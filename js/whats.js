// Geladão Brothers — tela da extensão do WhatsApp Web (estilo Cardapinho)
const sb = supabase.createClient(GB_CONFIG.SUPABASE_URL, GB_CONFIG.SUPABASE_KEY);
const app = document.getElementById("app"), ov = document.getElementById("ov");
const SITE = location.origin;

/* ---------- utilidades ---------- */
const brl=v=>"R$ "+Number(v||0).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,".");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=v=>{if(v===""||v==null)return null;let s=String(v).replace(/[^\d,.\-]/g,"");s=s.includes(",")?s.replace(/\./g,"").replace(",","."):s;const n=parseFloat(s);return isNaN(n)?null:n};
const money=v=>v==null?"":Number(v).toFixed(2).replace(".",",");
const digits=s=>String(s||"").replace(/\D/g,"");
const fmtPhone=s=>{let d=digits(s);if(d.length>=12&&d.startsWith("55"))d=d.slice(2);return d.length===11?`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`:d.length===10?`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`:s||""};
const same9=(a,b)=>{const x=digits(a),y=digits(b);return x.length>=8&&y.length>=8&&x.slice(-9)===y.slice(-9)};
const dt=d=>new Date(d).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
const $=(s,el=document)=>el.querySelector(s), $$=(s,el=document)=>[...el.querySelectorAll(s)];
function toast(t){const e=document.createElement("div");e.className="toast";e.textContent=t;document.body.append(e);setTimeout(()=>e.remove(),2600)}
async function q(p){const {data,error}=await p;if(error){console.error(error);toast("Erro: "+error.message);throw error}return data}
const STATUS={novo:"Novo",em_preparo:"Em preparação",saiu_entrega:"Saiu para entrega",pronto:"Pronto para retirada",concluido:"Concluído",cancelado:"Cancelado"};
const pill=s=>`<span class="pill p-${s}">${STATUS[s]||s}</span>`;
const WA_DEFAULT={em_preparo:"Olá, {nome}! 😃 Recebemos seu pedido *#{numero}* no {loja} e já estamos preparando. 🍻\nTotal: {total}",saiu_entrega:"🛵 {nome}, seu pedido *#{numero}* saiu para entrega! Já já chega aí. 🍻",pronto:"✅ {nome}, seu pedido *#{numero}* está pronto pra retirada aqui no {loja}!",concluido:"Obrigado pela preferência, {nome}! 🙏💛\nEsperamos te encontrar em breve.\nO {loja} agradece! 🍻\n\n⭐ Avalie seu pedido, leva 10 segundos:\n{link_avaliacao}"};

/* ---------- ponte com a extensão ---------- */
const IN_EXT=window.parent!==window;
let chat={title:"",phone:""}, pending={};
function post(m){if(IN_EXT)parent.postMessage(m,"*")}
function sendToChat(text,{auto=true}={}){
  return new Promise(res=>{
    if(!IN_EXT){navigator.clipboard?.writeText(text).catch(()=>{});toast("Fora do WhatsApp: texto copiado");return res(false)}
    const id=Math.random().toString(36).slice(2); pending[id]=res;
    post({gb:"send",id,text,auto,expect:{title:chat.title,phone:chat.phone}});
    setTimeout(()=>{if(pending[id]){delete pending[id];res(false)}},6000);
  });
}
window.addEventListener("message",e=>{
  if(!String(e.origin).startsWith("chrome-extension://"))return;
  const d=e.data||{};
  if(d.gb==="chat-info"){const changed=d.title!==chat.title||digits(d.phone)!==digits(chat.phone);chat={title:d.title||"",phone:digits(d.phone)};if(changed)onChat()}
  if(d.gb==="sent"&&pending[d.id]){const r=pending[d.id];delete pending[d.id];
    if(!d.ok)toast(d.reason==="chat"?"A conversa aberta mudou. Volte pra conversa do cliente.":"Não consegui colar no WhatsApp. Recarregue a aba (F5).");r(!!d.ok)}
});

/* ---------- dados ---------- */
let S={}, CUSTS=null, cust=null, CATS=[], PRODS=[], ZONES=[], view="home";
async function loadBase(){
  const [s,c,p,z]=await Promise.all([
    q(sb.from("store_settings").select("*").eq("id",1).single()),
    q(sb.from("categories").select("id,name,sort_order,active").order("sort_order")),
    q(sb.from("products").select("id,name,price,promo_price,price_tiers,image_url,category_id,status").neq("status","inativo").order("sort_order").order("name")),
    q(sb.from("delivery_zones").select("*").eq("active",true).order("neighborhood"))]);
  S=s;CATS=c.filter(x=>x.active);PRODS=p;ZONES=z;
}
async function loadCusts(){CUSTS=await q(sb.from("customers").select("*").limit(5000));return CUSTS}
async function findCust(){
  if(!CUSTS) await loadCusts();
  const t=(chat.title||"").trim().toLowerCase();
  let c=chat.phone?CUSTS.find(x=>same9(x.phone,chat.phone)):null;
  if(!c&&t) c=CUSTS.find(x=>(x.wa_name||"").trim().toLowerCase()===t);
  if(!c&&t){const byName=CUSTS.filter(x=>(x.name||"").trim().toLowerCase()===t);if(byName.length===1)c=byName[0]}
  if(c&&chat.title&&c.wa_name!==chat.title){sb.from("customers").update({wa_name:chat.title}).eq("id",c.id).then(()=>{});c.wa_name=chat.title}
  return c||null;
}
let started=false;
async function onChat(){if(!started)return;cust=await findCust();draft=null;if(view==="home"||view==="novo")home()}

/* ---------- textos do WhatsApp ---------- */
function waText(o,status){
  const tpl=((S.wa_templates||{})[status])||WA_DEFAULT[status]; if(!tpl) return null;
  const first=String(o.customer_name||"").trim().split(/\s+/)[0]||"";
  return tpl.replace(/\{nome\}/g,first).replace(/\{numero\}/g,o.number).replace(/\{loja\}/g,S.name).replace(/\{total\}/g,brl(o.total))
    .replace(/\{link_pedido\}/g,`${SITE}/?pedido=${o.id}&tel=${digits(o.customer_phone)}`)
    .replace(/\{link_avaliacao\}/g,`${SITE}/?avaliar=${o.id}&tel=${digits(o.customer_phone)}`);
}
function orderMsg(o,items){
  const d=new Date(o.created_at),p=x=>String(x).padStart(2,"0");
  const L=["#### NOVO PEDIDO ####","",`#️⃣ Nº pedido: ${o.number}`,`feito em ${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`,"",`👤 ${o.customer_name||""}`,...(o.customer_phone?[`📞 ${fmtPhone(o.customer_phone)}`]:[]),""];
  if(o.type==="delivery"){L.push("🛵 Endereço de entrega",`${o.street||""} ${o.street_number||""}`.trim(),...(o.complement?["Complemento: "+o.complement]:[]),...(o.neighborhood?["Bairro: "+o.neighborhood]:[]),...(o.reference?[`(${o.reference})`]:[]),"",`Link do endereço:`,`https://maps.google.com/?q=${encodeURIComponent(`${o.street||""}, ${o.street_number||""}, ${o.neighborhood||""}`)}`,"")}
  else L.push(o.type==="retirada"?"🏪 Retirar no estabelecimento":"🧾 Balcão","");
  L.push("------- ITENS DO PEDIDO -------","");
  items.forEach(i=>{L.push(`*${i.qty} x ${i.name}*`,`💵 ${i.qty} x ${brl(i.unit_price)} = ${brl(i.total)}`);if(i.notes)L.push("Obs.: "+i.notes);L.push("")});
  L.push("-------------------------------","",`SUBTOTAL: ${brl(o.subtotal)}`);
  if(o.type==="delivery") L.push(`ENTREGA: ${+o.delivery_fee?brl(o.delivery_fee):"Grátis"}`);
  if(+o.discount) L.push(`DESCONTO: - ${brl(o.discount)}`);
  L.push(`*VALOR FINAL: ${brl(o.total)}*`,"","PAGAMENTO",`*${o.payment_method}*: ${brl(o.total)}`);
  if(o.change_for) L.push(`💵 Vai pagar com: ${brl(o.change_for)}`,`🔁 *Levar troco de: ${brl(o.change_for-o.total)}*`);
  if(o.notes) L.push("",`📝 ${o.notes}`);
  L.push("",`🕐 Prazo para ${o.type==="delivery"?"entrega: "+S.delivery_time_min+"-"+S.delivery_time_max:"retirada: "+(S.prep_time_min||10)} min`);
  return L.join("\n");
}

/* ---------- moldura ---------- */
function frame(title,body,foot,{back,sub}={}){
  app.innerHTML=`<div class="wh">${back?`<button class="back" id="bk" aria-label="Voltar">←</button>`:`<div class="lg">${S.logo_url?`<img src="${esc(S.logo_url)}" alt="">`:"GB"}</div>`}
    <div class="t"><b>${title}</b><small>${sub||esc(S.name)}</small></div>
    ${back?"":`<button class="pill-btn ${S.is_open?"on":"off"}" id="op">${S.is_open?"● Aberto":"● Fechado"}</button><a class="back" href="${SITE}/painel/" target="_blank" rel="noopener" title="Abrir painel completo">↗</a>`}</div>
    <div class="body">${body}</div>${foot?`<div class="foot">${foot}</div>`:""}`;
  if(back) $("#bk").onclick=back;
  const op=$("#op"); if(op) op.onclick=async()=>{S.is_open=!S.is_open;await q(sb.from("store_settings").update({is_open:S.is_open}).eq("id",1));toast(S.is_open?"Loja aberta":"Loja fechada");frameRefresh()};
}
let frameRefresh=()=>home();

/* ---------- login ---------- */
function loginView(){
  app.innerHTML=`<div class="login"><form id="lf"><h1>Entrar</h1><p>Use o mesmo e-mail e senha do painel. Só precisa fazer uma vez.</p>
    <label class="fld"><span>E-mail</span><input id="em" class="in" type="email" autocomplete="username" required></label>
    <label class="fld"><span>Senha</span><input id="pw" class="in" type="password" autocomplete="current-password" required></label>
    <p class="err" id="e" hidden></p><button class="btn">Entrar</button></form></div>`;
  $("#lf").onsubmit=async e=>{e.preventDefault();const {error}=await sb.auth.signInWithPassword({email:$("#em").value.trim(),password:$("#pw").value});
    if(error){$("#e").hidden=false;$("#e").textContent="E-mail ou senha incorretos.";return}start()};
}

/* ================= INÍCIO ================= */
async function home(){
  view="home"; frameRefresh=home;
  const link=SITE+"/";
  let orders=[],count=0;
  if(cust){const r=await sb.from("orders").select("id,number,total,type,status,created_at",{count:"exact"}).eq("customer_id",cust.id).order("created_at",{ascending:false}).limit(15);orders=r.data||[];count=r.count||0}
  const name=cust?cust.name:(chat.title||"");
  const phone=cust?cust.phone:(chat.phone?fmtPhone(chat.phone):"");
  frame("Olá! 👋",`
    <div class="box"><div class="sec" style="margin:0"><div><b>Link do cardápio</b><small>${esc(link.replace("https://",""))}</small></div>
      <div class="iconrow"><button id="sl" title="Enviar no chat">➤</button><button id="cl" title="Copiar">⧉</button></div></div></div>
    ${chat.title||chat.phone?`<div class="box who"><div class="av">👤</div><div class="t"><b>${esc(name||"Contato")}</b><small>${phone?esc(phone):"Telefone não identificado"}</small>${cust?"":'<small style="display:block;color:var(--y)">Cliente novo</small>'}</div><button class="btn o sm" id="ed">${cust?"Editar":"Cadastrar"}</button></div>
    <div class="sec"><div><b>Pedidos do cliente</b><small>${cust?`Total de ${count} pedido${count===1?"":"s"}`:"Nenhum pedido ainda"}</small></div><button class="btn sm" id="np">➕ Novo pedido</button></div>
    ${orders.map(o=>`<button class="ord" data-o="${o.id}"><b>Pedido Nº ${o.number}</b><div class="m">${brl(o.total)} · ${o.type==="delivery"?"Delivery":o.type==="retirada"?"Retirada":"Balcão"} · ${dt(o.created_at)}</div>${pill(o.status)}</button>`).join("")}`
    :`<div class="box empty" style="padding:28px 12px">💬 Abra a conversa de um cliente no WhatsApp.<br><br>O cliente aparece aqui sozinho, com os pedidos dele.</div>
      <button class="btn o" id="np">➕ Novo pedido sem conversa</button>`}`);
  $("#sl").onclick=async()=>{if(await sendToChat(`Faça seu pedido pelo nosso cardápio online 🍻👇\n${link}`))toast("Link enviado")};
  $("#cl").onclick=async()=>{try{await navigator.clipboard.writeText(link);toast("Link copiado")}catch{toast(link)}};
  if($("#ed"))$("#ed").onclick=()=>custForm();
  $("#np").onclick=()=>novo();
  $$("[data-o]").forEach(b=>b.onclick=()=>detalhe(+b.dataset.o));
}
function custForm(after){
  const c=cust||{name:chat.title&&!/^[\d\s()+\-]+$/.test(chat.title)?chat.title:"",phone:chat.phone?fmtPhone(chat.phone):""};
  frame(cust?"Editar cliente":"Cadastrar cliente",`<div class="box grid">
    <label class="fld"><span>Nome</span><input class="in" id="cn" value="${esc(c.name||"")}"></label>
    <label class="fld"><span>Telefone (WhatsApp)</span><input class="in" id="cp" inputmode="tel" value="${esc(c.phone||"")}"></label>
    <p class="hint" style="margin:0">Com o telefone salvo, da próxima vez o cliente é reconhecido sozinho nessa conversa.</p><p class="err" id="e" hidden></p></div>`,
    `<button class="btn c" id="sv">Salvar</button>`,{back:after||home});
  $("#sv").onclick=async()=>{const name=$("#cn").value.trim(),phone=fmtPhone($("#cp").value);
    if(!name||digits(phone).length<10){$("#e").hidden=false;$("#e").textContent="Preencha o nome e o telefone com DDD.";return}
    if(!CUSTS) await loadCusts();
    let ex=cust||CUSTS.find(x=>same9(x.phone,phone));
    try{
      if(ex){await q(sb.from("customers").update({name,phone,wa_name:chat.title||ex.wa_name}).eq("id",ex.id))}
      else{await q(sb.from("customers").insert({name,phone,wa_name:chat.title||null}))}
    }catch(e){$("#e").hidden=false;$("#e").textContent=/duplicate|unique/i.test(e.message)?"Esse telefone já é de outro cliente.":e.message;return}
    await loadCusts(); if(!chat.phone) chat.phone=digits(phone); cust=await findCust(); toast("Cliente salvo"); (after||home)();
  };
}

/* ================= NOVO PEDIDO ================= */
let draft=null;
const KM=()=>S.delivery_mode==="km";
const basePrice=p=>p.promo_price!=null&&+p.promo_price<+p.price?+p.promo_price:+p.price;
const unitPrice=p=>{const qn=(draft.cart.find(i=>i.p===p)||{n:0}).n;let b=basePrice(p);(p.price_tiers||[]).forEach(x=>{if(qn>=x.min_qty&&+x.price<b)b=+x.price});return b};
const subT=()=>draft.cart.reduce((s,i)=>s+unitPrice(i.p)*i.n,0);
const feeT=()=>draft.type==="delivery"?(num(draft.fee)||0):0;
const totT=()=>Math.max(0,subT()+feeT()-(num(draft.disc)||0));
function newDraft(){
  const c=cust||{};
  const zone=c.neighborhood?ZONES.find(z=>z.neighborhood.toLowerCase()===String(c.neighborhood).toLowerCase()):null;
  return {type:S.accepts_delivery===false?"retirada":"delivery",cart:[],disc:"",pay:null,troco:"",obs:"",
    addr:{cep:c.cep||"",street:c.street||"",num:c.street_number||"",nb:c.neighborhood||"",zone:zone?zone.id:null,comp:c.complement||"",ref:c.reference||"",city:"",uf:""},
    fee:zone&&!KM()?money(zone.fee):""};
}
function novo(){
  view="novo"; frameRefresh=novo;
  if(!draft) draft=newDraft();
  const a=draft.addr, name=cust?cust.name:(chat.title||"Cliente"), phone=cust?cust.phone:(chat.phone?fmtPhone(chat.phone):"");
  const hasAddr=a.street&&a.num;
  frame("Novo pedido",`
    <button class="rowbtn" id="cli"><span>👤</span><span class="t"><b>${esc(name)}</b><small>${phone?esc(phone):"Toque pra informar o telefone"}</small></span><span>✎</span></button>
    <div class="grid2"><button class="paybtn" data-t="delivery" aria-pressed="${draft.type==="delivery"}">🛵 Entrega</button><button class="paybtn" data-t="retirada" aria-pressed="${draft.type==="retirada"}">🏪 Retirada</button></div>
    ${draft.type==="delivery"?`<button class="rowbtn" id="adr"><span>📍</span><span class="t">${hasAddr?`<b>${esc(a.street)}, ${esc(a.num)}</b><small>${esc(a.nb||"")}${a.comp?" · "+esc(a.comp):""}${a.ref?" · "+esc(a.ref):""}</small><small>Taxa: ${brl(feeT())}</small>`:`<b>Informar endereço de entrega</b><small>Rua, número, bairro e taxa</small>`}</span><span>✎</span></button>`:""}
    <div class="sec"><b>Carrinho</b>${draft.cart.length?`<button class="btn o sm" id="clr">Limpar</button>`:""}</div>
    <div class="box">${draft.cart.length?draft.cart.map((i,k)=>`<div class="ci2"><div class="t"><b>${esc(i.p.name)}</b><small>${brl(unitPrice(i.p))} cada${unitPrice(i.p)<basePrice(i.p)?' · <span style="color:var(--green)">atacado</span>':""}</small></div><span class="stp"><button data-m="${k}" aria-label="Menos">−</button><span>${i.n}</span><button data-p="${k}" aria-label="Mais">+</button></span><b style="width:72px;text-align:right">${brl(unitPrice(i.p)*i.n)}</b></div>`).join(""):'<div class="empty" style="padding:18px 0">🛒 Carrinho vazio</div>'}
      <button class="btn o" id="add" style="width:100%;margin-top:8px">➕ Adicionar produto</button></div>
    <label class="fld"><span>Observação do pedido</span><input class="in" id="obs" value="${esc(draft.obs)}" placeholder="Ex.: bem gelada"></label>
    <p class="err" id="e" hidden></p>`,
    `<button class="btn" id="go" ${draft.cart.length?"":"disabled"}><span>PAGAR</span><span>${brl(totT())}</span></button>`,{back:home,sub:esc(S.name)});
  $("#cli").onclick=()=>custForm(novo);
  $$("[data-t]").forEach(b=>b.onclick=()=>{draft.type=b.dataset.t;novo()});
  if($("#adr"))$("#adr").onclick=endereco;
  if($("#clr"))$("#clr").onclick=()=>{draft.cart=[];novo()};
  $$("[data-m]").forEach(b=>b.onclick=()=>{const i=draft.cart[+b.dataset.m];i.n--;if(!i.n)draft.cart.splice(+b.dataset.m,1);novo()});
  $$("[data-p]").forEach(b=>b.onclick=()=>{draft.cart[+b.dataset.p].n++;novo()});
  $("#add").onclick=()=>produtos();
  $("#obs").oninput=e=>draft.obs=e.target.value;
  $("#go").onclick=()=>{
    if(draft.type==="delivery"&&!(a.street&&a.num)){$("#e").hidden=false;$("#e").textContent="Informe o endereço de entrega.";return}
    pagamento();
  };
}
function endereco(){
  const a=draft.addr;
  frame("Endereço para entrega",`<div class="box grid">
    <div class="row" style="flex-wrap:nowrap"><input class="in" id="cep" inputmode="numeric" placeholder="CEP" value="${esc(a.cep)}"><button class="btn o sm" id="bc">Buscar por CEP</button></div>
    <p class="hint" id="cm" style="margin:0"></p>
    <div class="grid" style="grid-template-columns:1fr 80px"><label class="fld"><span>Rua *</span><input class="in" id="st" value="${esc(a.street)}"></label><label class="fld"><span>Nº *</span><input class="in" id="nu" value="${esc(a.num)}"></label></div>
    ${KM()?`<label class="fld"><span>Bairro *</span><input class="in" id="nb" value="${esc(a.nb)}"></label>`
      :`<label class="fld"><span>Bairro *</span><select class="in" id="zn"><option value="">Escolha o bairro</option>${ZONES.map(z=>`<option value="${z.id}" ${z.id===a.zone?"selected":""}>${esc(z.neighborhood)} · ${brl(z.fee)}</option>`).join("")}</select></label>`}
    <label class="fld"><span>Complemento</span><input class="in" id="co" value="${esc(a.comp)}"></label>
    <label class="fld"><span>Referência</span><input class="in" id="rf" value="${esc(a.ref)}"></label>
    <div class="row" style="flex-wrap:nowrap;align-items:flex-end"><label class="fld" style="flex:1"><span>Taxa de entrega (R$)</span><input class="in" id="fe" inputmode="decimal" value="${esc(draft.fee)}" placeholder="0,00"></label><button class="btn o sm" id="ct" style="margin-bottom:2px">Calcular taxa</button></div>
    <p class="err" id="e" hidden></p></div>`,
    `<button class="btn c" id="sv">Salvar endereço</button>`,{back:novo});
  const cm=$("#cm");
  $("#cep").oninput=e=>{let d=digits(e.target.value).slice(0,8);e.target.value=d.length>5?d.slice(0,5)+"-"+d.slice(5):d};
  $("#bc").onclick=async()=>{const d=digits($("#cep").value);if(d.length!==8){cm.textContent="Digite os 8 números do CEP.";return}cm.textContent="Buscando…";
    try{const j=await (await fetch(`https://viacep.com.br/ws/${d}/json/`)).json();if(j.erro){cm.textContent="CEP não encontrado.";return}
      if(j.logradouro)$("#st").value=j.logradouro; a.city=j.localidade||""; a.uf=j.uf||"";
      if(KM()) $("#nb").value=j.bairro||"";
      else{const nz=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();const z=ZONES.find(z=>nz(z.neighborhood)===nz(j.bairro))||ZONES.find(z=>nz(j.bairro)&&(nz(z.neighborhood).includes(nz(j.bairro))||nz(j.bairro).includes(nz(z.neighborhood))));
        if(z){$("#zn").value=z.id;$("#fe").value=money(z.fee)}else cm.textContent=`Bairro ${j.bairro||"?"} não está na lista de entrega. Escolha o mais perto ou digite a taxa.`}
      if(!cm.textContent.startsWith("Bairro")) cm.textContent=`${j.bairro||""} · ${j.localidade}/${j.uf}`; $("#nu").focus();
    }catch{cm.textContent="Não deu pra buscar o CEP agora."}};
  if($("#zn"))$("#zn").onchange=e=>{const z=ZONES.find(z=>z.id==e.target.value);if(z)$("#fe").value=money(z.fee)};
  $("#ct").onclick=async()=>{
    if(!KM()){const z=ZONES.find(z=>z.id==$("#zn").value);if(!z){cm.textContent="Escolha o bairro pra calcular.";return}$("#fe").value=money(z.fee);cm.textContent=`Taxa do bairro ${z.neighborhood}`;return}
    if(S.store_lat==null){cm.textContent="Cadastre a localização da loja em Delivery e bairros, no painel.";return}
    cm.textContent="Calculando a distância…";
    const city=a.city||"", st=$("#st").value, nu=$("#nu").value, nb=$("#nb").value; let pos=null;
    for(const qy of [`${st}, ${nu}, ${nb}, ${city}`,`${st}, ${nb}, ${city}`,`${st}, ${city}`,`${nb}, ${city}`]){try{const j=await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(qy)}`)).json();if(j[0]){pos=j[0];break}}catch{}}
    if(!pos){cm.textContent="Não achei o endereço no mapa. Digite a taxa na mão.";return}
    const R=6371,r=x=>x*Math.PI/180,la=+pos.lat,ln=+pos.lon,h=Math.sin(r(la-S.store_lat)/2)**2+Math.cos(r(S.store_lat))*Math.cos(r(la))*Math.sin(r(ln-S.store_lng)/2)**2;
    const dkm=Math.round(2*R*Math.asin(Math.sqrt(h))*10)/10, fee=(+S.km_base_fee||0)+Math.max(0,Math.ceil(dkm-(+S.km_base_km||0)))*(+S.km_price||0);
    $("#fe").value=money(fee); cm.textContent=`${String(dkm).replace(".",",")} km da loja${+S.km_max>0&&dkm>+S.km_max?` · ⚠️ passa do máximo de ${S.km_max} km`:""}`;
  };
  $("#sv").onclick=()=>{
    const z=!KM()?ZONES.find(z=>z.id==$("#zn").value):null;
    Object.assign(a,{cep:$("#cep").value,street:$("#st").value.trim(),num:$("#nu").value.trim(),nb:KM()?$("#nb").value.trim():(z?z.neighborhood:""),zone:z?z.id:null,comp:$("#co").value.trim(),ref:$("#rf").value.trim()});
    if(!a.street||!a.num||!a.nb){$("#e").hidden=false;$("#e").textContent="Preencha rua, número e bairro.";return}
    draft.fee=$("#fe").value; novo();
  };
}
function produtos(){
  let cat="", term="";
  const draw=()=>{
    const list=PRODS.filter(p=>(!cat||String(p.category_id)===cat)&&(!term||p.name.toLowerCase().includes(term)));
    const cname=cat?(CATS.find(c=>String(c.id)===cat)||{}).name:"Todos os produtos";
    frame(esc(cname),`
      <div class="row" style="flex-wrap:nowrap"><input class="in" id="ps" placeholder="Pesquisar produto…" value="${esc(term)}"><select class="in" id="pc" style="max-width:150px"><option value="">Categorias</option>${CATS.map(c=>`<option value="${c.id}" ${String(c.id)===cat?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div>
      ${list.slice(0,150).map(p=>{const inC=draft.cart.find(i=>i.p===p);const out=p.status!=="ativo";return `<button class="prod ${out?"out":""}" data-a="${p.id}" ${out?"disabled":""}>${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy">`:`<span class="ph">GB</span>`}<span class="t"><b>${esc(p.name)}</b><small>${out?"Em falta":brl(basePrice(p))}${(p.price_tiers||[]).length?` · 🔥 ${p.price_tiers.map(x=>x.min_qty+"+ "+brl(x.price)).join(" · ")}`:""}</small></span>${inC?`<span class="q">${inC.n}</span>`:'<span class="q" style="background:var(--card-2);color:var(--fg)">+</span>'}</button>`}).join("")||'<div class="empty">Nada encontrado.</div>'}`,
      `<button class="btn" id="vc"><span>VER CARRINHO (${draft.cart.reduce((s,i)=>s+i.n,0)})</span><span>${brl(subT())}</span></button>`,{back:novo});
    const ps=$("#ps"); ps.oninput=e=>{term=e.target.value.toLowerCase();const pos=e.target.selectionStart;draw();$("#ps").focus();$("#ps").setSelectionRange(pos,pos)};
    $("#pc").onchange=e=>{cat=e.target.value;draw();window.scrollTo(0,0)};
    $$("[data-a]").forEach(b=>b.onclick=()=>{const p=PRODS.find(x=>x.id==b.dataset.a);const i=draft.cart.find(x=>x.p===p);i?i.n++:draft.cart.push({p,n:1});const y=window.scrollY;draw();window.scrollTo(0,y)});
    $("#vc").onclick=novo;
  };
  draw();
}
function pagamento(){
  const methods=(S.payment_methods||["Pix","Dinheiro","Cartão de crédito","Cartão de débito"]).concat(["Fiado"]);
  if(!draft.pay) draft.pay=methods[0];
  const draw=()=>{
    const tot=totT(), cash=/dinheiro/i.test(draft.pay), tr=num(draft.troco);
    frame("Pagamento do pedido",`
      <div class="kv"><div><small>Subtotal</small><b>${brl(subT())}</b></div><div><small>Entrega</small><b>${brl(feeT())}</b></div>
        <div><small>Desconto (R$)</small><input class="in" id="ds" inputmode="decimal" value="${esc(draft.disc)}" placeholder="0,00" style="margin-top:2px"></div><div><small>Total</small><b style="color:var(--y)">${brl(tot)}</b></div></div>
      <div class="sec"><b>Forma de pagamento</b></div>
      <div class="grid2">${methods.map(m=>`<button class="paybtn" data-pay="${esc(m)}" aria-pressed="${m===draft.pay}">${/pix/i.test(m)?"⚡":/dinheiro/i.test(m)?"💵":/fiado/i.test(m)?"📒":"💳"} ${esc(m)}</button>`).join("")}</div>
      ${cash?`<label class="fld"><span>Troco para quanto? (vazio = sem troco)</span><input class="in" id="tr" inputmode="decimal" value="${esc(draft.troco)}" placeholder="0,00"></label>
        <div class="chips">${[20,50,100,200].filter(v=>v>tot).slice(0,3).map(v=>`<button class="chip" data-v="${v}">${brl(v)}</button>`).join("")}</div>
        ${tr>tot?`<p class="ok" style="margin:0;font-size:14px">🔁 Levar <b>${brl(tr-tot)}</b> de troco</p>`:tr?`<p class="err" style="margin:0">O troco precisa ser maior que ${brl(tot)}</p>`:""}`:""}
      ${draft.pay==="Fiado"&&!(cust||chat.phone)?'<p class="err" style="margin:0">Pra lançar no fiado, cadastre o telefone do cliente.</p>':""}
      <p class="err" id="e" hidden></p>`,
      `<button class="btn" id="fz"><span>FINALIZAR</span><span>${brl(tot)}</span></button>`,{back:novo});
    $("#ds").onchange=e=>{draft.disc=e.target.value;draw()};
    $$("[data-pay]").forEach(b=>b.onclick=()=>{draft.pay=b.dataset.pay;if(!/dinheiro/i.test(draft.pay))draft.troco="";draw()});
    if($("#tr"))$("#tr").onchange=e=>{draft.troco=e.target.value;draw()};
    $$("[data-v]").forEach(b=>b.onclick=()=>{draft.troco=b.dataset.v;draw()});
    $("#fz").onclick=()=>{
      const err=t=>{$("#e").hidden=false;$("#e").textContent=t};
      if(cash&&tr&&!(tr>tot)) return err("O troco precisa ser maior que o total.");
      if(draft.pay==="Fiado"&&!(cust||digits(chat.phone).length>=10)) return err("Cadastre o telefone do cliente pra lançar no fiado.");
      ov.innerHTML=`<div class="confirm"><div class="box"><b style="font-size:16px">Gostaria de confirmar o pedido?</b><p class="muted" style="margin:0">${brl(tot)} · ${esc(draft.pay)}${tr>tot?` · troco ${brl(tr-tot)}`:""}<br>A mensagem do pedido vai ser enviada na conversa.</p>
        <div class="grid2"><button class="btn o" id="cv">Voltar</button><button class="btn" id="ok">Confirmar</button></div></div></div>`;
      $("#cv").onclick=()=>ov.innerHTML=""; $("#ok").onclick=finalizar;
    };
  };
  draw();
}
async function finalizar(){
  $("#ok").disabled=true;
  const a=draft.addr, name=cust?cust.name:(chat.title&&!/^[\d\s()+\-]+$/.test(chat.title)?chat.title:"Cliente WhatsApp");
  const phone=cust?cust.phone:(chat.phone?fmtPhone(chat.phone):"");
  try{
    const r=await q(sb.rpc("create_order",{p:{customer_name:name,customer_phone:phone,wa_name:chat.title||"",type:draft.type,
      fee_override:draft.type==="delivery"?String(feeT()):"",discount_override:num(draft.disc)?String(num(draft.disc)):"",
      neighborhood:draft.type==="delivery"?a.nb:"",cep:a.cep,street:draft.type==="delivery"?a.street:"",street_number:draft.type==="delivery"?a.num:"",complement:a.comp,reference:a.ref,
      payment_method:draft.pay,change_for:/dinheiro/i.test(draft.pay)&&num(draft.troco)?String(num(draft.troco)):"",notes:draft.obs,
      items:draft.cart.map(i=>({product_id:i.p.id,qty:i.n}))}}));
    await q(sb.from("orders").update({status:"em_preparo"}).eq("id",r.id));
    const o=await q(sb.from("orders").select("*,order_items(*)").eq("id",r.id).single());
    if(draft.pay==="Fiado"&&o.customer_id) await q(sb.from("credit_entries").insert({customer_id:o.customer_id,kind:"compra",amount:o.total,description:"Pedido #"+o.number,order_id:o.id}));
    ov.innerHTML=""; draft=null; await loadCusts(); cust=await findCust(); toast("Pedido #"+o.number+" lançado ✓");
    const items=o.order_items.sort((x,y)=>x.id-y.id);
    if(await sendToChat(orderMsg(o,items))){const t=waText(o,"em_preparo");if(t){await new Promise(z=>setTimeout(z,900));await sendToChat(t)}}
    detalhe(o.id);
  }catch(e){ov.innerHTML="";toast(e.message)}
}

/* ================= DETALHES DO PEDIDO ================= */
async function detalhe(id){
  view="detalhe"; frameRefresh=()=>detalhe(id);
  const o=await q(sb.from("orders").select("*,order_items(*)").eq("id",id).single());
  const items=o.order_items.sort((x,y)=>x.id-y.id);
  let next=null;
  if(o.status==="novo") next=["em_preparo","✅ Aceitar pedido"];
  else if(o.status==="em_preparo") next=o.type==="delivery"?["saiu_entrega","🛵 Saiu para entrega"]:o.type==="retirada"?["pronto","🏪 Pronto pra retirada"]:["concluido","✔️ Concluir"];
  else if(o.status==="saiu_entrega"||o.status==="pronto") next=["concluido","✔️ Concluído"];
  const prev=new Date(new Date(o.created_at).getTime()+(o.type==="delivery"?S.delivery_time_max:(S.prep_time_min||10))*6e4);
  frame(`Pedido Nº ${o.number}`,`
    <div class="banner b-${o.status}">${STATUS[o.status]}</div>
    <div class="box grid" style="gap:6px"><b>👤 Cliente</b><div>${esc(o.customer_name||"")}<div class="hint">${esc(fmtPhone(o.customer_phone||""))}</div></div></div>
    ${o.type==="delivery"?`<div class="box grid" style="gap:6px"><b>🏠 Endereço de entrega</b><div>${esc(o.street||"")}, ${esc(o.street_number||"")}<div class="hint">${esc(o.neighborhood||"")}${o.complement?" · "+esc(o.complement):""}${o.reference?"<br>("+esc(o.reference)+")":""}</div></div>
      <a href="https://maps.google.com/?q=${encodeURIComponent(`${o.street||""}, ${o.street_number||""}, ${o.neighborhood||""}`)}" target="_blank" rel="noopener">Abrir no mapa ↗</a></div>`:`<div class="box"><b>${o.type==="retirada"?"🏪 Retirada na loja":"🧾 Balcão"}</b></div>`}
    <div class="box"><b>🕐 ${o.type==="delivery"?"Entrega":"Retirada"} prevista para</b><div class="hint">${prev.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})} às ${prev.toTimeString().slice(0,5)}</div></div>
    <div class="box">${items.map(i=>`<div class="ci2"><div class="t"><b>${i.qty}x ${esc(i.name)}</b>${i.notes?`<small>Obs.: ${esc(i.notes)}</small>`:""}</div><b>${brl(i.total)}</b></div>`).join("")}
      <div class="line"><span class="muted">Subtotal</span><span>${brl(o.subtotal)}</span></div>
      ${o.type==="delivery"?`<div class="line"><span class="muted">Taxa de entrega</span><span>+ ${brl(o.delivery_fee)}</span></div>`:""}
      ${+o.discount?`<div class="line"><span class="muted">Desconto</span><span>- ${brl(o.discount)}</span></div>`:""}
      <div class="line big"><span>Total</span><span class="price">${brl(o.total)}</span></div>
      <div class="hint" style="margin-top:6px">💳 ${esc(o.payment_method||"")}${o.change_for?` · paga com ${brl(o.change_for)} · <b style="color:var(--green)">troco ${brl(o.change_for-o.total)}</b>`:""}</div></div>
    ${o.notes?`<div class="box">📝 ${esc(o.notes)}</div>`:""}
    <div class="row"><button class="btn o sm" id="rs">📲 Reenviar pedido no chat</button><button class="btn o sm" id="pr">🖨️ Imprimir</button>${!["cancelado","concluido"].includes(o.status)?`<button class="btn o sm" id="cc" style="color:var(--red)">Cancelar</button>`:""}</div>`,
    next?`<button class="btn c" id="nx">${next[1]}</button><p class="hint" style="margin:0;text-align:center">A mensagem pro cliente é enviada na conversa</p>`:"",{back:home});
  $("#rs").onclick=()=>sendToChat(orderMsg(o,items));
  $("#pr").onclick=()=>printOrder(o,items);
  if($("#cc"))$("#cc").onclick=async e=>{if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar cancelamento";return}
    await q(sb.from("orders").update({status:"cancelado"}).eq("id",o.id));toast("Pedido cancelado");detalhe(o.id)};
  if($("#nx"))$("#nx").onclick=async()=>{
    $("#nx").disabled=true;
    await q(sb.from("orders").update({status:next[0]}).eq("id",o.id));
    const t=waText({...o,status:next[0]},next[0]); if(t&&o.customer_phone) await sendToChat(t);
    toast(STATUS[next[0]]); detalhe(o.id);
  };
}
function printOrder(o,items){
  $("#print").innerHTML=`<h2>${esc(S.name)}</h2><div style="text-align:center">Pedido #${o.number} · ${dt(o.created_at)}</div><hr>
    <div>${o.type==="delivery"?"ENTREGA":o.type==="retirada"?"RETIRADA":"BALCÃO"}</div><div><b>${esc(o.customer_name||"")}</b> ${esc(fmtPhone(o.customer_phone||""))}</div>
    ${o.type==="delivery"?`<div>${esc(o.street||"")}, ${esc(o.street_number||"")} - ${esc(o.neighborhood||"")}</div>${o.complement?`<div>${esc(o.complement)}</div>`:""}${o.reference?`<div>Ref: ${esc(o.reference)}</div>`:""}`:""}<hr>
    ${items.map(i=>`<div>${i.qty}x ${esc(i.name)} <span style="float:right">${brl(i.total)}</span></div>${i.notes?`<div>&nbsp; Obs: ${esc(i.notes)}</div>`:""}`).join("")}<hr>
    <div>Subtotal <span style="float:right">${brl(o.subtotal)}</span></div>${o.type==="delivery"?`<div>Entrega <span style="float:right">${brl(o.delivery_fee)}</span></div>`:""}${+o.discount?`<div>Desconto <span style="float:right">-${brl(o.discount)}</span></div>`:""}
    <div><b>TOTAL <span style="float:right">${brl(o.total)}</span></b></div><hr><div>Pagamento: ${esc(o.payment_method||"")}</div>${o.change_for?`<div>Paga com ${brl(o.change_for)} - TROCO ${brl(o.change_for-o.total)}</div>`:""}${o.notes?`<hr><div>Obs: ${esc(o.notes)}</div>`:""}`;
  window.print();
}

/* ---------- início ---------- */
async function start(){
  try{await loadBase()}catch{app.innerHTML='<div class="empty">Não foi possível carregar. Verifique a internet.</div>';return}
  started=true; if(chat.title||chat.phone) cust=await findCust();
  await home();
  post({gb:"ready"});
  sb.channel("whats-orders").on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>{if(view==="home")home()}).subscribe();
}
(async()=>{const {data:{session}}=await sb.auth.getSession();session?start():loginView()})();
