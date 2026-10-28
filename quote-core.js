/* Financial values are integer cents; round half up only at display boundaries. */
(function(root){
  const validMoney=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000000;
  function cents(value){
    const s=String(value).trim().replace(',','.');
    if(!/^\d+(\.\d{1,2})?$/.test(s)) throw Error('Informe um valor válido com até duas casas decimais.');
    const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));
    if(!validMoney(n)) throw Error('Valor monetário fora do limite.');return n;
  }
  function money(n){if(!validMoney(n))throw Error('Valor inválido.');return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);}
  function unit(price,quantity,freight=0){
    if(!validMoney(price)||!validMoney(freight)||!Number.isSafeInteger(quantity)||quantity<=0)throw Error('Quantidade ou valor inválido.');
    const total=BigInt(price)+BigInt(freight),q=BigInt(quantity);
    return Number((total*2n+q)/(q*2n));
  }
  function best(rows){return rows.filter(r=>Number.isSafeInteger(r.quantity)&&r.quantity>0&&validMoney(r.price)).reduce((a,b)=>{
    if(!a)return b;const d=BigInt(b.price)*BigInt(a.quantity)-BigInt(a.price)*BigInt(b.quantity);
    return d<0n||(d===0n&&(b.price<a.price||(b.price===a.price&&b.id.localeCompare(a.id)<0)))?b:a;
  },null);}
  function validate(rows,c){
    if(!['full','short','formal','confirmation'].includes(c.mode))throw Error('Modo inválido.');
    const row=rows.find(r=>r.id===c.sheet);if(!row)throw Error('Selecione uma folha.');
    unit(row.price,row.quantity,c.freight);
    if(!c.carrier.trim())throw Error('Informe a transportadora.');
    if(!c.production.trim())throw Error('Informe o prazo de produção.');return row;
  }
  function generate(rows,c){
    if(c.mode==='confirmation')return generateConfirmation(rows,c);
    const chosen=validate(rows,c),winner=best(rows);
    const lines=[c.name.trim()?`Olá, ${c.name.trim()}! 😊`:'Olá! 😊','',c.mode==='formal'?'Formalização do orçamento de adesivos DTF UV:':'Segue seu orçamento de adesivos DTF UV:',''];
    for(const r of c.mode==='full'?rows:[chosen]){
      lines.push(`${winner?.id===r.id?'⭐':'📏'} Folha ${r.label}${winner?.id===r.id?' — Melhor custo por adesivo':''}`);
      if(r.quantity<=0){lines.push('• Nenhum adesivo cabe nesta folha.','');continue;}
      lines.push(`• Quantidade: ${r.quantity} adesivos`,`• Valor da folha: ${money(r.price)}`,`• Valor por adesivo: ${money(unit(r.price,r.quantity))}`,'');
    }
    lines.push(`🚚 Transporte: ${c.carrier.trim()}`,`💵 Frete: ${money(c.freight)}`,'',`📦 Opção selecionada: ${chosen.label}`,`💰 Total com frete: ${money(chosen.price+c.freight)}`);
    if(c.distributed)lines.push(`• Valor por adesivo com frete: ${money(unit(chosen.price,chosen.quantity,c.freight))}`);
    lines.push('',`⏱️ Prazo de produção: ${c.production.trim()}`);
    for(const [key,label]of [['delivery','Prazo estimado de entrega'],['validity','Validade do orçamento'],['notes','Observações']])if(c[key]?.trim())lines.push(`${label}: ${c[key].trim()}`);
    lines.push('','As quantidades são estimativas de encaixe, considerando as medidas informadas.','Os valores unitários são arredondados; o total é calculado pelo valor da folha.','Qualquer dúvida, estamos à disposição!');return lines.join('\n');
  }
  function generateConfirmation(rows,c){
    const chosen=validate(rows,c);
    const lines=['*CONFIRMAÇÃO PARA CONFERÊNCIA — DTF UV MANIA*'];
    if(c.orderId?.trim())lines.push('Pedido: '+c.orderId.trim());
    if(c.name?.trim())lines.push('Cliente: '+c.name.trim());
    for(const [key,label]of [['phone','Telefone'],['document','CPF/CNPJ'],['zip','CEP'],['street','Rua'],['number','Número'],['complement','Complemento'],['district','Bairro'],['city','Cidade'],['state','Estado']])if(c[key]?.trim())lines.push(label+': '+c[key].trim());
    lines.push('Folha: '+chosen.label,'Quantidade: '+chosen.quantity+' adesivos');
    if(c.color?.trim())lines.push('Cor/acabamento geral: '+c.color.trim());
    for(const [i,a]of (chosen.arts||[]).entries())if(a.quantity>0){
      lines.push('• Modelo '+String(i+1).padStart(2,'0')+': '+a.widthCm+' × '+a.heightCm+' cm · '+a.quantity+' un. · '+(a.color||c.color||'cor não informada'));
    }
    lines.push('','Produto: '+money(chosen.price),'Frete: '+c.carrier.trim()+' — '+money(c.freight),'','*TOTAL DO PEDIDO: '+money(chosen.price+c.freight)+'*','','Produção: '+c.production.trim());
    if(c.compareSheets){lines.push('','OUTRAS OPÇÕES DE FOLHA (encaixe estimado):');for(const row of rows)if(row.id!==chosen.id&&row.quantity>0)lines.push('• '+row.label+': '+row.quantity+' unidades · '+money(row.price)+' · '+money(unit(row.price,row.quantity))+'/un. sem frete');}
    if(c.delivery?.trim())lines.push('Entrega estimada: '+c.delivery.trim());
    if(c.notes?.trim())lines.push('Observações: '+c.notes.trim());
    if(c.estimated!==false)lines.push('','Encaixe estimado pelas medidas; conferir com as artes na montagem.');
    lines.push('','Confira medidas, cores e quantidades. Podemos seguir?');
    return lines.join('\n');
  }
  // Divisão BigInt não negativa com arredondamento half up.
  const roundDiv=(a,b)=>(a*2n+b)/(b*2n);
  // Comprimentos em décimos de centímetro (inteiros) para evitar frações binárias.
  function tenths(value){const n=Number(String(value).trim().replace(',','.'));if(!Number.isFinite(n)||n<=0||n>100000)throw Error('Comprimento inválido.');return Math.round(n*10);}
  function signedMoney(n){if(!Number.isSafeInteger(n))throw Error('Valor inválido.');return n<0?'-'+money(-n):money(n);}
  // Folha sob medida com preço configurado por cm de comprimento.
  function lengthPrice(perCm,heightCm){
    if(!validMoney(perCm))throw Error('Preço por cm inválido.');
    const n=Number(roundDiv(BigInt(perCm)*BigInt(tenths(heightCm)),10n));if(!validMoney(n))throw Error('Valor monetário fora do limite.');return n;
  }
  // Estimativa a partir da tabela de folhas padrão: interpolação linear entre os comprimentos vizinhos;
  // abaixo do menor comprimento usa o preço da menor folha; acima do maior, proporcional à maior folha.
  function estimateLengthPrice(table,heightCm){
    const rows=table.filter(r=>validMoney(r.price)&&r.h>0).map(r=>({t:BigInt(tenths(r.h)),p:BigInt(r.price)})).sort((a,b)=>a.t<b.t?-1:a.t>b.t?1:0);
    if(!rows.length)throw Error('Tabela de preços vazia.');
    const t=BigInt(tenths(heightCm)),first=rows[0],last=rows[rows.length-1];
    if(t<=first.t)return Number(first.p);
    if(t>=last.t)return Number(roundDiv(last.p*t,last.t));
    for(let i=0;i<rows.length-1;i++){const a=rows[i],b=rows[i+1];if(t>=a.t&&t<=b.t)return Number(roundDiv(a.p*(b.t-t)+b.p*(t-a.t),b.t-a.t));}
  }
  // Revenda: preço fixo por arte (centavos) ou margem sobre o custo (centésimos de ponto percentual).
  function resale(price,quantity,opt){
    if(!validMoney(price)||!Number.isSafeInteger(quantity)||quantity<=0)return null;
    const out={cost:unit(price,quantity)};
    let sale=null;
    if(opt&&opt.mode==='unit'&&validMoney(opt.value))sale=opt.value;
    else if(opt&&opt.mode==='markup'&&Number.isSafeInteger(opt.value)&&opt.value>=0&&opt.value<=100000000)sale=Number(roundDiv(BigInt(price)*(10000n+BigInt(opt.value)),10000n*BigInt(quantity)));
    if(sale==null)return out;
    const revenue=BigInt(sale)*BigInt(quantity),profit=revenue-BigInt(price);
    if(revenue>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Valor monetário fora do limite.');
    return {...out,sale,revenue:Number(revenue),profit:Number(profit)};
  }
  function whatsapp(text){if(!text.trim())throw Error('Mensagem vazia.');return 'https://wa.me/?text='+encodeURIComponent(text);}
  const api={cents,money,signedMoney,unit,best,validate,generate,generateConfirmation,whatsapp,tenths,lengthPrice,estimateLengthPrice,resale};
  if(typeof module!=='undefined')module.exports=api;
  // Bundlers may wrap this shared file as CommonJS even inside the browser.
  if(typeof window!=='undefined')root.Quote=api;
})(globalThis);
