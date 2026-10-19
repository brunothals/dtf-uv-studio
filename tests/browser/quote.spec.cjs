const {test,expect}=require('@playwright/test');
async function open(page){await page.goto('/');await page.locator('#btn-calc').click();await page.getByRole('button',{name:'Gerar orçamento',exact:true}).filter({visible:true}).click();await page.locator('[name=production]').fill('até 2 dias úteis');}
test('resultados reais, todas as folhas, modos, frete e validação',async({page})=>{
 await open(page);await expect(page.locator('#custom-carrier-label')).not.toBeVisible();
 const rows=await page.locator('#comp-table tbody tr').evaluateAll(rs=>rs.map(r=>({label:r.cells[0].textContent.replace('MELHOR',''),quantity:r.cells[2].textContent})));
 for(const r of rows)await expect(page.locator('#quote-preview')).toHaveValue(new RegExp('Quantidade: '+r.quantity+' adesivos'));
 await page.locator('[name=freight]').fill('18,90');
 for(const id of ['21','42','50','100']){await page.locator('[name=sheet]').selectOption(id);await expect(page.locator('#quote-preview')).toHaveValue(new RegExp('Opção selecionada: 29 x '+id+' cm'));}
 await expect(page.locator('#quote-total')).toContainText('117,90');
 await page.locator('[name=mode]').selectOption('short');expect((await page.locator('#quote-preview').inputValue()).match(/Quantidade:/g)).toHaveLength(1);
 await page.locator('[name=mode]').selectOption('formal');await expect(page.locator('#quote-preview')).toHaveValue(/Formalização/);
 await page.locator('[name=carrier]').selectOption('Outra');await page.locator('[name=customCarrier]').fill('Transportes Teste');await expect(page.locator('#quote-preview')).toHaveValue(/Transporte: Transportes Teste/);
 await page.locator('[name=freight]').fill('-1');await expect(page.locator('#quote-copy')).toBeDisabled();await expect(page.locator('#quote-preview')).toHaveValue('');
 await page.locator('[name=freight]').fill('0');await page.locator('[name=distributed]').check();await expect(page.locator('#quote-preview')).toHaveValue(new RegExp('Valor por adesivo com frete: R\\$\\s'+(Math.round(9900/Number(rows[3].quantity))/100).toFixed(2).replace('.',',')));
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
 const box=await page.locator('#quote-dialog').boundingBox();expect(box.width).toBeLessThanOrEqual(page.viewportSize().width);
});
test('editar, copiar, compartilhar e preferências sem nome',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await open(page);
 await page.locator('[name=name]').fill('Cliente privado');await page.locator('[name=carrier]').selectOption('Correios');await page.locator('#quote-preview').fill('Mensagem editada 😊');await page.locator('#quote-copy').click();await expect(page.locator('#quote-status')).toContainText('copiado');expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('Mensagem editada 😊');
 await page.evaluate(()=>{window.open=(url,target,features)=>{window.shared={url,target,features};};});await page.locator('#quote-share').click();const shared=await page.evaluate(()=>window.shared);expect(new URL(shared.url).searchParams.get('text')).toBe('Mensagem editada 😊');expect(new URL(shared.url).hostname).toBe('wa.me');expect(shared.features).toContain('noopener');
 const preferences=await page.evaluate(()=>localStorage.getItem('dtf-quote-preferences'));expect(preferences).not.toContain('Cliente privado');await page.locator('#quote-close').click();await page.reload();await page.locator('#btn-calc').click();await page.getByRole('button',{name:'Gerar orçamento',exact:true}).filter({visible:true}).click();await expect(page.locator('[name=carrier]')).toHaveValue('Correios');await expect(page.locator('[name=name]')).toHaveValue('');
 await page.keyboard.press('Escape');await expect(page.locator('#quote-dialog')).not.toBeVisible();
});
test('dimensões alteradas invalidam orçamento antigo e modo inverso funciona',async({page})=>{
 await page.goto('/');await page.locator('#btn-calc').click();await page.locator('#fill-w').fill('5');await expect(page.locator('#result')).not.toBeVisible();await page.locator('#btn-calc').click();await page.getByRole('button',{name:'Gerar orçamento',exact:true}).filter({visible:true}).click();await page.locator('[name=production]').fill('1 dia útil');await expect(page.locator('#quote-preview')).toHaveValue(/Quantidade:/);await page.keyboard.press('Escape');
 await page.locator('#main-inv').click();await page.locator('#btn-calc').click();await page.getByRole('button',{name:'Gerar orçamento',exact:true}).filter({visible:true}).click();await expect(page.locator('#quote-preview')).toHaveValue(/Quantidade: 3 adesivos/);
});
test('folha sem encaixe não permite seleção e não divide por zero',async({page})=>{
 await page.goto('/');await page.locator('#folha-sel').selectOption('29x100');await page.locator('#fill-w').fill('28');await page.locator('#fill-h').fill('30');await page.locator('#btn-calc').click();await page.getByRole('button',{name:'Gerar orçamento',exact:true}).filter({visible:true}).click();await page.locator('[name=production]').fill('3 dias úteis');
 expect(await page.locator('[name=sheet] option[value="21"]').evaluate(o=>o.disabled)).toBe(true);await expect(page.locator('#quote-preview')).toHaveValue(/Nenhum adesivo cabe/);await expect(page.locator('#quote-preview')).not.toHaveValue(/NaN|Infinity/);
});
