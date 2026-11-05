const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let widget;vm.runInNewContext(fs.readFileSync(require.resolve('../assets/freight.js'),'utf8'),{HTMLElement:class{},customElements:{get:()=>undefined,define:(name,value)=>widget=value}});
const sample=[{carrier:'Correios',service:'SEDEX',price:15,days:2},{carrier:'Correios',service:'PAC',price:12,days:4},{carrier:'Loggi',service:'Ponto',price:14,days:6},{carrier:'Loggi',service:'Express',price:10,days:2},{carrier:'Jadlog',service:'.Package',price:9,days:3},{carrier:'Jadlog',service:'.Com',price:8.5,days:2},{carrier:'Correios',service:'SEDEX 10',price:30,days:1},{carrier:'Correios',service:'PAC Mini',price:7,days:7},{carrier:'JeT',service:'Standard',price:8,days:3},{carrier:'Azul Cargo Express',service:'Expresso',price:5,days:2}];
test('PAC, SEDEX and the cheapest Loggi, Jadlog and J&T are offered, in this order',()=>{
 const options=widget.filterOptions(sample);
 assert.deepEqual(Array.from(options,o=>o.label),['PAC','SEDEX','Loggi','Jadlog','J&T']);
 assert.equal(options[2].service,'Express');assert.equal(options[2].price,10);
 assert.equal(options[3].service,'.Com');assert.equal(options[3].price,8.5);
 assert.equal(options[4].carrier,'JeT');assert.equal(options[4].price,8);
 const text=widget.message(options,'13451050');assert.match(text,/13451-050/);assert.match(text,/\*PAC\*: R\$\s12,00 — 4 dias úteis/);assert.match(text,/\*SEDEX\*: R\$\s15,00 — 2 dias úteis/);assert.match(text,/\*Loggi\*: R\$\s10,00 — 2 dias úteis/);assert.match(text,/\*Jadlog\*: R\$\s8,50 — 2 dias úteis/);assert.match(text,/\*J&T\*: R\$\s8,00 — 3 dias úteis/);
 assert.doesNotMatch(text,/Azul|Ponto|SEDEX 10|Mini|\.Package|acréscimo/);
});
test('J&T is recognised under the names the APIs use',()=>{
 for(const carrier of ['JeT','J&T','J&T Express','JT','j & t'])assert.deepEqual(Array.from(widget.filterOptions([{carrier,service:'Standard',price:8,days:3}]),o=>o.label),['J&T'],carrier);
});
test('optional surcharge adds exactly R$ 2,00 to every option without float drift',()=>{
 const options=widget.filterOptions([{carrier:'Correios',service:'SEDEX',price:13.62,days:2},{carrier:'Jadlog',service:'.Com',price:12.61,days:2},{carrier:'JeT',service:'Standard',price:17.71,days:2},{carrier:'Loggi',service:'Express',price:0.1,days:2}],200);
 assert.deepEqual(Array.from(options,o=>[o.label,o.price,o.basePrice,o.surcharge]),[['SEDEX',15.62,13.62,2],['Loggi',2.1,0.1,2],['Jadlog',14.61,12.61,2],['J&T',19.71,17.71,2]]);
 assert.match(widget.message(options,'01001000'),/\*J&T\*: R\$\s19,71/);
 for(const bad of [undefined,0,-200,1.5,NaN])assert.equal(widget.filterOptions([{carrier:'Correios',service:'PAC',price:12,days:4}],bad)[0].price,12,String(bad));
});
test('unavailable or invalid services are not invented and a price tie prefers the faster option',()=>{
 const options=widget.filterOptions([{carrier:'Loggi',service:'Ponto',price:10,days:6},{carrier:'Loggi',service:'Express',price:10,days:2},{carrier:'Jadlog',service:'.Package',price:9,days:5},{carrier:'Jadlog',service:'.Com',price:9,days:2},{carrier:'Correios',service:'PAC',price:NaN,days:4}]);
 assert.deepEqual(Array.from(options,o=>[o.label,o.days]),[['Loggi',2],['Jadlog',2]]);assert.equal(widget.filterOptions([]).length,0);
});
