// No customer data is persisted; CEP is sent only when the user requests a quote.
// Only the surcharge choice is remembered in this browser (dtf-freight-preferences).
if(!customElements.get('dtf-freight'))customElements.define('dtf-freight',class extends HTMLElement{
 /** Transportadoras mostradas, nesta ordem. */
 static get labels(){return ['PAC','SEDEX','Loggi','Jadlog','J&T'];}
 /** Acréscimo opcional por cotação, em centavos. */
 static get surchargeCents(){return 200;}
 static label(carrier,service){
  if(carrier.includes('correios'))return service==='pac'?'PAC':service==='sedex'?'SEDEX':null;
  if(carrier==='loggi')return 'Loggi';
  if(carrier.includes('jadlog'))return 'Jadlog';
  // Melhor Envio devolve "JeT"; aceita também "J&T", "J&T Express" e "JT".
  if(/^j ?(&|e)? ?t( |$)/.test(carrier))return 'J&T';
  return null;
 }
 /**
  * Mantém PAC e SEDEX comuns e a cotação mais barata de Loggi, Jadlog e J&T.
  * `surcharge` (centavos) é somado a cada preço; o valor original fica em `basePrice`.
  */
 static filterOptions(options,surcharge=0){
  const normalize=value=>String(value||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase(),selected=new Map();
  const extra=Number.isSafeInteger(surcharge)&&surcharge>0?surcharge:0;
  for(const option of options||[]){
   if(!Number.isFinite(option.price)||option.price<0||!Number.isFinite(option.days)||option.days<0)continue;
   const label=this.label(normalize(option.carrier),normalize(option.service));
   if(!label)continue;const previous=selected.get(label);
   if(!previous||option.price<previous.price||option.price===previous.price&&option.days<previous.days)selected.set(label,{...option,label});
  }
  // Soma em centavos inteiros para não acumular erro de ponto flutuante.
  return this.labels.flatMap(label=>{
   const o=selected.get(label);if(!o)return [];
   return [{...o,basePrice:o.price,surcharge:extra/100,price:(Math.round(o.price*100)+extra)/100}];
  });
 }
 static message(options,zip){
  const money=value=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  return ['📦 *Opções de frete*',`CEP: ${zip.replace(/^(\d{5})(\d{3})$/,'$1-$2')}`,'',...options.map(o=>`• *${o.label}*: ${money(o.price)} — ${o.days} ${o.days===1?'dia útil':'dias úteis'}`),'','Prazos estimados de transporte após a postagem. Prazo de produção à parte.','Qual opção você prefere?'].join('\n');
 }
 static loadSurchargePreference(){
  try{const p=JSON.parse(localStorage.getItem('dtf-freight-preferences')||'{}');return p.surcharge!==false;}catch{return true;}
 }
 static saveSurchargePreference(on){
  try{localStorage.setItem('dtf-freight-preferences',JSON.stringify({surcharge:!!on}));}catch{}
 }
 connectedCallback(){
  if(this.childNodes.length)return;
  const C=this.constructor,extraLabel=(C.surchargeCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  // Com o atributo `open` a cotação já aparece aberta (cartão fixo na calculadora e na montadora).
  this.innerHTML=`<details class="freight-box"${this.hasAttribute('open')?' open':''} style="margin:16px 0"><summary style="cursor:pointer;font-weight:700">🚚 Cotação de frete — Melhor Envio</summary><p>PAC, SEDEX, Loggi, Jadlog e J&amp;T, conforme disponibilidade. Para Loggi, Jadlog e J&amp;T, mostramos a cotação de menor valor. Informe a embalagem de envio e seu peso.</p><div style="display:flex;gap:10px;flex-wrap:wrap">${[['zip','CEP de destino','text',''],['width','Largura da embalagem (cm)','number','12'],['length','Comprimento da embalagem (cm)','number','17'],['height','Altura da embalagem (cm)','number','2'],['weight','Peso com embalagem (kg)','number','0.5'],['insurance','Valor declarado para frete (R$)','number','']].map(([name,label,type,value])=>`<label>${label}<input name="${name}" aria-label="${label}" type="${type}" value="${value}" step="any" style="display:block;max-width:180px"></label>`).join('')}</div><label><input type="checkbox" name="extraDay" checked> Mostrar 2 dias úteis quando retornar 1 dia útil</label><label style="display:block"><input type="checkbox" name="surcharge"> Acrescentar ${extraLabel} em cada cotação de frete</label><p><button type="button" class="freight-query">Consultar frete</button></p><p role="status"></p><div class="freight-options"></div><div class="freight-share" hidden><p><button type="button" class="freight-copy">Copiar opções de frete para WhatsApp</button></p><label>Mensagem de frete pronta para copiar<textarea aria-label="Mensagem de frete pronta para copiar" readonly rows="11" style="display:block;width:100%;box-sizing:border-box;margin:10px 0"></textarea></label><p class="freight-copy-status" role="status"></p></div></details>`;
  const status=this.querySelector('[role=status]'),list=this.querySelector('.freight-options'),button=this.querySelector('.freight-query'),share=this.querySelector('.freight-share'),message=share.querySelector('textarea'),copyStatus=share.querySelector('.freight-copy-status'),surchargeBox=this.querySelector('[name=surcharge]');
  let version=0,last=null;
  surchargeBox.checked=C.loadSurchargePreference();
  const clear=()=>{list.replaceChildren();share.hidden=true;message.value='';copyStatus.textContent='';};
  // Monta botões e mensagem a partir da última resposta, com ou sem acréscimo.
  const render=()=>{
   clear();if(!last)return;
   const options=C.filterOptions(last.options,surchargeBox.checked?C.surchargeCents:0);
   status.textContent=options.length?'Selecione um frete para incluir no orçamento ou copie todas as opções para o cliente escolher.'+(surchargeBox.checked?` Valores já incluem ${extraLabel} de acréscimo.`:''):'PAC, SEDEX, Loggi, Jadlog e J&T indisponíveis para essa embalagem e CEP.';
   for(const option of options){
    const b=document.createElement('button');b.type='button';b.style.cssText='display:block;margin:8px 0;padding:10px';b.textContent=`${option.label} — ${option.price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} — ${option.days} ${option.days===1?'dia útil':'dias úteis'}`;
    b.onclick=()=>this.dispatchEvent(new CustomEvent('freight-selected',{bubbles:true,detail:option}));list.append(b);
   }
   if(options.length){message.value=C.message(options,last.zip);share.hidden=false;}
  };
  this.addEventListener('input',event=>{
   // Trocar o acréscimo só recalcula os valores já consultados; não refaz a consulta.
   if(event.target===surchargeBox){C.saveSurchargePreference(surchargeBox.checked);render();return;}
   version++;last=null;clear();status.textContent='Dados alterados. Consulte novamente para atualizar valores e prazos.';
  });
  share.querySelector('button').onclick=async()=>{
   if(!message.value)return;
   try{await navigator.clipboard.writeText(message.value);copyStatus.textContent='Opções copiadas. Cole na conversa do WhatsApp.';}
   catch{message.focus();message.select();copyStatus.textContent='Selecionei a mensagem. Use Copiar ou Ctrl+C para enviar ao cliente.';}
  };
  button.onclick=async()=>{
   const requestedVersion=++version;last=null;clear();button.disabled=true;
   try{
    const q={};for(const k of ['width','height','length','weight','insurance'])q[k]=Number(this.querySelector(`[name=${k}]`).value);q.zip=this.querySelector('[name=zip]').value.replace(/\D/g,'');q.extraDay=this.querySelector('[name=extraDay]').checked;
    status.textContent='Consultando…';const r=await fetch('/api/freight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(q)}),data=await r.json();if(requestedVersion!==version)return;if(!r.ok)throw Error(data.error);
    last={options:data.options,zip:q.zip};render();
   }catch(e){if(requestedVersion===version)status.textContent=e.message||'Consulta indisponível. Preencha o frete manualmente.';}
   finally{button.disabled=false;}
  };
 }
});
