const {test,expect}=require('@playwright/test');
const dev='http://127.0.0.1:5174';
function fixturePdf(background){
 const content=(background?'1 1 1 rg 0 0 72 72 re f\n':'')+'0 0 0 rg 12 12 48 48 re f\n1 1 1 rg 24 24 24 24 re f\n';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Resources << >> /Contents 4 0 R >>',`<< /Length ${content.length} >>\nstream\n${content}endstream`];
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=pdf.length;pdf+='xref\n0 5\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');return pdf+`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
test('geometria física e tamanhos invariantes com gaps 0 / 0,2 / 0,3 / 0,4 cm em todos os modos e DPIs',async({page})=>{
 await page.goto(dev);
 const results=await page.evaluate(async()=>{
  const {DEFAULT_CONFIG}=await import('/src/types.ts');const {packArts}=await import('/src/utils/pack.ts');
  const c=document.createElement('canvas');c.width=64;c.height=32;
  const art={id:'a',name:'Arte',trimmedCanvas:c,trimmedWidthPx:64,trimmedHeightPx:32,quantity:30,maxSideCmOverride:null,rotate90:false};
  const results=[];
  for(const mode of ['maxrects','grade','group_rows','group_cols'])for(const gap of [0,2,3,4]){
   let canonical;
   for(const dpi of [150,300,813]){
    const cfg={...DEFAULT_CONFIG,widthCm:2,heightCm:3,maxSideCm:.2,gapMm:gap,gapXMm:gap,gapYMm:gap,packMode:mode,dpi};
    const {sheets,errors}=packArts([art],cfg,{skipPreview:true});
    const layout=JSON.stringify(sheets.map(s=>s.layout.placements.map(p=>[p.x,p.y,p.width,p.height])));
    const s=sheets[0];const gapUnits=gap*1000;let gapOk=true;
    for(const sheet of sheets)for(let i=0;i<sheet.layout.placements.length;i++)for(let j=i+1;j<sheet.layout.placements.length;j++){
      const a=sheet.layout.placements[i],b=sheet.layout.placements[j];const dx=Math.max(a.x-(b.x+b.width),b.x-(a.x+a.width)),dy=Math.max(a.y-(b.y+b.height),b.y-(a.y+a.height));
      if(Math.max(dx,dy)<gapUnits-.01)gapOk=false;
    }
    results.push({gapOk,mode,gap,dpi,same:canonical==null||canonical===layout,count:sheets.reduce((n,s)=>n+s.placements.length,0),errors,origin:s.placements[0].x,source:s.placements[0].source.width,width:s.placements[0].width*2.54/dpi});canonical=layout;
   }
  }return results;
 });
 for(const r of results){expect(r.gapOk).toBe(true);expect(r.errors).toEqual([]);expect(r.count).toBe(30);expect(r.same).toBe(true);expect(r.origin).toBe(0);expect(r.source).toBe(64);expect(Math.abs(r.width-.2)).toBeLessThanOrEqual(2.54/r.dpi);}
});
test('PNG real mantém tamanho físico, DPI, alpha e detalhes nativos da arte de 0,2 cm',async({page})=>{
 await page.goto(dev);
 const result=await page.evaluate(async()=>{
  const {DEFAULT_CONFIG}=await import('/src/types.ts');const {packArts}=await import('/src/utils/pack.ts');const {resolveExportDpi}=await import('/src/utils/units.ts');const {sheetToPngBlob,resolveExportGeometry,injectPhysChunk}=await import('/src/utils/exportPng.ts');
  const source=document.createElement('canvas');source.width=64;source.height=32;const ctx=source.getContext('2d');for(let x=0;x<64;x++){ctx.fillStyle=x%2?'#fff':'#000';ctx.fillRect(x,0,1,32);}
  const art={id:'a',name:'Fina',trimmedCanvas:source,trimmedWidthPx:64,trimmedHeightPx:32,quantity:1,maxSideCmOverride:null,rotate90:false};const config={...DEFAULT_CONFIG,widthCm:1,heightCm:2,maxSideCm:.2};const dpi=resolveExportDpi([art],config);const sheet=packArts([art],{...config,dpi},{skipPreview:true}).sheets[0];const original=await sheetToPngBlob(sheet,dpi);const blob=injectPhysChunk(await original.arrayBuffer(),dpi);const bytes=await blob.arrayBuffer();const v=new DataView(bytes);let off=8,phys=[];while(off<v.byteLength){const n=v.getUint32(off),type=String.fromCharCode(...new Uint8Array(bytes,off+4,4));if(type==='pHYs')phys.push({x:v.getUint32(off+8),y:v.getUint32(off+12),unit:v.getUint8(off+16)});off+=n+12;}
  const bitmap=await createImageBitmap(blob);const decoded=document.createElement('canvas');decoded.width=bitmap.width;decoded.height=bitmap.height;const d=decoded.getContext('2d');d.drawImage(bitmap,0,0);const expected=ctx.getImageData(0,0,64,32).data,actual=d.getImageData(0,0,64,32).data;let differing=0;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])differing++;
  return {dpi,phys,width:bitmap.width,height:bitmap.height,piece:sheet.placements[0].width,differing,alpha:d.getImageData(bitmap.width-1,bitmap.height-1,1,1).data[3],cropped:resolveExportGeometry(sheet,dpi,{cropEmpty:true}),defaultCrop:DEFAULT_CONFIG.cropEmptyExport};
 });
 expect(result.dpi).toBe(813);expect(result.piece).toBe(64);expect(result.differing).toBe(0);expect(result.alpha).toBe(0);expect(result.phys).toHaveLength(1);expect(result.phys[0].unit).toBe(1);expect(result.phys[0].x).toBe(result.phys[0].y);expect(Math.abs(result.width/result.phys[0].x*100-1)).toBeLessThan(.005);expect(Math.abs(result.height/result.phys[0].y*100-2)).toBeLessThan(.005);expect(result.defaultCrop).toBe(true);expect(result.cropped.widthPx).toBe(64);
});
test('PDF real: transparência e remoção opcional do branco externo preservando branco interno',async({page})=>{
 await page.goto(dev);
 for(const background of [false,true])for(const remove of [false,true]){
  const result=await page.evaluate(async({pdf,remove})=>{
   const {loadPdfAsCanvases}=await import('/src/utils/pdfImport.ts');const file=new File([pdf],'teste.pdf',{type:'application/pdf'});const {pages,failures}=await loadPdfAsCanvases(file,300,undefined,{removeWhiteBackground:remove});const ctx=pages[0].canvas.getContext('2d');return {pages:pages.length,failures,outer:[...ctx.getImageData(0,0,1,1).data],inner:[...ctx.getImageData(150,150,1,1).data],ink:[...ctx.getImageData(75,75,1,1).data]};
  },{pdf:fixturePdf(background),remove});
  expect(result.pages).toBe(1);expect(result.failures).toEqual([]);expect(result.outer[3]).toBe(background&&!remove?255:0);expect(result.inner).toEqual([255,255,255,255]);expect(result.ink).toEqual([0,0,0,255]);
 }
});
test('montadora integrada: importar, espaçar, exportar, navegar e conferir celular',async({page})=>{
 await page.goto('/');await page.getByRole('link',{name:'Montadora de artes'}).click();await expect(page.getByRole('heading',{name:'Montagem de folhas'})).toBeVisible();await expect(page.getByLabel('Recortar folha ao conteúdo')).toBeChecked();
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=32;c.getContext('2d').fillRect(0,0,64,32);return c.toDataURL().split(',')[1];});await page.locator('input[type=file]').first().setInputFiles({name:'detalhes.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.getByRole('combobox',{name:'Comprimento da folha',exact:true}).selectOption('custom');await page.getByRole('spinbutton',{name:'Compr. (cm)',exact:true}).fill('1');await page.getByLabel('Lado maior detalhes.png').fill('0.2');await page.getByRole('spinbutton',{name:'Espaço H (cm)',exact:true}).fill('0.4');await expect(page.locator('.art-cm')).toHaveText('0.200×0.100');await expect(page.locator('.sheet-meta')).toContainText('Exportação:');
 await page.getByRole('combobox',{name:'Qualidade do export',exact:true}).first().selectOption('high');await expect(page.getByRole('status').filter({hasText:'A qualidade selecionada'})).toContainText('reduz os pixels');await page.getByRole('combobox',{name:'Qualidade do export',exact:true}).first().selectOption('native');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'PNG',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.png$/);
 if(page.viewportSize().width<600)await page.screenshot({path:'/tmp/dtf-studio-montadora.png',fullPage:true});
 const sizes=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,viewport:innerWidth}));expect(sizes.doc).toBeLessThanOrEqual(sizes.viewport);
 await page.getByRole('link',{name:'Calculadora e orçamentos'}).click();await expect(page.locator('#btn-calc')).toBeVisible();
});
test('rotação e folha sob medida conservam o mesmo layout e a altura física entre preview e export',async({page})=>{
 await page.goto(dev);
 const result=await page.evaluate(async()=>{
  const {DEFAULT_CONFIG}=await import('/src/types.ts');const {packArts,scalePackedSheet}=await import('/src/utils/pack.ts');
  const source=document.createElement('canvas');source.width=64;source.height=32;
  const art={id:'a',name:'Girado',trimmedCanvas:source,trimmedWidthPx:64,trimmedHeightPx:32,quantity:4,maxSideCmOverride:null,rotate90:true};
  const cfg={...DEFAULT_CONFIG,widthCm:1,maxSideCm:.2,packMode:'grade',gapXMm:4,gapYMm:4,sheetGrowMode:'auto_height'};
  const preview=packArts([art],{...cfg,dpi:150},{skipPreview:true}).sheets[0],exported=packArts([art],{...cfg,dpi:813},{skipPreview:true}).sheets[0],scaled=scalePackedSheet(preview,150,813);
  return {previewCm:preview.usedHeightCm,exportCm:exported.usedHeightCm,exportHeight:exported.heightPx,dims:exported.placements.map(p=>[p.width,p.height,p.rotated]),direct:exported.placements.map(p=>[p.x,p.y,p.width,p.height]),scaled:scaled.placements.map(p=>[p.x,p.y,p.width,p.height]),width:exported.widthPx};
 });
 expect(result.previewCm).toBe(result.exportCm);expect(result.exportCm).toBeCloseTo(.8,3);expect(result.direct).toEqual(result.scaled);expect(result.exportHeight).toBe(Math.round(.8*813/2.54));expect(result.width).toBe(Math.round(813/2.54));for(const d of result.dims)expect(d).toEqual([32,64,true]);
});
test('exportação inviável informa limite sem reduzir resolução silenciosamente',async({page})=>{
 await page.goto(dev);
 const error=await page.evaluate(async()=>{const {sheetToPngBlob}=await import('/src/utils/exportPng.ts');try{await sheetToPngBlob({widthPx:100000,heightPx:100000,index:0,placements:[],previewUrl:''},12700);return null}catch(e){return e.message}});
 expect(error).toContain('excede o limite seguro');expect(error).toContain('não foi reduzida automaticamente');
});

test('PDF no aplicativo compilado carrega o worker e gera prévia sem fundo externo',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/montadora/');await page.getByRole('checkbox',{name:'Remover fundo branco externo do PDF'}).check();
 await page.locator('input[type=file]').first().setInputFiles({name:'fundo-branco.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixturePdf(true))});
 await expect(page.locator('.art-cm')).toHaveText('5.000×5.000');await expect(page.locator('.status-banner')).toContainText('branco externo removido');await expect(page.locator('.sheet-preview img')).toBeVisible();expect(errors).toEqual([]);
});
