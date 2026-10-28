const crypto=require('node:crypto');
const SESSION_MS=7*86400000;
/** Signed, expiring cookies survive idle suspension/redeploys. Password rotation invalidates them. */
function sessionAuth(password){
 const key=crypto.createHash('sha256').update('dtfuvstudio-session-v1\0').update(password).digest();
 const sign=value=>crypto.createHmac('sha256',key).update(value).digest('hex');
 return {
  create(now=Date.now()){
   const payload=`v1.${now+SESSION_MS}.${crypto.randomBytes(16).toString('hex')}`;
   return payload+'.'+sign(payload);
  },
  verify(token,now=Date.now()){
   if(typeof token!=='string'||!/^v1\.\d{13}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token))return false;
   const [version,expiry,nonce,signature]=token.split('.'),expires=Number(expiry);
   if(!Number.isSafeInteger(expires)||expires<=now||expires>now+SESSION_MS+60000)return false;
   return crypto.timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(sign(`${version}.${expiry}.${nonce}`),'hex'));
  }
 };
}
module.exports={sessionAuth};
