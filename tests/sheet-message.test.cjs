const {test}=require('node:test'),a=require('node:assert/strict'),Q=require('../quote-core');
test('mensagem das folhas traz só folha, medida, adesivos e valor',()=>{
 const rows=[{id:'21',label:'29 x 21 cm',price:3900,quantity:20,arts:[{widthCm:5,heightCm:5,quantity:20}]},{id:'42',label:'29 x 42 cm',price:4990,quantity:40,arts:[{widthCm:5,heightCm:5,quantity:40}]},{id:'custom',label:'29 x 60 cm (sob medida)',price:7252,quantity:60,arts:[{widthCm:5,heightCm:5,quantity:60}]}];
 const t=Q.sheetOptionsMessage(rows);
 a.equal(t,['📋 *Opções de folha*','Arte: 5 × 5 cm','','• *Folha 29 × 21 cm*: 20 adesivos — R$ 39,00','• *Folha 29 × 42 cm*: 40 adesivos — R$ 49,90','• *Folha 29 × 60 cm (sob medida)*: 60 adesivos — R$ 72,52'].join('\n'));
 a.doesNotMatch(t,/Custo|frete|Prazo|undefined|NaN/i);
});
test('várias artes mostram a divisão por medida; folhas sem encaixe ficam de fora',()=>{
 const t=Q.sheetOptionsMessage([{label:'29 x 21 cm',price:3900,quantity:0,arts:[{widthCm:10,heightCm:8,quantity:0}]},{label:'29 x 42 cm',price:4990,quantity:30,arts:[{widthCm:7.5,heightCm:6,quantity:20},{widthCm:3,heightCm:3,quantity:10}]}]);
 a.match(t,/^Artes: 7,5 × 6 cm e 3 × 3 cm$/m);a.match(t,/• \*Folha 29 × 42 cm\*: 30 adesivos \(20 de 7,5 × 6 cm \+ 10 de 3 × 3 cm\) — R\$\s49,90/);a.doesNotMatch(t,/29 × 21/);
 a.throws(()=>Q.sheetOptionsMessage([]),/Nenhuma folha/);
});
