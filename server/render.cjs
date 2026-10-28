const fs = require('node:fs');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const zlib = require('node:zlib');
const sharp = require('sharp');
sharp.cache({ memory: 32, files: 8, items: 30 }); sharp.concurrency(1);
const table = Array.from({length:256}, (_,n) => { for(let i=0;i<8;i++) n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0; });
function chunk(type,data) {
  const t=Buffer.from(type), out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);
  let crc=0xffffffff;for(const v of Buffer.concat([t,data]))crc=table[(crc^v)&255]^(crc>>>8);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;
}
async function render(dir, manifest) {
 const {width,height,dpi,placements}=manifest;
 const cache=new Map();let prepared=0;
 for(const p of placements) {
   const key=[p.asset,p.width,p.height,p.rotated].join('-');p.key=key;
   if(cache.has(key))continue;
   const file=path.join(dir,'scaled-'+cache.size+'.raw');
   let image=sharp(path.join(dir,p.asset+'.png'),{limitInputPixels:100000000}).ensureAlpha();
   if(p.rotated)image=image.rotate(90);
   await pipeline(image.resize(p.width,p.height,{fit:'fill',kernel:'lanczos3'}).raw(),fs.createWriteStream(file));cache.set(key,file);
   process.send?.({progress:Math.round(++prepared/placements.length*15)});
 }
 const output=path.join(dir,'result.png'), header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const phys=Buffer.alloc(9);phys.writeUInt32BE(Math.round(dpi/.0254));phys.writeUInt32BE(Math.round(dpi/.0254),4);phys[8]=1;
 fs.writeFileSync(output,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('pHYs',phys)]));
 async function* bands() {
   const rows=Math.max(1,Math.min(64,Math.floor(4*1024*1024/(width*4))));
   for(let y=0;y<height;y+=rows) {
     const h=Math.min(rows,height-y), overlays=[];
     for(const p of placements) {
       const left=Math.max(0,p.x),top=Math.max(y,p.y),right=Math.min(width,p.x+p.width),bottom=Math.min(y+h,p.y+p.height);
       if(right<=left||bottom<=top)continue;
       const w=right-left,tileH=bottom-top,input=Buffer.alloc(w*tileH*4),handle=await fs.promises.open(cache.get(p.key),'r');
       try{for(let row=0;row<tileH;row++){const {bytesRead}=await handle.read(input,row*w*4,w*4,((top-p.y+row)*p.width+left-p.x)*4);if(bytesRead!==w*4)throw Error('Fonte incompleta durante a exportação.');}}finally{await handle.close();}
       overlays.push({input,raw:{width:w,height:tileH,channels:4},left,top:top-y});
     }
     const pixels=await sharp({create:{width,height:h,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(overlays).raw().toBuffer();
     const scan=Buffer.alloc((width*4+1)*h);
     for(let r=0;r<h;r++)pixels.copy(scan,r*(width*4+1)+1,r*width*4,(r+1)*width*4);
     yield scan;process.send?.({progress:15+Math.round((y+h)/height*84)});
   }
 }
 const framing=new Transform({transform(data,enc,done){done(null,chunk('IDAT',data));}});
 await pipeline(Readable.from(bands()),zlib.createDeflate({level:3}),framing,fs.createWriteStream(output,{flags:'a'}));
 fs.appendFileSync(output,chunk('IEND',Buffer.alloc(0)));
 for(const file of cache.values())await fs.promises.unlink(file);
 return fs.statSync(output).size;
}
if(require.main===module) process.on('message',async ({dir,manifest})=>{
 const before=process.cpuUsage(),start=Date.now();
 try {const bytes=await render(dir,manifest);process.send?.({done:true,bytes,seconds:(Date.now()-start)/1000,cpuSeconds:(process.cpuUsage(before).user+process.cpuUsage(before).system)/1e6,maxRssMB:process.resourceUsage().maxRSS/1024});process.exit(0);}
 catch(e){process.send?.({error:e.message});process.exit(1);}
});
module.exports={render,chunk};
