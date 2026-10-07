// Painel de gestão — Geladão Brothers
const sb = supabase.createClient(GB_CONFIG.SUPABASE_URL, GB_CONFIG.SUPABASE_KEY);
const root = document.getElementById("root"), ov = document.getElementById("ov");

/* ---------- utilidades ---------- */
const brl=v=>"R$ "+Number(v||0).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,".");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=v=>{if(v===""||v==null)return null;const n=parseFloat(String(v).replace(/\./g,"").replace(",","."));return isNaN(n)?null:n};
const money=v=>v==null?"":Number(v).toFixed(2).replace(".",",");
const digits=s=>String(s||"").replace(/\D/g,"");
const dt=d=>new Date(d).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
const hm=d=>new Date(d).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
const ago=d=>{const m=Math.round((Date.now()-new Date(d))/6e4);return m<60?m+" min":Math.floor(m/60)+" h "+(m%60)+" min"};
const startOfDay=(off=0)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-off);return d};
const $=(s,el=document)=>el.querySelector(s), $$=(s,el=document)=>[...el.querySelectorAll(s)];
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.append(t);setTimeout(()=>t.remove(),2200)}
async function q(p){const {data,error}=await p;if(error){console.error(error);toast("Erro: "+error.message);throw error}return data}
const STATUS={novo:"Novo",em_preparo:"Em preparo",saiu_entrega:"Saiu p/ entrega",pronto:"Pronto p/ retirada",concluido:"Concluído",cancelado:"Cancelado"};
const pill=s=>`<span class="pill p-${s}">${STATUS[s]||({ativo:"Ativo",em_falta:"Em falta",inativo:"Oculto"})[s]||s}</span>`;

/* ---------- modal lateral ---------- */
function drawer(title,body,foot){
  ov.innerHTML=`<div class="ov"><div class="dr" role="dialog" aria-modal="true"><div class="hd"><b>${title}</b><button class="x" data-x aria-label="Fechar">✕</button></div><div class="bd">${body}</div>${foot?`<div class="ft">${foot}</div>`:""}</div></div>`;
  $("[data-x]",ov).onclick=closeDr; $(".ov",ov).onclick=e=>{if(e.target.classList.contains("ov"))closeDr()};
  return $(".dr",ov);
}
function closeDr(){ov.innerHTML=""}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDr()});

/* formulário genérico: fields = [{k,l,t:'text'|'money'|'int'|'select'|'check'|'area'|'img'|'color',o:[[v,l]],w:'g2'}] */
function formHTML(fields,v){
  return fields.map(f=>{
    const val=v?.[f.k]; const id="f_"+f.k;
    if(f.t==="check") return `<label class="chk"><input type="checkbox" id="${id}" ${val?"checked":""}> ${f.l}</label>`;
    if(f.t==="select") return `<label class="fld"><span>${f.l}</span><select id="${id}" class="in">${f.o.map(([a,b])=>`<option value="${esc(a)}" ${String(a)===String(val??"")?"selected":""}>${esc(b)}</option>`).join("")}</select></label>`;
    if(f.t==="area") return `<label class="fld"><span>${f.l}</span><textarea id="${id}" class="in" rows="3">${esc(val)}</textarea></label>`;
    if(f.t==="img") return `<div class="fld"><span>${f.l}</span><div class="imgup">${val?`<img src="${esc(val)}" alt="" id="${id}_pv">`:`<div class="ph" id="${id}_pv"></div>`}<div class="grid" style="gap:6px"><input type="file" accept="image/*" id="${id}_file" class="in"><input type="hidden" id="${id}" value="${esc(val||"")}">${val?`<button class="btn o sm" type="button" data-rmimg="${id}">Remover foto</button>`:""}</div></div></div>`;
    if(f.t==="color") return `<label class="fld"><span>${f.l}</span><input type="color" id="${id}" class="in" style="height:42px;padding:4px" value="${esc(val||"#FFC400")}"></label>`;
    const ph=f.t==="money"?"0,00":"";
    return `<label class="fld"><span>${f.l}</span><input id="${id}" class="in" ${f.t==="money"||f.t==="int"?'inputmode="decimal"':""} placeholder="${f.ph||ph}" value="${esc(f.t==="money"?money(val):val??"")}"></label>`;
  }).join("");
}
function wireImgs(el){
  $$("input[type=file]",el).forEach(inp=>inp.onchange=async()=>{
    const file=inp.files[0]; if(!file) return; const id=inp.id.replace(/_file$/,"");
    const pv=$("#"+id+"_pv",el); inp.disabled=true;
    try{
      const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
      const path=`${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      await q(sb.storage.from("fotos").upload(path,file,{cacheControl:"31536000",upsert:false}));
      const url=sb.storage.from("fotos").getPublicUrl(path).data.publicUrl;
      $("#"+id,el).value=url; const img=document.createElement("img"); img.src=url; img.id=id+"_pv"; pv.replaceWith(img); toast("Foto enviada");
    }finally{inp.disabled=false}
  });
  $$("[data-rmimg]",el).forEach(b=>b.onclick=()=>{const id=b.dataset.rmimg;$("#"+id,el).value="";const pv=$("#"+id+"_pv",el);const d=document.createElement("div");d.className="ph";d.id=id+"_pv";pv.replaceWith(d);b.remove()});
}
function readForm(fields,el){
  const o={}; fields.forEach(f=>{const i=$("#f_"+f.k,el); if(!i) return;
    if(f.t==="check") o[f.k]=i.checked; else if(f.t==="money") o[f.k]=num(i.value); else if(f.t==="int") o[f.k]=i.value===""?null:parseInt(i.value);
    else if(f.t==="select") o[f.k]=f.num?(i.value===""?null:+i.value):i.value; else o[f.k]=i.value.trim()===""&&f.nullable!==false?null:i.value.trim();});
  return o;
}

/* ---------- login ---------- */
async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  session?shell():loginView();
}
function loginView(msg){
  root.innerHTML=`<div class="login"><form id="lf"><h1>Painel</h1><p>Entre com o e-mail e a senha criados no Supabase.</p>
    <label class="fld"><span>E-mail</span><input id="em" class="in" type="email" autocomplete="username" required></label>
    <label class="fld"><span>Senha</span><input id="pw" class="in" type="password" autocomplete="current-password" required></label>
    <p class="err" id="e" ${msg?"":"hidden"}>${esc(msg||"")}</p><button class="btn" id="go">Entrar</button></form></div>`;
  $("#lf").onsubmit=async e=>{e.preventDefault();$("#go").disabled=true;
    const {error}=await sb.auth.signInWithPassword({email:$("#em").value.trim(),password:$("#pw").value});
    if(error){$("#go").disabled=false;$("#e").hidden=false;$("#e").textContent="E-mail ou senha incorretos.";return}
    shell();};
}

/* ---------- estrutura ---------- */
let S={}, page="pedidos", newCount=0;
const MENU=[["Operação",[["pedidos","🧾","Pedidos"],["novo","➕","Novo pedido (balcão)"],["historico","📋","Histórico"],["caixa","💰","Caixa"]]],
  ["Cardápio",[["catalogo","🍺","Catálogo"],["complementos","🧊","Complementos"],["destaques","⭐","Destaques e promoções"]]],
  ["Clientes",[["clientes","👥","Clientes e fiado"],["cupons","🎟️","Cupons"],["fidelidade","🏆","Fidelidade"]]],
  ["Gestão",[["desempenho","📈","Desempenho"],["estoque","📦","Estoque"],["financeiro","💸","Despesas"],["delivery","🛵","Delivery e bairros"],["config","⚙️","Configurações"]]]];
async function shell(){
  S=await q(sb.from("store_settings").select("*").eq("id",1).single());
  root.innerHTML=`<div class="mobilebar"><button class="x" id="mb" aria-label="Menu">☰</button><b>${esc(S.name)}</b></div>
  <div class="shell"><aside class="side" id="side"><div class="brand"><div class="lg">${S.logo_url?`<img src="${esc(S.logo_url)}" alt="">`:"GB"}</div><div><b>${esc(S.name)}</b><small>Painel de gestão</small></div></div>
    <button class="openbtn" id="ob"></button><nav class="menu" id="menu"></nav>
    <a class="btn o sm" href="/" target="_blank" rel="noopener" style="margin:14px 10px 0;display:flex">Ver cardápio ↗</a>
    <button class="out" id="lo">Sair</button></aside><main class="main" id="main"></main></div>`;
  $("#mb").onclick=()=>$("#side").classList.toggle("open");
  $("#side").onclick=e=>{if(e.target.id==="side")$("#side").classList.remove("open")};
  $("#lo").onclick=async()=>{await sb.auth.signOut();location.reload()};
  $("#ob").onclick=async()=>{S.is_open=!S.is_open;await q(sb.from("store_settings").update({is_open:S.is_open}).eq("id",1));openBtn();toast(S.is_open?"Loja aberta":"Loja fechada")};
  openBtn(); menu(); listenOrders(); go(location.hash.slice(1)||"pedidos");
}
function openBtn(){const b=$("#ob");b.className="openbtn"+(S.is_open?"":" off");b.innerHTML=`<i></i>${S.is_open?"Loja aberta · clique p/ fechar":"Loja fechada · clique p/ abrir"}`}
function menu(){
  $("#menu").innerHTML=MENU.map(([s,items])=>`<div class="sec">${s}</div>`+items.map(([k,i,l])=>`<button data-p="${k}" aria-current="${page===k}"><span>${i}</span>${l}${k==="pedidos"&&newCount?`<span class="badge">${newCount}</span>`:""}</button>`).join("")).join("");
  $$("#menu [data-p]").forEach(b=>b.onclick=()=>{go(b.dataset.p);$("#side").classList.remove("open")});
}
const PAGES={};
function go(p){if(!PAGES[p])p="pedidos";page=p;location.hash=p;menu();closeDr();const m=$("#main");m.innerHTML='<div class="empty">Carregando…</div>';PAGES[p](m).catch(e=>{m.innerHTML=`<div class="empty">Não foi possível carregar. ${esc(e.message||"")}</div>`})}

/* ---------- avisos de pedido novo ---------- */
let audioCtx=null;
document.addEventListener("click",()=>{if(!audioCtx){try{audioCtx=new (window.AudioContext||window.webkitAudioContext)()}catch{}}},{once:true});
function beep(){if(!audioCtx)return;[0,0.25,0.5].forEach(t=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=880;o.connect(g);g.connect(audioCtx.destination);g.gain.setValueAtTime(0.25,audioCtx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+t+0.2);o.start(audioCtx.currentTime+t);o.stop(audioCtx.currentTime+t+0.2)})}
async function countNew(){const {count}=await sb.from("orders").select("id",{count:"exact",head:true}).eq("status","novo");newCount=count||0;menu();document.title=(newCount?`(${newCount}) `:"")+"Painel · "+S.name}
function listenOrders(){
  countNew();
  sb.channel("orders").on("postgres_changes",{event:"*",schema:"public",table:"orders"},payload=>{
    if(payload.eventType==="INSERT"){beep();toast("Novo pedido #"+payload.new.number)}
    countNew(); if(page==="pedidos") PAGES.pedidos($("#main"),true);
  }).subscribe();
  setInterval(()=>{countNew();if(page==="pedidos"&&!ov.innerHTML)PAGES.pedidos($("#main"),true)},60000);
}

/* ================= PEDIDOS ================= */
PAGES.pedidos=async(m,soft)=>{
  const since=startOfDay(1).toISOString();
  const rows=await q(sb.from("orders").select("*").or(`status.in.(novo,em_preparo,saiu_entrega,pronto),created_at.gte.${since}`).order("created_at",{ascending:false}).limit(300));
  const today=rows.filter(o=>new Date(o.created_at)>=startOfDay()&&o.status!=="cancelado");
  const cols=[["novo","Novos"],["em_preparo","Em preparo"],["saida","Saiu / Pronto"],["concluido","Concluídos hoje"]];
  const inCol=(o,c)=>c==="saida"?["saiu_entrega","pronto"].includes(o.status):c==="concluido"?o.status==="concluido"&&new Date(o.created_at)>=startOfDay():o.status===c;
  m.innerHTML=`<div class="top"><h1>Pedidos</h1><div class="row"><button class="btn" id="np">➕ Novo pedido</button></div></div>
    <div class="stats"><div class="stat"><small>Pedidos hoje</small><b>${today.length}</b></div><div class="stat"><small>Vendido hoje</small><b>${brl(today.reduce((s,o)=>s+ +o.total,0))}</b></div>
    <div class="stat"><small>Ticket médio</small><b>${brl(today.length?today.reduce((s,o)=>s+ +o.total,0)/today.length:0)}</b></div><div class="stat"><small>Aguardando aceitar</small><b style="color:${newCount?"var(--y)":"inherit"}">${rows.filter(o=>o.status==="novo").length}</b></div></div>
    ${audioCtx?"":`<p class="alert" style="margin:0 0 12px">🔔 Clique em qualquer lugar da tela uma vez pra liberar o <b>som de pedido novo</b>.</p>`}
    <div class="board">${cols.map(([c,l])=>{const list=rows.filter(o=>inCol(o,c));return `<div class="col"><h3><span>${l}</span><span class="muted">${list.length}</span></h3>${list.map(o=>`<button class="oc ${o.status==="novo"?"new":""}" data-o="${o.id}"><div class="h"><span>#${o.number} · ${esc(o.customer_name||"Balcão")}</span><span class="price">${brl(o.total)}</span></div><div class="m">${o.type==="delivery"?"🛵 "+esc(o.neighborhood||""):o.type==="retirada"?"🏪 Retirada":"🧾 Balcão"} · ${esc(o.payment_method||"")} · há ${ago(o.created_at)}</div></button>`).join("")||'<p class="muted" style="margin:6px">Nenhum</p>'}</div>`}).join("")}</div>`;
  $("#np").onclick=()=>go("novo");
  $$("[data-o]",m).forEach(b=>b.onclick=()=>orderDrawer(+b.dataset.o));
};
const NEXT={novo:["em_preparo","✅ Aceitar pedido"],em_preparo:[null,""],saiu_entrega:["concluido","✔️ Entregue / concluir"],pronto:["concluido","✔️ Retirado / concluir"]};
async function orderDrawer(id){
  const o=await q(sb.from("orders").select("*,order_items(*)").eq("id",id).single());
  const items=o.order_items.sort((a,b)=>a.id-b.id);
  const change=o.change_for?o.change_for-o.total:0;
  const addr=o.type==="delivery"?`${o.street||o.address||""}${o.street_number?", "+o.street_number:""}`:"";
  const maps=addr?`https://maps.google.com/?q=${encodeURIComponent(addr+", "+(o.neighborhood||""))}`:"";
  let next=NEXT[o.status]; if(o.status==="em_preparo") next=o.type==="delivery"?["saiu_entrega","🛵 Saiu para entrega"]:["pronto","🏪 Pronto p/ retirada"];
  if(o.status==="em_preparo"&&o.type==="balcao") next=["concluido","✔️ Concluir"];
  const wa=o.customer_phone?`https://wa.me/55${digits(o.customer_phone).replace(/^55/,"")}?text=${encodeURIComponent(`Olá, ${o.customer_name||""}! Seu pedido #${o.number} no ${S.name}: ${STATUS[o.status]}.`)}`:"";
  const dr=drawer(`Pedido #${o.number} ${pill(o.status)}`,`
    <div class="muted">${dt(o.created_at)} · ${o.type==="delivery"?"🛵 Entrega":o.type==="retirada"?"🏪 Retirada":"🧾 Balcão"}</div>
    <div class="card"><b>👤 ${esc(o.customer_name||"Cliente balcão")}</b>${o.customer_phone?`<div class="muted">${esc(o.customer_phone)}</div>`:""}
      ${o.type==="delivery"?`<div style="margin-top:8px"><b>📍 ${esc(addr)}</b><div class="muted">${esc(o.neighborhood||"")}${o.complement?" · "+esc(o.complement):""}${o.cep?" · CEP "+esc(o.cep):""}</div>${o.reference?`<div>Ref.: ${esc(o.reference)}</div>`:""}<a href="${maps}" target="_blank" rel="noopener">Abrir no mapa ↗</a></div>`:""}</div>
    <div class="card">${items.map(i=>`<div class="line"><div><b>${i.qty}x</b> ${esc(i.name)}${(i.options||[]).length?`<div class="muted">${i.options.map(x=>x.qty+"x "+esc(x.name)).join(", ")}</div>`:""}${i.notes?`<div class="muted">Obs.: ${esc(i.notes)}</div>`:""}</div><b>${brl(i.total)}</b></div>`).join("")}
      <div class="line"><span class="muted">Subtotal</span><span>${brl(o.subtotal)}</span></div>
      ${o.type==="delivery"?`<div class="line"><span class="muted">Taxa de entrega</span><span>${brl(o.delivery_fee)}</span></div>`:""}
      ${+o.discount?`<div class="line"><span class="muted">Desconto ${esc(o.coupon_code||"")}</span><span>- ${brl(o.discount)}</span></div>`:""}
      <div class="line big"><span>Total</span><span class="price">${brl(o.total)}</span></div></div>
    <div class="card"><b>💳 ${esc(o.payment_method||"")}</b>${o.change_for?`<div>Cliente paga com <b>${brl(o.change_for)}</b> → <b style="color:var(--green)">levar ${brl(change)} de troco</b></div>`:(/dinheiro/i.test(o.payment_method||"")?'<div class="muted">Não precisa de troco</div>':"")}</div>
    ${o.notes?`<div class="card">📝 ${esc(o.notes)}</div>`:""}
    ${o.status!=="cancelado"&&o.status!=="concluido"?`<label class="fld"><span>Mudar status</span><select class="in" id="st">${Object.entries(STATUS).map(([k,l])=>`<option value="${k}" ${k===o.status?"selected":""}>${l}</option>`).join("")}</select></label>`:""}`,
    `${wa?`<a class="btn o" href="${wa}" target="_blank" rel="noopener">WhatsApp do cliente</a>`:""}<button class="btn o" id="pr">🖨️ Imprimir</button>
     ${o.status!=="cancelado"&&o.status!=="concluido"?`<button class="btn r" id="cc">Cancelar</button>`:""}${next&&next[0]?`<button class="btn" id="nx">${next[1]}</button>`:""}`);
  const setSt=async s=>{await q(sb.from("orders").update({status:s}).eq("id",o.id));toast(STATUS[s]);closeDr();if(page==="pedidos")PAGES.pedidos($("#main"));countNew()};
  if($("#nx",dr)) $("#nx",dr).onclick=()=>setSt(next[0]);
  if($("#st",dr)) $("#st",dr).onchange=e=>setSt(e.target.value);
  if($("#cc",dr)) $("#cc",dr).onclick=e=>{if(e.target.dataset.sure){setSt("cancelado")}else{e.target.dataset.sure=1;e.target.textContent="Confirmar cancelamento"}};
  $("#pr",dr).onclick=()=>printOrder(o,items,addr,change);
}
function printOrder(o,items,addr,change){
  $("#print").innerHTML=`<h2>${esc(S.name)}</h2><div style="text-align:center">Pedido #${o.number} · ${dt(o.created_at)}</div><hr>
    <div>${o.type==="delivery"?"ENTREGA":o.type==="retirada"?"RETIRADA":"BALCÃO"}</div><div><b>${esc(o.customer_name||"")}</b> ${esc(o.customer_phone||"")}</div>
    ${o.type==="delivery"?`<div>${esc(addr)} - ${esc(o.neighborhood||"")}</div>${o.complement?`<div>${esc(o.complement)}</div>`:""}${o.reference?`<div>Ref: ${esc(o.reference)}</div>`:""}`:""}<hr>
    ${items.map(i=>`<div>${i.qty}x ${esc(i.name)} <span style="float:right">${brl(i.total)}</span></div>${(i.options||[]).map(x=>`<div>&nbsp; + ${x.qty}x ${esc(x.name)}</div>`).join("")}${i.notes?`<div>&nbsp; Obs: ${esc(i.notes)}</div>`:""}`).join("")}<hr>
    <div>Subtotal <span style="float:right">${brl(o.subtotal)}</span></div>${o.type==="delivery"?`<div>Entrega <span style="float:right">${brl(o.delivery_fee)}</span></div>`:""}${+o.discount?`<div>Desconto <span style="float:right">-${brl(o.discount)}</span></div>`:""}
    <div><b>TOTAL <span style="float:right">${brl(o.total)}</span></b></div><hr><div>Pagamento: ${esc(o.payment_method||"")}</div>${o.change_for?`<div>Paga com ${brl(o.change_for)} - TROCO ${brl(change)}</div>`:""}${o.notes?`<hr><div>Obs: ${esc(o.notes)}</div>`:""}`;
  window.print();
}

/* ================= NOVO PEDIDO (BALCÃO / TELEFONE) ================= */
PAGES.novo=async m=>{
  const [cats,prods,zones]=await Promise.all([q(sb.from("categories").select("*").order("sort_order")),q(sb.from("products").select("id,name,price,promo_price,category_id,status").eq("status","ativo").order("name")),q(sb.from("delivery_zones").select("*").eq("active",true).order("neighborhood"))]);
  let cart=[], type="balcao", term="";
  const pr=p=>p.promo_price!=null&&+p.promo_price<+p.price?+p.promo_price:+p.price;
  const draw=()=>{
    const list=prods.filter(p=>!term||p.name.toLowerCase().includes(term)).slice(0,40);
    const sub=cart.reduce((s,i)=>s+pr(i.p)*i.n,0);
    m.innerHTML=`<div class="top"><h1>Novo pedido</h1></div><div class="cat2" style="grid-template-columns:minmax(0,1fr) 360px">
      <div><input class="in" id="ns" placeholder="Buscar produto…" value="${esc(term)}"><div class="tw" style="margin-top:10px;max-height:60vh;overflow:auto"><table><tbody>${list.map(p=>`<tr><td>${esc(p.name)}<div class="muted" style="font-size:12px">${esc((cats.find(c=>c.id===p.category_id)||{}).name||"")}</div></td><td class="num price">${brl(pr(p))}</td><td class="num"><button class="btn sm" data-a="${p.id}">+</button></td></tr>`).join("")}</tbody></table></div></div>
      <div class="card grid" style="align-content:start">
        <div class="tabs" style="margin:0">${[["balcao","Balcão"],["retirada","Retirada"],["delivery","Entrega"]].map(([k,l])=>`<button data-t="${k}" aria-current="${type===k}">${l}</button>`).join("")}</div>
        ${cart.map((i,k)=>`<div class="line"><div><b>${i.n}x</b> ${esc(i.p.name)}</div><div class="row"><span>${brl(pr(i.p)*i.n)}</span><button class="icb" data-m="${k}" aria-label="Diminuir">−</button></div></div>`).join("")||'<p class="muted">Adicione produtos ao lado.</p>'}
        <div class="line big"><span>Subtotal</span><span class="price">${brl(sub)}</span></div>
        <label class="fld"><span>Nome do cliente</span><input class="in" id="cn"></label>
        <label class="fld"><span>Telefone</span><input class="in" id="ct" inputmode="tel"></label>
        ${type==="delivery"?`<label class="fld"><span>Bairro</span><select class="in" id="cz">${zones.map(z=>`<option value="${z.id}">${esc(z.neighborhood)} · ${brl(z.fee)}</option>`).join("")}</select></label>
          <div class="grid" style="grid-template-columns:1fr 80px"><label class="fld"><span>Rua</span><input class="in" id="cs"></label><label class="fld"><span>Nº</span><input class="in" id="cnu"></label></div>
          <label class="fld"><span>Referência</span><input class="in" id="cr"></label>`:""}
        <label class="fld"><span>Pagamento</span><select class="in" id="cp">${(S.payment_methods||[]).concat(["Fiado"]).map(p=>`<option>${esc(p)}</option>`).join("")}</select></label>
        <label class="fld"><span>Troco para (se dinheiro)</span><input class="in" id="cg" inputmode="decimal" placeholder="0,00"></label>
        <p class="err" id="e" hidden></p><button class="btn" id="fz" ${cart.length?"":"disabled"}>Lançar pedido</button></div></div>`;
    $("#ns").oninput=e=>{term=e.target.value.toLowerCase();const pos=e.target.selectionStart;draw();$("#ns").focus();$("#ns").setSelectionRange(pos,pos)};
    $$("[data-a]",m).forEach(b=>b.onclick=()=>{const p=prods.find(x=>x.id==b.dataset.a);const i=cart.find(x=>x.p===p);i?i.n++:cart.push({p,n:1});draw()});
    $$("[data-m]",m).forEach(b=>b.onclick=()=>{const i=cart[+b.dataset.m];i.n--;if(!i.n)cart.splice(+b.dataset.m,1);draw()});
    $$("[data-t]",m).forEach(b=>b.onclick=()=>{type=b.dataset.t;draw()});
    $("#fz").onclick=async()=>{
      const v=id=>($("#"+id)||{}).value||"";
      if(type==="delivery"&&(!v("cs")||!v("cnu"))){$("#e").hidden=false;$("#e").textContent="Preencha rua e número.";return}
      const pay=v("cp");
      if(pay==="Fiado"&&digits(v("ct")).length<10){$("#e").hidden=false;$("#e").textContent="Pra lançar no fiado, informe o telefone do cliente.";return}
      $("#fz").disabled=true;
      const wasOpen=S.is_open; if(!wasOpen) await q(sb.from("store_settings").update({is_open:true}).eq("id",1));
      try{
        const r=await q(sb.rpc("create_order",{p:{customer_name:v("cn")||"Cliente balcão",customer_phone:v("ct"),type,zone_id:type==="delivery"?+v("cz"):null,street:v("cs"),street_number:v("cnu"),reference:v("cr"),payment_method:pay,change_for:v("cg")?String(num(v("cg"))):"",items:cart.map(i=>({product_id:i.p.id,qty:i.n}))}}));
        await q(sb.from("orders").update({status:type==="balcao"?"concluido":"em_preparo"}).eq("id",r.id));
        if(pay==="Fiado"){const o=await q(sb.from("orders").select("customer_id").eq("id",r.id).single());if(o.customer_id)await q(sb.from("credit_entries").insert({customer_id:o.customer_id,kind:"compra",amount:r.total,description:"Pedido #"+r.number,order_id:r.id}))}
        toast("Pedido #"+r.number+" lançado"); go("pedidos");
      }catch(e){$("#fz").disabled=false;$("#e").hidden=false;$("#e").textContent=e.message}
      finally{if(!wasOpen) await sb.from("store_settings").update({is_open:false}).eq("id",1)}
    };
  };
  draw();
};

/* ================= HISTÓRICO ================= */
PAGES.historico=async m=>{
  let from=startOfDay(6).toISOString().slice(0,10), to=new Date().toISOString().slice(0,10), term="", st="";
  const draw=async()=>{
    let qy=sb.from("orders").select("*").gte("created_at",from+"T00:00:00").lte("created_at",to+"T23:59:59").order("created_at",{ascending:false}).limit(500);
    if(st) qy=qy.eq("status",st);
    let rows=await q(qy);
    if(term) rows=rows.filter(o=>String(o.number)===term||(o.customer_name||"").toLowerCase().includes(term.toLowerCase())||digits(o.customer_phone).includes(digits(term)||"§"));
    const ok=rows.filter(o=>o.status!=="cancelado");
    $("#hres").innerHTML=`<div class="stats"><div class="stat"><small>Pedidos</small><b>${ok.length}</b></div><div class="stat"><small>Total</small><b>${brl(ok.reduce((s,o)=>s+ +o.total,0))}</b></div><div class="stat"><small>Taxas de entrega</small><b>${brl(ok.reduce((s,o)=>s+ +o.delivery_fee,0))}</b></div><div class="stat"><small>Cancelados</small><b>${rows.length-ok.length}</b></div></div>
      <div class="tw"><table><thead><tr><th>#</th><th>Data</th><th>Cliente</th><th>Tipo</th><th>Pagamento</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>${rows.map(o=>`<tr data-o="${o.id}" style="cursor:pointer"><td>${o.number}</td><td>${dt(o.created_at)}</td><td>${esc(o.customer_name||"")}</td><td>${o.type==="delivery"?"Entrega":o.type==="retirada"?"Retirada":"Balcão"}</td><td>${esc(o.payment_method||"")}</td><td>${pill(o.status)}</td><td class="num">${brl(o.total)}</td></tr>`).join("")||'<tr><td colspan="7" class="empty">Nenhum pedido nesse período.</td></tr>'}</tbody></table></div>`;
    $$("[data-o]",m).forEach(r=>r.onclick=()=>orderDrawer(+r.dataset.o));
  };
  m.innerHTML=`<div class="top"><h1>Histórico de pedidos</h1></div><div class="row" style="margin-bottom:12px">
    <label class="fld"><span>De</span><input type="date" class="in" id="hf" value="${from}"></label><label class="fld"><span>Até</span><input type="date" class="in" id="ht" value="${to}"></label>
    <label class="fld"><span>Status</span><select class="in" id="hs"><option value="">Todos</option>${Object.entries(STATUS).map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select></label>
    <label class="fld" style="flex:1;min-width:180px"><span>Buscar (nº, nome ou telefone)</span><input class="in" id="hq"></label></div><div id="hres"></div>`;
  $("#hf").onchange=e=>{from=e.target.value;draw()}; $("#ht").onchange=e=>{to=e.target.value;draw()}; $("#hs").onchange=e=>{st=e.target.value;draw()};
  let tm; $("#hq").oninput=e=>{clearTimeout(tm);tm=setTimeout(()=>{term=e.target.value.trim();draw()},300)};
  await draw();
};

/* ================= DESEMPENHO ================= */
PAGES.desempenho=async m=>{
  let days=7;
  const draw=async()=>{
    const rows=await q(sb.from("orders").select("id,total,subtotal,created_at,status,type,payment_method,order_items(name,qty,total)").gte("created_at",startOfDay(days-1).toISOString()).neq("status","cancelado").limit(5000));
    const tot=rows.reduce((s,o)=>s+ +o.total,0);
    const byDay={}; for(let i=days-1;i>=0;i--){const d=startOfDay(i);byDay[d.toDateString()]={d,v:0}}
    rows.forEach(o=>{const k=new Date(o.created_at);k.setHours(0,0,0,0);if(byDay[k.toDateString()])byDay[k.toDateString()].v+= +o.total});
    const max=Math.max(1,...Object.values(byDay).map(x=>x.v));
    const prod={}; rows.forEach(o=>o.order_items.forEach(i=>{prod[i.name]=prod[i.name]||{q:0,v:0};prod[i.name].q+=i.qty;prod[i.name].v+= +i.total}));
    const top=Object.entries(prod).sort((a,b)=>b[1].v-a[1].v).slice(0,15);
    const pay={}; rows.forEach(o=>{pay[o.payment_method||"—"]=(pay[o.payment_method||"—"]||0)+ +o.total});
    const hours=Array(24).fill(0); rows.forEach(o=>hours[new Date(o.created_at).getHours()]++);
    $("#dres").innerHTML=`<div class="stats"><div class="stat"><small>Faturamento</small><b>${brl(tot)}</b></div><div class="stat"><small>Pedidos</small><b>${rows.length}</b></div><div class="stat"><small>Ticket médio</small><b>${brl(rows.length?tot/rows.length:0)}</b></div><div class="stat"><small>Entregas</small><b>${rows.filter(o=>o.type==="delivery").length}</b></div></div>
      <div class="grid g2"><div class="card"><b>Vendas por dia</b><div class="bars" style="margin-bottom:20px">${Object.values(byDay).map(x=>`<div title="${x.d.toLocaleDateString("pt-BR")}: ${brl(x.v)}" style="height:${Math.max(2,x.v/max*100)}%"><span>${days<=14?x.d.getDate():""}</span></div>`).join("")}</div></div>
      <div class="card"><b>Pedidos por horário</b><div class="bars" style="margin-bottom:20px">${hours.map((h,i)=>`<div title="${i}h: ${h} pedidos" style="height:${Math.max(2,h/Math.max(1,...hours)*100)}%"><span>${i%3===0?i+"h":""}</span></div>`).join("")}</div></div></div>
      <div class="grid g2" style="margin-top:12px"><div class="card"><b>Mais vendidos</b>${top.map(([n,x],i)=>`<div class="line"><span>${i+1}. ${esc(n)} <span class="muted">· ${x.q} un</span></span><b>${brl(x.v)}</b></div>`).join("")||'<p class="muted">Sem vendas no período.</p>'}</div>
      <div class="card"><b>Por forma de pagamento</b>${Object.entries(pay).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="line"><span>${esc(k)}</span><b>${brl(v)}</b></div>`).join("")||'<p class="muted">—</p>'}</div></div>`;
  };
  m.innerHTML=`<div class="top"><h1>Desempenho</h1><div class="tabs" style="margin:0">${[[1,"Hoje"],[7,"7 dias"],[30,"30 dias"],[90,"90 dias"]].map(([d,l])=>`<button data-d="${d}" aria-current="${d===days}">${l}</button>`).join("")}</div></div><div id="dres"></div>`;
  $$("[data-d]",m).forEach(b=>b.onclick=()=>{days=+b.dataset.d;$$("[data-d]",m).forEach(x=>x.setAttribute("aria-current",x===b));draw()});
  await draw();
};

/* ================= CATÁLOGO ================= */
let catSel=null;
PAGES.catalogo=async m=>{
  const [cats,prods,groups,pcs]=await Promise.all([q(sb.from("categories").select("*").order("sort_order").order("name")),q(sb.from("products").select("*").order("sort_order").order("name")),q(sb.from("complement_groups").select("*").order("name")),q(sb.from("product_complements").select("*"))]);
  if(!catSel||!cats.find(c=>c.id===catSel)) catSel=cats[0]?.id||null;
  let term="";
  const draw=()=>{
    const list=term?prods.filter(p=>p.name.toLowerCase().includes(term)):prods.filter(p=>p.category_id===catSel);
    const cat=cats.find(c=>c.id===catSel);
    m.innerHTML=`<div class="top"><h1>Catálogo</h1><div class="row"><input class="in" id="cq" placeholder="Buscar em todo o catálogo…" style="width:240px" value="${esc(term)}"><button class="btn" id="npd">➕ Novo produto</button></div></div>
    <div class="cat2"><div class="clist"><div class="row" style="justify-content:space-between"><b>Categorias</b><button class="btn sm" id="nct">➕</button></div>
      ${cats.map((c,i)=>`<div class="ci ${c.id===catSel&&!term?"on":""}"><button class="nm" data-c="${c.id}" style="${c.active?"":"opacity:.45"}">${esc(c.name)} <span class="ct">${prods.filter(p=>p.category_id===c.id).length}</span></button>
        <button class="icb" data-up="${i}" aria-label="Subir">↑</button><button class="icb" data-dn="${i}" aria-label="Descer">↓</button><button class="icb" data-ec="${c.id}" aria-label="Editar">✎</button></div>`).join("")}</div>
      <div><div class="row" style="justify-content:space-between;margin-bottom:10px"><b>${term?"Resultados da busca":esc(cat?.name||"")}</b><span class="muted">${list.length} produtos</span></div>
      <div class="tw"><table><thead><tr><th></th><th>Produto</th><th class="num">Preço</th><th class="num">Promoção</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(p=>`<tr><td>${p.image_url?`<img class="thumb" src="${esc(p.image_url)}" alt="">`:'<div class="thumb"></div>'}</td><td><b>${esc(p.name)}</b>${p.featured?' <span class="pill p-novo">Destaque</span>':""}${p.is_new?' <span class="pill p-novo">Novidade</span>':""}${term?`<div class="muted" style="font-size:12px">${esc((cats.find(c=>c.id===p.category_id)||{}).name||"")}</div>`:""}</td>
        <td class="num">${brl(p.price)}</td><td class="num">${p.promo_price!=null?`<span class="price">${brl(p.promo_price)}</span>`:"—"}</td>
        <td><button data-tg="${p.id}" title="Clique pra alternar entre ativo e em falta">${pill(p.status)}</button></td><td class="num"><button class="btn o sm" data-ep="${p.id}">Editar</button></td></tr>`).join("")||'<tr><td colspan="6" class="empty">Nenhum produto aqui.</td></tr>'}</tbody></table></div></div></div>`;
    let tm; $("#cq").oninput=e=>{clearTimeout(tm);tm=setTimeout(()=>{term=e.target.value.trim().toLowerCase();draw();const i=$("#cq");i.focus();i.setSelectionRange(i.value.length,i.value.length)},250)};
    $$("[data-c]",m).forEach(b=>b.onclick=()=>{catSel=+b.dataset.c;term="";draw()});
    $$("[data-ec]",m).forEach(b=>b.onclick=()=>catForm(cats.find(c=>c.id==b.dataset.ec)));
    $("#nct").onclick=()=>catForm(null,cats.length);
    $$("[data-up],[data-dn]",m).forEach(b=>b.onclick=async()=>{const i=+(b.dataset.up??b.dataset.dn),j=b.dataset.up!=null?i-1:i+1;if(j<0||j>=cats.length)return;
      [cats[i],cats[j]]=[cats[j],cats[i]];await Promise.all(cats.map((c,k)=>c.sort_order!==k?sb.from("categories").update({sort_order:k}).eq("id",c.id):null));cats.forEach((c,k)=>c.sort_order=k);draw()});
    $$("[data-tg]",m).forEach(b=>b.onclick=async()=>{const p=prods.find(x=>x.id==b.dataset.tg);const s=p.status==="ativo"?"em_falta":"ativo";await q(sb.from("products").update({status:s}).eq("id",p.id));p.status=s;draw();toast(p.name+": "+(s==="ativo"?"ativo":"em falta"))});
    $$("[data-ep]",m).forEach(b=>b.onclick=()=>prodForm(prods.find(x=>x.id==b.dataset.ep)));
    $("#npd").onclick=()=>prodForm(null);
  };
  const CF=[{k:"name",l:"Nome da categoria"},{k:"image_url",l:"Foto da categoria (aparece no bloco)",t:"img"},{k:"active",l:"Mostrar no cardápio",t:"check"}];
  function catForm(c,n){
    const dr=drawer(c?"Editar categoria":"Nova categoria",formHTML(CF,c||{active:true})+'<p class="err" id="e" hidden></p>',`${c?'<button class="btn r" id="del">Excluir</button>':""}<button class="btn" id="sv">Salvar</button>`);
    wireImgs(dr);
    $("#sv",dr).onclick=async()=>{const v=readForm(CF,dr);if(!v.name){$("#e",dr).hidden=false;$("#e",dr).textContent="Dê um nome.";return}
      if(c) await q(sb.from("categories").update(v).eq("id",c.id)); else {const r=await q(sb.from("categories").insert({...v,sort_order:n}).select().single());catSel=r.id}
      closeDr();toast("Categoria salva");PAGES.catalogo(m)};
    if(c) $("#del",dr).onclick=async e=>{if(prods.some(p=>p.category_id===c.id)){$("#e",dr).hidden=false;$("#e",dr).textContent="Mova ou exclua os produtos dessa categoria antes. Ou desmarque \"Mostrar no cardápio\" pra só esconder.";return}
      if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar exclusão";return}
      await q(sb.from("categories").delete().eq("id",c.id));closeDr();toast("Categoria excluída");PAGES.catalogo(m)};
  }
  function prodForm(p){
    const PF=[{k:"name",l:"Nome do produto"},{k:"category_id",l:"Categoria",t:"select",num:true,o:cats.map(c=>[c.id,c.name])},{k:"description",l:"Descrição",t:"area"},
      {k:"price",l:"Preço (R$)",t:"money"},{k:"promo_price",l:"Preço de promoção (R$) · deixe vazio se não tiver",t:"money"},
      {k:"status",l:"Situação",t:"select",o:[["ativo","Ativo (aparece e vende)"],["em_falta","Em falta (aparece como esgotado)"],["inativo","Oculto (não aparece)"]]},
      {k:"image_url",l:"Foto",t:"img"},{k:"featured",l:"Mostrar nos Destaques",t:"check"},{k:"is_new",l:"Selo NOVIDADE",t:"check"},
      {k:"cost_price",l:"Preço de custo (R$) · só você vê",t:"money"},{k:"track_stock",l:"Controlar estoque deste produto",t:"check"},{k:"stock_qty",l:"Estoque atual",t:"money"},{k:"stock_min",l:"Estoque mínimo (avisa quando chegar)",t:"money"}];
    const linked=new Set(pcs.filter(x=>p&&x.product_id===p.id).map(x=>x.group_id));
    const dr=drawer(p?"Editar produto":"Novo produto",formHTML(PF,p||{category_id:catSel,status:"ativo"})+
      (groups.length?`<div class="fld"><span>Complementos que o cliente pode escolher</span>${groups.map(g=>`<label class="chk"><input type="checkbox" data-gr="${g.id}" ${linked.has(g.id)?"checked":""}> ${esc(g.name)}</label>`).join("")}</div>`:"")+'<p class="err" id="e" hidden></p>',
      `${p?'<button class="btn r" id="del">Excluir</button>':""}<button class="btn" id="sv">Salvar</button>`);
    wireImgs(dr);
    $("#sv",dr).onclick=async()=>{const v=readForm(PF,dr);
      if(!v.name||v.price==null){$("#e",dr).hidden=false;$("#e",dr).textContent="Preencha nome e preço.";return}
      if(v.promo_price!=null&&v.promo_price>=v.price){$("#e",dr).hidden=false;$("#e",dr).textContent="O preço de promoção precisa ser menor que o preço normal.";return}
      v.stock_qty=v.stock_qty??0; v.stock_min=v.stock_min??0;
      const before=p?+p.stock_qty:0;
      const saved=p?await q(sb.from("products").update(v).eq("id",p.id).select().single()):await q(sb.from("products").insert(v).select().single());
      if(v.track_stock&&+v.stock_qty!==before) await sb.from("stock_movements").insert({product_id:saved.id,kind:"ajuste",qty:+v.stock_qty-before,description:"Ajuste pelo cadastro"});
      const want=$$("[data-gr]",dr).filter(x=>x.checked).map(x=>+x.dataset.gr);
      await sb.from("product_complements").delete().eq("product_id",saved.id);
      if(want.length) await q(sb.from("product_complements").insert(want.map((g,i)=>({product_id:saved.id,group_id:g,sort_order:i}))));
      closeDr();toast("Produto salvo");catSel=saved.category_id;PAGES.catalogo(m)};
    if(p) $("#del",dr).onclick=async e=>{if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar exclusão";return}
      const {error}=await sb.from("products").delete().eq("id",p.id);
      if(error){await q(sb.from("products").update({status:"inativo"}).eq("id",p.id));toast("Produto tem vendas no histórico, então foi só ocultado")} else toast("Produto excluído");
      closeDr();PAGES.catalogo(m)};
  }
  draw();
};

/* ================= COMPLEMENTOS ================= */
PAGES.complementos=async m=>{
  const [groups,opts]=await Promise.all([q(sb.from("complement_groups").select("*").order("name")),q(sb.from("complement_options").select("*").order("sort_order"))]);
  m.innerHTML=`<div class="top"><h1>Complementos e opções</h1><button class="btn" id="ng">➕ Novo complemento</button></div>
    <p class="muted" style="margin-top:-6px">Ex.: "Gelo Sabores" com as opções Melancia, Limão… Depois ligue o complemento ao produto, na tela de editar produto.</p>
    <div class="grid g2">${groups.map(g=>`<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(g.name)}</b><button class="btn o sm" data-eg="${g.id}">Editar</button></div>
      <div class="muted" style="font-size:12px;margin:2px 0 8px">Mín. ${g.min_select} · máx. ${g.max_select}${g.allow_repeat?" · pode repetir":""}${g.active?"":" · desativado"}</div>
      ${opts.filter(o=>o.group_id===g.id).map(o=>`<div class="line"><span style="${o.active?"":"opacity:.45"}">${esc(o.name)}</span><span class="row">${+o.price?brl(o.price):"grátis"}<button class="icb" data-eo="${o.id}" aria-label="Editar">✎</button></span></div>`).join("")}
      <button class="btn o sm" data-no="${g.id}" style="margin-top:8px">➕ Opção</button></div>`).join("")||'<div class="empty">Nenhum complemento ainda.</div>'}</div>`;
  const GF=[{k:"name",l:"Nome (ex.: Gelo Sabores)"},{k:"min_select",l:"Mínimo que o cliente escolhe (0 = opcional)",t:"int"},{k:"max_select",l:"Máximo que pode escolher",t:"int"},{k:"allow_repeat",l:"Pode escolher a mesma opção mais de uma vez",t:"check"},{k:"active",l:"Ativo",t:"check"}];
  const OF=[{k:"name",l:"Nome da opção"},{k:"price",l:"Preço adicional (R$)",t:"money"},{k:"image_url",l:"Foto (opcional)",t:"img"},{k:"active",l:"Disponível",t:"check"}];
  const edit=(title,F,v,table,id,extra)=>{const dr=drawer(title,formHTML(F,v)+'<p class="err" id="e" hidden></p>',`${id?'<button class="btn r" id="del">Excluir</button>':""}<button class="btn" id="sv">Salvar</button>`);wireImgs(dr);
    $("#sv",dr).onclick=async()=>{const x={...readForm(F,dr),...extra};if(!x.name){$("#e",dr).hidden=false;$("#e",dr).textContent="Dê um nome.";return}if("price" in x)x.price=x.price??0;if("min_select" in x){x.min_select=x.min_select??0;x.max_select=x.max_select??1}
      id?await q(sb.from(table).update(x).eq("id",id)):await q(sb.from(table).insert(x));closeDr();toast("Salvo");PAGES.complementos(m)};
    if(id)$("#del",dr).onclick=async e=>{if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar exclusão";return}await q(sb.from(table).delete().eq("id",id));closeDr();PAGES.complementos(m)}};
  $("#ng").onclick=()=>edit("Novo complemento",GF,{min_select:0,max_select:1,active:true},"complement_groups");
  $$("[data-eg]",m).forEach(b=>b.onclick=()=>{const g=groups.find(x=>x.id==b.dataset.eg);edit("Editar complemento",GF,g,"complement_groups",g.id)});
  $$("[data-no]",m).forEach(b=>b.onclick=()=>edit("Nova opção",OF,{active:true},"complement_options",null,{group_id:+b.dataset.no,sort_order:opts.filter(o=>o.group_id==b.dataset.no).length+1}));
  $$("[data-eo]",m).forEach(b=>b.onclick=()=>{const o=opts.find(x=>x.id==b.dataset.eo);edit("Editar opção",OF,o,"complement_options",o.id)});
};

/* ================= DESTAQUES E PROMOÇÕES ================= */
PAGES.destaques=async m=>{
  const prods=await q(sb.from("products").select("id,name,price,promo_price,featured,is_new,status").neq("status","inativo").order("name"));
  let term="";
  const draw=()=>{
    const list=prods.filter(p=>!term||p.name.toLowerCase().includes(term));
    $("#dl").innerHTML=list.slice(0,150).map(p=>`<tr><td>${esc(p.name)}</td><td class="num">${brl(p.price)}</td>
      <td style="width:130px"><input class="in" data-pp="${p.id}" inputmode="decimal" placeholder="—" value="${money(p.promo_price)}"></td>
      <td><label class="chk"><input type="checkbox" data-ft="${p.id}" ${p.featured?"checked":""}> Destaque</label></td><td><label class="chk"><input type="checkbox" data-nw="${p.id}" ${p.is_new?"checked":""}> Novidade</label></td></tr>`).join("");
    $$("[data-pp]").forEach(i=>i.onchange=async()=>{const p=prods.find(x=>x.id==i.dataset.pp),v=num(i.value);if(v!=null&&v>=p.price){toast("Promoção precisa ser menor que "+brl(p.price));i.value=money(p.promo_price);return}await q(sb.from("products").update({promo_price:v}).eq("id",p.id));p.promo_price=v;toast(v==null?"Promoção removida":"Promoção salva")});
    $$("[data-ft]").forEach(i=>i.onchange=async()=>{await q(sb.from("products").update({featured:i.checked}).eq("id",+i.dataset.ft));prods.find(x=>x.id==i.dataset.ft).featured=i.checked;toast("Salvo")});
    $$("[data-nw]").forEach(i=>i.onchange=async()=>{await q(sb.from("products").update({is_new:i.checked}).eq("id",+i.dataset.nw));prods.find(x=>x.id==i.dataset.nw).is_new=i.checked;toast("Salvo")});
  };
  m.innerHTML=`<div class="top"><h1>Destaques e promoções</h1><input class="in" id="dq" placeholder="Buscar produto…" style="width:240px"></div>
    <p class="muted" style="margin-top:-6px">Preço de promoção aparece riscado no cardápio e no pop-up de Promoções. Destaques aparecem no topo. Salva sozinho.</p>
    <div class="stats"><div class="stat"><small>Em promoção</small><b>${prods.filter(p=>p.promo_price!=null).length}</b></div><div class="stat"><small>Destaques</small><b>${prods.filter(p=>p.featured).length}</b></div></div>
    <div class="tw"><table><thead><tr><th>Produto</th><th class="num">Preço</th><th>Promoção (R$)</th><th></th><th></th></tr></thead><tbody id="dl"></tbody></table></div>`;
  $("#dq").oninput=e=>{term=e.target.value.toLowerCase();draw()};
  draw();
};

/* ================= CLIENTES E FIADO ================= */
PAGES.clientes=async m=>{
  const [cs,bal]=await Promise.all([q(sb.from("customers").select("*").order("name").limit(2000)),q(sb.from("customer_balances").select("id,balance"))]);
  const B=Object.fromEntries(bal.map(b=>[b.id,+b.balance]));
  let term="", onlyDebt=false;
  const draw=()=>{
    const list=cs.filter(c=>(!term||(c.name||"").toLowerCase().includes(term)||digits(c.phone).includes(digits(term)||"§"))&&(!onlyDebt||B[c.id]>0));
    $("#cl").innerHTML=list.slice(0,300).map(c=>`<tr data-c="${c.id}" style="cursor:pointer"><td><b>${esc(c.name)}</b></td><td>${esc(c.phone||"")}</td><td>${esc(c.neighborhood||"")}</td><td class="num">${c.loyalty_points||0}</td><td class="num" style="color:${B[c.id]>0?"var(--red)":"inherit"}">${B[c.id]?brl(B[c.id]):"—"}</td></tr>`).join("")||'<tr><td colspan="5" class="empty">Nenhum cliente.</td></tr>';
    $$("[data-c]",m).forEach(r=>r.onclick=()=>custDrawer(cs.find(c=>c.id==r.dataset.c)));
  };
  m.innerHTML=`<div class="top"><h1>Clientes e fiado</h1><div class="row"><button class="btn" id="nc">➕ Novo cliente</button></div></div>
    <div class="stats"><div class="stat"><small>Clientes</small><b>${cs.length}</b></div><div class="stat"><small>Devendo no fiado</small><b>${Object.values(B).filter(v=>v>0).length}</b></div><div class="stat"><small>Total a receber</small><b style="color:var(--red)">${brl(Object.values(B).filter(v=>v>0).reduce((s,v)=>s+v,0))}</b></div></div>
    <div class="row" style="margin-bottom:10px"><input class="in" id="cq" placeholder="Buscar nome ou telefone…" style="max-width:320px"><label class="chk"><input type="checkbox" id="od"> Só quem está devendo</label></div>
    <div class="tw"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Bairro</th><th class="num">Pontos</th><th class="num">Fiado</th></tr></thead><tbody id="cl"></tbody></table></div>`;
  $("#cq").oninput=e=>{term=e.target.value.toLowerCase();draw()}; $("#od").onchange=e=>{onlyDebt=e.target.checked;draw()};
  $("#nc").onclick=()=>custDrawer(null);
  draw();
  async function custDrawer(c){
    const CF=[{k:"name",l:"Nome"},{k:"phone",l:"Telefone"},{k:"street",l:"Rua"},{k:"street_number",l:"Número"},{k:"neighborhood",l:"Bairro"},{k:"reference",l:"Referência"},{k:"credit_limit",l:"Limite do fiado (R$) · 0 = sem limite",t:"money"},{k:"loyalty_points",l:"Pontos de fidelidade",t:"int"},{k:"notes",l:"Anotações",t:"area"}];
    const ent=c?await q(sb.from("credit_entries").select("*").eq("customer_id",c.id).order("created_at",{ascending:false}).limit(100)):[];
    const ords=c?await q(sb.from("orders").select("id,number,total,created_at,status").eq("customer_id",c.id).order("created_at",{ascending:false}).limit(20)):[];
    const bal=c?B[c.id]||0:0;
    const dr=drawer(c?esc(c.name):"Novo cliente",`${c?`<div class="card"><div class="line big"><span>Saldo do fiado</span><span style="color:${bal>0?"var(--red)":"var(--green)"}">${brl(bal)}</span></div>${+c.credit_limit>0&&bal>+c.credit_limit?'<p class="err">Passou do limite do fiado.</p>':""}
      <div class="grid g2" style="margin-top:8px"><input class="in" id="fv" inputmode="decimal" placeholder="Valor R$"><input class="in" id="fd" placeholder="Descrição (opcional)"></div>
      <div class="row" style="margin-top:8px"><button class="btn r sm" id="fc">➕ Lançar compra</button><button class="btn g sm" id="fp">✔ Registrar pagamento</button></div>
      ${ent.length?`<div style="margin-top:10px">${ent.map(e=>`<div class="line"><span>${dt(e.created_at)} · ${esc(e.description||(e.kind==="compra"?"Compra":"Pagamento"))}</span><b style="color:${e.kind==="compra"?"var(--red)":"var(--green)"}">${e.kind==="compra"?"+":"−"} ${brl(e.amount)}</b></div>`).join("")}</div>`:""}</div>`:""}
      ${formHTML(CF,c||{credit_limit:0,loyalty_points:0})}
      ${ords.length?`<div class="card"><b>Últimos pedidos</b>${ords.map(o=>`<div class="line"><span>#${o.number} · ${dt(o.created_at)} ${pill(o.status)}</span><b>${brl(o.total)}</b></div>`).join("")}</div>`:""}<p class="err" id="e" hidden></p>`,
      `${c&&c.phone?`<a class="btn o" target="_blank" rel="noopener" href="https://wa.me/55${digits(c.phone).replace(/^55/,"")}">WhatsApp</a>`:""}<button class="btn" id="sv">Salvar</button>`);
    $("#sv",dr).onclick=async()=>{const v=readForm(CF,dr);if(!v.name){$("#e",dr).hidden=false;$("#e",dr).textContent="Informe o nome.";return}v.credit_limit=v.credit_limit??0;v.loyalty_points=v.loyalty_points??0;
      try{c?await q(sb.from("customers").update(v).eq("id",c.id)):await q(sb.from("customers").insert(v));closeDr();toast("Cliente salvo");PAGES.clientes(m)}catch(e){$("#e",dr).hidden=false;$("#e",dr).textContent=/duplicate|unique/i.test(e.message)?"Já existe um cliente com esse telefone.":e.message}};
    const fiado=async kind=>{const v=num($("#fv",dr).value);if(!v||v<=0){toast("Informe o valor");return}await q(sb.from("credit_entries").insert({customer_id:c.id,kind,amount:v,description:$("#fd",dr).value.trim()||null}));toast(kind==="compra"?"Compra lançada":"Pagamento registrado");closeDr();await PAGES.clientes(m);};
    if(c){$("#fc",dr).onclick=()=>fiado("compra");$("#fp",dr).onclick=()=>fiado("pagamento")}
  }
};

/* ================= CUPONS ================= */
PAGES.cupons=async m=>{
  const cs=await q(sb.from("coupons").select("*").order("id",{ascending:false}));
  const KIND={percent:"% de desconto",fixed:"R$ de desconto",free_delivery:"Entrega grátis"};
  m.innerHTML=`<div class="top"><h1>Cupons de desconto</h1><button class="btn" id="nc">➕ Novo cupom</button></div>
    <div class="tw"><table><thead><tr><th>Código</th><th>Tipo</th><th class="num">Valor</th><th class="num">Pedido mín.</th><th class="num">Usos</th><th>Validade</th><th></th></tr></thead><tbody>
    ${cs.map(c=>`<tr><td><b>${esc(c.code)}</b> ${c.active?"":'<span class="pill p-inativo">Desativado</span>'}</td><td>${KIND[c.kind]}</td><td class="num">${c.kind==="percent"?(+c.value)+"%":c.kind==="fixed"?brl(c.value):"—"}</td><td class="num">${+c.min_order?brl(c.min_order):"—"}</td><td class="num">${c.uses}${c.max_uses?" / "+c.max_uses:""}</td><td>${c.expires_at?new Date(c.expires_at).toLocaleDateString("pt-BR"):"Sem validade"}</td><td class="num"><button class="btn o sm" data-e="${c.id}">Editar</button></td></tr>`).join("")||'<tr><td colspan="7" class="empty">Nenhum cupom ainda.</td></tr>'}</tbody></table></div>`;
  const F=[{k:"code",l:"Código (o cliente digita)"},{k:"kind",l:"Tipo",t:"select",o:Object.entries(KIND)},{k:"value",l:"Valor (% ou R$)",t:"money"},{k:"min_order",l:"Pedido mínimo (R$)",t:"money"},{k:"max_uses",l:"Limite de usos (vazio = sem limite)",t:"int"},{k:"expires",l:"Válido até (vazio = sem validade)"},{k:"active",l:"Ativo",t:"check"}];
  const edit=c=>{const v=c?{...c,expires:c.expires_at?c.expires_at.slice(0,10):""}:{kind:"percent",active:true};
    const dr=drawer(c?"Editar cupom":"Novo cupom",formHTML(F,v)+'<p class="err" id="e" hidden></p>',`${c?'<button class="btn r" id="del">Excluir</button>':""}<button class="btn" id="sv">Salvar</button>`);
    $("#f_expires",dr).type="date";
    $("#sv",dr).onclick=async()=>{const x=readForm(F,dr);x.code=(x.code||"").toUpperCase().replace(/\s/g,"");if(!x.code){$("#e",dr).hidden=false;$("#e",dr).textContent="Informe o código.";return}
      x.expires_at=x.expires?x.expires+"T23:59:59-03:00":null;delete x.expires;x.value=x.value??0;x.min_order=x.min_order??0;
      try{c?await q(sb.from("coupons").update(x).eq("id",c.id)):await q(sb.from("coupons").insert(x));closeDr();toast("Cupom salvo");PAGES.cupons(m)}catch(e){$("#e",dr).hidden=false;$("#e",dr).textContent=/unique|duplicate/i.test(e.message)?"Já existe um cupom com esse código.":e.message}};
    if(c)$("#del",dr).onclick=async e=>{if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar exclusão";return}await q(sb.from("coupons").delete().eq("id",c.id));closeDr();PAGES.cupons(m)}};
  $("#nc").onclick=()=>edit(null); $$("[data-e]",m).forEach(b=>b.onclick=()=>edit(cs.find(c=>c.id==b.dataset.e)));
};

/* ================= FIDELIDADE ================= */
PAGES.fidelidade=async m=>{
  const top=await q(sb.from("customers").select("id,name,phone,loyalty_points").gt("loyalty_points",0).order("loyalty_points",{ascending:false}).limit(50));
  const F=[{k:"loyalty_enabled",l:"Programa de fidelidade ligado",t:"check"},{k:"loyalty_points_per_real",l:"Pontos ganhos a cada R$ 1,00",t:"money"},{k:"loyalty_reward_points",l:"Pontos pra ganhar o prêmio",t:"int"},{k:"loyalty_reward_text",l:"Prêmio (ex.: R$ 10 de desconto, 1 gelo grátis)"}];
  m.innerHTML=`<div class="top"><h1>Fidelidade</h1></div><div class="grid g2"><div class="card grid">${formHTML(F,S)}<p class="muted" style="margin:0">O cliente ganha pontos quando o pedido é marcado como <b>Concluído</b>. Pra dar o prêmio, abra o cliente em Clientes e tire os pontos usados.</p><button class="btn" id="sv">Salvar</button></div>
    <div class="card"><b>Clientes com mais pontos</b>${top.map(c=>`<div class="line"><span>${esc(c.name)} <span class="muted">${esc(c.phone||"")}</span></span><b style="color:${c.loyalty_points>=S.loyalty_reward_points?"var(--green)":"inherit"}">${c.loyalty_points} pts${c.loyalty_points>=S.loyalty_reward_points?" 🏆":""}</b></div>`).join("")||'<p class="muted">Ninguém com pontos ainda.</p>'}</div></div>`;
  $("#sv").onclick=async()=>{const v=readForm(F,m);v.loyalty_points_per_real=v.loyalty_points_per_real??1;v.loyalty_reward_points=v.loyalty_reward_points??100;await q(sb.from("store_settings").update(v).eq("id",1));Object.assign(S,v);toast("Salvo")};
};

/* ================= ESTOQUE ================= */
PAGES.estoque=async m=>{
  const prods=await q(sb.from("products").select("id,name,stock_qty,stock_min,track_stock,cost_price,status").order("name"));
  let term="", all=false;
  const draw=()=>{
    const list=prods.filter(p=>(all||p.track_stock)&&(!term||p.name.toLowerCase().includes(term)));
    const low=prods.filter(p=>p.track_stock&&+p.stock_qty<=+p.stock_min);
    $("#er").innerHTML=`<div class="stats"><div class="stat"><small>Produtos controlados</small><b>${prods.filter(p=>p.track_stock).length}</b></div><div class="stat"><small>Abaixo do mínimo</small><b style="color:${low.length?"var(--red)":"inherit"}">${low.length}</b></div><div class="stat"><small>Valor em estoque (custo)</small><b>${brl(prods.filter(p=>p.track_stock).reduce((s,p)=>s+Math.max(0,+p.stock_qty)*(+p.cost_price||0),0))}</b></div></div>
      ${!prods.some(p=>p.track_stock)?'<p class="alert">Nenhum produto com estoque controlado ainda. Marque "Mostrar todos" abaixo e clique em <b>Controlar</b> nos produtos que quiser acompanhar.</p>':""}
      <div class="tw"><table><thead><tr><th>Produto</th><th class="num">Estoque</th><th class="num">Mínimo</th><th></th></tr></thead><tbody>${list.slice(0,300).map(p=>`<tr><td>${esc(p.name)} ${p.track_stock&&+p.stock_qty<=+p.stock_min?'<span class="pill p-cancelado">Repor</span>':""}</td><td class="num"><b>${p.track_stock?+p.stock_qty:"—"}</b></td><td class="num">${p.track_stock?+p.stock_min:"—"}</td>
        <td class="num">${p.track_stock?`<button class="btn sm" data-in="${p.id}">Entrada</button> <button class="btn o sm" data-aj="${p.id}">Ajustar</button> <button class="btn o sm" data-hi="${p.id}">Histórico</button>`:`<button class="btn o sm" data-tr="${p.id}">Controlar</button>`}</td></tr>`).join("")||'<tr><td colspan="4" class="empty">Nada aqui.</td></tr>'}</tbody></table></div>`;
    $$("[data-tr]",m).forEach(b=>b.onclick=async()=>{await q(sb.from("products").update({track_stock:true}).eq("id",+b.dataset.tr));prods.find(p=>p.id==b.dataset.tr).track_stock=true;draw();toast("Agora é só lançar a entrada")});
    $$("[data-in],[data-aj]",m).forEach(b=>b.onclick=()=>{const isIn=!!b.dataset.in,p=prods.find(x=>x.id==(b.dataset.in||b.dataset.aj));
      const dr=drawer((isIn?"Entrada de estoque · ":"Ajustar estoque · ")+esc(p.name),`<p class="muted">Estoque atual: <b>${+p.stock_qty}</b></p><label class="fld"><span>${isIn?"Quantidade que chegou":"Quantidade correta agora (contagem)"}</span><input class="in" id="qq" inputmode="decimal"></label>${isIn?`<label class="fld"><span>Preço de custo por unidade (opcional)</span><input class="in" id="cp" inputmode="decimal" value="${money(p.cost_price)}"></label>`:""}<label class="fld"><span>Observação</span><input class="in" id="ob" placeholder="${isIn?"Ex.: compra no atacado":"Ex.: contagem do mês"}"></label>${isIn?"":`<label class="fld"><span>Estoque mínimo</span><input class="in" id="mn" inputmode="decimal" value="${+p.stock_min}"></label>`}`,`<button class="btn" id="sv">Salvar</button>`);
      $("#sv",dr).onclick=async()=>{const v=num($("#qq",dr).value);if(v==null){toast("Informe a quantidade");return}
        const novo=isIn?+p.stock_qty+v:v, diff=novo-p.stock_qty, upd={stock_qty:novo};
        if(isIn&&num($("#cp",dr).value)!=null)upd.cost_price=num($("#cp",dr).value); if(!isIn&&num($("#mn",dr).value)!=null)upd.stock_min=num($("#mn",dr).value);
        await q(sb.from("products").update(upd).eq("id",p.id)); if(diff) await q(sb.from("stock_movements").insert({product_id:p.id,kind:isIn?"entrada":"ajuste",qty:diff,description:$("#ob",dr).value.trim()||null}));
        Object.assign(p,upd);closeDr();draw();toast("Estoque atualizado")}});
    $$("[data-hi]",m).forEach(b=>b.onclick=async()=>{const p=prods.find(x=>x.id==b.dataset.hi);const mv=await q(sb.from("stock_movements").select("*").eq("product_id",p.id).order("created_at",{ascending:false}).limit(100));
      drawer("Histórico · "+esc(p.name),mv.map(x=>`<div class="line"><span>${dt(x.created_at)} · ${({entrada:"Entrada",saida:"Saída",ajuste:"Ajuste",venda:"Venda"})[x.kind]}${x.description?" · "+esc(x.description):""}</span><b style="color:${+x.qty<0?"var(--red)":"var(--green)"}">${+x.qty>0?"+":""}${+x.qty}</b></div>`).join("")||'<p class="muted">Sem movimentações.</p>')});
  };
  m.innerHTML=`<div class="top"><h1>Estoque</h1><div class="row"><input class="in" id="eq" placeholder="Buscar produto…" style="width:220px"><label class="chk"><input type="checkbox" id="ea"> Mostrar todos</label></div></div><div id="er"></div>`;
  $("#eq").oninput=e=>{term=e.target.value.toLowerCase();draw()}; $("#ea").onchange=e=>{all=e.target.checked;draw()};
  draw();
};

/* ================= CAIXA ================= */
PAGES.caixa=async m=>{
  const open=(await q(sb.from("cash_sessions").select("*").is("closed_at",null).order("opened_at",{ascending:false}).limit(1)))[0];
  const past=await q(sb.from("cash_sessions").select("*").not("closed_at","is",null).order("opened_at",{ascending:false}).limit(15));
  if(!open){
    m.innerHTML=`<div class="top"><h1>Caixa</h1></div><div class="grid g2"><div class="card grid"><b>Caixa fechado</b><label class="fld"><span>Dinheiro na gaveta pra começar (troco)</span><input class="in" id="oa" inputmode="decimal" placeholder="0,00"></label><button class="btn" id="ob">Abrir caixa</button></div>
      <div class="card"><b>Últimos fechamentos</b>${past.map(s=>`<div class="line"><span>${dt(s.opened_at)} → ${hm(s.closed_at)}</span><b>${brl(s.closing_amount)}</b></div>`).join("")||'<p class="muted">Nenhum ainda.</p>'}</div></div>`;
    $("#ob").onclick=async()=>{await q(sb.from("cash_sessions").insert({opening_amount:num($("#oa").value)||0}));toast("Caixa aberto");PAGES.caixa(m)};
    return;
  }
  const [ords,mv]=await Promise.all([q(sb.from("orders").select("total,payment_method,change_for,status").gte("created_at",open.opened_at).eq("status","concluido")),q(sb.from("cash_movements").select("*").eq("session_id",open.id).order("created_at",{ascending:false}))]);
  const byPay={}; ords.forEach(o=>byPay[o.payment_method||"—"]=(byPay[o.payment_method||"—"]||0)+ +o.total);
  const cashSales=Object.entries(byPay).filter(([k])=>/dinheiro/i.test(k)).reduce((s,[,v])=>s+v,0);
  const sumK=k=>mv.filter(x=>x.kind===k).reduce((s,x)=>s+ +x.amount,0);
  const expected=+open.opening_amount+cashSales+sumK("entrada")+sumK("suprimento")-sumK("saida")-sumK("sangria");
  const KL={entrada:"Entrada",saida:"Saída / despesa",sangria:"Sangria (retirada)",suprimento:"Suprimento (reforço)"};
  m.innerHTML=`<div class="top"><h1>Caixa aberto</h1><span class="muted">desde ${dt(open.opened_at)}</span></div>
    <div class="stats"><div class="stat"><small>Vendas concluídas</small><b>${brl(ords.reduce((s,o)=>s+ +o.total,0))}</b></div><div class="stat"><small>Pedidos</small><b>${ords.length}</b></div><div class="stat"><small>Abertura</small><b>${brl(open.opening_amount)}</b></div><div class="stat"><small>Dinheiro esperado na gaveta</small><b style="color:var(--y)">${brl(expected)}</b></div></div>
    <div class="grid g2"><div class="card"><b>Vendas por forma de pagamento</b>${Object.entries(byPay).map(([k,v])=>`<div class="line"><span>${esc(k)}</span><b>${brl(v)}</b></div>`).join("")||'<p class="muted">Nenhum pedido concluído ainda.</p>'}
      <p class="muted" style="font-size:12px">Conta os pedidos marcados como Concluído desde a abertura.</p></div>
      <div class="card grid"><b>Lançar movimento</b><div class="grid g2"><select class="in" id="mk">${Object.entries(KL).map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select><input class="in" id="mvv" inputmode="decimal" placeholder="Valor R$"></div><input class="in" id="mvd" placeholder="Descrição"><button class="btn o" id="mva">Lançar</button>
      ${mv.map(x=>`<div class="line"><span>${hm(x.created_at)} · ${KL[x.kind]}${x.description?" · "+esc(x.description):""}</span><b style="color:${["saida","sangria"].includes(x.kind)?"var(--red)":"var(--green)"}">${["saida","sangria"].includes(x.kind)?"−":"+"} ${brl(x.amount)}</b></div>`).join("")}</div></div>
    <div class="card grid" style="margin-top:12px;max-width:520px"><b>Fechar caixa</b><label class="fld"><span>Quanto tem de dinheiro na gaveta agora (contado)</span><input class="in" id="ca" inputmode="decimal"></label><div id="df" class="muted"></div><label class="fld"><span>Observação</span><input class="in" id="cn"></label><button class="btn r" id="cb">Fechar caixa</button></div>`;
  $("#mva").onclick=async()=>{const v=num($("#mvv").value);if(!v){toast("Informe o valor");return}await q(sb.from("cash_movements").insert({session_id:open.id,kind:$("#mk").value,amount:v,description:$("#mvd").value.trim()||null}));toast("Lançado");PAGES.caixa(m)};
  $("#ca").oninput=()=>{const v=num($("#ca").value);if(v==null){$("#df").textContent="";return}const d=v-expected;$("#df").innerHTML=Math.abs(d)<0.01?'<span class="ok">Caixa bateu certinho ✓</span>':`<span class="${d<0?"err":"ok"}">${d<0?"Faltando":"Sobrando"} ${brl(Math.abs(d))}</span>`};
  $("#cb").onclick=async e=>{const v=num($("#ca").value);if(v==null){toast("Informe o valor contado");return}if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar fechamento";return}
    await q(sb.from("cash_sessions").update({closed_at:new Date().toISOString(),closing_amount:v,notes:[$("#cn").value.trim(),`Esperado ${brl(expected)}`].filter(Boolean).join(" · ")}).eq("id",open.id));toast("Caixa fechado");PAGES.caixa(m)};
};

/* ================= DESPESAS ================= */
PAGES.financeiro=async m=>{
  const mStart=new Date();mStart.setDate(1);mStart.setHours(0,0,0,0);
  const [ex,ords]=await Promise.all([q(sb.from("expenses").select("*").order("due_date",{ascending:true,nullsFirst:false}).limit(300)),q(sb.from("orders").select("total,subtotal").gte("created_at",mStart.toISOString()).eq("status","concluido"))]);
  const month=ex.filter(e=>e.due_date&&new Date(e.due_date+"T12:00")>=mStart);
  const sales=ords.reduce((s,o)=>s+ +o.total,0), spent=month.reduce((s,e)=>s+ +e.amount,0);
  m.innerHTML=`<div class="top"><h1>Despesas e contas</h1><button class="btn" id="ne">➕ Nova despesa</button></div>
    <div class="stats"><div class="stat"><small>Vendas no mês</small><b>${brl(sales)}</b></div><div class="stat"><small>Despesas no mês</small><b style="color:var(--red)">${brl(spent)}</b></div><div class="stat"><small>Resultado do mês</small><b style="color:${sales-spent>=0?"var(--green)":"var(--red)"}">${brl(sales-spent)}</b></div><div class="stat"><small>Contas em aberto</small><b>${ex.filter(e=>!e.paid).length}</b></div></div>
    <div class="tw"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
    ${ex.map(e=>`<tr><td>${e.due_date?new Date(e.due_date+"T12:00").toLocaleDateString("pt-BR"):"—"}</td><td>${esc(e.description)}</td><td>${esc(e.category||"")}</td><td class="num">${brl(e.amount)}</td><td><button data-pd="${e.id}">${e.paid?'<span class="pill p-concluido">Paga</span>':'<span class="pill p-novo">A pagar</span>'}</button></td><td class="num"><button class="btn o sm" data-e="${e.id}">Editar</button></td></tr>`).join("")||'<tr><td colspan="6" class="empty">Nenhuma despesa lançada.</td></tr>'}</tbody></table></div>`;
  const F=[{k:"description",l:"Descrição (ex.: compra de cerveja, luz, gelo)"},{k:"amount",l:"Valor (R$)",t:"money"},{k:"category",l:"Categoria",t:"select",o:[["Mercadoria","Mercadoria"],["Contas da loja","Contas da loja (luz, água, internet)"],["Aluguel","Aluguel"],["Funcionários","Funcionários / entregador"],["Outros","Outros"]]},{k:"due_date",l:"Vencimento"},{k:"paid",l:"Já está paga",t:"check"}];
  const edit=e=>{const dr=drawer(e?"Editar despesa":"Nova despesa",formHTML(F,e||{due_date:new Date().toISOString().slice(0,10),category:"Mercadoria"})+'<p class="err" id="er" hidden></p>',`${e?'<button class="btn r" id="del">Excluir</button>':""}<button class="btn" id="sv">Salvar</button>`);
    $("#f_due_date",dr).type="date";
    $("#sv",dr).onclick=async()=>{const v=readForm(F,dr);if(!v.description||!v.amount){$("#er",dr).hidden=false;$("#er",dr).textContent="Preencha descrição e valor.";return}e?await q(sb.from("expenses").update(v).eq("id",e.id)):await q(sb.from("expenses").insert(v));closeDr();toast("Salvo");PAGES.financeiro(m)};
    if(e)$("#del",dr).onclick=async x=>{if(!x.target.dataset.sure){x.target.dataset.sure=1;x.target.textContent="Confirmar exclusão";return}await q(sb.from("expenses").delete().eq("id",e.id));closeDr();PAGES.financeiro(m)}};
  $("#ne").onclick=()=>edit(null); $$("[data-e]",m).forEach(b=>b.onclick=()=>edit(ex.find(x=>x.id==b.dataset.e)));
  $$("[data-pd]",m).forEach(b=>b.onclick=async()=>{const e=ex.find(x=>x.id==b.dataset.pd);await q(sb.from("expenses").update({paid:!e.paid}).eq("id",e.id));PAGES.financeiro(m)});
};

/* ================= DELIVERY ================= */
PAGES.delivery=async m=>{
  const zs=await q(sb.from("delivery_zones").select("*").order("neighborhood"));
  const F=[{k:"accepts_delivery",l:"Fazer entregas",t:"check"},{k:"accepts_pickup",l:"Aceitar retirada na loja",t:"check"},{k:"delivery_time_min",l:"Tempo de entrega mínimo (min)",t:"int"},{k:"delivery_time_max",l:"Tempo de entrega máximo (min)",t:"int"},{k:"prep_time_min",l:"Tempo pra retirada (min)",t:"int"},{k:"min_order",l:"Pedido mínimo (R$)",t:"money"}];
  m.innerHTML=`<div class="top"><h1>Delivery e bairros</h1><button class="btn" id="nz">➕ Novo bairro</button></div>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 320px"><div class="tw"><table><thead><tr><th>Bairro</th><th class="num">Taxa</th><th class="num">Tempo</th><th></th></tr></thead><tbody>
    ${zs.map(z=>`<tr><td><b style="${z.active?"":"opacity:.45"}">${esc(z.neighborhood)}</b>${z.active?"":' <span class="pill p-inativo">Pausado</span>'}</td><td class="num">${+z.fee?brl(z.fee):"Grátis"}</td><td class="num">${z.eta_minutes?z.eta_minutes+" min":"padrão"}</td><td class="num"><button class="btn o sm" data-e="${z.id}">Editar</button></td></tr>`).join("")||'<tr><td colspan="4" class="empty">Cadastre os bairros que vocês entregam. <b>Sem bairro cadastrado o cliente não consegue pedir entrega.</b></td></tr>'}</tbody></table></div>
    <div class="card grid" style="align-content:start">${formHTML(F,S)}<button class="btn" id="sv">Salvar</button></div></div>
    <p class="muted">Dica: use o nome do bairro igual aos Correios (ex.: "Conjunto Ceará"), assim o CEP do cliente já encontra o bairro sozinho.</p>`;
  $("#sv").onclick=async()=>{const v=readForm(F,m);v.min_order=v.min_order??0;await q(sb.from("store_settings").update(v).eq("id",1));Object.assign(S,v);toast("Salvo")};
  const ZF=[{k:"neighborhood",l:"Nome do bairro"},{k:"fee",l:"Taxa de entrega (R$) · 0 = grátis",t:"money"},{k:"eta_minutes",l:"Tempo de entrega (min) · vazio = padrão",t:"int"},{k:"active",l:"Entregando nesse bairro",t:"check"}];
  const edit=z=>{const dr=drawer(z?"Editar bairro":"Novo bairro",formHTML(ZF,z||{active:true,fee:0})+'<p class="err" id="e" hidden></p>',`${z?'<button class="btn r" id="del">Excluir</button>':""}<button class="btn" id="sv2">Salvar</button>`);
    $("#sv2",dr).onclick=async()=>{const v=readForm(ZF,dr);if(!v.neighborhood){$("#e",dr).hidden=false;$("#e",dr).textContent="Informe o bairro.";return}v.fee=v.fee??0;z?await q(sb.from("delivery_zones").update(v).eq("id",z.id)):await q(sb.from("delivery_zones").insert(v));closeDr();toast("Bairro salvo");PAGES.delivery(m)};
    if(z)$("#del",dr).onclick=async e=>{if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar exclusão";return}await q(sb.from("delivery_zones").delete().eq("id",z.id));closeDr();PAGES.delivery(m)}};
  $("#nz").onclick=()=>edit(null); $$("[data-e]",m).forEach(b=>b.onclick=()=>edit(zs.find(x=>x.id==b.dataset.e)));
};

/* ================= CONFIGURAÇÕES ================= */
PAGES.config=async m=>{
  S=await q(sb.from("store_settings").select("*").eq("id",1).single());
  const F=[{k:"name",l:"Nome da loja"},{k:"whatsapp",l:"WhatsApp que recebe os pedidos (com DDD)"},{k:"address",l:"Endereço da loja"},{k:"pix_key",l:"Chave Pix (aparece pro cliente)"},{k:"logo_url",l:"Logo",t:"img"},{k:"banner_url",l:"Capa do cardápio (faixa do topo)",t:"img"},{k:"primary_color",l:"Cor principal",t:"color"}];
  const DAYS=[["seg","Segunda"],["ter","Terça"],["qua","Quarta"],["qui","Quinta"],["sex","Sexta"],["sab","Sábado"],["dom","Domingo"]];
  const H=S.opening_hours||{}, PAYS=["Pix","Dinheiro","Cartão de crédito","Cartão de débito","Vale-refeição"];
  const custom=(S.payment_methods||[]).filter(p=>!PAYS.includes(p));
  m.innerHTML=`<div class="top"><h1>Configurações</h1><button class="btn" id="sv">Salvar tudo</button></div>
    <div class="grid g2"><div class="card grid" style="align-content:start"><b>Dados da loja</b>${formHTML(F,S)}</div>
    <div class="grid" style="align-content:start"><div class="card grid"><b>Horário de funcionamento</b><p class="muted" style="margin:0;font-size:12px">Se fechar depois da meia-noite, é só colocar o horário (ex.: abre 16:00, fecha 02:00).</p>
      ${DAYS.map(([k,l])=>{const d=H[k]||{open:"16:00",close:"02:00",closed:false};return `<div class="row"><span style="width:70px">${l}</span><input type="time" class="in" style="width:120px" id="h_${k}_o" value="${d.open}"><span class="muted">às</span><input type="time" class="in" style="width:120px" id="h_${k}_c" value="${d.close}"><label class="chk"><input type="checkbox" id="h_${k}_x" ${d.closed?"checked":""}> Fechado</label></div>`}).join("")}</div>
    <div class="card grid"><b>Formas de pagamento</b>${PAYS.map(p=>`<label class="chk"><input type="checkbox" data-pay="${esc(p)}" ${(S.payment_methods||[]).includes(p)?"checked":""}> ${p}</label>`).join("")}
      <label class="fld"><span>Outras (separe por vírgula)</span><input class="in" id="pc" value="${esc(custom.join(", "))}"></label></div>
    <div class="card"><b>Link do cardápio pros clientes</b><p style="word-break:break-all"><a href="/" target="_blank" rel="noopener">${location.origin}/</a></p><button class="btn o sm" id="cpl">Copiar link</button></div></div></div>`;
  wireImgs(m);
  $("#cpl").onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+"/");toast("Link copiado")}catch{toast(location.origin+"/")}};
  $("#sv").onclick=async()=>{const v=readForm(F,m);
    if(!v.name){toast("Informe o nome da loja");return}
    v.opening_hours=Object.fromEntries(DAYS.map(([k])=>[k,{open:$(`#h_${k}_o`).value||"00:00",close:$(`#h_${k}_c`).value||"00:00",closed:$(`#h_${k}_x`).checked}]));
    v.payment_methods=$$("[data-pay]",m).filter(x=>x.checked).map(x=>x.dataset.pay).concat($("#pc").value.split(",").map(s=>s.trim()).filter(Boolean));
    if(!v.payment_methods.length){toast("Escolha pelo menos uma forma de pagamento");return}
    v.updated_at=new Date().toISOString();
    await q(sb.from("store_settings").update(v).eq("id",1)); Object.assign(S,v); toast("Configurações salvas"); setTimeout(()=>location.reload(),600);};
};

boot();
