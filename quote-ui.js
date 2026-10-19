const dialog=document.createElement('dialog');
dialog.id='quote-dialog';dialog.setAttribute('aria-labelledby','quote-title');
dialog.innerHTML=`<h2 id="quote-title">Gerar orçamento</h2><button id="quote-close" class="bclean">Fechar</button>
<p>1. Configuração do orçamento</p><p>As quantidades correspondem ao comparativo da calculadora. No modo normal, o comparativo considera somente a arte principal, sem a segunda arte.</p><form id="quote-form"><div class="quote-grid">
<label>Modo<select name="mode"><option value="full">Comparativo completo</option><option value="short">Orçamento resumido</option><option value="formal">Formalização</option></select></label>
<label>Nome do cliente (opcional)<input name="name" autocomplete="off"></label>
<label>Folha<select name="sheet"></select></label>
<label>Transportadora<select name="carrier">${['Jadlog','LATAM Cargo','Correios','Motoboy','Retirada no local','Outra'].map(s=>`<option>${s}</option>`).join('')}</select></label>
<label id="custom-carrier-label" hidden>Nome da transportadora<input name="customCarrier"></label>
<label>Valor do frete (R$)<input name="freight" inputmode="decimal" value="0,00" required></label>
<label>Prazo de produção<input name="production" placeholder="Ex.: até 2 dias úteis" required></label>
<label>Prazo estimado de entrega (opcional)<input name="delivery"></label>
<label>Validade do orçamento (opcional)<input name="validity"></label>
<label>Observações adicionais (opcional)<textarea name="notes"></textarea></label>
</div><label><input type="checkbox" name="distributed"> Mostrar preço unitário com frete distribuído</label></form>
<strong id="quote-total" aria-live="polite"></strong><p id="quote-error" role="alert"></p>
<p>2. Prévia da mensagem</p><label for="quote-preview">Mensagem editável (alterar campos acima gera uma nova prévia)</label><textarea id="quote-preview" rows="18"></textarea>
<p>3. Copiar e compartilhar</p><div class="quote-actions"><button class="bcalc" id="quote-copy">Copiar orçamento</button><button class="bcalc" id="quote-share">Enviar pelo WhatsApp</button></div><p id="quote-status" role="status"></p>`;
document.body.append(dialog);
const style=document.createElement('style');style.textContent=`#quote-dialog{color:var(--txt);background:var(--s1);border:1px solid var(--b2);border-radius:14px;padding:24px;width:min(940px,96vw);max-height:92dvh;overflow:auto;margin:auto}#quote-dialog::backdrop{background:#000b}#quote-dialog [hidden]{display:none!important}#quote-dialog h2{margin-bottom:12px}#quote-dialog p{margin:16px 0 10px}.quote-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}#quote-dialog label{color:#bcbcbc}#quote-dialog input[type=checkbox]{width:18px;height:18px;appearance:auto;vertical-align:middle}#quote-total{display:block;color:var(--accent);font-size:22px;margin-top:16px}#quote-error{color:#ff8396}#quote-preview{min-height:320px}.quote-actions{display:flex;gap:12px}.quote-actions button{padding:8px;height:auto;min-height:48px}@media(max-width:580px){.quote-grid{grid-template-columns:1fr}.quote-actions{flex-direction:column}#quote-dialog{padding:16px}}`;document.head.append(style);
const form=document.getElementById('quote-form'),preview=document.getElementById('quote-preview');
let activeRows=[],config,valid=false;
function field(n){return form.elements.namedItem(n);}
function refreshQuote(){
  valid=false;document.getElementById('custom-carrier-label').hidden=field('carrier').value!=='Outra';
  try{
    config=Object.fromEntries(new FormData(form));config.carrier=config.carrier==='Outra'?config.customCarrier:config.carrier;
    config.freight=Quote.cents(config.freight);config.distributed=field('distributed').checked;
    const row=Quote.validate(activeRows,config);preview.value=Quote.generate(activeRows,config);
    document.getElementById('quote-total').textContent='Total com frete: '+Quote.money(row.price+config.freight);
    document.getElementById('quote-error').textContent='';valid=true;
    try{localStorage.setItem('dtf-quote-preferences',JSON.stringify({carrier:field('carrier').value,production:config.production}));}catch{}
  }catch(e){preview.value='';document.getElementById('quote-total').textContent='';document.getElementById('quote-error').textContent=e.message;}
  document.getElementById('quote-copy').disabled=!valid;document.getElementById('quote-share').disabled=!valid;
  document.getElementById('quote-status').textContent='';
}
function openQuote(){
  activeRows=quoteRows.map(r=>({...r}));
  field('sheet').replaceChildren(...activeRows.map(r=>{const o=new Option(`${r.label} — ${r.quantity} adesivos`,r.id);o.disabled=r.quantity<=0;return o;}));
  field('sheet').value=Quote.best(activeRows)?.id||'';
  field('name').value='';field('delivery').value='';field('validity').value='';field('notes').value='';field('customCarrier').value='';
  try{const p=JSON.parse(localStorage.getItem('dtf-quote-preferences')||'{}');if([...field('carrier').options].some(o=>o.value===p.carrier))field('carrier').value=p.carrier;if(typeof p.production==='string')field('production').value=p.production;}catch{}
  refreshQuote();dialog.showModal();
}
form.addEventListener('input',refreshQuote);form.addEventListener('submit',e=>e.preventDefault());
document.getElementById('quote-close').onclick=()=>dialog.close();
document.getElementById('quote-copy').onclick=async()=>{
  if(!valid||!preview.value.trim())return;
  try{await navigator.clipboard.writeText(preview.value);document.getElementById('quote-status').textContent='Orçamento copiado.';}catch{preview.focus();preview.select();document.getElementById('quote-status').textContent='Não foi possível copiar automaticamente. Copie o texto selecionado.';}
};
document.getElementById('quote-share').onclick=()=>{if(valid&&preview.value.trim())window.open(Quote.whatsapp(preview.value),'_blank','noopener,noreferrer');};
// Any calculator input edit invalidates its old result and prevents stale quotes.
document.querySelector('.wrap').addEventListener('input',e=>{if(e.target.matches('input,select,textarea')){document.getElementById('result').style.display='none';document.getElementById('result-inv').style.display='none';quoteRows=[];}});

document.querySelector('.wrap').addEventListener('click',e=>{if(e.target.closest('.rm,.badd')){document.getElementById('result').style.display='none';document.getElementById('result-inv').style.display='none';quoteRows=[];}});
// Validate inputs before invoking the original packing engine; its algorithm is unchanged.
const calculateOriginal=calcular;
calcular=function(){
  const containers=mainMode==='inv'?['card-inv']:['card-folha',currentMode==='fill'?'mode-fill':'mode-multi'];
  const inputs=containers.flatMap(id=>[...document.getElementById(id).querySelectorAll('input[type=number]:not(:disabled)')]);
  const invalid=inputs.find(el=>el.value===''||!Number.isFinite(el.valueAsNumber)||!el.checkValidity());
  if(invalid){invalid.focus();alert('Preencha medidas, quantidades e espaçamento válidos antes de calcular.');return;}
  calculateOriginal();
};

preview.addEventListener('input',()=>{const disabled=!valid||!preview.value.trim();document.getElementById('quote-copy').disabled=disabled;document.getElementById('quote-share').disabled=disabled;document.getElementById('quote-status').textContent='';});
