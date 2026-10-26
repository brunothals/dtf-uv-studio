const {test,expect}=require('@playwright/test');
const calc=page=>page.locator('#btn-calc').click();
const headers=page=>page.locator('#comp-table thead th').allTextContents();
async function row(page,table,label){return page.locator(`#${table} tbody tr`).filter({hasText:label}).first().locator('td').allTextContents();}

test('múltiplas artes: comparativo considera todas as artes e a proporção do pedido',async({page})=>{
 await page.goto('/');await page.locator('#mt-multi').click();
 await page.evaluate(()=>{document.getElementById('arts-list').innerHTML='';addArt(10,8,4,'azul');addArt(5,4,6,'preto');});
 await calc(page);
 expect(await headers(page)).toEqual(expect.arrayContaining(['Pedido cabe?','Pedidos completos','Artes na folha']));
 const big=await row(page,'comp-table','29 x 100 cm');
 expect(big[2]).toContain('Sim (10/10)');const kits=Number(big[3]);expect(kits).toBeGreaterThan(1);
 const bigRow=page.locator('#comp-table tbody tr').filter({hasText:'29 x 100 cm'});
 const total=Number(await bigRow.locator('.qty-total').textContent());
 const [, a1, a2]=(await bigRow.locator('.mix-cell').textContent()).match(/^(\d+)x 10x8 \+ (\d+)x 5x4$/).map(Number);
 expect(a1).toBeGreaterThanOrEqual(4*kits);expect(a2).toBeGreaterThanOrEqual(6*kits);expect(total).toBe(a1+a2);
 await expect(page.locator('#comp-table tbody tr').filter({hasText:'29 x 21 cm'}).locator('.mix-cell')).toHaveText(/^\d+x 10x8 \+ \d+x 5x4$/);
 await expect(page.locator('#comp-note')).toContainText('pedido inteiro');
 await page.getByRole('button',{name:'Gerar orçamento',exact:true}).filter({visible:true}).click();await page.locator('[name=production]').fill('2 dias');
 await expect(page.locator('#quote-preview')).toHaveValue(new RegExp('Quantidade: '+(a1+a2)+' adesivos'));
 await page.keyboard.press('Escape');
 const href=await page.locator('#montadora-link').getAttribute('href');const q=new URL(href,'http://x/').searchParams;
 expect(q.get('origem')).toBe('calculadora');expect(q.get('w')).toBe('29');expect(q.get('h')).toBe('21');expect(q.getAll('arte')[0]).toMatch(/^10x8x\d+$/);expect(q.getAll('arte')[1]).toMatch(/^5x4x\d+$/);
});

test('espaçamento zero é aceito sem trocar por 0,3 cm',async({page})=>{
 await page.goto('/');await page.locator('#fill-w').fill('2');await page.locator('#fill-h').fill('2');await page.locator('#folha-sel').selectOption('29x21');
 await page.locator('#esp').fill('0');await calc(page);
 expect((await row(page,'comp-table','29 x 21 cm'))[2]).toBe('140');
 expect(new URL(await page.locator('#montadora-link').getAttribute('href'),'http://x/').searchParams.get('esp')).toBe('0');
 await page.locator('#esp').fill('0.3');await calc(page);expect((await row(page,'comp-table','29 x 21 cm'))[2]).toBe('108');
 await page.locator('#main-inv').click();await page.locator('#esp-inv').fill('0');await calc(page);await expect(page.locator('#result-inv')).toBeVisible();
 expect(new URL(await page.locator('#montadora-link-inv').getAttribute('href'),'http://x/').searchParams.get('esp')).toBe('0');
});

test('revenda desligada por padrão, preço fixo e margem persistidos',async({page})=>{
 await page.goto('/');await expect(page.locator('#resale-mode')).toHaveValue('off');await expect(page.locator('#resale-value')).toBeDisabled();await expect(page.locator('#price-per-cm')).toHaveValue('');
 await calc(page);let h=await headers(page);expect(h).toContain('Custo/arte');expect(h).not.toContain('Venda/arte');
 await page.locator('#resale-mode').selectOption('unit');await page.locator('#resale-value').fill('2,50');await calc(page);
 h=await headers(page);expect(h).toEqual(expect.arrayContaining(['Venda/arte','Receita/folha','Lucro/folha']));
 const r=await row(page,'comp-table','29 x 100 cm');const qty=Number(r[2]);
 const expected=await page.evaluate(q=>[Quote.money(Quote.unit(9900,q)),Quote.money(250),Quote.money(250*q),Quote.signedMoney(250*q-9900)],qty);
 expect(r.slice(6,10)).toEqual(expected);
 await page.reload();await expect(page.locator('#resale-mode')).toHaveValue('unit');await expect(page.locator('#resale-value')).toHaveValue('2,50');
 await page.locator('#resale-mode').selectOption('markup');await page.locator('#resale-value').fill('100');await calc(page);
 const m=await row(page,'comp-table','29 x 21 cm');const q2=Number(m[2]);
 expect(m[7]).toBe(await page.evaluate(q=>Quote.money(Quote.resale(3900,q,{mode:'markup',value:10000}).sale),q2));
 await page.locator('#resale-value').fill('abc');await page.locator('#btn-calc').click();await expect(page.locator('#result')).not.toBeVisible();
 page.once('dialog',d=>d.dismiss());
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
});

test('folha sob medida tem preço (estimativa ou por cm) e entra no orçamento',async({page})=>{
 await page.goto('/');await page.locator('#folha-sel').selectOption('custom');await page.locator('#fh-custom').fill('60');
 await expect(page.locator('#pricing-hint')).toContainText('estimativa');await calc(page);
 let r=await row(page,'comp-table','sob medida');expect(r[0]).toContain('29 x 60 cm (sob medida)*');expect(r[1]).toBe(await page.evaluate(()=>Quote.money(7252)));
 await expect(page.locator('#comp-note')).toContainText('estimado');
 await page.locator('#price-per-cm').fill('1,50');await calc(page);r=await row(page,'comp-table','sob medida');expect(r[0]).not.toContain('*');expect(r[1]).toBe(await page.evaluate(()=>Quote.money(9000)));
 await page.getByRole('button',{name:'Gerar orçamento',exact:true}).filter({visible:true}).click();await page.locator('[name=production]').fill('2 dias');
 await page.locator('[name=sheet]').selectOption('custom');await expect(page.locator('#quote-preview')).toHaveValue(/Opção selecionada: 29 x 60 cm \(sob medida\)/);await expect(page.locator('#quote-total')).toContainText('90,00');
 await page.keyboard.press('Escape');
 await page.locator('#main-inv').click();await calc(page);const inv=await row(page,'comp-table-inv','sob medida');expect(inv[2]).toBe('Comporta tudo');
});

test('rótulos com acentos e botões de adicionar arte distintos',async({page})=>{
 await page.goto('/');
 for(const t of ['Anúncio da venda','Modo de cálculo','Espaçamento entre artes (cm)','Múltiplas artes','Rotação automática'])await expect(page.getByText(t,{exact:false}).first()).toBeAttached();
 await page.locator('#mt-multi').click();await expect(page.locator('#add-art-normal')).toBeVisible();await expect(page.locator('#add-art-normal')).toHaveText('+ Adicionar outro tamanho nesta folha');
 await page.locator('#main-inv').click();await expect(page.locator('#add-art-inv')).toBeVisible();await expect(page.locator('#add-art-inv')).toHaveText('+ Adicionar arte ao pedido');await expect(page.locator('#add-art-normal')).not.toBeVisible();
 const box=await page.locator('#add-art-inv').boundingBox();expect(box.height).toBeGreaterThanOrEqual(34);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('montar esta folha: montadora abre com folha, espaçamento, medidas e quantidades',async({page})=>{
 await page.goto('/');await page.locator('#mt-multi').click();
 await page.evaluate(()=>{document.getElementById('arts-list').innerHTML='';addArt(4,2,3,'');addArt(3,3,2,'');});
 await page.locator('#folha-sel').selectOption('29x50');await page.locator('#esp').fill('0');await calc(page);
 const link=page.locator('#montadora-link');await expect(link).toHaveText('Montar esta folha na montadora');await expect(link).toHaveAttribute('target','_blank');
 const href=await link.getAttribute('href');expect(href).toContain('arte=4x2x3');expect(href).toContain('arte=3x3x2');
 await page.goto('/'+href);
 await expect(page.getByRole('combobox',{name:'Comprimento da folha'})).toHaveValue('50');await expect(page.getByRole('combobox',{name:'Largura da folha'})).toHaveValue('29');
 await expect(page.getByLabel('Espaço H (cm)')).toHaveValue('0');await expect(page.getByLabel('Espaço V (cm)')).toHaveValue('0');
 await expect(page.locator('.calc-prefill-list li')).toHaveText([/Arte 1: 4 × 2 cm · 3 un\./,/Arte 2: 3 × 3 cm · 2 un\./]);
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=32;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,64,32);return c.toDataURL().split(',')[1]});
 await page.locator('input[type=file]').first().setInputFiles(['a.png','b.png'].map(name=>({name,mimeType:'image/png',buffer:Buffer.from(data,'base64')})));
 await expect(page.locator('.art-editor')).toHaveCount(2);
 await expect(page.locator('.art-cm')).toHaveText(['4.000×2.000','3.000×1.500']);
 await expect(page.getByLabel('Quantidade a.png',{exact:true})).toHaveValue('3');await expect(page.getByLabel('Quantidade b.png',{exact:true})).toHaveValue('2');
 await expect(page.locator('.layout-summary')).toContainText('5 de 5');await expect(page.locator('.calc-prefill-list li').first()).toContainText('aplicada');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
 await page.goto('/montadora/?origem=calculadora&w=abc');await expect(page.locator('.calc-prefill')).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'Comprimento da folha'})).toHaveValue('42');
});
