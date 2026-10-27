const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const zlib=require('node:zlib');
const dev='http://127.0.0.1:5174';

test('otimização preserva quantidades, medidas, margens, gaps diferentes e layout em todos os DPIs',async({page})=>{
 await page.goto(dev);
 const result=await page.evaluate(async()=>{
  const {packArts}=await import('/src/utils/pack.ts');const {DEFAULT_CONFIG}=await import('/src/types.ts');
  const canvas=document.createElement('canvas');canvas.width=120;canvas.height=80;
  const arts=Array.from({length:12},(_,i)=>({id:String(i),name:String(i),trimmedCanvas:canvas,trimmedWidthPx:120,trimmedHeightPx:80,quantity:3+i%4,maxSideCmOverride:null,rotate90:i%2===0,widthCmOverride:1+i%5,heightCmOverride:1+(i*3)%7}));
  const runs=[];let previous;
  for(const dpi of [150,300,813]){
   const config={...DEFAULT_CONFIG,widthCm:15,heightCm:20,marginMm:4,gapXMm:4,gapYMm:7,dpi,packMode:'optimized'};
   const r=packArts(arts,config,{skipPreview:true}),legacy=packArts(arts,{...config,packMode:'maxrects'},{skipPreview:true});
   let valid=true,rotated=0;const counts={};
   for(const s of r.sheets){const ps=s.layout.placements;for(let i=0;i<ps.length;i++){
    const p=ps[i],a=arts.find(a=>a.id===p.artId);counts[p.artId]=(counts[p.artId]||0)+1;if(p.rotated)rotated++;
    const w=(p.rotated?a.heightCmOverride:a.widthCmOverride)*10000,h=(p.rotated?a.widthCmOverride:a.heightCmOverride)*10000;
    if(p.width!==w||p.height!==h||p.x<4000||p.y<4000||p.x+p.width>s.layout.width-4000||p.y+p.height>s.layout.height-4000)valid=false;
    for(let j=i+1;j<ps.length;j++){const q=ps[j],dx=Math.max(p.x-q.x-q.width,q.x-p.x-p.width),dy=Math.max(p.y-q.y-q.height,q.y-p.y-p.height);if(dx<4000-.01&&dy<7000-.01)valid=false;}
   }}
   const layout=JSON.stringify(r.sheets.map(s=>s.layout.placements.map(({source,...p})=>p)));
   runs.push({valid,counts,rotated,errors:r.errors,sheets:r.sheets.length,baseline:legacy.sheets.length,stable:previous==null||layout===previous});previous=layout;
  }
  const turnArt={...arts[0],quantity:2,rotate90:false,widthCmOverride:8,heightCmOverride:3};
  const rotatedFit=packArts([turnArt],{...DEFAULT_CONFIG,widthCm:4,heightCm:18,packMode:'optimized'},{skipPreview:true});
  const noRotation=packArts([turnArt],{...DEFAULT_CONFIG,widthCm:4,heightCm:18,packMode:'optimized',optimizedAutoRotation:false},{skipPreview:true});
  const cfg={...DEFAULT_CONFIG,widthCm:15,packMode:'optimized',sheetGrowMode:'auto_height',gapXMm:4,gapYMm:4};
  const roll=packArts(arts,cfg,{skipPreview:true}),base=packArts(arts,{...cfg,packMode:'maxrects'},{skipPreview:true});
  return {runs,rotatedFit:{errors:rotatedFit.errors,count:rotatedFit.sheets.flatMap(s=>s.placements).length,allRotated:rotatedFit.sheets.flatMap(s=>s.placements).every(p=>p.rotated)},noRotation:noRotation.errors,roll:{count:roll.sheets.flatMap(s=>s.placements).length,height:roll.sheets[0].usedHeightCm,baseline:base.sheets[0].usedHeightCm},defaultMode:DEFAULT_CONFIG.packMode};
 });
 expect(result.defaultMode).toBe('grade');
 for(const r of result.runs){expect(r.valid).toBe(true);expect(r.stable).toBe(true);expect(r.errors).toEqual([]);expect(r.sheets).toBeLessThanOrEqual(r.baseline);for(let i=0;i<12;i++)expect(r.counts[i]).toBe(3+i%4);}
 expect(result.rotatedFit).toEqual({errors:[],count:2,allRotated:true});expect(result.noRotation.length).toBeGreaterThan(0);
 expect(result.roll.count).toBe(54);expect(result.roll.height).toBeLessThanOrEqual(result.roll.baseline);
});

test('PNG inteiro ultrapassa limites de partes, preserva RGBA, crop, rotação, DPI e CRC',async({page})=>{
 await page.goto(dev);
 const result=await page.evaluate(async()=>{
  const {sheetWholeToPngBlob,planPngDownloads,resolveExportGeometry}=await import('/src/utils/exportPng.ts');
  const {renderSheetCanvas}=await import('/src/utils/pack.ts');
  const c=document.createElement('canvas');c.width=13;c.height=9;const ctx=c.getContext('2d'),data=ctx.createImageData(13,9);
  for(let i=0;i<data.data.length;i+=4){data.data[i]=255;data.data[i+1]=255;data.data[i+2]=255;data.data[i+3]=[0,1,128,255][i/4%4];}ctx.putImageData(data,0,0);
  const sheet={index:0,widthPx:9000,heightPx:90,previewUrl:'',placements:[{artId:'a',name:'a',source:c,x:1,y:4,width:13,height:9,rotated:false},{artId:'b',name:'b',source:c,x:8970,y:2,width:9,height:13,rotated:true}]};
  const options={cropEmpty:true,marginMm:.1,outputMode:'whole'},dpi=813;
  const g=resolveExportGeometry(sheet,dpi,options),blob=await sheetWholeToPngBlob(sheet,dpi,options);
  const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);
  const actual=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  const expected=renderSheetCanvas(g.widthPx,g.heightPx,g.placements).getContext('2d').getImageData(0,0,g.widthPx,g.heightPx).data;
  let diff=0,clear=0,soft=0;for(let i=0;i<actual.length;i++){if(actual[i]!==expected[i])diff++;if(i%4===3){if(!actual[i])clear++;else if(actual[i]<255)soft++;}}
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  const whole=planPngDownloads([sheet],dpi,options),auto=planPngDownloads([sheet],dpi);
  return {diff,clear,soft,b64:btoa(binary),whole:whole.length,auto:auto.length,width:g.widthPx,height:g.heightPx};
 });
 expect(result.diff).toBe(0);expect(result.clear).toBeGreaterThan(0);expect(result.soft).toBeGreaterThan(0);expect(result.whole).toBe(1);expect(result.auto).toBeGreaterThan(1);
 const bytes=Buffer.from(result.b64,'base64'),ids=[],phys=[];let off=8;const idat=[];
 const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;};
 while(off<bytes.length){const n=bytes.readUInt32BE(off),type=bytes.toString('ascii',off+4,off+8);ids.push(type);expect(bytes.readUInt32BE(off+8+n)).toBe(crc(bytes.subarray(off+4,off+8+n)));if(type==='pHYs')phys.push(bytes.readUInt32BE(off+8));if(type==='IDAT')idat.push(bytes.subarray(off+8,off+8+n));off+=n+12;}
 expect(phys).toEqual([Math.round(813/.0254)]);expect(ids.at(-1)).toBe('IEND');expect(zlib.inflateSync(Buffer.concat(idat)).length).toBe((result.width*4+1)*result.height);
});

test('opções adicionais fazem downloads reais inteiro e dividido e mantêm os modos anteriores',async({page})=>{
 await page.goto('/montadora/');
 const buffer=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=48;c.getContext('2d').fillRect(0,0,80,48);return c.toDataURL().split(',')[1];}),'base64');
 await page.locator('input[type=file]').first().setInputFiles({name:'arte.png',mimeType:'image/png',buffer});
 const mode=page.getByLabel('Modo de montagem');await expect(mode).toHaveValue('grade');
 await mode.selectOption('optimized');await expect(page.getByLabel('Girar cópias automaticamente')).toBeChecked();
 await page.getByLabel('Quantidade arte.png').fill('6');
 await page.getByLabel('Qualidade do export').selectOption('high');
 const output=page.getByLabel('Formato do download PNG');await expect(output).toHaveValue('auto');await output.selectOption('whole');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar PNG',exact:true}).click();const whole=await download;
 expect(whole.suggestedFilename()).toBe('gang.png');expect((await fs.readFile(await whole.path())).subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
 await expect(output).toBeEnabled();await output.selectOption('parts');await page.getByLabel('Comprimento por parte (cm)').fill('2');
 const parts=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar PNGs',exact:true}).click();expect((await parts).suggestedFilename()).toContain('-parte-');
 await page.getByRole('button',{name:'Parar após esta parte'}).click();await expect(output).toBeEnabled();await expect(page.getByRole('region',{name:'Partes PNG'})).toBeVisible();
 await output.selectOption('whole');await expect(page.getByRole('region',{name:'Partes PNG'})).toHaveCount(0);
});

test('divisão solicitada respeita comprimento e cobertura sem diminuir DPI',async({page})=>{
 await page.goto(dev);const result=await page.evaluate(async()=>{
  const {planOutputParts}=await import('/src/utils/exportPng.ts');const s={index:0,widthPx:100,heightPx:2500,previewUrl:'',placements:[]};
  const parts=planOutputParts(s,254,{outputMode:'parts',partLengthCm:10});return {parts,area:parts.reduce((n,p)=>n+p.widthPx*p.heightPx,0)};
 });expect(result.parts.map(p=>p.heightPx)).toEqual([1000,1000,500]);expect(result.area).toBe(250000);
});

test('várias folhas pagina sem cortar artes e recupera a configuração ao sair',async({page})=>{
 await page.goto('/montadora/');
 const buffer=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=48;c.getContext('2d').fillRect(0,0,80,48);return c.toDataURL().split(',')[1];}),'base64');
 await page.locator('input[type=file]').first().setInputFiles({name:'pedido.png',mimeType:'image/png',buffer});
 await page.getByLabel('Quantidade pedido.png').fill('30');await page.getByLabel('Qualidade do export').selectOption('high');
 await expect(page.locator('.sheet-meta')).toHaveCount(1);
 const output=page.getByLabel('Formato do download PNG');await output.selectOption('pages');await page.getByLabel('Comprimento por folha (cm)').fill('8');
 await expect(page.locator('.sheet-meta')).toHaveCount(3);await expect(page.locator('.layout-summary')).toContainText('30 de 30');
 await expect(page.locator('.sheet-cut-warning')).toHaveCount(0);for(const meta of await page.locator('.sheet-meta').allTextContents())expect(meta).toContain('29 × 8 cm');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'PNG',exact:true}).first().click();expect((await pending).suggestedFilename()).toBe('folha-01.png');
 await expect(output).toBeEnabled();await output.selectOption('whole');await expect(page.locator('.sheet-meta')).toHaveCount(1);await expect(page.getByLabel('Comprimento da folha')).toHaveValue('42');
});
