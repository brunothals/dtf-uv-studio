const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const dev='http://127.0.0.1:5174';

async function fixture(page) {
 return Buffer.from(await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=32;c.height=24;const x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(10,5,10,14);x.fillStyle='#000';x.fillRect(14,6,2,12);
  x.fillStyle='#f00';x.fillRect(1,1,1,1);x.fillRect(30,21,1,1);
  return c.toDataURL().split(',')[1];
 }),'base64');
}
async function importFixture(page,names=['arte.png']) {
 const buffer=await fixture(page);await page.locator('input[type=file]').first().setInputFiles(names.map(name=>({name,mimeType:'image/png',buffer})));
 await expect(page.locator('.art-editor')).toHaveCount(names.length);
}
async function downloadArt(page,name='arte.png') {
 const pending=page.waitForEvent('download');await page.locator('.art-editor').filter({has:page.getByLabel(`Quantidade ${name}`,{exact:true})}).getByRole('button',{name:'Baixar arte',exact:true}).click();return fs.readFile(await(await pending).path());
}
async function decoded(page,bytes) {
 return page.evaluate(async b64=>{const b=await createImageBitmap(await(await fetch('data:image/png;base64,'+b64)).blob());const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);const data=x.getImageData(0,0,c.width,c.height).data;let ink=0,white=0,clear=0;for(let i=0;i<data.length;i+=4){if(data[i+3]){ink++;if(data[i]===255&&data[i+1]===255&&data[i+2]===255)white++;}else clear++;}return{width:c.width,height:c.height,ink,white,clear};},bytes.toString('base64'));
}

test('limpeza preserva o maior componente, antialias conectado e brancos, sem tocar no original',async({page})=>{
 await page.goto(dev);const r=await page.evaluate(async()=>{
  const {prepareArt}=await import('/src/utils/prepareArt.ts');
  const c=document.createElement('canvas');c.width=12;c.height=12;const x=c.getContext('2d'),img=x.createImageData(12,12);
  const put=(px,py,color=[255,255,255,255])=>img.data.set(color,(py*12+px)*4);
  for(let y=4;y<7;y++)for(let p=4;p<7;p++)put(p,y);put(5,5,[0,0,0,255]);put(7,7,[255,255,255,1]);put(0,0);put(1,0);put(10,10);
  x.putImageData(img,0,0);const original=Array.from(x.getImageData(0,0,12,12).data);
  const inactive=prepareArt(c,{cleanSpecks:false,maxSpeckPixels:100,thicken:false,radiusPx:3});
  const settings={cleanSpecks:true,maxSpeckPixels:3,thicken:false,radiusPx:1};const out=prepareArt(c,settings),data=out.canvas.getContext('2d').getImageData(0,0,12,12).data;
  const tiny=document.createElement('canvas');tiny.width=5;tiny.height=5;tiny.getContext('2d').fillRect(0,0,1,1);tiny.getContext('2d').fillRect(4,4,1,1);const small=prepareArt(tiny,{...settings,maxSpeckPixels:100});
  let kept=0;const sp=small.canvas.getContext('2d').getImageData(0,0,5,5).data;for(let i=3;i<sp.length;i+=4)if(sp[i])kept++;
  let rejected=false;try{prepareArt({width:5000,height:5000,getContext(){throw Error('não deveria alocar')}},settings);}catch(e){rejected=e.message.includes('16 megapixels');}
  return {same:inactive.canvas===c,stats:out.stats,unchanged:JSON.stringify(original)===JSON.stringify(Array.from(x.getImageData(0,0,12,12).data)),soft:data[(7*12+7)*4+3],white:Array.from(data.slice((4*12+4)*4,(4*12+4)*4+4)),black:Array.from(data.slice((5*12+5)*4,(5*12+5)*4+4)),removed:data[3]+data[7]+data[(10*12+10)*4+3],kept,rejected};
 });
 expect(r).toEqual({same:true,stats:{removedPixels:3,addedPixels:0},unchanged:true,soft:1,white:[255,255,255,255],black:[0,0,0,255],removed:0,kept:1,rejected:true});
});

test('engrossamento expande sem cortar bordas, preserva cores e alpha externo transparente',async({page})=>{
 await page.goto(dev);const r=await page.evaluate(async()=>{
  const {prepareArt}=await import('/src/utils/prepareArt.ts');const c=document.createElement('canvas');c.width=3;c.height=3;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,1,1);
  const settings={cleanSpecks:false,maxSpeckPixels:4,thicken:true,radiusPx:2};const a=prepareArt(c,settings),b=prepareArt(c,settings),p=a.canvas.getContext('2d').getImageData(0,0,7,7).data;
  let ink=0,white=0;for(let i=0;i<p.length;i+=4)if(p[i+3]){ink++;if(p[i]===255&&p[i+1]===255&&p[i+2]===255)white++;}
  return{w:a.canvas.width,h:a.canvas.height,stats:a.stats,ink,white,corner:p[3],top:p[(0*7+2)*4+3],same:a.canvas.toDataURL()===b.canvas.toDataURL(),original:x.getImageData(0,0,3,3).data.filter((value,i)=>i%4===3&&value>0).length};
 });
 expect(r.w).toBe(7);expect(r.h).toBe(7);expect(r.stats).toEqual({removedPixels:0,addedPixels:12});expect(r.ink).toBe(13);expect(r.white).toBe(13);expect(r.corner).toBe(0);expect(r.top).toBe(255);expect(r.same).toBe(true);expect(r.original).toBe(1);
});

test('resolução usa o eixo mais fraco e conferência detecta troca de modelos com mesmo total',async({page})=>{
 await page.goto(dev);const r=await page.evaluate(async()=>{
  const {sourceResolutionDpi,auditQuantities}=await import('/src/utils/preflight.ts');
  const a={id:'a',name:'A',quantity:2,trimmedWidthPx:1200,trimmedHeightPx:300,widthCmOverride:10,heightCmOverride:10,maxSideCmOverride:null};const b={id:'b',name:'B',quantity:1};
  const sheet=ids=>[{placements:ids.map(artId=>({artId}))}];
  return{dpi:sourceResolutionDpi(a,10),valid:auditQuantities([a,b],sheet(['a','a','b'])).valid,swapped:auditQuantities([a,b],sheet(['a','b','b'])).valid,missing:auditQuantities([a,b],sheet(['a','b'])).valid,unknown:auditQuantities([a,b],sheet(['a','a','x'])).valid,zero:auditQuantities([{...a,quantity:0}],[]).valid};
 });expect(r).toEqual({dpi:76.2,valid:true,swapped:false,missing:false,unknown:false,zero:true});
});

test('ajustes são opcionais, aplicados às selecionadas, reversíveis e usados nos PNGs reais',async({page})=>{
 await page.goto('/montadora/');await importFixture(page,['arte.png','outra.png']);
 await page.getByText('Preparação e conferência DTF UV (opcional)',{exact:true}).click();
 for(const name of ['Limpar pixels isolados','Engrossar traços','Alertar baixa resolução no tamanho de impressão','Conferir quantidades antes de baixar'])await expect(page.getByRole('checkbox',{name,exact:true})).not.toBeChecked();
 const baseline=await downloadArt(page);const original=await decoded(page,baseline);
 await page.getByLabel('Selecionar outra.png',{exact:true}).uncheck();
 await page.getByLabel('Quantidade arte.png',{exact:true}).fill('3');await page.getByLabel('Largura arte.png',{exact:true}).fill('10');
 const beforeSize=await page.locator('.art-cm').first().textContent();
 await page.getByRole('checkbox',{name:'Limpar pixels isolados',exact:true}).check();await page.getByRole('checkbox',{name:'Engrossar traços',exact:true}).check();
 await expect(page.locator('.art-comparison')).toHaveCount(0);expect((await downloadArt(page)).equals(baseline)).toBe(true);
 await page.getByRole('button',{name:'Aplicar às selecionadas',exact:true}).click();await expect(page.locator('.art-comparison')).toHaveCount(1);
 await page.getByText('Comparar original e resultado',{exact:true}).click();await expect(page.getByAltText('Original arte.png',{exact:true})).toBeVisible();await expect(page.getByAltText('Resultado arte.png',{exact:true})).toBeVisible();
 const processed=await downloadArt(page),after=await decoded(page,processed);expect(after.ink).toBeGreaterThan(original.ink);expect(after.white).toBeGreaterThan(0);expect(after.clear).toBeGreaterThan(0);expect(processed.equals(baseline)).toBe(false);
 await expect(page.getByLabel('Quantidade arte.png',{exact:true})).toHaveValue('3');expect(Math.max(...(await page.locator('.art-cm').first().textContent()).split('×').map(Number))).toBe(10);
 expect(beforeSize).toContain('10.000');
 await page.getByRole('button',{name:'Aplicar às selecionadas',exact:true}).click();await expect(page.getByRole('button',{name:'Aplicar às selecionadas',exact:true})).toBeEnabled();expect((await downloadArt(page)).equals(processed)).toBe(true);
 await page.getByRole('checkbox',{name:'Conferir quantidades antes de baixar',exact:true}).check();const audit=page.getByRole('region',{name:'Conferência de quantidades'});await expect(audit).toContainText('4 de 4');await audit.getByText('Conferência por modelo',{exact:true}).click();await expect(audit.getByRole('row')).toHaveCount(3);
 await page.getByRole('checkbox',{name:'Alertar baixa resolução no tamanho de impressão',exact:true}).check();await expect(page.locator('.source-resolution').first()).toContainText('Baixa resolução');await page.getByRole('checkbox',{name:'Alertar baixa resolução no tamanho de impressão',exact:true}).uncheck();await expect(page.locator('.source-resolution')).toHaveCount(0);
 await page.getByRole('button',{name:'Restaurar original arte.png',exact:true}).click();await expect(page.locator('.art-comparison')).toHaveCount(0);expect((await downloadArt(page)).equals(baseline)).toBe(true);
 await page.getByRole('checkbox',{name:'Conferir quantidades antes de baixar',exact:true}).uncheck();await expect(audit).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});
