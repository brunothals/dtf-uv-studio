const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events');
const {sessionAuth}=require('../server/session.cjs');
const password='test-only-long-password',now=1793152000000;
test('signed sessions survive a new verifier and reject expiry, tampering and changed passwords',()=>{
 const token=sessionAuth(password).create(now);
 assert(sessionAuth(password).verify(token,now+10000));
 assert(!sessionAuth(password).verify(token,now+7*86400000));
 assert(!sessionAuth(password+'changed').verify(token,now));
 const parts=token.split('.');parts[1]=String(Number(parts[1])+1000);assert(!sessionAuth(password).verify(parts.join('.'),now));
 for(const invalid of [undefined,'','x'.repeat(64),token.slice(0,-1),token.slice(0,-1)+'z',token.replace('v1','v2')])assert(!sessionAuth(password).verify(invalid,now));
});
test('same browser cookie authenticates API and freight after the server process restarts',async()=>{
 const code="const {server}=require('./server/index.cjs');server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));";
 const start=async()=>{const child=spawn(process.execPath,['-e',code],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,APP_PASSWORD:password,MELHOR_ENVIO_TOKEN:'',PORT:'0'},stdio:['ignore','ignore','inherit','ipc']});const [message]=await once(child,'message');return {child,base:'http://127.0.0.1:'+message.port};};
 const stop=async c=>{const exited=once(c,'exit');c.kill();await exited;};
 let instance=await start();try{
  const login=await fetch(instance.base+'/login',{method:'POST',body:new URLSearchParams({password}),redirect:'manual'});assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(cookie,/dtf_session=v1\./);assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.equal((await fetch(instance.base+'/api/capabilities',{headers:{Cookie:cookie}})).status,200);
  await stop(instance.child);instance=await start();
  assert.equal((await fetch(instance.base+'/api/capabilities',{headers:{Cookie:cookie}})).status,200);
  assert.equal((await fetch(instance.base+'/api/freight',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,503,'Freight reaches configuration check, not a lost-login 401');
  assert.equal((await fetch(instance.base+'/api/capabilities',{headers:{Cookie:cookie.slice(0,-1)+'z'}})).status,401);
 }finally{await stop(instance.child);}
});
