const {test,expect}=require('@playwright/test');const fs=require('node:fs/promises');
const dev='http://127.0.0.1:5174';
async function images(page,names=['primeira.png','segunda.png']){
 const buffer=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=90;c.height=60;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(10,10,70,40);return c.toDataURL().split(',')[1];}),'base64');
 await page.locator('input[type=file]').first().setInputFiles(names.map(name=>({name,mimeType:'image/png',buffer})));
 await expect(page.locator('.art-editor')).toHaveCount(names.length);
}

test('calculadora copia confirmação e transfere pedido, frete e cores sem redigitar',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');await page.locator('#client-name').fill('Maria Cliente');await page.locator('#mt-multi').click();
 await page.evaluate(()=>{document.getElementById('arts-list').innerHTML='';addArt(6,4,2,'Dourado');addArt(3,2,3,'Branco');});
 await page.locator('#btn-calc').click();const expected=await page.evaluate(()=>quoteRows.find(r=>r.id==='42'));
 await page.getByRole('button',{name:'Gerar orçamento',exact:true}).filter({visible:true}).click();await expect(page.locator('[name=name]')).toHaveValue('Maria Cliente');
 await page.locator('[name=sheet]').selectOption('42');await page.locator('[name=carrier]').selectOption('J&T');await page.locator('[name=freight]').fill('12,30');await page.locator('[name=production]').fill('2 dias úteis');await page.locator('[name=orderId]').fill('DTF-TESTE');
 await page.locator('#quote-confirm').click();const message=await page.evaluate(()=>navigator.clipboard.readText());expect(message).toContain('DTF UV MANIA');expect(message).toContain('DTF-TESTE');expect(message).toContain('J&T');expect(message).toContain('Dourado');expect(message).toContain('Branco');expect(message).toContain('Quantidade: '+expected.quantity);
 await page.evaluate(()=>{window.open=url=>{window.transferUrl=url;};});await page.locator('#quote-mount').click();const href=await page.evaluate(()=>window.transferUrl);expect(href).toBeTruthy();expect(href).not.toContain('Maria');expect(href).not.toContain('12%2C30');
 await page.goto(new URL(href,'http://127.0.0.1:3000').href);await expect(page.getByLabel('Cliente da aprovação')).toHaveValue('Maria Cliente');await expect(page.getByLabel('Número do pedido',{exact:true})).toHaveValue('DTF-TESTE');await expect(page.getByLabel('Frete do pedido (R$)',{exact:true})).toHaveValue('12,30');await expect(page.getByLabel('Transportadora do pedido')).toHaveValue('J&T');
 await images(page);for(let i=0;i<expected.arts.length;i++){const name=i===0?'primeira.png':'segunda.png';await expect(page.getByLabel('Quantidade '+name,{exact:true})).toHaveValue(String(expected.arts[i].quantity));await expect(page.getByLabel('Cor '+name,{exact:true})).toHaveValue(expected.arts[i].color);}
 await page.getByRole('button',{name:'Copiar confirmação do pedido',exact:true}).click();const final=await page.evaluate(()=>navigator.clipboard.readText());expect(final).toContain('Maria Cliente');expect(final).toContain('J&T');expect(final).not.toContain('estimado pelas medidas');
 await page.getByRole('button',{name:'Ver aprovação',exact:true}).click();await expect(page.getByAltText('Aprovação do cliente — página 1',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

test('baixar aprovação junto com PNG gera arquivos separados e mantém nome comercial do modelo',async({page})=>{
 await page.goto('/montadora/');await images(page,['01 - copia 01 de 04.png']);await page.getByText('Pedido e aprovação do cliente',{exact:true}).click();await expect(page.getByLabel('Nome na aprovação 01 - copia 01 de 04.png',{exact:true})).toHaveAttribute('placeholder','01');await page.getByLabel('Nome na aprovação 01 - copia 01 de 04.png',{exact:true}).fill('Nossa Senhora');
 await page.getByLabel('Baixar aprovação junto com os PNGs',{exact:true}).check();
 const downloads=[];page.on('download',d=>downloads.push(d));await page.getByRole('button',{name:'Baixar PNG',exact:true}).click();await expect.poll(()=>downloads.length).toBe(2);
 expect(downloads[0].suggestedFilename()).toMatch(/\.png$/);expect(downloads[1].suggestedFilename()).toMatch(/aprovacao.*\.jpg$/);
});

test('aprovação gera JPEG com logo, um modelo de cada, medidas, quantidade e fundo para arte branca',async({page})=>{
 await page.goto(dev);const r=await page.evaluate(async()=>{
  const {renderApprovalPages}=await import('/src/utils/approval.ts'),{emptyCustomerOrder}=await import('/src/utils/customerOrder.ts');
  const c=document.createElement('canvas');c.width=50;c.height=100;c.getContext('2d').fillStyle='#fff';c.getContext('2d').fillRect(0,0,50,100);
  const arts=[{name:'Maria',widthCm:3,heightCm:6,quantity:4,color:'Branco',source:c,rotated:false},{name:'Cruz',widthCm:5,heightCm:2.5,quantity:7,color:'Dourado',source:c,rotated:true}];
  const texts=[];const old=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(...args){texts.push(String(args[0]));return old.apply(this,args)};
  try{const blobs=await renderApprovalPages(arts,{...emptyCustomerOrder(),name:'Cliente Exemplo',orderId:'DTF-123',price:'49,90',freight:'12,30',carrier:'Loggi'},'1 folha de 29 × 42 cm',{pages:false,backdrop:'auto',revision:'2'});const b=await createImageBitmap(blobs[0]),out=document.createElement('canvas');out.width=b.width;out.height=b.height;const x=out.getContext('2d');x.drawImage(b,0,0);const bg=Array.from(x.getImageData(70,400,1,1).data);return{count:blobs.length,type:blobs[0].type,w:b.width,h:b.height,texts,bg};}finally{CanvasRenderingContext2D.prototype.fillText=old;}
 });expect(r.count).toBe(1);expect(r.type).toBe('image/jpeg');expect(r.w).toBe(1600);expect(r.h).toBe(900);expect(r.texts.filter(t=>t.startsWith('MODELO '))).toHaveLength(2);expect(r.texts).toContain('4 unidades');expect(r.texts).toContain('7 unidades');expect(r.texts).toContain('3 × 6 cm');expect(r.texts.some(t=>t.includes('62,20'))).toBe(true);expect(r.bg[0]).toBeLessThan(70);expect(r.bg[3]).toBe(255);
});

test('download real de aprovação, prévia invalidada e PNG de produção continua transparente',async({page})=>{
 await page.goto('/montadora/');await images(page,['arte.png']);await page.getByText('Pedido e aprovação do cliente',{exact:true}).click();await page.getByLabel('Cliente da aprovação').fill('Cliente Teste');await page.getByLabel('Valor do produto (R$)').fill('30,00');await page.getByLabel('Frete do pedido (R$)').fill('10,00');await page.getByLabel('Produção do pedido').fill('2 dias');
 await page.getByLabel('Quantidade arte.png',{exact:true}).fill('4');const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar aprovação',exact:true}).click();const download=await pending;expect(download.suggestedFilename()).toMatch(/aprovacao.*\.jpg$/);const bytes=await fs.readFile(await download.path());expect(bytes[0]).toBe(255);expect(bytes[1]).toBe(216);await expect(page.getByAltText('Aprovação do cliente — página 1',{exact:true})).toBeVisible();
 await page.getByLabel('Quantidade arte.png',{exact:true}).fill('5');await expect(page.locator('.approval-preview')).toHaveCount(0);await page.getByRole('button',{name:'Ver aprovação',exact:true}).click();await expect(page.locator('.approval-preview')).toHaveCount(1);
 const png=page.waitForEvent('download');await page.getByRole('button',{name:'PNG',exact:true}).click();const data=await fs.readFile(await(await png).path());const alpha=await page.evaluate(async b64=>{const b=await createImageBitmap(await(await fetch('data:image/png;base64,'+b64)).blob());const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);return x.getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v===0);},data.toString('base64'));expect(alpha).toBe(true);
});

test('aprovação paginada inclui todos os modelos; imagem grande demais não é truncada',async({page})=>{
 await page.goto(dev);const r=await page.evaluate(async()=>{
  const {renderApprovalPages}=await import('/src/utils/approval.ts'),{emptyCustomerOrder}=await import('/src/utils/customerOrder.ts');const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').fillRect(0,0,2,2);
  const arts=Array.from({length:25},(_,i)=>({name:String(i),widthCm:1,heightCm:1,quantity:i+1,source:c,rotated:false}));const images=await renderApprovalPages(arts,emptyCustomerOrder(),'Folha de teste',{pages:true,backdrop:'light',revision:'1'});let error='';try{await renderApprovalPages(Array.from({length:200},()=>arts[0]),emptyCustomerOrder(),'Teste',{pages:false,backdrop:'auto',revision:'1'});}catch(e){error=e.message;}
  return {count:images.length,error};
 });expect(r.count).toBe(3);expect(r.error).toContain('Páginas de 12 modelos');
});

test('dados de pedido vencidos ou inválidos não preenchem o cliente',async({page})=>{
 await page.goto(dev);const r=await page.evaluate(async()=>{const {readCustomerOrder}=await import('/src/utils/customerOrder.ts');const key='dtf-order-handoff:teste-1234567';localStorage.setItem(key,JSON.stringify({version:1,createdAt:Date.now()-86400001,name:'Antigo',price:5000}));const old=readCustomerOrder('?pedido=teste-1234567');localStorage.setItem(key,'not-json');const invalid=readCustomerOrder('?pedido=teste-1234567');return{old:old.name,invalid:invalid.name};});expect(r).toEqual({old:'',invalid:''});
});
