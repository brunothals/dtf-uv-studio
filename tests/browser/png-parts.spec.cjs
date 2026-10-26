const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const dev='http://127.0.0.1:5174';

test('partes recompõem exatamente o PNG com crop, margem, rotação, alpha e DPI alto',async({page})=>{
 await page.goto(dev);
 const result=await page.evaluate(async()=>{
  const {planPngParts,sheetPartToPngBlob,sheetToPngBlob,resolveExportGeometry}=await import('/src/utils/exportPng.ts');
  const source=document.createElement('canvas');source.width=13;source.height=9;const x=source.getContext('2d');
  const pixels=x.createImageData(13,9);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=255;pixels.data[i+1]=255;pixels.data[i+2]=255;pixels.data[i+3]=[0,1,128,255][(i/4)%4];}x.putImageData(pixels,0,0);
  const sheet={index:0,widthPx:40,heightPx:30,previewUrl:'',placements:[{artId:'a',name:'branca',x:4,y:3,width:9,height:13,rotated:true,source},{artId:'b',name:'branca',x:17,y:3,width:13,height:9,rotated:false,source}]};
  const dpi=1200,options={cropEmpty:true,marginMm:.04};const g=resolveExportGeometry(sheet,dpi,options),parts=planPngParts(sheet,dpi,options,{maxSide:8,maxPixels:40});
  const full=await createImageBitmap(await sheetToPngBlob(sheet,dpi,undefined,options));const reference=document.createElement('canvas');reference.width=full.width;reference.height=full.height;reference.getContext('2d').drawImage(full,0,0);
  const reconstructed=document.createElement('canvas');reconstructed.width=g.widthPx;reconstructed.height=g.heightPx;const out=reconstructed.getContext('2d');const metadata=[];
  for(const part of parts){const blob=await sheetPartToPngBlob(sheet,dpi,part,options);const bitmap=await createImageBitmap(blob);out.drawImage(bitmap,part.x,part.y);bitmap.close();const bytes=await blob.arrayBuffer();const v=new DataView(bytes);let off=8,ppm=[];while(off+12<=v.byteLength){const n=v.getUint32(off),type=String.fromCharCode(...new Uint8Array(bytes,off+4,4));if(type==='pHYs')ppm.push([v.getUint32(off+8),v.getUint32(off+12),v.getUint8(off+16)]);off+=n+12;}metadata.push({type:blob.type,ppm,width:part.widthPx,height:part.heightPx});}
  const expected=reference.getContext('2d').getImageData(0,0,g.widthPx,g.heightPx).data,actual=out.getImageData(0,0,g.widthPx,g.heightPx).data;let differences=0,white=0,clear=0,soft=0;for(let i=0;i<actual.length;i++){if(actual[i]!==expected[i])differences++;if(i%4===3){if(actual[i]===0)clear++;else if(actual[i]<255)soft++;else if(actual[i-3]===255&&actual[i-2]===255&&actual[i-1]===255)white++;}}
  return {differences,white,clear,soft,metadata,parts,width:g.widthPx,height:g.heightPx,area:parts.reduce((n,p)=>n+p.widthPx*p.heightPx,0)};
 });
 expect(result.differences).toBe(0);expect(result.white).toBeGreaterThan(0);expect(result.clear).toBeGreaterThan(0);expect(result.soft).toBeGreaterThan(0);expect(result.parts.length).toBeGreaterThan(1);expect(result.area).toBe(result.width*result.height);
 for(const m of result.metadata){expect(m.type).toBe('image/png');expect(m.ppm).toEqual([[Math.round(1200/.0254),Math.round(1200/.0254),1]]);expect(m.width*m.height).toBeLessThanOrEqual(40);}
});

test('folha acima de 512 MiB é planejada sem canvas gigante e sem reduzir DPI',async({page})=>{
 await page.goto(dev);
 const result=await page.evaluate(async()=>{
  const {planPngParts,PNG_PART_LIMITS}=await import('/src/utils/exportPng.ts');
  const create=document.createElement;let canvases=0;document.createElement=function(...args){if(args[0]==='canvas')canvases++;return create.apply(this,args)};
  try{const parts=planPngParts({index:0,widthPx:100000,heightPx:100000,placements:[],previewUrl:''},12700);return {canvases,limits:PNG_PART_LIMITS,count:parts.length,area:parts.reduce((n,p)=>n+p.widthPx*p.heightPx,0),valid:parts.every(p=>p.widthPx*p.heightPx<=PNG_PART_LIMITS.maxPixels&&p.widthPx<=PNG_PART_LIMITS.maxSide&&p.heightPx<=PNG_PART_LIMITS.maxSide),end:parts.at(-1)}}finally{document.createElement=create;}
 });
 expect(result.canvases).toBe(0);expect(result.count).toBeGreaterThan(1);expect(result.area).toBe(100000*100000);expect(result.valid).toBe(true);expect(result.end.x+result.end.widthPx).toBe(100000);expect(result.end.y+result.end.heightPx).toBe(100000);
});

test('downloads reais dividem largura e altura, com nomes PNG, DPI e bordas sem perdas',async({page})=>{
 await page.goto(dev);
 for(const vertical of [false,true]){
  const downloads=[];const listener=d=>downloads.push(d);page.on('download',listener);
  const plan=await page.evaluate(async vertical=>{
   const {planPngDownloads,downloadPngPart}=await import('/src/utils/exportPng.ts');const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').fillStyle='#fff';c.getContext('2d').fillRect(0,0,2,2);
   const sheet={index:0,widthPx:vertical?2:8193,heightPx:vertical?8193:2,previewUrl:'',placements:[{artId:'a',name:'arte',source:c,x:vertical?0:8191,y:vertical?8191:0,width:2,height:2,rotated:false}]};
   const items=planPngDownloads([sheet],813,undefined,'Cliente');for(const item of items)await downloadPngPart(item);return items.map(i=>({name:i.filename,x:i.part.x,y:i.part.y,w:i.part.widthPx,h:i.part.heightPx}));
  },vertical);
  await expect.poll(()=>downloads.length).toBe(2);page.off('download',listener);let white=0;
  for(let i=0;i<downloads.length;i++){
   expect(downloads[i].suggestedFilename()).toBe(plan[i].name);expect(plan[i].name).toMatch(/Cliente_gang-parte-\d+-L\d+-C\d+-x\d+-y\d+\.png$/);
   const bytes=await fs.readFile(await downloads[i].path());expect([...bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);let off=8,ppm;while(off+12<=bytes.length){if(bytes.toString('ascii',off+4,off+8)==='pHYs')ppm=bytes.readUInt32BE(off+8);off+=bytes.readUInt32BE(off)+12;}expect(ppm).toBe(Math.round(813/.0254));
   const decoded=await page.evaluate(async b64=>{const blob=await(await fetch('data:image/png;base64,'+b64)).blob(),b=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);const data=x.getImageData(0,0,c.width,c.height).data;let white=0,clear=0;for(let i=0;i<data.length;i+=4){if(data[i+3]===0)clear++;else if(data[i]===255&&data[i+1]===255&&data[i+2]===255&&data[i+3]===255)white++;}return {w:b.width,h:b.height,white,clear};},bytes.toString('base64'));
   expect(decoded.w).toBe(plan[i].w);expect(decoded.h).toBe(plan[i].h);white+=decoded.white;
  }expect(white).toBe(4);
 }
});

test('interface cancela entre PNGs, permite baixar parte isolada e limpa planos antigos',async({page})=>{
 await page.goto('/montadora/');
 const buffer=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').fillRect(0,0,2,2);return c.toDataURL().split(',')[1];}),'base64');
 await page.locator('input[type=file]').first().setInputFiles({name:'arte.png',mimeType:'image/png',buffer});await page.getByLabel('Largura arte.png').fill('29');await page.getByLabel('Quantidade arte.png').fill('3');
 const all=page.getByRole('button',{name:'Baixar PNGs',exact:true});await expect(page.locator('.sheet-meta')).toHaveCount(3);await expect(all).toBeEnabled();
 const downloads=[];page.on('download',d=>downloads.push(d));const first=page.waitForEvent('download');await all.click();await first;await page.getByRole('button',{name:'Parar após esta parte'}).click();await expect(all).toBeEnabled();expect(downloads).toHaveLength(1);
 const panel=page.getByRole('region',{name:'Partes PNG'});await expect(panel).toBeVisible();expect(downloads[0].suggestedFilename()).toBe('folha-01.png');
 const next=page.waitForEvent('download');await panel.getByRole('button',{name:/^folha-02\.png/}).click();expect((await next).suggestedFilename()).toBe('folha-02.png');await expect(all).toBeEnabled();expect(downloads).toHaveLength(2);
 await page.getByLabel('Espaço H (cm)',{exact:true}).fill('0');await expect(panel).toHaveCount(0);
});
