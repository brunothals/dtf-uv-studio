const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let widget;vm.runInNewContext(fs.readFileSync(require.resolve('../assets/freight.js'),'utf8'),{HTMLElement:class{},customElements:{get:()=>undefined,define:(name,value)=>widget=value}});
test('only ordinary PAC, SEDEX and cheapest available Loggi are offered',()=>{
 const options=widget.filterOptions([{carrier:'Correios',service:'SEDEX',price:15,days:2},{carrier:'Correios',service:'PAC',price:12,days:4},{carrier:'Loggi',service:'Ponto',price:14,days:6},{carrier:'Loggi',service:'Express',price:10,days:2},{carrier:'Jadlog',service:'Package',price:9,days:3},{carrier:'Correios',service:'SEDEX 10',price:30,days:1},{carrier:'Correios',service:'PAC Mini',price:7,days:7},{carrier:'JeT',service:'Standard',price:8,days:3}]);
 assert.deepEqual(Array.from(options,o=>o.label),['PAC','SEDEX','Loggi']);assert.equal(options[2].service,'Express');assert.equal(options[2].price,10);
 const text=widget.message(options,'13451050');assert.match(text,/13451-050/);assert.match(text,/\*PAC\*: R\$\s12,00 — 4 dias úteis/);assert.match(text,/\*SEDEX\*: R\$\s15,00 — 2 dias úteis/);assert.match(text,/\*Loggi\*: R\$\s10,00 — 2 dias úteis/);assert.doesNotMatch(text,/Jadlog|JeT|Ponto|SEDEX 10|Mini/);
});
test('unavailable or invalid services are not invented and a price tie prefers faster Loggi',()=>{
 const options=widget.filterOptions([{carrier:'Loggi',service:'Ponto',price:10,days:6},{carrier:'Loggi',service:'Express',price:10,days:2},{carrier:'Correios',service:'PAC',price:NaN,days:4}]);assert.equal(options.length,1);assert.equal(options[0].days,2);assert.equal(widget.filterOptions([]).length,0);
});
