const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const dev='http://127.0.0.1:5174';
async function importArts(page,names=['larga.png']){
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=32;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,64,32);x.clearRect(5,5,3,3);return c.toDataURL().split(',')[1]});
 await page.locator('input[type=file]').first().setInputFiles(names.map(name=>({name,mimeType:'image/png',buffer:Buffer.from(data,'base64')})));
 await expect(page.locator('.art-editor')).toHaveCount(names.length);
}
async function download(page){const pending=page.waitForEvent('download');const button=page.getByRole('button',{name:'PNG',exact:true});await expect(button).toBeEnabled();await button.click();return fs.readFile(await(await pending).path())}

test('três artes, tela inteira, campos legíveis e X sem rolagem lateral',async({page})=>{
 await page.goto('/montadora/');await importArts(page,['a.png','b.png','c.png']);
 await expect(page.getByRole('combobox',{name:'Modo de montagem'})).toHaveValue('grade');
 for(const [i,name] of ['a.png','b.png','c.png'].entries()){await page.getByLabel('Largura '+name,{exact:true}).fill(String(i+1));await page.getByLabel('Quantidade '+name,{exact:true}).fill(String((i+1)*3));}
 await expect(page.locator('.art-cm')).toHaveText(['1.000×0.500','2.000×1.000','3.000×1.500']);await expect(page.locator('.layout-summary')).toContainText('18 de 18');
 const widths=page.viewportSize().width<600?[320,390]:[1024,1366,1920];
 for(const width of widths){await page.setViewportSize({width,height:900});const geometry=await page.evaluate(()=>({page:document.documentElement.scrollWidth,width:innerWidth,app:document.querySelector('.folha-app').getBoundingClientRect().width,cards:[...document.querySelectorAll('.art-editor')].map(e=>({scroll:e.scrollWidth,width:e.clientWidth})),buttons:[...document.querySelectorAll('.art-delete')].map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))}));expect(geometry.page).toBeLessThanOrEqual(width);expect(geometry.app).toBeGreaterThan(width-40);for(const c of geometry.cards)expect(c.scroll).toBeLessThanOrEqual(c.width+1);for(const b of geometry.buttons){expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width);}}
 await page.getByText('Opções de PDF e recorte',{exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);await page.getByText('Opções de PDF e recorte',{exact:true}).click();
 if(page.viewportSize().width<950){await page.getByRole('button',{name:'Ver prévia',exact:true}).click();await expect(page.locator('.preview-stage')).toBeInViewport();await page.getByRole('button',{name:'Editar artes',exact:true}).click();await expect(page.locator('.art-editor').first()).toBeInViewport();}
 await page.getByRole('button',{name:'Excluir arte b.png',exact:true}).click();await expect(page.locator('.art-cm')).toHaveText(['1.000×0.500','3.000×1.500']);await page.getByRole('button',{name:'Desfazer exclusão (1)'}).click();await expect(page.locator('.art-cm')).toHaveText(['1.000×0.500','2.000×1.000','3.000×1.500']);
 await expect(page.locator('.layout-summary')).toContainText('18 de 18');
 await page.screenshot({path:`/tmp/dtf-editor-${page.viewportSize().width}.png`,fullPage:true});
});

test('variantes independentes, altura/largura, proporção e rotação conservam medidas',async({page})=>{
 await page.goto('/montadora/');await importArts(page);await page.getByLabel('Largura larga.png',{exact:true}).fill('4');await expect(page.getByLabel('Altura larga.png',{exact:true})).toHaveValue('2');
 await page.getByRole('button',{name:'Duplicar larga.png',exact:true}).click();const variant='larga.png — variação 2';await page.getByLabel('Altura '+variant,{exact:true}).fill('3');await page.getByLabel('Quantidade '+variant,{exact:true}).fill('7');await expect(page.locator('.art-cm')).toHaveText(['4.000×2.000','6.000×3.000']);
 const card=page.locator('.art-editor').nth(1);await card.getByRole('button',{name:'90°',exact:true}).click();await expect(page.locator('.art-cm').nth(1)).toHaveText('3.000×6.000 ↻');await page.getByLabel('Largura '+variant,{exact:true}).fill('2');await expect(page.locator('.art-cm').nth(1)).toHaveText('2.000×4.000 ↻');
 await page.getByLabel('Manter proporção '+variant,{exact:true}).uncheck();await page.getByLabel('Altura '+variant,{exact:true}).fill('3');await expect(page.locator('.art-cm').nth(1)).toHaveText('2.000×3.000 ↻');await page.getByLabel('Manter proporção '+variant,{exact:true}).check();await expect(page.locator('.art-cm').nth(1)).toHaveText('2.000×4.000 ↻');await expect(page.getByLabel('Quantidade larga.png',{exact:true})).toHaveValue('1');
 // A pessoa pode apagar o campo e digitar um decimal sem o valor antigo voltar no meio.
 const input=page.getByLabel('Largura larga.png',{exact:true});await input.fill('');await input.pressSequentially('0.2');await input.blur();await expect(page.locator('.art-cm').first()).toHaveText('0.200×0.100');
});

test('ações em lote alteram só selecionadas e pedidos se mantêm por arte',async({page})=>{
 await page.goto('/montadora/');await importArts(page,['a.png','b.png','c.png']);await page.getByRole('button',{name:'Nenhuma',exact:true}).click();await page.getByLabel('Selecionar a.png',{exact:true}).check();await page.getByLabel('Selecionar c.png',{exact:true}).check();await page.getByText('Editar selecionadas (2)',{exact:true}).click();
 await page.getByLabel('Quantidade em lote',{exact:true}).fill('8');await page.getByRole('button',{name:'Aplicar quantidade',exact:true}).click();await page.getByLabel('Largura em lote (cm)',{exact:true}).fill('3');await page.getByRole('button',{name:'Aplicar largura',exact:true}).click();await page.getByLabel('Pedido em lote',{exact:true}).fill('Pedido A');await page.getByRole('button',{name:'Aplicar pedido',exact:true}).click();
 await expect(page.getByLabel('Quantidade a.png',{exact:true})).toHaveValue('8');await expect(page.getByLabel('Quantidade b.png',{exact:true})).toHaveValue('1');await expect(page.getByLabel('Quantidade c.png',{exact:true})).toHaveValue('8');await expect(page.getByLabel('Largura b.png',{exact:true})).toHaveValue('5');await expect(page.getByLabel('Pedido a.png',{exact:true})).toHaveValue('Pedido A');await expect(page.getByLabel('Pedido b.png',{exact:true})).toHaveValue('');
 await page.getByRole('combobox',{name:'Modo de montagem'}).selectOption('group_rows');await expect(page.locator('.layout-summary')).toContainText('17 de 17');await page.getByRole('button',{name:'Excluir selecionadas',exact:true}).click();await expect(page.locator('.art-editor')).toHaveCount(1);await expect(page.getByLabel('Quantidade b.png',{exact:true})).toHaveValue('1');
});

test('zoom, guias e seleção na prévia não mudam os bytes do PNG',async({page})=>{
 await page.goto('/montadora/');await importArts(page);await page.getByLabel('Largura larga.png',{exact:true}).fill('0.2');const original=await download(page);
 const stage=page.locator('.preview-stage');const box=await stage.boundingBox();expect(box.width).toBeGreaterThan(100);await stage.click({position:{x:box.width/2,y:box.height/2}});await expect(page.locator('.art-editor')).toHaveClass(/is-focused/);await expect(page.getByTestId('preview-selection')).toHaveCount(1);
 await page.getByLabel('Zoom da prévia').selectOption('2');await page.getByLabel('Mostrar guias de corte e PNGs').uncheck();const next=await download(page);expect(next.equals(original)).toBe(true);await page.getByLabel('Zoom da prévia').selectOption('1');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

test('divisões procuram corredores vazios e sinalizam uma arte maior que a parte',async({page})=>{
 await page.goto(dev);const result=await page.evaluate(async()=>{
  const {planPngParts}=await import('/src/utils/exportPng.ts');const c=document.createElement('canvas');c.width=6;c.height=4;
  const p={artId:'a',name:'a',x:0,y:0,width:6,height:4,source:c,rotated:false};const sheet={index:0,widthPx:6,heightPx:10,previewUrl:'',placements:[p,{...p,artId:'b',y:5}]};const limits={maxSide:8,maxPixels:64};
  return {safe:planPngParts(sheet,300,undefined,limits),forced:planPngParts({...sheet,placements:[{...p,height:10}]},300,undefined,limits)};
 });expect(result.safe).toHaveLength(2);expect(result.safe[0].heightPx).toBe(5);expect(result.safe.every(p=>!p.cutsArtwork)).toBe(true);expect(result.forced.some(p=>p.cutsArtwork)).toBe(true);
 await page.goto('/montadora/');await importArts(page);await page.getByRole('combobox',{name:'Largura da folha'}).selectOption('custom');await page.getByLabel('Largura personalizada (cm)').fill('300');await page.getByRole('combobox',{name:'Comprimento da folha',exact:true}).selectOption('custom');await page.getByLabel('Compr. (cm)',{exact:true}).fill('150');await page.getByLabel('Largura larga.png',{exact:true}).fill('300');
 await expect(page.locator('.sheet-cut-warning')).toContainText('atravessa uma arte');await expect(page.getByTestId('part-guides')).toBeVisible();await page.getByLabel('Mostrar guias de corte e PNGs').uncheck();await expect(page.getByTestId('part-guides')).toHaveCount(0);
});

function fixturePdf(ink){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${ink.map((_,i)=>`${3+2*i} 0 R`).join(' ')}] /Count ${ink.length} >>`];ink.forEach((draw,i)=>{const content=draw?'0 0 0 rg 12 12 48 48 re f\n':'';objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] /Resources << >> /Contents ${4+2*i} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}endstream`)});let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`});const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');return Buffer.from(pdf+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}
test('páginas vazias de PDF não interrompem as páginas válidas seguintes',async({page})=>{
 for(const pages of [[false,true],[true,false,true],[true,false]]){
  await page.goto('/montadora/');await page.locator('input[type=file]').first().setInputFiles({name:'paginas.pdf',mimeType:'application/pdf',buffer:fixturePdf(pages)});await expect(page.locator('.art-editor')).toHaveCount(pages.filter(Boolean).length);await expect(page.locator('.status-banner')).toContainText('falharam');
 }
});

test('fileiras permanecem alinhadas e grupo reúne pedidos com medidas diferentes',async({page})=>{
 await page.goto(dev);const result=await page.evaluate(async()=>{
  const {DEFAULT_CONFIG}=await import('/src/types.ts');const {packArts}=await import('/src/utils/pack.ts');const {resizeArt}=await import('/src/utils/artEditing.ts');const {resolveExportDpi}=await import('/src/utils/units.ts');
  const c=document.createElement('canvas');c.width=64;c.height=32;const base={id:'a',name:'a',trimmedCanvas:c,trimmedWidthPx:64,trimmedHeightPx:32,quantity:2,maxSideCmOverride:null,rotate90:false};const a=resizeArt(base,'width',.2,5),b=resizeArt({...base,id:'b',name:'b'},'height',.3,5),d=resizeArt({...base,id:'d',name:'d'},'width',.4,5);
  const arts=[{...a,groupName:'Pedido 1'},b,{...d,groupName:'Pedido 1'}];const cfg={...DEFAULT_CONFIG,widthCm:3,heightCm:3,dpi:813};const rows=packArts(arts,cfg,{skipPreview:true}).sheets;let aligned=true;for(const sheet of rows){const ps=sheet.layout.placements;for(const y of [...new Set(ps.map(p=>p.y))]){const onRow=ps.filter(p=>p.y===y);const next=ps.filter(p=>p.y>y);if(next.some(p=>p.y<Math.max(...onRow.map(a=>a.y+a.height))+3000))aligned=false;}}
  const grouped=packArts(arts,{...cfg,packMode:'group_rows'},{skipPreview:true}).sheets.flatMap(s=>s.layout.placements.map(p=>p.artId));return {aligned,grouped,dpi:resolveExportDpi([a],cfg),size:[a.widthCmOverride,a.heightCmOverride]};
 });expect(result.aligned).toBe(true);expect(result.grouped).toEqual(['a','a','d','d','b','b']);expect(result.dpi).toBe(813);expect(result.size).toEqual([.2,.1]);
});
