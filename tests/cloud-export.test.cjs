const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),sharp=require('sharp');
process.env.APP_PASSWORD='test-password-only-not-production';
const {validate,server}=require('../server/index.cjs'),{render}=require('../server/render.cjs');
test('cloud renderer preserves alpha, placement, distortion, rotation and physical DPI',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dtf-test-'));
 try{
  const source=Buffer.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,0,255,0,255,255,255,255,0,255,255]);
  await sharp(source,{raw:{width:2,height:3,channels:4}}).png().toFile(path.join(dir,'asset0.png'));
  const manifest={width:20,height:12,dpi:600,placements:[{asset:'asset0',x:2,y:3,width:3,height:2,rotated:true},{asset:'asset0',x:10,y:2,width:4,height:6,rotated:false}]};
  validate(manifest,new Set(['asset0']));await render(dir,manifest);
  const {data,info}=await sharp(path.join(dir,'result.png')).raw().toBuffer({resolveWithObject:true});
  const px=(x,y)=>Array.from(data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4));
  assert.deepEqual(px(0,0),[0,0,0,0]);assert.deepEqual(px(2,3),[0,255,255,255]);assert.deepEqual(px(4,3),[255,0,0,255]);assert.equal(px(10,2)[3],255);assert.equal(info.width,20);assert.equal(info.height,12);
  const metadata=await sharp(path.join(dir,'result.png')).metadata();assert.equal(metadata.density,600);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('cloud accepts clipped bands and rejects oversized/invalid manifests',()=>{
 const base={width:100,height:100,dpi:300,placements:[{asset:'asset0',x:-10,y:-10,width:30,height:30,rotated:false}]};
 assert.equal(validate(base,new Set(['asset0'])),base);
 assert.throws(()=>validate({...base,width:100000,height:100000},new Set(['asset0'])));
 assert.throws(()=>validate(base,new Set()));assert.throws(()=>validate({...base,dpi:NaN},new Set(['asset0'])));
});
test('API requires login, accepts export, downloads PNG, cancels and never serves server source',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/capabilities')).status,401);
  const login=await fetch(base+'/login',{method:'POST',body:new URLSearchParams({password:process.env.APP_PASSWORD}),redirect:'manual'});assert.equal(login.status,303);const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
  assert.equal((await fetch(base+'/server/index.cjs',{headers})).status,404);
  assert.equal((await(await fetch(base+'/api/capabilities',{headers})).json()).cloudExport,true);
  const png=await sharp({create:{width:2,height:2,channels:4,background:'#ff0000'}}).png().toBuffer(),form=new FormData();
  form.append('manifest',JSON.stringify({width:40,height:40,dpi:300,placements:[{asset:'asset0',x:5,y:5,width:20,height:20,rotated:false}]}));form.append('asset0',new Blob([png],{type:'image/png'}),'art.png');
  const r=await fetch(base+'/api/exports',{method:'POST',headers,body:form});assert.equal(r.status,202);const {id}=await r.json();let job;
  for(let i=0;i<100;i++){job=await(await fetch(base+'/api/exports/'+id,{headers})).json();if(job.status==='done'||job.status==='failed')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(job.status,'done',job.error);assert(job.metrics.seconds>=0);const result=await fetch(base+'/api/exports/'+id+'/file',{headers});assert.equal(result.status,200);assert.equal((await sharp(Buffer.from(await result.arrayBuffer())).metadata()).width,40);
  assert.equal((await fetch(base+'/api/exports/'+id,{method:'DELETE',headers})).status,200);
  assert.equal((await fetch(base+'/api/freight',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,503);
 }finally{await new Promise(r=>server.close(r));}
});
