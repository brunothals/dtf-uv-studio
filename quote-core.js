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
    if(!['full','short','formal'].includes(c.mode))throw Error('Modo inválido.');
    const row=rows.find(r=>r.id===c.sheet);if(!row)throw Error('Selecione uma folha.');
    unit(row.price,row.quantity,c.freight);
    if(!c.carrier.trim())throw Error('Informe a transportadora.');
    if(!c.production.trim())throw Error('Informe o prazo de produção.');return row;
  }
  function generate(rows,c){
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
  function whatsapp(text){if(!text.trim())throw Error('Mensagem vazia.');return 'https://wa.me/?text='+encodeURIComponent(text);}
  const api={cents,money,unit,best,validate,generate,whatsapp};
  if(typeof module!=='undefined')module.exports=api;else root.Quote=api;
})(globalThis);
