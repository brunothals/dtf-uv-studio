// Explicit, synthetic smoke test. Never uses customer artwork or logs the password.
const {chromium}=require('@playwright/test'),sharp=require('sharp'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const base=process.env.DTF_TEST_URL,output=process.env.DTF_TEST_OUTPUT;
 if(!base||!output||!process.env.DTF_PASSWORD_FILE)throw Error('Informe URL, diretório de saída e arquivo da senha via ambiente.');
 const password=(await fs.readFile(process.env.DTF_PASSWORD_FILE,'utf8')).match(/Senha de acesso ao DTFUVStudio no Railway: ([a-f0-9]{48})/)?.[1];if(!password)throw Error('Senha não encontrada no arquivo de acesso.');
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});page.setDefaultTimeout(60000);
  await page.goto(base+'/montadora/');await page.locator('[name=password]').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL('**/montadora/');await page.getByLabel('Local de exportação').selectOption('cloud');
  const png=await sharp({create:{width:200,height:100,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:160,height:60,channels:4,background:'#ffffff'}}).png().toBuffer(),left:20,top:20}]).png().toBuffer();
  await page.locator('input[type=file]').first().setInputFiles({name:'teste-sintetico.png',mimeType:'image/png',buffer:png});await page.getByLabel('Quantidade teste-sintetico.png',{exact:true}).fill('3');await page.getByLabel('Qualidade do export').selectOption('high');await page.getByLabel('Formato do download PNG').selectOption('whole');
  const request=page.waitForResponse(r=>r.url()===base+'/api/exports'&&r.request().method()==='POST');const download=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar PNG',exact:true}).click();const response=await request;assert.equal(response.status(),202);const {id}=await response.json();const file=await download;await fs.mkdir(output,{recursive:true});const target=path.join(output,'PNG - teste sintetico na nuvem.png');await file.saveAs(target);
  const meta=await sharp(target).metadata();assert.equal(meta.format,'png');assert.equal(meta.density,300);assert.equal(meta.hasAlpha,true);
  const {data}=await sharp(target).raw().toBuffer({resolveWithObject:true});let white=false,alpha=false;for(let i=0;i<data.length;i+=4){white ||= data[i]===255&&data[i+1]===255&&data[i+2]===255&&data[i+3]===255;alpha ||= data[i+3]===0;}assert(white&&alpha,'Preservar branco e transparência');
  const job=await(await page.request.get(base+'/api/exports/'+id)).json();await fs.writeFile(path.join(output,'Teste real Railway.json'),JSON.stringify({url:base,job,downloadName:file.suggestedFilename(),metadata:meta,verifiedWhite:true,verifiedAlpha:true},null,2));await page.screenshot({path:path.join(output,'Montadora no Railway.png'),fullPage:true});console.log(JSON.stringify({ok:true,job,downloadName:file.suggestedFilename(),width:meta.width,height:meta.height,dpi:meta.density,white,alpha}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
