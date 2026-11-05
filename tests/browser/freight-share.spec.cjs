const {test,expect}=require('@playwright/test');
const quote={options:[{carrier:'Correios',service:'PAC',price:12,days:4},{carrier:'Correios',service:'SEDEX',price:15,days:2},{carrier:'Loggi',service:'Express',price:10,days:2},{carrier:'Loggi',service:'Ponto',price:14,days:6},{carrier:'Jadlog',service:'.Package',price:9,days:3},{carrier:'JeT',service:'Standard',price:8,days:3},{carrier:'Azul Cargo Express',service:'Expresso',price:5,days:2}]};
async function openFreight(page){
 await page.goto('/');await page.locator('#btn-calc').click();await page.getByRole('button',{name:'Gerar orçamento',exact:true}).filter({visible:true}).click();
 const widget=page.locator('dtf-freight');await widget.locator('summary').click();return widget;
}
test('freight offers PAC SEDEX Loggi Jadlog J&T and copies prices and days for WhatsApp',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);await page.addInitScript(()=>localStorage.setItem('dtf-freight-preferences',JSON.stringify({surcharge:false})));
 const widget=await openFreight(page);await expect(widget.locator('[name=height]')).toHaveValue('2');await expect(widget.locator('[name=weight]')).toHaveValue('0.5');await expect(widget.locator('[name=surcharge]')).not.toBeChecked();await widget.locator('[name=zip]').fill('01001000');
 await page.route('**/api/freight',async route=>{expect(route.request().postDataJSON().extraDay).toBe(true);await route.fulfill({json:quote})});
 await widget.getByRole('button',{name:'Consultar frete',exact:true}).click();await expect(widget.locator('.freight-options button')).toHaveCount(5);
 await expect(widget.locator('.freight-options button')).toHaveText([/^PAC/,/^SEDEX/,/^Loggi/,/^Jadlog/,/^J&T/]);
 const text=widget.getByLabel('Mensagem de frete pronta para copiar');await expect(text).toHaveValue(/PAC.*12,00 — 4 dias úteis/s);await expect(text).toHaveValue(/SEDEX.*15,00 — 2 dias úteis/s);await expect(text).toHaveValue(/Loggi.*10,00 — 2 dias úteis/s);await expect(text).toHaveValue(/Jadlog.*9,00 — 3 dias úteis/s);await expect(text).toHaveValue(/J&T.*8,00 — 3 dias úteis/s);
 await widget.getByRole('button',{name:'Copiar opções de frete para WhatsApp',exact:true}).click();expect((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(await text.inputValue());expect(await text.inputValue()).not.toContain('Azul');
 await widget.locator('.freight-options button').filter({hasText:'SEDEX'}).click();await expect(page.locator('#quote-form [name=freight]')).toHaveValue('15,00');
 await widget.locator('[name=zip]').fill('13451050');await expect(widget.locator('.freight-share')).toBeHidden();await expect(widget.locator('.freight-options button')).toHaveCount(0);
});
test('R$ 2,00 surcharge is on by default, applies to every option and is remembered',async({page})=>{
 let calls=0;await page.route('**/api/freight',async route=>{calls++;await route.fulfill({json:quote})});
 let widget=await openFreight(page);const box=widget.locator('[name=surcharge]');await expect(box).toBeChecked();
 await widget.locator('[name=zip]').fill('01001000');await widget.getByRole('button',{name:'Consultar frete',exact:true}).click();
 await expect(widget.locator('.freight-options button')).toHaveText([/PAC — R\$\s14,00/,/SEDEX — R\$\s17,00/,/Loggi — R\$\s12,00/,/Jadlog — R\$\s11,00/,/J&T — R\$\s10,00/]);
 await expect(widget.locator('[role=status]').first()).toContainText('já incluem R$');
 const text=widget.getByLabel('Mensagem de frete pronta para copiar');await expect(text).toHaveValue(/J&T.*10,00/s);expect(await text.inputValue()).not.toMatch(/acréscimo/i);
 await widget.locator('.freight-options button').filter({hasText:'Jadlog'}).click();await expect(page.locator('#quote-form [name=freight]')).toHaveValue('11,00');
 // Desligar recalcula sem nova consulta.
 await box.uncheck();await expect(widget.locator('.freight-options button')).toHaveText([/PAC — R\$\s12,00/,/SEDEX — R\$\s15,00/,/Loggi — R\$\s10,00/,/Jadlog — R\$\s9,00/,/J&T — R\$\s8,00/]);await expect(text).toHaveValue(/Jadlog.*9,00/s);expect(calls).toBe(1);
 widget=await openFreight(page);await expect(widget.locator('[name=surcharge]')).not.toBeChecked();
});
