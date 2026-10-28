// No customer data is persisted; CEP is sent only when the user requests a quote.
if(!customElements.get('dtf-freight'))customElements.define('dtf-freight',class extends HTMLElement{
 static filterOptions(options){
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase(),selected=new Map();
  for(const option of options||[]){
   if(!Number.isFinite(option.price)||option.price<0||!Number.isFinite(option.days)||option.days<0)continue;
   const carrier=normalize(option.carrier),service=normalize(option.service);
   const label=carrier.includes('correios')&&service==='pac'?'PAC':carrier.includes('correios')&&service==='sedex'?'SEDEX':carrier==='loggi'?'Loggi':null;
   if(!label)continue;const previous=selected.get(label);
   if(!previous||option.price<previous.price||option.price===previous.price&&option.days<previous.days)selected.set(label,{...option,label});
  }
  return ['PAC','SEDEX','Loggi'].flatMap(label=>selected.has(label)?[selected.get(label)]:[]);
 }
 static message(options,zip){
  const money=value=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  return ['📦 *Opções de frete*',`CEP: ${zip.replace(/^(\d{5})(\d{3})$/,'$1-$2')}`,'',...options.map(o=>`• *${o.label}*: ${money(o.price)} — ${o.days} ${o.days===1?'dia útil':'dias úteis'}`),'','Prazos estimados de transporte após a postagem. Prazo de produção à parte.','Qual opção você prefere?'].join('\n');
 }
 connectedCallback(){
  if(this.childNodes.length)return;
  this.innerHTML=`<details style="margin:16px 0"><summary>Consultar frete — Melhor Envio (opcional)</summary><p>PAC, SEDEX e Loggi, conforme disponibilidade. Para Loggi, mostramos a cotação de menor valor. Informe a embalagem de envio e seu peso.</p><div style="display:flex;gap:10px;flex-wrap:wrap">${[['zip','CEP de destino','text',''],['width','Largura da embalagem (cm)','number','12'],['length','Comprimento da embalagem (cm)','number','17'],['height','Altura da embalagem (cm)','number','2'],['weight','Peso com embalagem (kg)','number','0.5'],['insurance','Valor declarado para frete (R$)','number','']].map(([name,label,type,value])=>`<label>${label}<input name="${name}" aria-label="${label}" type="${type}" value="${value}" step="any" style="display:block;max-width:180px"></label>`).join('')}</div><label><input type="checkbox" name="extraDay" checked> Mostrar 2 dias úteis quando retornar 1 dia útil</label><p><button type="button" class="freight-query">Consultar frete</button></p><p role="status"></p><div class="freight-options"></div><div class="freight-share" hidden><p><button type="button" class="freight-copy">Copiar opções de frete para WhatsApp</button></p><label>Mensagem de frete pronta para copiar<textarea aria-label="Mensagem de frete pronta para copiar" readonly rows="9" style="display:block;width:100%;box-sizing:border-box;margin:10px 0"></textarea></label><p class="freight-copy-status" role="status"></p></div></details>`;
  const status=this.querySelector('[role=status]'),list=this.querySelector('.freight-options'),button=this.querySelector('.freight-query'),share=this.querySelector('.freight-share'),message=share.querySelector('textarea'),copyStatus=share.querySelector('.freight-copy-status');let version=0;
  this.addEventListener('input',()=>{version++;list.replaceChildren();share.hidden=true;message.value='';copyStatus.textContent='';status.textContent='Dados alterados. Consulte novamente para atualizar valores e prazos.';});
  share.querySelector('button').onclick=async()=>{
   if(!message.value)return;
   try{await navigator.clipboard.writeText(message.value);copyStatus.textContent='Opções copiadas. Cole na conversa do WhatsApp.';}
   catch{message.focus();message.select();copyStatus.textContent='Selecionei a mensagem. Use Copiar ou Ctrl+C para enviar ao cliente.';}
  };
  button.onclick=async()=>{
   const requestedVersion=++version;list.replaceChildren();share.hidden=true;message.value='';copyStatus.textContent='';button.disabled=true;
   try{
    const q={};for(const k of ['width','height','length','weight','insurance'])q[k]=Number(this.querySelector(`[name=${k}]`).value);q.zip=this.querySelector('[name=zip]').value.replace(/\D/g,'');q.extraDay=this.querySelector('[name=extraDay]').checked;
    status.textContent='Consultando…';const r=await fetch('/api/freight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(q)}),data=await r.json();if(requestedVersion!==version)return;if(!r.ok)throw Error(data.error);
    const options=this.constructor.filterOptions(data.options);
    status.textContent=options.length?'Selecione um frete para incluir no orçamento ou copie todas as opções para o cliente escolher.':'PAC, SEDEX e Loggi indisponíveis para essa embalagem e CEP.';
    for(const option of options){
     const b=document.createElement('button');b.type='button';b.style.cssText='display:block;margin:8px 0;padding:10px';b.textContent=`${option.label} — ${option.price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} — ${option.days} ${option.days===1?'dia útil':'dias úteis'}`;
     b.onclick=()=>this.dispatchEvent(new CustomEvent('freight-selected',{bubbles:true,detail:option}));list.append(b);
    }
    if(options.length){message.value=this.constructor.message(options,q.zip);share.hidden=false;}
   }catch(e){if(requestedVersion===version)status.textContent=e.message||'Consulta indisponível. Preencha o frete manualmente.';}
   finally{button.disabled=false;}
  };
 }
});
