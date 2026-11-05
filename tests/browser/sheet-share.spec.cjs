const {test,expect}=require('@playwright/test');
test('comparativo copia folha, medida, adesivos e valor para WhatsApp',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.goto('/');
 await page.locator('#fill-w').fill('5');await page.locator('#fill-h').fill('5');await page.locator('#btn-calc').click();
 const box=page.locator('#result .sheet-share'),text=box.locator('.sheet-message');
 await expect(text).toHaveValue(/^📋 \*Opções de folha\*\nArte: 5 × 5 cm\n\n• \*Folha 29 × 21 cm\*: \d+ adesivos — R\$\s39,00/);
 await expect(text).toHaveValue(/• \*Folha 29 × 100 cm\*: \d+ adesivos — R\$\s99,00$/);
 // As quantidades batem com a tabela.
 const qty21=(await page.locator('#comp-table tbody tr').first().locator('td').nth(2).innerText()).trim();await expect(text).toHaveValue(new RegExp('29 × 21 cm\\*: '+qty21+' adesivos'));
 expect(await text.inputValue()).not.toMatch(/Custo|Aproveit|frete/i);
 await box.getByRole('button',{name:'Copiar folhas para WhatsApp'}).click();await expect(box.locator('.sheet-copy-status')).toContainText('copiadas');
 expect((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(await text.inputValue());
 // Modo "Tenho as artes": inclui a folha sob medida calculada.
 await page.locator('#main-inv').click();await page.locator('#btn-calc').click();
 await expect(page.locator('#result-inv .sheet-message')).toHaveValue(/sob medida\)\*: \d+ adesivos — R\$/);
});
