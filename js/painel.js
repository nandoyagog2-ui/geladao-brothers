// Painel de gestão — Geladão Brothers
const sb = supabase.createClient(GB_CONFIG.SUPABASE_URL, GB_CONFIG.SUPABASE_KEY);
const root = document.getElementById("root"), ov = document.getElementById("ov");

/* ---------- utilidades ---------- */
const brl=v=>"R$ "+Number(v||0).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,".");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=v=>{if(v===""||v==null)return null;let s=String(v).replace(/[^\d,.\-]/g,"");s=s.includes(",")?s.replace(/\./g,"").replace(",","."):s;const n=parseFloat(s);return isNaN(n)?null:n};
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

/* ---------- ponte com a extensão do WhatsApp Web ---------- */
const IN_WA=new URLSearchParams(location.search).get("modo")==="whats"&&window.parent!==window;
const waBridge={onChat:null,
  ask(){if(IN_WA)parent.postMessage({gb:"chat"},"*")},
  insert(text){if(IN_WA){parent.postMessage({gb:"insert",text},"*");toast("Resumo colado no WhatsApp")}}};
window.addEventListener("message",e=>{if(!String(e.origin).startsWith("chrome-extension://"))return;const d=e.data||{};if(d.gb==="chat-info"&&waBridge.onChat)waBridge.onChat(d);if(d.gb==="no-chat")toast("Abra uma conversa no WhatsApp primeiro")});

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
  ["Cardápio",[["catalogo","🍺","Catálogo"],["complementos","🧊","Complementos"],["destaques","🔥","Destaques e promoções"]]],
  ["Clientes",[["clientes","👥","Clientes e fiado"],["avaliacoes","⭐","Avaliações"],["cupons","🎟️","Cupons"],["fidelidade","🏆","Fidelidade"]]],
  ["Gestão",[["desempenho","📈","Desempenho"],["estoque","📦","Estoque"],["financeiro","💸","Despesas"],["delivery","🛵","Delivery e bairros"],["config","⚙️","Configurações"]]]];
async function shell(){
  S=await q(sb.from("store_settings").select("*").eq("id",1).single());
  root.innerHTML=`<div class="mobilebar"><button class="x" id="mb" aria-label="Menu">☰</button><b>${esc(S.name)}</b></div>
  <div class="shell"><aside class="side" id="side"><div class="brand"><div class="lg">${S.logo_url?`<img src="${esc(S.logo_url)}" alt="">`:"GB"}</div><div><b>${esc(S.name)}</b><small>Painel de gestão</small></div></div>
    <button class="openbtn" id="ob"></button><button class="openbtn off" id="snd"></button><nav class="menu" id="menu"></nav>
    <a class="btn o sm" href="/" target="_blank" rel="noopener" style="margin:14px 10px 0;display:flex">Ver cardápio ↗</a>
    <button class="out" id="lo">Sair</button></aside><main class="main" id="main"></main></div>`;
  $("#mb").onclick=()=>$("#side").classList.toggle("open");
  $("#side").onclick=e=>{if(e.target.id==="side")$("#side").classList.remove("open")};
  $("#lo").onclick=async()=>{await sb.auth.signOut();location.reload()};
  $("#ob").onclick=async()=>{S.is_open=!S.is_open;await q(sb.from("store_settings").update({is_open:S.is_open}).eq("id",1));openBtn();toast(S.is_open?"Loja aberta":"Loja fechada")};
  $("#snd").onclick=e=>{e.stopPropagation();unlockAudio();const ready=audioCtx&&audioCtx.state==="running";
    if(!soundOn){soundOn=true}else if(ready){beep();toast("Esse é o som de pedido novo")}
    try{localStorage.setItem("gb_sound",soundOn?"on":"off")}catch{};soundBtn()};
  $("#snd").oncontextmenu=e=>{e.preventDefault();soundOn=!soundOn;try{localStorage.setItem("gb_sound",soundOn?"on":"off")}catch{};soundBtn()};
  openBtn(); soundBtn(); menu(); listenOrders(); go(location.hash.slice(1)||"pedidos");
}
function openBtn(){const b=$("#ob");b.className="openbtn"+(S.is_open?"":" off");b.innerHTML=`<i></i>${S.is_open?"Loja aberta · clique p/ fechar":"Loja fechada · clique p/ abrir"}`}
function menu(){
  $("#menu").innerHTML=MENU.map(([s,items])=>`<div class="sec">${s}</div>`+items.map(([k,i,l])=>`<button data-p="${k}" aria-current="${page===k}"><span>${i}</span>${l}${k==="pedidos"&&newCount?`<span class="badge">${newCount}</span>`:""}</button>`).join("")).join("");
  $$("#menu [data-p]").forEach(b=>b.onclick=()=>{go(b.dataset.p);$("#side").classList.remove("open")});
}
const PAGES={};
function go(p){if(!PAGES[p])p="pedidos";page=p;location.hash=p;menu();closeDr();const m=$("#main");m.innerHTML='<div class="empty">Carregando…</div>';PAGES[p](m).catch(e=>{m.innerHTML=`<div class="empty">Não foi possível carregar. ${esc(e.message||"")}</div>`})}

/* ---------- avisos de pedido novo ---------- */
let audioCtx=null, soundOn=(()=>{try{return localStorage.getItem("gb_sound")!=="off"}catch{return true}})(), lastNew=null;
function unlockAudio(){if(!audioCtx){try{audioCtx=new (window.AudioContext||window.webkitAudioContext)()}catch{}}if(audioCtx&&audioCtx.state==="suspended")audioCtx.resume();soundBtn()}
document.addEventListener("click",unlockAudio);
function beep(){
  if(!soundOn||!audioCtx||audioCtx.state!=="running")return;
  [[0,880],[0.18,1175],[0.36,880],[0.54,1175],[0.9,880],[1.08,1175]].forEach(([t,f])=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type="square";o.frequency.value=f;o.connect(g);g.connect(audioCtx.destination);const s=audioCtx.currentTime+t;g.gain.setValueAtTime(0.0001,s);g.gain.exponentialRampToValueAtTime(0.35,s+0.02);g.gain.exponentialRampToValueAtTime(0.0001,s+0.16);o.start(s);o.stop(s+0.17)});
}
function soundBtn(){const b=$("#snd");if(!b)return;const ready=audioCtx&&audioCtx.state==="running";
  b.className="openbtn"+(soundOn&&ready?"":" off");b.innerHTML=`<i></i>${!soundOn?"🔕 Som desligado · clique p/ ligar":ready?"🔔 Som ligado · clique p/ testar":"🔔 Clique aqui p/ ativar o som"}`}
async function countNew(){
  const {count,error}=await sb.from("orders").select("id",{count:"exact",head:true}).eq("status","novo"); if(error) return;
  const n=count||0;
  if(lastNew!==null&&n>lastNew){beep();toast("🔔 Pedido novo chegou!");if(page==="pedidos"&&!ov.innerHTML)PAGES.pedidos($("#main"),true)}
  lastNew=n; newCount=n; menu(); document.title=(newCount?`(${newCount}) 🔔 `:"")+"Painel · "+S.name;
}
function listenOrders(){
  countNew();
  sb.channel("orders").on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>{
    countNew(); if(page==="pedidos"&&!ov.innerHTML) PAGES.pedidos($("#main"),true);
  }).subscribe();
  setInterval(countNew,15000);                                   // confere a cada 15 s, mesmo sem conexão ao vivo
  setInterval(()=>{if(newCount>0)beep()},20000);                 // repete o alarme enquanto tiver pedido sem aceitar
  setInterval(()=>{if(page==="pedidos"&&!ov.innerHTML)PAGES.pedidos($("#main"),true)},60000);
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
    ${audioCtx&&audioCtx.state==="running"?"":`<p class="alert" style="margin:0 0 12px">🔔 O navegador só libera o som depois de um clique. <b>Clique em qualquer lugar desta tela</b> (ou no botão "Ativar o som" do menu) toda vez que abrir o painel.</p>`}
    <div class="board">${cols.map(([c,l])=>{const list=rows.filter(o=>inCol(o,c));return `<div class="col"><h3><span>${l}</span><span class="muted">${list.length}</span></h3>${list.map(o=>`<button class="oc ${o.status==="novo"?"new":""}" data-o="${o.id}"><div class="h"><span>#${o.number} · ${esc(o.customer_name||"Balcão")}</span><span class="price">${brl(o.total)}</span></div><div class="m">${o.type==="delivery"?"🛵 "+esc(o.neighborhood||""):o.type==="retirada"?"🏪 Retirada":"🧾 Balcão"} · ${esc(o.payment_method||"")} · há ${ago(o.created_at)}</div></button>`).join("")||'<p class="muted" style="margin:6px">Nenhum</p>'}</div>`}).join("")}</div>`;
  $("#np").onclick=()=>go("novo");
  $$("[data-o]",m).forEach(b=>b.onclick=()=>orderDrawer(+b.dataset.o));
};
const WA_LABEL={em_preparo:"Pedido aceito / em preparo",saiu_entrega:"Saiu para entrega",pronto:"Pronto para retirada",concluido:"Concluído (agradecimento + avaliação)"};
const WA_DEFAULT={em_preparo:"Olá, {nome}! 😃 Recebemos seu pedido *#{numero}* no {loja} e já estamos preparando. 🍻\nTotal: {total}",saiu_entrega:"🛵 {nome}, seu pedido *#{numero}* saiu para entrega! Já já chega aí. 🍻",pronto:"✅ {nome}, seu pedido *#{numero}* está pronto pra retirada aqui no {loja}!",concluido:"Obrigado pela preferência, {nome}! 🙏💛\nEsperamos te encontrar em breve.\nO {loja} agradece! 🍻\n\n⭐ Avalie seu pedido, leva 10 segundos:\n{link_avaliacao}"};
const notifyOn=()=>{try{return localStorage.getItem("gb_notify")!=="off"}catch{return true}};
function waText(o,status){
  const tpl=((S.wa_templates||{})[status])||WA_DEFAULT[status]; if(!tpl) return null;
  const first=String(o.customer_name||"").trim().split(/\s+/)[0]||"";
  return tpl.replace(/\{nome\}/g,first).replace(/\{numero\}/g,o.number).replace(/\{loja\}/g,S.name).replace(/\{total\}/g,brl(o.total))
    .replace(/\{link_pedido\}/g,`${location.origin}/?pedido=${o.id}&tel=${digits(o.customer_phone)}`)
    .replace(/\{link_avaliacao\}/g,`${location.origin}/?avaliar=${o.id}&tel=${digits(o.customer_phone)}`);
}
function waLink(o,status){const txt=waText(o,status), ph=digits(o.customer_phone); if(!txt||ph.length<10) return null; return waURL(ph,txt)}
function waURL(phone,txt){const ph=digits(phone).replace(/^55(?=\d{10,11}$)/,"");return `https://api.whatsapp.com/send?phone=55${ph}${txt?"&text="+encodeURIComponent(txt):""}`}
const NEXT={novo:["em_preparo","✅ Aceitar pedido"],em_preparo:[null,""],saiu_entrega:["concluido","✔️ Entregue / concluir"],pronto:["concluido","✔️ Retirado / concluir"]};
async function orderDrawer(id){
  const o=await q(sb.from("orders").select("*,order_items(*)").eq("id",id).single());
  const items=o.order_items.sort((a,b)=>a.id-b.id);
  const change=o.change_for?o.change_for-o.total:0;
  const addr=o.type==="delivery"?`${o.street||o.address||""}${o.street_number?", "+o.street_number:""}`:"";
  const maps=addr?`https://maps.google.com/?q=${encodeURIComponent(addr+", "+(o.neighborhood||""))}`:"";
  let next=NEXT[o.status]; if(o.status==="em_preparo") next=o.type==="delivery"?["saiu_entrega","🛵 Saiu para entrega"]:["pronto","🏪 Pronto p/ retirada"];
  if(o.status==="em_preparo"&&o.type==="balcao") next=["concluido","✔️ Concluir"];
  const wa=o.customer_phone&&digits(o.customer_phone).length>=10?waURL(o.customer_phone):"";
  const nextWa=next&&next[0]&&notifyOn()?waLink(o,next[0]):null, curWa=waLink(o,o.status);
  const dr=drawer(`Pedido #${o.number} ${pill(o.status)}`,`
    <div class="muted">${dt(o.created_at)} · ${o.type==="delivery"?"🛵 Entrega"+(o.distance_km!=null?" · "+String(o.distance_km).replace(".",",")+" km":""):o.type==="retirada"?"🏪 Retirada":"🧾 Balcão"}</div>
    ${o.customer_phone&&o.type!=="balcao"?`<label class="chk"><input type="checkbox" id="nt" ${notifyOn()?"checked":""}> Avisar o cliente no WhatsApp quando eu mudar o status</label>`:""}
    ${curWa?`<a class="btn o sm" href="${curWa}" target="_blank" rel="noopener" style="justify-self:start">📲 Enviar aviso de "${STATUS[o.status]}" de novo</a>`:""}
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
     ${o.status!=="cancelado"&&o.status!=="concluido"?`<button class="btn r" id="cc">Cancelar</button>`:""}${next&&next[0]?(nextWa?`<a class="btn" id="nx" href="${nextWa}" target="_blank" rel="noopener">${next[1]} + 📲</a>`:`<button class="btn" id="nx">${next[1]}</button>`):""}`);
  const setSt=async(s,reopen)=>{await q(sb.from("orders").update({status:s}).eq("id",o.id));toast(STATUS[s]);countNew();if(page==="pedidos")PAGES.pedidos($("#main"));
    if(reopen&&notifyOn()&&waLink({...o,status:s},s)) orderDrawer(o.id); else closeDr()};
  if($("#nt",dr)) $("#nt",dr).onchange=e=>{try{localStorage.setItem("gb_notify",e.target.checked?"on":"off")}catch{};orderDrawer(o.id)};
  if($("#nx",dr)) $("#nx",dr).onclick=()=>setSt(next[0]);
  if($("#st",dr)) $("#st",dr).onchange=e=>setSt(e.target.value,true);
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
  const [cats,prods,zones]=await Promise.all([q(sb.from("categories").select("*").order("sort_order")),q(sb.from("products").select("id,name,price,promo_price,price_tiers,category_id,status").eq("status","ativo").order("name")),q(sb.from("delivery_zones").select("*").eq("active",true).order("neighborhood"))]);
  let cart=[], type=IN_WA?"delivery":"balcao", term="", catF="", custs=null, found=null, done=null;
  const f={name:"",phone:"",zone:zones[0]?String(zones[0].id):"",nb:"",street:"",num:"",comp:"",ref:"",pay:(S.payment_methods||[])[0]||"Pix",troco:"",fee:"",obs:""};
  const KM=S.delivery_mode==="km";
  const base=p=>p.promo_price!=null&&+p.promo_price<+p.price?+p.promo_price:+p.price;
  const pr=p=>{const q=(cart.find(i=>i.p===p)||{n:0}).n;let b=base(p);(p.price_tiers||[]).forEach(x=>{if(q>=x.min_qty&&+x.price<b)b=+x.price});return b};
  const sub=()=>cart.reduce((s,i)=>s+pr(i.p)*i.n,0);
  const feeNow=()=>type!=="delivery"?0:KM?(num(f.fee)||0):+((zones.find(z=>String(z.id)===f.zone)||{}).fee||0);
  async function lookup(){
    const d=digits(f.phone); if(d.length<10){found=null;return}
    if(!custs) custs=await q(sb.from("customers").select("*").limit(5000));
    const c=custs.find(x=>digits(x.phone).slice(-9)===d.slice(-9));
    found=c||null;
    if(c){ if(!f.name)f.name=c.name||""; if(!f.street)f.street=c.street||""; if(!f.num)f.num=c.street_number||""; if(!f.ref)f.ref=c.reference||""; if(!f.comp)f.comp=c.complement||"";
      if(c.neighborhood){f.nb=c.neighborhood;const z=zones.find(z=>z.neighborhood.toLowerCase()===c.neighborhood.toLowerCase());if(z)f.zone=String(z.id)} }
  }
  function fromChat(info){
    if(!info) return; const t=String(info.title||"").trim(), d=digits(t);
    if(d.length>=10&&d.length<=13&&/^[\d\s()+\-]+$/.test(t)){f.phone=t}else if(t){f.name=t}
    if(info.phone) f.phone=info.phone;
    lookup().then(draw);
  }
  waBridge.onChat=fromChat;
  function summary(r){
    const L=[`*Pedido #${r.number} · ${S.name}*`,""];
    cart.forEach(i=>L.push(`${i.n}x ${i.p.name} — ${brl(pr(i.p)*i.n)}`));
    L.push("",`Subtotal: ${brl(r.subtotal)}`);
    if(type==="delivery") L.push(`Entrega: ${+r.delivery_fee?brl(r.delivery_fee):"Grátis"}`);
    if(+r.discount) L.push(`Desconto: - ${brl(r.discount)}`);
    L.push(`*Total: ${brl(r.total)}*`,`Pagamento: ${f.pay}`);
    if(r.change!=null) L.push(`💵 Paga com ${brl(num(f.troco))} · troco de ${brl(r.change)}`);
    if(type==="delivery") L.push("",`📍 ${f.street}, ${f.num}${f.comp?" ("+f.comp+")":""}${(KM?f.nb:(zones.find(z=>String(z.id)===f.zone)||{}).neighborhood)?" - "+(KM?f.nb:(zones.find(z=>String(z.id)===f.zone)||{}).neighborhood):""}`,...(f.ref?["Ref.: "+f.ref]:[]),"",`🛵 Prazo: ${S.delivery_time_min}-${S.delivery_time_max} min`);
    else if(type==="retirada") L.push("",`🏪 Retirada na loja em ${S.prep_time_min||10} min`);
    L.push("","Obrigado pela preferência! 🍻");
    return L.join("\n");
  }
  const draw=()=>{
    if(done) return doneView();
    const list=prods.filter(p=>(!term||p.name.toLowerCase().includes(term))&&(!catF||String(p.category_id)===catF)).slice(0,80);
    const tot=sub()+feeNow();
    const inp=(k,l,extra="")=>`<label class="fld"><span>${l}</span><input class="in" data-f="${k}" value="${esc(f[k])}" ${extra}></label>`;
    m.innerHTML=`<div class="top"><h1>Novo pedido</h1>${IN_WA?`<button class="btn o sm" id="pull">📥 Puxar cliente da conversa</button>`:""}</div>
    <div class="cat2" style="grid-template-columns:minmax(0,1fr) 360px">
      <div><div class="row" style="flex-wrap:nowrap"><input class="in" id="ns" placeholder="Buscar produto…" value="${esc(term)}"><select class="in" id="nc" style="max-width:170px"><option value="">Todas as categorias</option>${cats.map(c=>`<option value="${c.id}" ${String(c.id)===catF?"selected":""}>${esc(c.name)}</option>`).join("")}</select></div>
        <div class="tw" style="margin-top:10px;max-height:${IN_WA?"38vh":"60vh"};overflow:auto"><table><tbody>${list.map(p=>`<tr><td>${esc(p.name)}${(p.price_tiers||[]).length?` <span class="muted" style="font-size:11px">🔥 ${p.price_tiers.map(x=>x.min_qty+"+ "+brl(x.price)).join(" · ")}</span>`:""}</td><td class="num price">${brl(pr(p))}</td><td class="num"><button class="btn sm" data-a="${p.id}" aria-label="Adicionar">+</button></td></tr>`).join("")||'<tr><td class="empty">Nada encontrado.</td></tr>'}</tbody></table></div></div>
      <div class="card grid" style="align-content:start">
        <div class="tabs" style="margin:0">${[["balcao","Balcão"],["retirada","Retirada"],["delivery","Entrega"]].map(([k,l])=>`<button data-t="${k}" aria-current="${type===k}">${l}</button>`).join("")}</div>
        ${cart.map((i,k)=>`<div class="line"><div><b>${i.n}x</b> ${esc(i.p.name)}${pr(i.p)<base(i.p)?` <span style="color:var(--green);font-size:12px">atacado</span>`:""}</div><div class="row" style="flex-wrap:nowrap"><span>${brl(pr(i.p)*i.n)}</span><button class="icb" data-m="${k}" aria-label="Diminuir">−</button><button class="icb" data-p="${k}" aria-label="Aumentar">+</button></div></div>`).join("")||'<p class="muted" style="margin:0">Adicione produtos.</p>'}
        <div class="line"><span class="muted">Subtotal</span><span>${brl(sub())}</span></div>
        ${type==="delivery"?`<div class="line"><span class="muted">Entrega</span><span>${brl(feeNow())}</span></div>`:""}
        <div class="line big"><span>Total</span><span class="price">${brl(tot)}</span></div>
        ${inp("phone","Telefone / WhatsApp",'inputmode="tel"')}
        ${found?`<p class="ok" style="margin:-4px 0 0">✓ Cliente já cadastrado${custs?"":""}, dados preenchidos</p>`:""}
        ${inp("name","Nome do cliente")}
        ${type==="delivery"?`${KM?inp("nb","Bairro")+inp("fee","Taxa de entrega (R$)",'inputmode="decimal" placeholder="0,00"'):`<label class="fld"><span>Bairro</span><select class="in" data-f="zone">${zones.map(z=>`<option value="${z.id}" ${String(z.id)===f.zone?"selected":""}>${esc(z.neighborhood)} · ${brl(z.fee)}</option>`).join("")}</select></label>`}
          <div class="grid" style="grid-template-columns:1fr 80px">${inp("street","Rua")}${inp("num","Nº")}</div>${inp("comp","Complemento")}${inp("ref","Referência")}`:""}
        <label class="fld"><span>Pagamento</span><select class="in" data-f="pay">${(S.payment_methods||[]).concat(["Fiado"]).map(p=>`<option ${p===f.pay?"selected":""}>${esc(p)}</option>`).join("")}</select></label>
        ${/dinheiro/i.test(f.pay)?inp("troco","Troco para (R$)",'inputmode="decimal" placeholder="0,00"')+(num(f.troco)>tot?`<p class="ok" style="margin:-4px 0 0">Levar ${brl(num(f.troco)-tot)} de troco</p>`:""):""}
        ${inp("obs","Observação")}
        <p class="err" id="e" hidden></p><button class="btn" id="fz" ${cart.length?"":"disabled"}>Lançar pedido</button></div></div>`;
    $("#ns").oninput=e=>{term=e.target.value.toLowerCase();const pos=e.target.selectionStart;draw();$("#ns").focus();$("#ns").setSelectionRange(pos,pos)};
    $("#nc").onchange=e=>{catF=e.target.value;draw()};
    if($("#pull"))$("#pull").onclick=()=>waBridge.ask();
    $$("[data-f]",m).forEach(i=>{const k=i.dataset.f;
      i.oninput=()=>{f[k]=i.value; if(k==="fee"||k==="troco"||k==="zone"){const pos=i.selectionStart;draw();const n=$(`[data-f="${k}"]`,m);if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch{}}}};
      i.onchange=async()=>{f[k]=i.value; if(k==="phone"){await lookup();draw()} if(k==="pay"||k==="zone")draw()}});
    $$("[data-a]",m).forEach(b=>b.onclick=()=>{const p=prods.find(x=>x.id==b.dataset.a);const i=cart.find(x=>x.p===p);i?i.n++:cart.push({p,n:1});draw()});
    $$("[data-m]",m).forEach(b=>b.onclick=()=>{const i=cart[+b.dataset.m];i.n--;if(!i.n)cart.splice(+b.dataset.m,1);draw()});
    $$("[data-p]",m).forEach(b=>b.onclick=()=>{cart[+b.dataset.p].n++;draw()});
    $$("[data-t]",m).forEach(b=>b.onclick=()=>{type=b.dataset.t;draw()});
    $("#fz").onclick=async()=>{
      const err=t=>{$("#e").hidden=false;$("#e").textContent=t};
      if(type==="delivery"&&(!f.street||!f.num)) return err("Preencha rua e número.");
      if(f.pay==="Fiado"&&digits(f.phone).length<10) return err("Pra lançar no fiado, informe o telefone do cliente.");
      if(/dinheiro/i.test(f.pay)&&f.troco&&!(num(f.troco)>sub()+feeNow())) return err("O troco precisa ser maior que o total.");
      $("#fz").disabled=true;
      try{
        const z=zones.find(z=>String(z.id)===f.zone);
        const r=await q(sb.rpc("create_order",{p:{customer_name:f.name||"Cliente balcão",customer_phone:f.phone,type,
          zone_id:type==="delivery"&&!KM&&z?z.id:null,fee_override:type==="delivery"?String(feeNow()):"",neighborhood:type==="delivery"?(KM?f.nb:(z||{}).neighborhood||""):"",
          street:f.street,street_number:f.num,complement:f.comp,reference:f.ref,payment_method:f.pay,change_for:/dinheiro/i.test(f.pay)&&f.troco?String(num(f.troco)):"",notes:f.obs,
          items:cart.map(i=>({product_id:i.p.id,qty:i.n}))}}));
        await q(sb.from("orders").update({status:type==="balcao"?"concluido":"em_preparo"}).eq("id",r.id));
        if(f.pay==="Fiado"){const o=await q(sb.from("orders").select("customer_id").eq("id",r.id).single());if(o.customer_id)await q(sb.from("credit_entries").insert({customer_id:o.customer_id,kind:"compra",amount:r.total,description:"Pedido #"+r.number,order_id:r.id}))}
        custs=null; done={r,text:summary(r),phone:f.phone}; toast("Pedido #"+r.number+" lançado");
        if(IN_WA) waBridge.insert(done.text);
        draw();
      }catch(e){$("#fz").disabled=false;err(e.message)}
    };
  };
  function doneView(){
    m.innerHTML=`<div class="top"><h1>Pedido #${done.r.number} lançado ✓</h1></div><div class="card grid" style="max-width:520px">
      ${IN_WA?'<p class="ok" style="margin:0">O resumo foi colado na conversa do WhatsApp. Confira e aperte <b>enviar</b>.</p>':""}
      <pre style="white-space:pre-wrap;margin:0;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;font:12.5px/1.5 ui-monospace,monospace" id="sm"></pre>
      <div class="row">${IN_WA?'<button class="btn o" id="again">📋 Colar de novo no WhatsApp</button>':`<button class="btn o" id="cp">Copiar resumo</button>${digits(done.phone).length>=10?`<a class="btn o" target="_blank" rel="noopener" href="${waURL(done.phone,done.text)}">📲 Enviar pro cliente</a>`:""}`}
      <button class="btn" id="nw">➕ Novo pedido</button><button class="btn o" id="vp">Ver pedidos</button></div></div>`;
    $("#sm").textContent=done.text;
    if($("#again"))$("#again").onclick=()=>waBridge.insert(done.text);
    if($("#cp"))$("#cp").onclick=async()=>{try{await navigator.clipboard.writeText(done.text);toast("Copiado")}catch{toast("Selecione o texto e copie")}};
    $("#nw").onclick=()=>PAGES.novo(m); $("#vp").onclick=()=>go("pedidos");
  }
  await draw();
  if(IN_WA) waBridge.ask();
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
      ${list.map(p=>`<tr><td>${p.image_url?`<img class="thumb" src="${esc(p.image_url)}" alt="">`:'<div class="thumb"></div>'}</td><td><b>${esc(p.name)}</b>${p.featured?' <span class="pill p-novo">Destaque</span>':""}${p.is_new?' <span class="pill p-novo">Novidade</span>':""}${(p.price_tiers||[]).length?` <span class="pill p-concluido" title="${p.price_tiers.map(x=>x.min_qty+"+ un: "+brl(x.price)).join(" · ")}">🔥 Atacado</span>`:""}${term?`<div class="muted" style="font-size:12px">${esc((cats.find(c=>c.id===p.category_id)||{}).name||"")}</div>`:""}</td>
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
      {k:"cost_price",l:"Preço de custo (R$) · só você vê",t:"money"},{k:"track_stock",l:"Controlar estoque deste produto",t:"check"},{k:"stock_qty",l:"Estoque atual",t:"money"},{k:"stock_min",l:"Estoque mínimo (avisa quando chegar)",t:"money"},
      {k:"stock_parent_id",l:"📦 Usa o estoque de outro produto? (ex.: o fardo \"12 x Amstel\" usa o estoque da \"Amstel Lata\")",t:"select",num:true,o:[["","Não, tem estoque próprio"]].concat(prods.filter(x=>(!p||x.id!==p.id)&&!x.stock_parent_id).map(x=>[x.id,x.name]))},
      {k:"stock_factor",l:"Quantas unidades saem do estoque a cada 1 vendido (ex.: 12)",t:"money"}];
    const linked=new Set(pcs.filter(x=>p&&x.product_id===p.id).map(x=>x.group_id));
    const dr=drawer(p?"Editar produto":"Novo produto",formHTML(PF,p||{category_id:catSel,status:"ativo"})+
      `<div class="card grid" style="gap:8px"><b>🔥 Preço por quantidade (atacado)</b><p class="muted" style="margin:0;font-size:12px">Ex.: a partir de 12 un sai R$ 6,80 cada; a partir de 24 un, R$ 6,70. Conta tudo desse produto que o cliente colocar na sacola.</p>
        <div id="tiers" class="grid" style="gap:6px"></div><button class="btn o sm" type="button" id="addt" style="justify-self:start">➕ Adicionar faixa</button></div>`+
      (groups.length?`<div class="fld"><span>Complementos que o cliente pode escolher</span>${groups.map(g=>`<label class="chk"><input type="checkbox" data-gr="${g.id}" ${linked.has(g.id)?"checked":""}> ${esc(g.name)}</label>`).join("")}</div>`:"")+'<p class="err" id="e" hidden></p>',
      `${p?'<button class="btn r" id="del">Excluir</button>':""}<button class="btn" id="sv">Salvar</button>`);
    wireImgs(dr);
    const tierRow=(x={})=>{const r=document.createElement("div");r.className="row";r.style.flexWrap="nowrap";
      r.innerHTML=`<span class="muted" style="white-space:nowrap">A partir de</span><input class="in" data-tm inputmode="numeric" style="width:80px" value="${x.min_qty||""}" placeholder="12"><span class="muted" style="white-space:nowrap">un, R$</span><input class="in" data-tp inputmode="decimal" style="width:100px" value="${x.price!=null?money(x.price):""}" placeholder="6,80"><span class="muted">cada</span><button class="icb" type="button" aria-label="Remover faixa">✕</button>`;
      $("button",r).onclick=()=>r.remove(); $("#tiers",dr).append(r)};
    ((p&&p.price_tiers)||[]).forEach(tierRow);
    $("#addt",dr).onclick=()=>tierRow();
    $("#sv",dr).onclick=async()=>{const v=readForm(PF,dr);
      const tiers=$$("#tiers .row",dr).map(r=>({min_qty:parseInt($("[data-tm]",r).value),price:num($("[data-tp]",r).value)})).filter(x=>x.min_qty>1&&x.price>0).sort((a,b)=>a.min_qty-b.min_qty);
      if(tiers.some(x=>v.price!=null&&x.price>=v.price)){$("#e",dr).hidden=false;$("#e",dr).textContent="O preço por quantidade precisa ser menor que o preço normal ("+brl(v.price)+").";return}
      v.price_tiers=tiers;
      if(!v.name||v.price==null){$("#e",dr).hidden=false;$("#e",dr).textContent="Preencha nome e preço.";return}
      if(v.promo_price!=null&&v.promo_price>=v.price){$("#e",dr).hidden=false;$("#e",dr).textContent="O preço de promoção precisa ser menor que o preço normal.";return}
      v.stock_qty=v.stock_qty??0; v.stock_min=v.stock_min??0;
      if(!v.stock_parent_id&&!prods.some(x=>x.stock_parent_id===(p&&p.id))){
        const nm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
        const mm=String(v.name).match(/^\s*(\d+)\s*x\s*(.+)$/i);
        const par=mm&&+mm[1]>1?prods.find(x=>(!p||x.id!==p.id)&&!x.stock_parent_id&&nm(x.name)===nm(mm[2])):null;
        if(par){v.stock_parent_id=par.id;v.stock_factor=+mm[1];toast(`📦 Ligado ao estoque de "${par.name}" (tira ${mm[1]} un)`)}
      }
      v.stock_factor=v.stock_parent_id?(v.stock_factor||1):1; if(v.stock_parent_id) v.track_stock=false;
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
  const [prods,cats]=await Promise.all([q(sb.from("products").select("id,name,price,promo_price,price_tiers,featured,is_new,status,category_id").neq("status","inativo").order("name")),q(sb.from("categories").select("id,name").order("sort_order"))]);
  let term="";
  const tiersTxt=p=>(p.price_tiers||[]).map(x=>`${x.min_qty}+ un: <b>${brl(x.price)}</b>`).join(" · ");
  const withT=prods.filter(p=>(p.price_tiers||[]).length);
  const draw=()=>{
    const list=prods.filter(p=>!term||p.name.toLowerCase().includes(term));
    $("#dl").innerHTML=list.slice(0,150).map(p=>`<tr><td>${esc(p.name)}${(p.price_tiers||[]).length?`<div class="muted" style="font-size:12px;color:var(--green)">🔥 ${tiersTxt(p)}</div>`:""}</td><td class="num">${brl(p.price)}</td>
      <td style="width:130px"><input class="in" data-pp="${p.id}" inputmode="decimal" placeholder="—" value="${money(p.promo_price)}"></td>
      <td><label class="chk"><input type="checkbox" data-ft="${p.id}" ${p.featured?"checked":""}> Destaque</label></td><td><label class="chk"><input type="checkbox" data-nw="${p.id}" ${p.is_new?"checked":""}> Novidade</label></td></tr>`).join("");
    $$("[data-pp]").forEach(i=>i.onchange=async()=>{const p=prods.find(x=>x.id==i.dataset.pp),v=num(i.value);if(v!=null&&v>=p.price){toast("Promoção precisa ser menor que "+brl(p.price));i.value=money(p.promo_price);return}await q(sb.from("products").update({promo_price:v}).eq("id",p.id));p.promo_price=v;toast(v==null?"Promoção removida":"Promoção salva")});
    $$("[data-ft]").forEach(i=>i.onchange=async()=>{await q(sb.from("products").update({featured:i.checked}).eq("id",+i.dataset.ft));prods.find(x=>x.id==i.dataset.ft).featured=i.checked;toast("Salvo")});
    $$("[data-nw]").forEach(i=>i.onchange=async()=>{await q(sb.from("products").update({is_new:i.checked}).eq("id",+i.dataset.nw));prods.find(x=>x.id==i.dataset.nw).is_new=i.checked;toast("Salvo")});
  };
  m.innerHTML=`<div class="top"><h1>Destaques e promoções</h1></div>
    <div class="card grid" style="margin-bottom:14px;border-color:rgba(61,220,132,.35)">
      <div class="row" style="justify-content:space-between"><div><b style="font-size:16px">🔥 Leve mais, pague menos</b><div class="muted" style="font-size:12.5px">Ex.: Heineken R$ 7,00 · levando 12 sai R$ 6,80 cada · levando 24, R$ 6,70. Você escolhe os produtos.</div></div><button class="btn" id="nt">➕ Nova promoção por quantidade</button></div>
      ${withT.length?`<div class="tw"><table><thead><tr><th>Produto</th><th class="num">Preço normal</th><th>Faixas</th><th></th></tr></thead><tbody>${withT.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td class="num">${brl(p.price)}</td><td style="color:var(--green)">${tiersTxt(p)}</td><td class="num"><button class="btn o sm" data-et="${p.id}">Editar</button> <button class="btn o sm" data-rt="${p.id}" style="color:var(--red)">Remover</button></td></tr>`).join("")}</tbody></table></div>`
        :'<p class="muted" style="margin:0">Nenhum produto com promoção por quantidade ainda.</p>'}</div>
    <div class="row" style="justify-content:space-between;margin-bottom:8px"><b>Preço promocional, destaques e novidades</b><input class="in" id="dq" placeholder="Buscar produto…" style="width:240px"></div>
    <p class="muted" style="margin-top:0">Preço de promoção aparece riscado no cardápio e no pop-up de Promoções. Destaques aparecem no topo. Salva sozinho.</p>
    <div class="stats"><div class="stat"><small>Em promoção</small><b>${prods.filter(p=>p.promo_price!=null).length}</b></div><div class="stat"><small>Destaques</small><b>${prods.filter(p=>p.featured).length}</b></div><div class="stat"><small>Leve mais, pague menos</small><b>${withT.length}</b></div></div>
    <div class="tw"><table><thead><tr><th>Produto</th><th class="num">Preço</th><th>Promoção (R$)</th><th></th><th></th></tr></thead><tbody id="dl"></tbody></table></div>`;
  $("#dq").oninput=e=>{term=e.target.value.toLowerCase();draw()};
  $("#nt").onclick=()=>tierEditor([]);
  $$("[data-et]",m).forEach(b=>b.onclick=()=>tierEditor([+b.dataset.et]));
  $$("[data-rt]",m).forEach(b=>b.onclick=async e=>{if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar";return}await q(sb.from("products").update({price_tiers:[]}).eq("id",+b.dataset.rt));toast("Promoção removida");PAGES.destaques(m)});
  draw();

  function tierEditor(preIds){
    const sel=new Set(preIds); let ft="", fc="";
    const first=prods.find(p=>p.id===preIds[0]);
    let mode="preco", rows=first&&(first.price_tiers||[]).length?first.price_tiers.map(x=>({q:x.min_qty,v:money(x.price)})):[{q:12,v:""},{q:24,v:""}];
    const dr=drawer(preIds.length===1?"Promoção por quantidade · "+esc(first.name):"Nova promoção por quantidade",`
      <div class="card grid"><b>1. Escolha os produtos</b>
        <div class="row" style="flex-wrap:nowrap"><input class="in" id="ts" placeholder="Buscar (ex.: lata, heineken)…"><select class="in" id="tc" style="max-width:170px"><option value="">Todas as categorias</option>${cats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
        <div class="row"><button class="btn o sm" id="ta" type="button">Marcar todos da lista</button><button class="btn o sm" id="tn" type="button">Desmarcar todos</button><span class="muted" id="tcnt"></span></div>
        <div id="tl" style="max-height:34vh;overflow:auto;display:grid;gap:2px"></div></div>
      <div class="card grid"><b>2. Como é o desconto</b>
        <select class="in" id="tm"><option value="preco">Preço final por unidade (R$) · ex.: 6,80</option><option value="reais">R$ a menos por unidade · ex.: 0,20</option><option value="pct">% de desconto · ex.: 3</option></select>
        <div id="tr" class="grid" style="gap:6px"></div><button class="btn o sm" id="tadd" type="button" style="justify-self:start">➕ Adicionar faixa</button>
        <p class="muted" id="tprev" style="margin:0;font-size:12.5px"></p></div><p class="err" id="e" hidden></p>`,
      `<button class="btn" id="tsv">Salvar promoção</button>`);
    const drawList=()=>{
      const list=prods.filter(p=>(!ft||p.name.toLowerCase().includes(ft))&&(!fc||String(p.category_id)===fc));
      $("#tl",dr).innerHTML=list.map(p=>`<label class="chk" style="font-weight:500;padding:4px 2px"><input type="checkbox" data-s="${p.id}" ${sel.has(p.id)?"checked":""}> ${esc(p.name)} <span class="muted">· ${brl(p.price)}</span></label>`).join("")||'<p class="muted">Nada encontrado.</p>';
      $$("[data-s]",dr).forEach(c=>c.onchange=()=>{c.checked?sel.add(+c.dataset.s):sel.delete(+c.dataset.s);upd()});
      upd();
      return list;
    };
    const drawRows=()=>{
      $("#tr",dr).innerHTML=rows.map((r,i)=>`<div class="row" style="flex-wrap:nowrap"><span class="muted" style="white-space:nowrap">A partir de</span><input class="in" data-q="${i}" inputmode="numeric" style="width:76px" value="${r.q}"><span class="muted" style="white-space:nowrap">un →</span><input class="in" data-v="${i}" inputmode="decimal" style="width:100px" value="${esc(r.v)}" placeholder="${mode==="preco"?"6,80":mode==="reais"?"0,20":"3"}"><span class="muted">${mode==="preco"?"R$ cada":mode==="reais"?"R$ a menos":"%"}</span><button class="icb" data-x="${i}" type="button" aria-label="Remover">✕</button></div>`).join("");
      $$("[data-q]",dr).forEach(i=>i.oninput=()=>{rows[+i.dataset.q].q=parseInt(i.value)||"";upd()});
      $$("[data-v]",dr).forEach(i=>i.oninput=()=>{rows[+i.dataset.v].v=i.value;upd()});
      $$("[data-x]",dr).forEach(b=>b.onclick=()=>{rows.splice(+b.dataset.x,1);drawRows()});
      upd();
    };
    const calc=(p,r)=>{const v=num(r.v);if(v==null)return null;const base=+p.price;
      const x=mode==="preco"?v:mode==="reais"?base-v:base*(1-v/100);return Math.round(x*100)/100};
    function upd(){
      $("#tcnt",dr).textContent=sel.size+" selecionado(s)";
      const p=prods.find(x=>sel.has(x.id));
      const ok=rows.filter(r=>r.q>1&&num(r.v)!=null).sort((a,b)=>a.q-b.q);
      $("#tprev",dr).innerHTML=p&&ok.length?`Exemplo · <b>${esc(p.name)}</b> (${brl(p.price)}): `+ok.map(r=>`${r.q}+ un = <b style="color:var(--green)">${brl(calc(p,r))}</b> cada`).join(" · ")+(sel.size>1?` <br>Os outros produtos usam o mesmo cálculo, cada um com o seu preço.`:""):"Marque os produtos e preencha as faixas pra ver o exemplo.";
    }
    let current=[];
    $("#ts",dr).oninput=e=>{ft=e.target.value.toLowerCase();current=drawList()};
    $("#tc",dr).onchange=e=>{fc=e.target.value;current=drawList()};
    $("#ta",dr).onclick=()=>{current.forEach(p=>sel.add(p.id));current=drawList()};
    $("#tn",dr).onclick=()=>{sel.clear();current=drawList()};
    $("#tm",dr).onchange=e=>{mode=e.target.value;rows.forEach(r=>r.v="");drawRows()};
    $("#tadd",dr).onclick=()=>{rows.push({q:"",v:""});drawRows()};
    $("#tsv",dr).onclick=async()=>{
      const err=x=>{$("#e",dr).hidden=false;$("#e",dr).textContent=x};
      if(!sel.size) return err("Marque pelo menos um produto.");
      const ok=rows.filter(r=>r.q>1&&num(r.v)!=null).sort((a,b)=>a.q-b.q);
      if(!ok.length) return err("Preencha pelo menos uma faixa (quantidade a partir de 2 e o valor).");
      const ups=[];
      for(const id of sel){const p=prods.find(x=>x.id===id);
        const tiers=ok.map(r=>({min_qty:r.q,price:calc(p,r)}));
        const bad=tiers.find(x=>!(x.price>0&&x.price<+p.price));
        if(bad) return err(`Em "${p.name}" o preço da faixa ficou ${brl(bad.price)}, que não é menor que o normal (${brl(p.price)}). Ajuste os valores.`);
        ups.push({id,tiers});}
      $("#tsv",dr).disabled=true;
      for(const u of ups) await q(sb.from("products").update({price_tiers:u.tiers}).eq("id",u.id));
      closeDr(); toast(`Promoção salva em ${ups.length} produto(s)`); PAGES.destaques(m);
    };
    current=drawList(); drawRows();
  }
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
      `${c&&c.phone?`<a class="btn o" target="_blank" rel="noopener" href="${waURL(c.phone)}">WhatsApp</a>`:""}<button class="btn" id="sv">Salvar</button>`);
    $("#sv",dr).onclick=async()=>{const v=readForm(CF,dr);if(!v.name){$("#e",dr).hidden=false;$("#e",dr).textContent="Informe o nome.";return}v.credit_limit=v.credit_limit??0;v.loyalty_points=v.loyalty_points??0;
      try{c?await q(sb.from("customers").update(v).eq("id",c.id)):await q(sb.from("customers").insert(v));closeDr();toast("Cliente salvo");PAGES.clientes(m)}catch(e){$("#e",dr).hidden=false;$("#e",dr).textContent=/duplicate|unique/i.test(e.message)?"Já existe um cliente com esse telefone.":e.message}};
    const fiado=async kind=>{const v=num($("#fv",dr).value);if(!v||v<=0){toast("Informe o valor");return}await q(sb.from("credit_entries").insert({customer_id:c.id,kind,amount:v,description:$("#fd",dr).value.trim()||null}));toast(kind==="compra"?"Compra lançada":"Pagamento registrado");closeDr();await PAGES.clientes(m);};
    if(c){$("#fc",dr).onclick=()=>fiado("compra");$("#fp",dr).onclick=()=>fiado("pagamento")}
  }
};

/* ================= AVALIAÇÕES ================= */
PAGES.avaliacoes=async m=>{
  const rv=await q(sb.from("reviews").select("*,orders(number,customer_phone)").order("created_at",{ascending:false}).limit(500));
  let f=0;
  const stars=n=>"★".repeat(n)+"☆".repeat(5-n);
  const draw=()=>{
    const list=f?rv.filter(r=>f==="bad"?r.rating<=3:r.rating===f):rv;
    $("#rl").innerHTML=list.map(r=>{const ph=r.orders&&r.orders.customer_phone;return `<div class="card" style="border-color:${r.rating<=2?"var(--red)":r.rating===3?"var(--orange)":"var(--line)"}">
      <div class="row" style="justify-content:space-between"><b>${esc(r.customer_name||"Cliente")}</b><span style="color:var(--y);font-size:18px;letter-spacing:2px">${stars(r.rating)}</span></div>
      <div class="muted" style="font-size:12px">Pedido #${r.orders?r.orders.number:"—"} · ${dt(r.created_at)}</div>
      ${r.comment?`<p style="margin:8px 0 0">“${esc(r.comment)}”</p>`:""}
      ${ph&&r.rating<=3?`<a class="btn o sm" style="margin-top:8px" target="_blank" rel="noopener" href="${waURL(ph,`Olá, ${String(r.customer_name||"").split(" ")[0]}! Aqui é do ${S.name}. Vimos sua avaliação do pedido #${r.orders.number} e queremos entender o que aconteceu pra melhorar. 🙏`)}">📲 Falar com o cliente</a>`:""}</div>`}).join("")||'<div class="empty">Nenhuma avaliação aqui ainda.</div>';
  };
  const avg=rv.length?rv.reduce((s,r)=>s+r.rating,0)/rv.length:0;
  const cnt=n=>rv.filter(r=>r.rating===n).length;
  m.innerHTML=`<div class="top"><h1>Avaliações</h1></div>
    <div class="stats"><div class="stat"><small>Nota média</small><b style="color:var(--y)">${rv.length?avg.toFixed(1).replace(".",","):"—"} ★</b></div><div class="stat"><small>Avaliações</small><b>${rv.length}</b></div>
      <div class="stat"><small>5 estrelas</small><b style="color:var(--green)">${cnt(5)}</b></div><div class="stat"><small>Nota 3 ou menos</small><b style="color:${rv.some(r=>r.rating<=3)?"var(--red)":"inherit"}">${rv.filter(r=>r.rating<=3).length}</b></div></div>
    <div class="card" style="margin-bottom:12px">${[5,4,3,2,1].map(n=>`<div class="row" style="flex-wrap:nowrap"><span style="width:28px">${n}★</span><div style="flex:1;height:8px;background:var(--card-2);border-radius:4px;overflow:hidden"><div style="height:100%;width:${rv.length?cnt(n)/rv.length*100:0}%;background:var(--y)"></div></div><span class="muted" style="width:30px;text-align:right">${cnt(n)}</span></div>`).join("")}</div>
    <div class="tabs">${[[0,"Todas"],["bad","Só as ruins (≤3)"],[5,"5★"],[4,"4★"],[3,"3★"],[2,"2★"],[1,"1★"]].map(([k,l])=>`<button data-f="${k}" aria-current="${f===k}">${l}</button>`).join("")}</div>
    <div class="grid g2" id="rl"></div>`;
  $$("[data-f]",m).forEach(b=>b.onclick=()=>{f=b.dataset.f==="bad"?"bad":+b.dataset.f;$$("[data-f]",m).forEach(x=>x.setAttribute("aria-current",x===b));draw()});
  draw();
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
  const prods=await q(sb.from("products").select("id,name,stock_qty,stock_min,track_stock,cost_price,status,stock_parent_id,stock_factor").order("name"));
  let term="", all=false;
  const draw=()=>{
    const kids=id=>prods.filter(x=>x.stock_parent_id===id);
    const list=prods.filter(p=>!p.stock_parent_id&&(all||p.track_stock)&&(!term||p.name.toLowerCase().includes(term)||kids(p.id).some(k=>k.name.toLowerCase().includes(term))));
    const sugg=autoLinks();
    const low=prods.filter(p=>p.track_stock&&+p.stock_qty<=+p.stock_min);
    $("#er").innerHTML=`<div class="stats"><div class="stat"><small>Produtos controlados</small><b>${prods.filter(p=>p.track_stock).length}</b></div><div class="stat"><small>Abaixo do mínimo</small><b style="color:${low.length?"var(--red)":"inherit"}">${low.length}</b></div><div class="stat"><small>Valor em estoque (custo)</small><b>${brl(prods.filter(p=>p.track_stock).reduce((s,p)=>s+Math.max(0,+p.stock_qty)*(+p.cost_price||0),0))}</b></div></div>
      ${sugg.length?`<div class="alert" style="margin-bottom:12px"><b>📦 Achei ${sugg.length} fardo(s) que podem usar o estoque da unidade</b> (ex.: "${esc(sugg[0].kid.name)}" → ${+sugg[0].f} un de "${esc(sugg[0].par.name)}"). <button class="btn sm" id="al" style="margin-left:6px">Ver e ligar</button></div>`:""}
      ${!prods.some(p=>p.track_stock)?'<p class="alert">Nenhum produto com estoque controlado ainda. Marque "Mostrar todos" abaixo e clique em <b>Controlar</b> nos produtos que quiser acompanhar.</p>':""}
      <div class="tw"><table><thead><tr><th>Produto</th><th class="num">Estoque</th><th class="num">Mínimo</th><th></th></tr></thead><tbody>${list.slice(0,300).map(p=>`<tr><td>${esc(p.name)} ${p.track_stock&&+p.stock_qty<=+p.stock_min?'<span class="pill p-cancelado">Repor</span>':""}${kids(p.id).map(k=>`<div class="muted" style="font-size:12px">↳ ${esc(k.name)} tira ${+k.stock_factor} un${p.track_stock?` · dá <b>${Math.max(0,Math.floor(+p.stock_qty/(+k.stock_factor||1)))}</b>`:""}</div>`).join("")}</td><td class="num"><b>${p.track_stock?+p.stock_qty:"—"}</b></td><td class="num">${p.track_stock?+p.stock_min:"—"}</td>
        <td class="num">${p.track_stock?`<button class="btn sm" data-in="${p.id}">Entrada</button> <button class="btn o sm" data-aj="${p.id}">Ajustar</button> <button class="btn o sm" data-hi="${p.id}">Histórico</button>`:`<button class="btn o sm" data-tr="${p.id}">Controlar</button>`}</td></tr>`).join("")||'<tr><td colspan="4" class="empty">Nada aqui.</td></tr>'}</tbody></table></div>`;
    if($("#al",m))$("#al",m).onclick=()=>{const dr=drawer("Ligar fardos ao estoque da unidade",`<p class="muted" style="margin:0">Cada fardo vendido vai tirar as unidades do estoque do produto da direita. Desmarque o que não estiver certo.</p>
      ${sugg.map((s,i)=>`<label class="chk" style="font-weight:500;align-items:flex-start"><input type="checkbox" data-l="${i}" checked> <span><b>${esc(s.kid.name)}</b><br><span class="muted">tira ${+s.f} un de</span> ${esc(s.par.name)}</span></label>`).join("")}`,`<button class="btn" id="lk">Ligar selecionados</button>`);
      $("#lk",dr).onclick=async()=>{const pick=$$("[data-l]",dr).filter(x=>x.checked).map(x=>sugg[+x.dataset.l]);$("#lk",dr).disabled=true;
        for(const s of pick){await q(sb.from("products").update({stock_parent_id:s.par.id,stock_factor:s.f,track_stock:false}).eq("id",s.kid.id));Object.assign(s.kid,{stock_parent_id:s.par.id,stock_factor:s.f,track_stock:false})}
        closeDr();toast(pick.length+" fardo(s) ligado(s)");draw()}};
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
  function autoLinks(){
    const nm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
    const out=[];
    prods.forEach(k=>{if(k.stock_parent_id)return;const mm=String(k.name).match(/^\s*(\d+)\s*x\s*(.+)$/i);if(!mm)return;
      const par=prods.find(x=>x.id!==k.id&&!x.stock_parent_id&&nm(x.name)===nm(mm[2]));if(par&&+mm[1]>1)out.push({kid:k,par,f:+mm[1]})});
    return out;
  }
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
  const KF=[{k:"km_base_fee",l:"Taxa mínima (R$)",t:"money"},{k:"km_base_km",l:"Até quantos km vale a taxa mínima",t:"money"},{k:"km_price",l:"Valor de cada km a mais (R$)",t:"money"},{k:"km_max",l:"Distância máxima de entrega (km)",t:"money"}];
  const F=[{k:"accepts_delivery",l:"Fazer entregas",t:"check"},{k:"accepts_pickup",l:"Aceitar retirada na loja",t:"check"},{k:"delivery_time_min",l:"Tempo de entrega mínimo (min)",t:"int"},{k:"delivery_time_max",l:"Tempo de entrega máximo (min)",t:"int"},{k:"prep_time_min",l:"Tempo pra retirada (min)",t:"int"},{k:"min_order",l:"Pedido mínimo (R$)",t:"money"}];
  const km=S.delivery_mode==="km";
  const ex=d=>+S.km_base_fee+Math.max(0,Math.ceil(d-(+S.km_base_km||0)))*(+S.km_price||0);
  m.innerHTML=`<div class="top"><h1>Delivery e bairros</h1>${km?"":'<button class="btn" id="nz">➕ Novo bairro</button>'}</div>
    <div class="card grid" style="margin-bottom:12px"><b>Como cobrar a entrega</b>
      <div class="tabs" style="margin:0"><button data-mode="bairro" aria-current="${!km}">Por bairro</button><button data-mode="km" aria-current="${km}">Por km (distância)</button></div>
      ${km?`<div class="grid g4">${formHTML(KF,S)}</div>
        <p class="muted" style="margin:0">Exemplo com esses valores: 1 km = ${brl(ex(1))} · 3 km = ${brl(ex(3))} · 5 km = ${brl(ex(5))}. A distância é em linha reta da loja até o cliente (costuma ser um pouco menor que o caminho pelas ruas).</p>
        <div class="grid g3"><label class="fld"><span>Latitude da loja</span><input class="in" id="slat" value="${S.store_lat??""}"></label><label class="fld"><span>Longitude da loja</span><input class="in" id="slng" value="${S.store_lng??""}"></label>
          <div class="fld"><span>&nbsp;</span><div class="row"><button class="btn o sm" id="gps">📍 Usar a localização deste aparelho</button><button class="btn o sm" id="geo">🔎 Buscar pelo endereço da loja</button></div></div></div>
        <p class="muted" style="margin:0" id="locmsg">${S.store_lat!=null?`Localização salva: <a target="_blank" rel="noopener" href="https://maps.google.com/?q=${S.store_lat},${S.store_lng}">conferir no mapa ↗</a>`:'<b style="color:var(--red)">Falta a localização da loja.</b> Estando na loja, clique em "Usar a localização deste aparelho".'}</p>
        <button class="btn" id="svk" style="justify-self:start">Salvar taxa por km</button>`:'<p class="muted" style="margin:0">Cada bairro tem a sua taxa. Cadastre os bairros abaixo.</p>'}</div>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 320px">${km?'<div class="card muted">Com a cobrança por km, os bairros não são usados.</div>':""}<div class="tw" ${km?"hidden":""}><table><thead><tr><th>Bairro</th><th class="num">Taxa</th><th class="num">Tempo</th><th></th></tr></thead><tbody>
    ${zs.map(z=>`<tr><td><b style="${z.active?"":"opacity:.45"}">${esc(z.neighborhood)}</b>${z.active?"":' <span class="pill p-inativo">Pausado</span>'}</td><td class="num">${+z.fee?brl(z.fee):"Grátis"}</td><td class="num">${z.eta_minutes?z.eta_minutes+" min":"padrão"}</td><td class="num"><button class="btn o sm" data-e="${z.id}">Editar</button></td></tr>`).join("")||'<tr><td colspan="4" class="empty">Cadastre os bairros que vocês entregam. <b>Sem bairro cadastrado o cliente não consegue pedir entrega.</b></td></tr>'}</tbody></table></div>
    <div class="card grid" style="align-content:start">${formHTML(F,S)}<button class="btn" id="sv">Salvar</button></div></div>
    <p class="muted">Dica: use o nome do bairro igual aos Correios (ex.: "Conjunto Ceará"), assim o CEP do cliente já encontra o bairro sozinho.</p>`;
  $("#sv").onclick=async()=>{const v=readForm(F,m);v.min_order=v.min_order??0;await q(sb.from("store_settings").update(v).eq("id",1));Object.assign(S,v);toast("Salvo")};
  $$("[data-mode]",m).forEach(b=>b.onclick=async()=>{await q(sb.from("store_settings").update({delivery_mode:b.dataset.mode}).eq("id",1));S.delivery_mode=b.dataset.mode;toast(b.dataset.mode==="km"?"Agora a entrega é cobrada por km":"Agora a entrega é cobrada por bairro");PAGES.delivery(m)});
  if(km){
    const setLoc=(la,ln,txt)=>{$("#slat").value=(+la).toFixed(6);$("#slng").value=(+ln).toFixed(6);$("#locmsg").innerHTML=`${txt} <a target="_blank" rel="noopener" href="https://maps.google.com/?q=${la},${ln}">conferir no mapa ↗</a> · clique em Salvar`};
    $("#gps").onclick=()=>{if(!navigator.geolocation){toast("Este aparelho não tem localização");return}$("#locmsg").textContent="Pegando a localização…";
      navigator.geolocation.getCurrentPosition(p=>setLoc(p.coords.latitude,p.coords.longitude,`Localização encontrada (precisão ~${Math.round(p.coords.accuracy)} m).`),()=>{$("#locmsg").textContent="Não deu pra pegar a localização. Permita o acesso à localização no navegador ou use a busca pelo endereço."},{enableHighAccuracy:true,timeout:15000})};
    $("#geo").onclick=async()=>{if(!S.address){toast("Preencha o endereço da loja em Configurações primeiro");return}$("#locmsg").textContent="Buscando…";
      try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(S.address)}`);const j=await r.json();
        if(!j[0]){$("#locmsg").textContent="Não achei esse endereço no mapa. Use a localização do aparelho estando na loja.";return}setLoc(j[0].lat,j[0].lon,"Achei pelo endereço.")}catch{$("#locmsg").textContent="A busca falhou. Tente a localização do aparelho."}};
    $("#svk").onclick=async()=>{const v=readForm(KF,m);v.store_lat=parseFloat($("#slat").value);v.store_lng=parseFloat($("#slng").value);if(isNaN(v.store_lat)||isNaN(v.store_lng)){toast("Falta a localização da loja");return}
      v.km_base_fee=v.km_base_fee??0;v.km_base_km=v.km_base_km??0;v.km_price=v.km_price??0;v.km_max=v.km_max??0;
      await q(sb.from("store_settings").update(v).eq("id",1));Object.assign(S,v);toast("Taxa por km salva");PAGES.delivery(m)};
  }
  const ZF=[{k:"neighborhood",l:"Nome do bairro"},{k:"fee",l:"Taxa de entrega (R$) · 0 = grátis",t:"money"},{k:"eta_minutes",l:"Tempo de entrega (min) · vazio = padrão",t:"int"},{k:"active",l:"Entregando nesse bairro",t:"check"}];
  const edit=z=>{const dr=drawer(z?"Editar bairro":"Novo bairro",formHTML(ZF,z||{active:true,fee:0})+'<p class="err" id="e" hidden></p>',`${z?'<button class="btn r" id="del">Excluir</button>':""}<button class="btn" id="sv2">Salvar</button>`);
    $("#sv2",dr).onclick=async()=>{const v=readForm(ZF,dr);if(!v.neighborhood){$("#e",dr).hidden=false;$("#e",dr).textContent="Informe o bairro.";return}v.fee=v.fee??0;z?await q(sb.from("delivery_zones").update(v).eq("id",z.id)):await q(sb.from("delivery_zones").insert(v));closeDr();toast("Bairro salvo");PAGES.delivery(m)};
    if(z)$("#del",dr).onclick=async e=>{if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar exclusão";return}await q(sb.from("delivery_zones").delete().eq("id",z.id));closeDr();PAGES.delivery(m)}};
  if($("#nz"))$("#nz").onclick=()=>edit(null); $$("[data-e]",m).forEach(b=>b.onclick=()=>edit(zs.find(x=>x.id==b.dataset.e)));
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
    <div class="card grid"><b>Mensagens do WhatsApp pro cliente</b><p class="muted" style="margin:0;font-size:12px">Use {nome}, {numero}, {total}, {loja}, {link_pedido} (acompanhar pedido) e {link_avaliacao} (página de avaliação com estrelas). Ao mudar o status do pedido, o WhatsApp abre com a mensagem pronta, é só apertar enviar.</p>
      ${Object.entries(WA_LABEL).map(([k,l])=>`<label class="fld"><span>${l}</span><textarea class="in" rows="3" id="wa_${k}">${esc(((S.wa_templates||{})[k])||WA_DEFAULT[k])}</textarea></label>`).join("")}
      <label class="fld"><span>Link de avaliação no Google (opcional). Quem der 4 ou 5 estrelas no nosso link é convidado a avaliar no Google também</span><input class="in" id="rv" value="${esc(S.review_url||"")}"></label></div>
    <div class="card"><b>Link do cardápio pros clientes</b><p style="word-break:break-all"><a href="/" target="_blank" rel="noopener">${location.origin}/</a></p><button class="btn o sm" id="cpl">Copiar link</button></div></div></div>`;
  wireImgs(m);
  $("#cpl").onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+"/");toast("Link copiado")}catch{toast(location.origin+"/")}};
  $("#sv").onclick=async()=>{const v=readForm(F,m);
    if(!v.name){toast("Informe o nome da loja");return}
    v.opening_hours=Object.fromEntries(DAYS.map(([k])=>[k,{open:$(`#h_${k}_o`).value||"00:00",close:$(`#h_${k}_c`).value||"00:00",closed:$(`#h_${k}_x`).checked}]));
    v.payment_methods=$$("[data-pay]",m).filter(x=>x.checked).map(x=>x.dataset.pay).concat($("#pc").value.split(",").map(s=>s.trim()).filter(Boolean));
    if(!v.payment_methods.length){toast("Escolha pelo menos uma forma de pagamento");return}
    v.wa_templates=Object.fromEntries(Object.keys(WA_LABEL).map(k=>[k,$("#wa_"+k).value.trim()||WA_DEFAULT[k]]));
    v.review_url=$("#rv").value.trim()||null;
    v.updated_at=new Date().toISOString();
    await q(sb.from("store_settings").update(v).eq("id",1)); Object.assign(S,v); toast("Configurações salvas"); setTimeout(()=>location.reload(),600);};
};

boot();
