const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const dev='http://127.0.0.1:5174';

async function pngFixture(page,empty=false){
 return Buffer.from(await page.evaluate(empty=>{
  const c=document.createElement('canvas');c.width=80;c.height=48;
  if(!empty){const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(8,8,64,32);x.clearRect(30,20,4,4);x.fillStyle='rgba(255,255,255,0.004)';x.fillRect(7,8,1,1);}
  return c.toDataURL().split(',')[1];
 },empty),'base64');
}
async function download(page,button){
 const pending=page.waitForEvent('download');await button.click();return fs.readFile(await (await pending).path());
}
async function decode(page,buffer){
 return page.evaluate(async base64=>{
  const blob=await (await fetch('data:image/png;base64,'+base64)).blob();
  const b=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);
  const pixels=x.getImageData(0,0,c.width,c.height).data;let white=0,clear=0,soft=0;
  for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]===0)clear++;else if(pixels[i+3]<255)soft++;else if(pixels[i]===255&&pixels[i+1]===255&&pixels[i+2]===255)white++;}
  return {width:b.width,height:b.height,white,clear,soft};
 },buffer.toString('base64'));
}

test('recorte alpha zero preserva pixels suaves, brancos e tamanho; vazio é rejeitado mesmo sem recorte',async({page})=>{
 await page.goto(dev);
 const result=await page.evaluate(async()=>{
  const {applyTrim,trimToAlphaBounds}=await import('/src/utils/trim.ts');
  const c=document.createElement('canvas');c.width=80;c.height=48;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(8,8,64,32);x.fillStyle='rgba(255,255,255,0.004)';x.fillRect(7,8,1,1);
  const r=trimToAlphaBounds(c,80,48,0),data=r.canvas.getContext('2d').getImageData(0,0,65,32).data;
  const errors=[];for(const enabled of [true,false])try{applyTrim(document.createElement('canvas'),enabled,0)}catch(e){errors.push(e.message)}
  return {width:r.width,height:r.height,soft:data[3],white:[...data.slice(4,8)],original:[c.width,c.height],errors};
 });
 expect(result).toMatchObject({width:65,height:32,soft:1,white:[255,255,255,255],original:[80,48]});expect(result.errors).toHaveLength(2);for(const e of result.errors)expect(e).toContain('totalmente transparente');
 await page.goto('/montadora/');const empty=await pngFixture(page,true);
 for(const trim of [true,false]){await page.getByLabel('Recortar bordas da arte').setChecked(trim);await page.locator('input[type=file]').first().setInputFiles({name:'vazia.png',mimeType:'image/png',buffer:empty});await expect(page.locator('.status-banner')).toContainText('totalmente transparente');await expect(page.locator('.art-cm')).toHaveCount(0);}
});

test('eixos independentes em todos os modos respeitam margens, limites, quantidades e geometria entre DPIs',async({page})=>{
 await page.goto(dev);
 const results=await page.evaluate(async()=>{
  const {DEFAULT_CONFIG}=await import('/src/types.ts');const {packArts}=await import('/src/utils/pack.ts');const {resolveExportGeometry}=await import('/src/utils/exportPng.ts');
  const c=document.createElement('canvas');c.width=64;c.height=32;c.getContext('2d').fillRect(0,0,64,32);
  const arts=[{id:'a',name:'a',trimmedCanvas:c,trimmedWidthPx:64,trimmedHeightPx:32,quantity:17,maxSideCmOverride:.2,rotate90:false},{id:'b',name:'b',trimmedCanvas:c,trimmedWidthPx:64,trimmedHeightPx:32,quantity:11,maxSideCmOverride:.4,rotate90:true}];
  const out=[];
  for(const mode of ['maxrects','grade','group_rows','group_cols'])for(const [gx,gy] of [[0,0],[2,2],[3,3],[4,4],[0,4],[4,0],[2,3]])for(const margin of [0,1])for(const grow of ['fixed','auto_height']){
   let previous;
   for(const dpi of [150,813]){
    const cfg={...DEFAULT_CONFIG,widthCm:1,heightCm:2,gapXMm:gx,gapYMm:gy,marginMm:margin,packMode:mode,sheetGrowMode:grow,dpi};
    const r=packArts(arts,cfg,{skipPreview:true});const counts={a:0,b:0};let valid=true;
    const layout=JSON.stringify(r.sheets.map(s=>s.layout));
    // Compare geometry only: layout retains source canvas references and canonical dpi.
    for(const sheet of r.sheets){const l=sheet.layout;const m=margin*1000;
     for(let i=0;i<l.placements.length;i++){const a=l.placements[i];counts[a.artId]++;if(a.x<m||a.y<m||a.x+a.width>l.width-m+.01||a.y+a.height>l.height-m+.01)valid=false;
      for(let j=i+1;j<l.placements.length;j++){const b=l.placements[j];const dx=Math.max(a.x-b.x-b.width,b.x-a.x-a.width),dy=Math.max(a.y-b.y-b.height,b.y-a.y-a.height);if(dx<gx*1000-.01&&dy<gy*1000-.01)valid=false;}
     }
     const g=resolveExportGeometry(sheet,dpi,{cropEmpty:true,marginMm:margin});if(g.widthPx>sheet.widthPx||g.heightPx>sheet.heightPx)valid=false;
    }
    out.push({mode,gx,gy,margin,grow,dpi,valid,counts,errors:r.errors,same:previous==null||layout===previous});previous=layout;
   }
  }return out;
 });
 for(const r of results){expect(r,JSON.stringify(r)).toMatchObject({valid:true,counts:{a:17,b:11},errors:[],same:true});}
});

test('exclusão individual, múltipla e última limpa montagem e conserva configurações',async({page})=>{
 await page.goto('/montadora/');const buffer=await pngFixture(page);
 await page.locator('input[type=file]').first().setInputFiles(['a','b','c'].map(n=>({name:n+'.png',mimeType:'image/png',buffer})));
 await expect(page.locator('.art-cm')).toHaveCount(3);
 await page.getByRole('spinbutton',{name:'Espaço H (cm)',exact:true}).fill('0');await page.getByRole('spinbutton',{name:'Espaço V (cm)',exact:true}).fill('0.4');await page.getByLabel('Margem (cm)',{exact:true}).fill('0.2');
 const del=page.getByRole('button',{name:'Excluir arte a.png',exact:true});await expect(del).toBeVisible();const box=await del.boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize().width);await del.click();await expect(page.locator('.art-cm')).toHaveCount(2);await expect(page.locator('.sheet-meta')).toContainText('2 peça(s)');
 await page.getByRole('button',{name:'Nenhuma',exact:true}).click();await page.getByLabel('Selecionar b.png',{exact:true}).check();await page.getByRole('button',{name:'Excluir selecionadas',exact:true}).click();await expect(page.locator('.art-cm')).toHaveCount(1);await expect(page.locator('.sheet-meta')).toContainText('1 peça(s)');
 await page.getByRole('button',{name:'Excluir arte c.png',exact:true}).click();await expect(page.locator('.sheet-preview')).toHaveCount(0);await expect(page.getByRole('button',{name:'PNG',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Baixar PNG',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Espaço H (cm)',{exact:true})).toHaveValue('0');await expect(page.getByLabel('Espaço V (cm)',{exact:true})).toHaveValue('0.4');await expect(page.getByLabel('Margem (cm)',{exact:true})).toHaveValue('0.2');
 await page.locator('input[type=file]').first().setInputFiles(['d','e'].map(n=>({name:n+'.png',mimeType:'image/png',buffer})));await expect(page.locator('.art-cm')).toHaveCount(2);await page.getByRole('button',{name:'Excluir selecionadas',exact:true}).click();await expect(page.locator('.art-cm')).toHaveCount(0);await expect(page.locator('.sheet-preview')).toHaveCount(0);
});

test('fundos só visuais: PNGs reais e arte individual preservam transparência e branco',async({page})=>{
 await page.goto('/montadora/');const buffer=await pngFixture(page);await page.locator('input[type=file]').first().setInputFiles({name:'branca.png',mimeType:'image/png',buffer});await page.getByLabel('Largura branca.png').fill('0.2');
 await expect(page.locator('.sheet-preview img')).toBeVisible();await expect(page.locator('.sheet-preview')).toHaveCSS('background-color','rgb(32, 38, 52)');await expect(page.getByLabel('Recortar folha ao conteúdo')).toBeChecked();
 const button=page.getByRole('button',{name:'PNG',exact:true});await expect(button).toBeEnabled();const original=await download(page,button);const pixels=await decode(page,original);const preview=await page.locator('.sheet-preview img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));expect(Math.abs(preview.w/preview.h-65/32)).toBeLessThan(.2);expect(pixels.white).toBeGreaterThan(1900);expect(pixels.clear).toBeGreaterThan(0);expect(pixels.soft).toBeGreaterThan(0);expect(pixels.width).toBe(65);expect(pixels.height).toBe(32);
 for(const background of ['light','checker','custom','dark']){
  await page.getByLabel('Fundo da prévia').selectOption(background);if(background==='custom')await page.getByLabel('Cor da prévia').fill('#ff00ff');const next=await download(page,button);expect(next.equals(original)).toBe(true);
 }
 const art=await download(page,page.getByTitle('Baixar PNG cortado'));const individual=await decode(page,art);expect(individual).toEqual(pixels);
 // Two sheets are downloaded as separate PNGs, never an archive.
 await page.getByRole('combobox',{name:'Qualidade do export',exact:true}).first().selectOption('fast');await page.getByLabel('Largura branca.png').fill('29');await page.getByLabel('Quantidade branca.png').fill('3');
 const downloads=[];const listener=d=>downloads.push(d);page.on('download',listener);
 const allButton=page.getByRole('button',{name:'Baixar PNGs',exact:true});await expect(allButton).toBeEnabled();await allButton.click();
 await expect.poll(()=>downloads.length).toBe(2);await expect(allButton).toBeEnabled();page.off('download',listener);
 expect(downloads.map(d=>d.suggestedFilename())).toEqual(['folha-01.png','folha-02.png']);
 for(const item of downloads){const p=await decode(page,await fs.readFile(await item.path()));expect(p.white).toBeGreaterThan(0);expect(p.clear).toBeGreaterThan(0);}
 await expect(page.getByRole('region',{name:'Partes PNG'})).toBeVisible();

});

test('arredondamento de pixels não sobrepõe peças adjacentes com espaço zero',async({page})=>{
 await page.goto(dev);
 const failures=await page.evaluate(async()=>{
  const {DEFAULT_CONFIG}=await import('/src/types.ts');const {packArts}=await import('/src/utils/pack.ts');
  const c=document.createElement('canvas');c.width=16;c.height=16;
  const art={id:'a',name:'pequena',trimmedCanvas:c,trimmedWidthPx:16,trimmedHeightPx:16,quantity:100,maxSideCmOverride:.1,rotate90:false};const failures=[];
  for(const mode of ['maxrects','grade','group_rows','group_cols'])for(const dpi of [150,300,813]){
   const {sheets}=packArts([art],{...DEFAULT_CONFIG,widthCm:1,heightCm:1,gapXMm:0,gapYMm:0,packMode:mode,dpi},{skipPreview:true});
   for(const sheet of sheets)for(let i=0;i<sheet.placements.length;i++){const a=sheet.placements[i];if(a.x+a.width>sheet.widthPx||a.y+a.height>sheet.heightPx)failures.push('limite '+mode+' '+dpi);for(let j=i+1;j<sheet.placements.length;j++){const b=sheet.placements[j];if(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)failures.push('sobreposição '+mode+' '+dpi);}}
  }return failures;
 });expect(failures).toEqual([]);
});

test('exportação real com rotação, recorte e margem preserva DPI e não usa montagem antiga',async({page})=>{
 await page.goto('/montadora/');const buffer=await pngFixture(page);await page.locator('input[type=file]').first().setInputFiles({name:'medidas.png',mimeType:'image/png',buffer});
 await page.getByLabel('Largura medidas.png').fill('0.2');await page.getByText('Opções de PDF e recorte',{exact:true}).click();await page.getByLabel('Sensib. corte (alpha)',{exact:true}).fill('8');await page.getByLabel('Sensib. corte (alpha)',{exact:true}).fill('0');await expect(page.getByLabel('Sensib. corte (alpha)',{exact:true})).toHaveValue('0');
 await page.getByRole('combobox',{name:'Comprimento da folha',exact:true}).selectOption('auto');await page.getByLabel('Margem (cm)',{exact:true}).fill('0.1');await page.getByRole('button',{name:'90°',exact:true}).click();
 const button=page.getByRole('button',{name:'PNG',exact:true});await expect(button).toBeEnabled();
 const png=await download(page,button);const pixels=await decode(page,png);
 let offset=8,dpi;while(offset+12<=png.length){const n=png.readUInt32BE(offset);if(png.toString('ascii',offset+4,offset+8)==='pHYs')dpi=png.readUInt32BE(offset+8)*.0254;offset+=n+12;}
 expect(dpi).toBeCloseTo(826,1);expect(Math.abs(pixels.width*2.54/dpi-(.2*32/65+.2))).toBeLessThanOrEqual(2.54/dpi);expect(Math.abs(pixels.height*2.54/dpi-.4)).toBeLessThanOrEqual(2.54/dpi);expect(pixels.white).toBeGreaterThan(1900);expect(pixels.clear).toBeGreaterThan(0);
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
 await page.getByLabel('Quantidade medidas.png').fill('2');await expect(button).toBeDisabled();await page.clock.runFor(1000);await expect(button).toBeEnabled();await expect(page.locator('.sheet-meta')).toContainText('2 peça(s)');
 await page.clock.resume();
 const current=await decode(page,await download(page,button));expect(current.width*current.height).toBeGreaterThan(pixels.width*pixels.height);expect(current.white).toBeGreaterThan(pixels.white);
});
