const http=require('node:http'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {fork}=require('node:child_process');const {pipeline}=require('node:stream/promises');const Busboy=require('busboy');
const root=path.resolve(__dirname,'..'),jobs=new Map(),attempts=new Map();let running=null;
const password=process.env.APP_PASSWORD,port=Number(process.env.PORT||3001),ttl=3600000;
if(!password||password.length<16)throw Error('Configure APP_PASSWORD com pelo menos 16 caracteres.');
const sessions=require('./session.cjs').sessionAuth(password);
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function authorized(req){const token=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('dtf_session='))?.slice(12);return sessions.verify(token);}
function sameOrigin(req){const origin=req.headers.origin;return !origin||origin===`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`;}
function validate(m,assets){
 if(!m||![m.width,m.height,m.dpi].every(Number.isSafeInteger)||m.width<1||m.height<1||m.width>100000||m.height>100000||m.width*m.height>600000000||m.dpi<72||m.dpi>2400)throw Error('Limite: 600 milhões de pixels, lado até 100 mil pixels e 72–2400 DPI. Use folhas menores ou exportação em partes.');
 if(!Array.isArray(m.placements)||!m.placements.length||m.placements.length>10000)throw Error('Quantidade de peças inválida.');
 for(const p of m.placements)if(!assets.has(p.asset)||![p.x,p.y,p.width,p.height].every(Number.isSafeInteger)||p.width<1||p.height<1||p.width*p.height>100000000||p.x< -100000||p.y< -100000||p.x>m.width||p.y>m.height||typeof p.rotated!=='boolean')throw Error('Geometria ou fonte inválida.');
 return m;
}
async function receive(req,dir){
 const parser=Busboy({headers:req.headers,limits:{files:100,fields:1,fieldSize:2000000,fileSize:100*1024*1024}}),assets=new Set(),writes=[];let manifest,error,bytes=0;
 parser.on('field',(name,value,info)=>{if(name!=='manifest'||info.valueTruncated)error=Error('Manifesto inválido.');else try{manifest=JSON.parse(value);}catch{error=Error('Manifesto inválido.');}});
 parser.on('file',(name,file,info)=>{
  if(!/^asset\d+$/.test(name)||assets.has(name)||info.mimeType!=='image/png'){error=Error('Envie apenas fontes PNG válidas.');file.resume();return;}
  assets.add(name);file.on('limit',()=>{error=Error('Fonte maior que 100 MB.');});
  file.on('data',b=>{bytes+=b.length;if(bytes>200*1024*1024){error=Error('Upload maior que 200 MB.');req.destroy();}});
  writes.push(pipeline(file,fs.createWriteStream(path.join(dir,name+'.png'))).catch(e=>{error=e}));
 });
 parser.on('filesLimit',()=>error=Error('Máximo de 100 modelos por exportação.'));parser.on('fieldsLimit',()=>error=Error('Manifesto duplicado.'));
 await pipeline(req,parser);await Promise.all(writes);if(error)throw error;
 const sharp=require('sharp');for(const asset of assets){const metadata=await sharp(path.join(dir,asset+'.png'),{limitInputPixels:100000000}).metadata();if(metadata.format!=='png')throw Error('Fonte inválida.');}
 return validate(manifest,assets);
}
function next(){
 if(running)return;const job=[...jobs.values()].find(j=>j.status==='queued');if(!job)return;
 running=job.id;job.status='rendering';job.child=fork(path.join(__dirname,'render.cjs'),[],{execArgv:['--max-old-space-size=384'],stdio:['ignore','ignore','inherit','ipc']});
 const timer=setTimeout(()=>{job.error='Tempo máximo de 20 minutos atingido. Divida a folha.';job.child.kill();},1200000);
 job.child.on('message',m=>{if(m.progress)job.progress=m.progress;if(m.error)job.error=m.error;if(m.done){Object.assign(job,{status:'done',progress:100,metrics:m});console.log(JSON.stringify({event:'export',job:job.id,...m}));}});
 job.child.on('exit',()=>{clearTimeout(timer);if(job.status==='rendering')job.status=job.error?'failed':'cancelled';running=null;next();});job.child.send({dir:job.dir,manifest:job.manifest});
}
const login=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Acesso — DTFUVStudio</title><body style="background:#101015;color:white;font:18px Arial;max-width:420px;margin:12vh auto;padding:24px"><h1 style="color:#ff2eaa">DTF UV Mania</h1><p>Montadora e calculadora</p><form method="post" action="/login"><label>Senha de acesso<input name="password" type="password" required autocomplete="current-password" style="display:block;padding:12px;width:90%;margin:16px 0"></label><button style="padding:12px">Entrar</button></form></body></html>`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 if(url.pathname==='/health'){json(res,200,{ok:true});return;}
 if(['POST','DELETE'].includes(req.method)&&!sameOrigin(req)){json(res,403,{error:'Origem inválida.'});return;}
 if(url.pathname==='/login'){
  if(req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(login);return;}
  const ip=req.socket.remoteAddress,a=attempts.get(ip)||{count:0,until:Date.now()+60000};if(a.until<Date.now()){a.count=0;a.until=Date.now()+60000;}attempts.set(ip,a);if(++a.count>10){json(res,429,{error:'Aguarde um minuto.'});return;}
  let body='';for await(const b of req){body+=b;if(body.length>1024){json(res,413,{error:'Entrada inválida.'});return;}}
  const input=new URLSearchParams(body).get('password')||'';const hash=s=>crypto.createHash('sha256').update(s).digest();
  if(!crypto.timingSafeEqual(hash(input),hash(password))){res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'});res.end(login+'<p>Senha incorreta.</p>');return;}
  const token=sessions.create();res.writeHead(303,{'Cache-Control':'no-store','Set-Cookie':`dtf_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`,'Location':'/montadora/'});res.end();return;
 }
 if(!authorized(req)){if(url.pathname.startsWith('/api/'))json(res,401,{error:'Entre novamente no aplicativo.'});else{res.writeHead(302,{Location:'/login'});res.end();}return;}
 if(url.pathname==='/api/capabilities'){json(res,200,{cloudExport:true,freight:!!process.env.MELHOR_ENVIO_TOKEN,maxPixels:600000000});return;}
 if(url.pathname==='/api/freight'&&req.method==='POST'){
  if(!process.env.MELHOR_ENVIO_TOKEN||!process.env.FREIGHT_ORIGIN_ZIP){json(res,503,{error:'Conecte o Melhor Envio e configure o CEP de origem no servidor para ativar a consulta.'});return;}
  let body='';for await(const b of req){body+=b;if(body.length>4096)throw Error('Consulta inválida.');}const q=JSON.parse(body);
  if(!/^\d{8}$/.test(q.zip)||!['width','height','length','weight'].every(k=>Number.isFinite(q[k])&&q[k]>0&&q[k]<1000)||!Number.isFinite(q.insurance)||q.insurance<0||q.insurance>100000)throw Error('Confira CEP, dimensões, peso e valor do produto.');
  const upstream=await fetch('https://www.melhorenvio.com.br/api/v2/me/shipment/calculate',{method:'POST',signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+process.env.MELHOR_ENVIO_TOKEN,'Content-Type':'application/json',Accept:'application/json','User-Agent':'DTFUVStudio ('+(process.env.SUPPORT_EMAIL||'suporte@dtfuvmania.com.br')+')'},body:JSON.stringify({from:{postal_code:process.env.FREIGHT_ORIGIN_ZIP},to:{postal_code:q.zip},volumes:[{width:q.width,height:q.height,length:q.length,weight:q.weight,insurance:q.insurance}]})});
  if(!upstream.ok){json(res,502,{error:'Melhor Envio indisponível ou acesso inválido. Confira a conexão e tente novamente.'});return;}
  const result=await upstream.json();if(!Array.isArray(result))throw Error('Resposta inválida do Melhor Envio.');
  json(res,200,{options:result.filter(r=>!r.error).flatMap(r=>{const price=Number(r.custom_price??r.price),days=Number(r.custom_delivery_time??r.delivery_time);return Number.isFinite(price)&&price>=0&&Number.isFinite(days)&&days>=0?[{carrier:r.company?.name||'',service:r.name,price,days:q.extraDay!==false&&days===1?2:days}]:[];})});return;
 }
 if(url.pathname==='/api/exports'&&req.method==='POST'){
  if([...jobs.values()].filter(j=>['uploading','queued','rendering'].includes(j.status)).length>=3){json(res,429,{error:'Servidor ocupado. Aguarde uma exportação terminar.'});return;}
  const id=crypto.randomUUID(),dir=await fsp.mkdtemp(path.join(os.tmpdir(),'dtf-'));const job={id,dir,status:'uploading',created:Date.now(),progress:0};jobs.set(id,job);
  try{job.manifest=await receive(req,dir);job.status='queued';json(res,202,{id});next();}catch(e){jobs.delete(id);await fsp.rm(dir,{recursive:true,force:true});throw e;}return;
 }
 const match=url.pathname.match(/^\/api\/exports\/([a-f0-9-]{36})(\/file)?$/);
 if(match){const j=jobs.get(match[1]);if(!j){json(res,404,{error:'Exportação expirada ou inexistente.'});return;}
  if(req.method==='DELETE'){j.status='cancelled';j.child?.kill();json(res,200,{ok:true});return;}
  if(match[2]){if(j.status!=='done'){json(res,409,{error:'Arquivo ainda não está pronto.'});return;}const name=(url.searchParams.get('name')||'folha.png').replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,180);res.writeHead(200,{'Content-Type':'image/png','Content-Length':fs.statSync(path.join(j.dir,'result.png')).size,'Content-Disposition':"attachment; filename=folha.png; filename*=UTF-8''"+encodeURIComponent(name),'Cache-Control':'no-store'});await pipeline(fs.createReadStream(path.join(j.dir,'result.png')),res);return;}
  json(res,200,{id:j.id,status:j.status,progress:j.progress,error:j.error,metrics:j.metrics});return;
 }
 if(url.pathname.startsWith('/api/')){json(res,404,{error:'Recurso indisponível.'});return;}
 let target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root+path.sep)&&target!==root){json(res,404,{});return;}
 if(url.pathname.startsWith('/server/')||!['/','/index.html','/quote-core.js','/quote-ui.js'].includes(url.pathname)&&!url.pathname.startsWith('/montadora/')&&!url.pathname.startsWith('/assets/')){json(res,404,{});return;}
 if((await fsp.stat(target)).isDirectory())target=path.join(target,'index.html');
 const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mjs':'application/javascript','.wasm':'application/wasm'};
 res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');await pipeline(fs.createReadStream(target),res);
}catch(e){if(!res.headersSent)json(res,e.code==='ENOENT'?404:400,{error:e.code==='ENOENT'?'Arquivo não encontrado.':e.message});else res.destroy();}});
setInterval(()=>{for(const [id,j]of jobs)if(Date.now()-j.created>ttl&&!['rendering','uploading'].includes(j.status)){jobs.delete(id);fsp.rm(j.dir,{recursive:true,force:true}).catch(()=>{});}for(const [id,a]of attempts)if(a.until<Date.now())attempts.delete(id);},60000).unref();
if(require.main===module)server.listen(port,'0.0.0.0',()=>console.log('DTFUVStudio listening on '+port));
module.exports={validate,server};
