const {test}=require('node:test');const a=require('node:assert/strict');const Q=require('../quote-core');
const rows=[{id:'21',label:'29 x 21 cm',price:3900,quantity:20},{id:'42',label:'29 x 42 cm',price:4990,quantity:35},{id:'50',label:'29 x 50 cm',price:6590,quantity:45},{id:'100',label:'29 x 100 cm',price:9900,quantity:90}];
const config={mode:'full',sheet:'100',name:'',carrier:'Jadlog',freight:1890,production:'até 2 dias úteis',distributed:false};
test('centavos e entradas inválidas',()=>{a.equal(Q.cents('18,90'),1890);a.equal(Q.cents('0'),0);for(const v of ['','-1','NaN','1.234','1e2','Infinity'])a.throws(()=>Q.cents(v));});
test('todas as folhas e arredondamento',()=>{a.deepEqual(rows.map(r=>Q.unit(r.price,r.quantity)),[195,143,146,110]);a.equal(Q.unit(1,2),1);a.equal(Q.unit(9900,90,1890),131);});
test('quantidade zero, negativa, fracionária e preços inválidos',()=>{for(const q of [0,-1,NaN,1.5])a.throws(()=>Q.unit(100,q));a.throws(()=>Q.unit(100,1,-1));});
test('melhor custo e desempate por preço da folha e id',()=>{a.equal(Q.best(rows).id,'100');a.equal(Q.best([{id:'b',price:200,quantity:2},{id:'a',price:100,quantity:1}]).id,'a');a.equal(Q.best([{id:'b',price:100,quantity:1},{id:'a',price:100,quantity:1}]).id,'a');a.equal(Q.best([{id:'z',price:0,quantity:0}]),null);});
test('comparativo completo sem nome nem opcionais vazios',()=>{const t=Q.generate(rows,config);for(const r of rows)a.ok(t.includes(r.label));a.ok(t.startsWith('Olá!'));a.ok(!t.includes('Prazo estimado'));a.equal(t.match(/Total com frete/g).length,1);a.ok(t.includes('117,90'));});
test('troca de folha e frete, resumido e formalização',()=>{for(const mode of ['short','formal'])for(const r of rows){const t=Q.generate(rows,{...config,mode,sheet:r.id,freight:0,carrier:'Transporte personalizado',name:'Maria',delivery:'5 dias úteis',validity:'7 dias',notes:'Teste',distributed:true});a.ok(t.includes('Maria'));a.ok(t.includes('Transporte personalizado'));a.equal(t.match(/• Quantidade:/g).length,1);a.ok(t.includes(Q.money(r.price)));a.ok(t.includes('Prazo estimado de entrega: 5 dias úteis'));}a.notEqual(Q.generate(rows,config),Q.generate(rows,{...config,freight:0}));});
test('seleção zero e campos obrigatórios bloqueados',()=>{a.throws(()=>Q.generate([{...rows[0],quantity:0}],{...config,sheet:'21'}));for(const key of ['carrier','production','sheet'])a.throws(()=>Q.generate(rows,{...config,[key]:''}));});
test('WhatsApp oficial preserva texto e edição',()=>{const t='Olá! 😊\nR$ 18,90 & entrega';a.equal(new URL(Q.whatsapp(t)).searchParams.get('text'),t);a.equal(new URL(Q.whatsapp(t)).hostname,'wa.me');a.throws(()=>Q.whatsapp(''));});
const TABLE=[{h:21,price:3900},{h:42,price:4990},{h:50,price:6590},{h:100,price:9900}];
test('folha sob medida: preço por cm e estimativa interpolada da tabela',()=>{
 a.equal(Q.lengthPrice(150,60),9000);a.equal(Q.lengthPrice(199,37.5),7463);a.equal(Q.lengthPrice(0,10),0);
 for(const h of [21,42,50,100])a.equal(Q.estimateLengthPrice(TABLE,h),TABLE.find(r=>r.h===h).price);
 a.equal(Q.estimateLengthPrice(TABLE,10),3900);a.equal(Q.estimateLengthPrice(TABLE,46),5790);a.equal(Q.estimateLengthPrice(TABLE,60),7252);a.equal(Q.estimateLengthPrice(TABLE,150),14850);a.equal(Q.estimateLengthPrice(TABLE,'37,5'),4756);
 for(const h of [0,-1,'abc',NaN])a.throws(()=>Q.lengthPrice(100,h));a.throws(()=>Q.lengthPrice(-1,10));a.throws(()=>Q.estimateLengthPrice([],10));
});
test('revenda: preço fixo, margem, sem configuração e prejuízo',()=>{
 a.deepEqual(Q.resale(9900,90,{mode:'off'}),{cost:110});a.deepEqual(Q.resale(9900,90,null),{cost:110});
 a.deepEqual(Q.resale(9900,90,{mode:'unit',value:250}),{cost:110,sale:250,revenue:22500,profit:12600});
 a.deepEqual(Q.resale(9900,90,{mode:'unit',value:100}),{cost:110,sale:100,revenue:9000,profit:-900});
 a.deepEqual(Q.resale(9900,90,{mode:'markup',value:Q.cents('100')}),{cost:110,sale:220,revenue:19800,profit:9900});
 a.equal(Q.resale(3900,7,{mode:'markup',value:Q.cents('33,33')}).sale,743);a.equal(Q.resale(100,3,{mode:'markup',value:0}).sale,33);
 a.equal(Q.resale(9900,0,{mode:'unit',value:250}),null);a.equal(Q.resale(9900,1.5,{mode:'unit',value:250}),null);
 a.equal(Q.signedMoney(-900),'-'+Q.money(900));a.equal(Q.signedMoney(900),Q.money(900));
});
