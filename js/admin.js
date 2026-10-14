/* =========================================================
   Painel do DONO DO SISTEMA: todas as lojas que usam o sistema.
   Criar loja + login do dono, bloquear/liberar, mensalidade.
   ========================================================= */
const sb=supabase.createClient(GB_CONFIG.SUPABASE_URL,GB_CONFIG.SUPABASE_KEY,{auth:{storageKey:"gb-admin"}});
const $=(s,el=document)=>el.querySelector(s), $$=(s,el=document)=>[...el.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl=v=>"R$ "+Number(v||0).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,".");
const dBR=d=>d?new Date(String(d).length<=10?d+"T12:00:00":d).toLocaleDateString("pt-BR"):"—";
const root=$("#root"), ov=$("#ov");
function toast(m){const t=document.createElement("div");t.className="toast";t.textContent=m;document.body.append(t);setTimeout(()=>t.remove(),2600)}
function drawer(title,body,foot){ov.innerHTML=`<div class="ov"><div class="dr"><div class="hd"><b>${title}</b><button class="x" data-x>✕</button></div><div class="bd">${body}</div>${foot?`<div class="ft">${foot}</div>`:""}</div></div>`;
  $("[data-x]",ov).onclick=()=>ov.innerHTML="";$(".ov",ov).onclick=e=>{if(e.target.classList.contains("ov"))ov.innerHTML=""};return $(".dr",ov)}
const loginUser=v=>String(v||"").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g,".").replace(/[^a-z0-9._-]/g,"");
const loginEmail=v=>String(v||"").includes("@")?String(v).trim().toLowerCase():loginUser(v)+"@equipe.geladao.app";
const slugify=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const SEG={bebidas:"🍺 Bebidas / conveniência",pizzaria:"🍕 Pizzaria",lanchonete:"🍔 Lanchonete",restaurante:"🍽️ Restaurante",marmitaria:"🍱 Marmitaria",acai:"🍧 Açaí / sorveteria",outro:"🛍️ Outro"};
const SITE=location.origin;

async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session) return loginView();
  const r=await sb.rpc("is_platform_admin");
  if(r.error){root.innerHTML=`<div class="login"><div class="card grid" style="max-width:420px"><h1>Falta o banco</h1><p>Rode a <b>parte 20</b> do banco no Supabase.</p><p class="muted">${esc(r.error.message)}</p><button class="btn o" id="lo">Sair</button></div></div>`;$("#lo").onclick=out;return}
  if(!r.data) return claimView();
  list();
}
async function out(){await sb.auth.signOut();location.reload()}
function loginView(){
  root.innerHTML=`<div class="login"><form id="lf"><h1>Lojas do sistema</h1><p class="muted" style="margin:0">Entre com o seu login do painel.</p>
    <label class="fld"><span>Usuário</span><input class="in" id="u" autocomplete="username" autocapitalize="none"></label>
    <label class="fld"><span>Senha</span><input class="in" id="p" type="password" autocomplete="current-password"></label>
    <button class="btn" type="submit">Entrar</button><p class="err" id="e" hidden></p></form></div>`;
  $("#lf").onsubmit=async e=>{e.preventDefault();const r=await sb.auth.signInWithPassword({email:loginEmail($("#u").value),password:$("#p").value});
    if(r.error){$("#e").hidden=false;$("#e").textContent="Usuário ou senha errados.";return}boot()};
}
function claimView(){
  root.innerHTML=`<div class="login"><div class="card grid" style="max-width:440px"><h1>Dono do sistema</h1>
    <p>Esta tela é só pra quem <b>vende o sistema</b> e cuida de todas as lojas.</p>
    <p class="muted" style="margin:0;font-size:13px">Se ainda ninguém foi marcado como dono do sistema, toque no botão abaixo. Isso só funciona <b>uma vez</b>: depois, ninguém mais consegue.</p>
    <button class="btn" id="cl">🏢 Sou o dono do sistema</button><button class="btn o" id="lo">Sair</button><p class="err" id="e" hidden></p></div></div>`;
  $("#lo").onclick=out;
  $("#cl").onclick=async()=>{const r=await sb.rpc("claim_platform_admin");if(r.error){$("#e").hidden=false;$("#e").textContent=r.error.message;return}
    if(!r.data){$("#e").hidden=false;$("#e").textContent="O sistema já tem um dono cadastrado. Entre com o login dele.";return}toast("Pronto! Você é o dono do sistema");list()};
}

let L=[];
async function list(){
  const r=await sb.rpc("admin_stores"); if(r.error){toast(r.error.message);return}
  L=r.data||[];
  const ok=L.filter(x=>x.ok).length, bl=L.filter(x=>!x.ok).length, venc=L.filter(x=>x.paid_until&&new Date(x.paid_until+"T23:59:59")<new Date()).length;
  const tot=L.reduce((s,x)=>s+ +x.sales30,0);
  const st=x=>!x.active?'<span class="pill p-cancelado">Bloqueada</span>':!x.ok?'<span class="pill p-cancelado">Mensalidade vencida</span>':x.paid_until&&new Date(x.paid_until+"T23:59:59")<new Date(Date.now()+5*864e5)?'<span class="pill p-novo">Vence logo</span>':'<span class="pill p-concluido">Ativa</span>';
  root.innerHTML=`<div class="wrapA"><div class="top"><h1>🏢 Lojas do sistema</h1><div class="row"><button class="btn" id="nw">➕ Nova loja</button><a class="btn o" href="/painel/">Meu painel</a><button class="btn o" id="lo">Sair</button></div></div>
    <div class="stats"><div class="stat"><small>Lojas ativas</small><b>${ok}</b></div><div class="stat"><small>Bloqueadas / vencidas</small><b style="color:${bl?"var(--red)":"inherit"}">${bl}</b></div><div class="stat"><small>Mensalidade vencida</small><b>${venc}</b></div><div class="stat"><small>Vendido por todas (30 dias)</small><b>${brl(tot)}</b></div></div>
    <div class="lj">${L.map(x=>`<div class="card"><div><h3>${esc(x.name)} ${st(x)}</h3>
        <div class="muted tagS">${esc(SEG[x.segment]||x.segment||"")} · loja nº ${x.id} · desde ${dBR(x.created_at)}</div>
        <div class="tagS" style="margin-top:4px">🔗 <a href="${SITE}/${esc(x.slug)}" target="_blank" rel="noopener">${esc(SITE.replace(/^https?:\/\//,""))}/${esc(x.slug)}</a></div>
        <div class="muted tagS">👤 ${(x.logins||[]).filter(l=>l.role==="dono").map(l=>esc((l.name||"")+" ("+(l.username||"")+")")).join(", ")||'<span style="color:var(--red)">sem login de dono</span>'} · ${(x.logins||[]).length} login(s)${x.owner_phone?" · 📞 "+esc(x.owner_phone):""}</div></div>
      <div class="tagS"><div>📦 ${x.products} produtos · 🧾 ${x.orders30} pedidos (30 dias)</div><div>💰 ${brl(x.sales30)} (30 dias)</div><div class="muted">Último pedido: ${x.last_order?new Date(x.last_order).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"nenhum"}</div><div>📅 Pago até: <b>${dBR(x.paid_until)}</b>${x.plan?" · "+esc(x.plan):""}</div></div>
      <div class="row" style="justify-content:flex-end"><button class="btn o sm" data-m="${x.id}">+1 mês</button><button class="btn o sm" data-e="${x.id}">Editar</button><button class="btn ${x.active?"r":"g"} sm" data-b="${x.id}">${x.active?"Bloquear":"Liberar"}</button></div></div>`).join("")||'<p class="empty">Nenhuma loja ainda.</p>'}</div></div>`;
  $("#lo").onclick=out; $("#nw").onclick=createStore;
  $$("[data-e]").forEach(b=>b.onclick=()=>edit(L.find(x=>x.id==b.dataset.e)));
  $$("[data-b]").forEach(b=>b.onclick=async e=>{const x=L.find(y=>y.id==b.dataset.b);if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent=x.active?"Confirmar bloqueio":"Confirmar";return}
    const r=await sb.rpc("admin_update_store",{p:{id:x.id,active:!x.active}});if(r.error){toast(r.error.message);return}toast(x.active?"Loja bloqueada":"Loja liberada");list()});
  $$("[data-m]").forEach(b=>b.onclick=async()=>{const x=L.find(y=>y.id==b.dataset.m);const base=x.paid_until&&new Date(x.paid_until+"T12:00:00")>new Date()?new Date(x.paid_until+"T12:00:00"):new Date();base.setMonth(base.getMonth()+1);
    const r=await sb.rpc("admin_update_store",{p:{id:x.id,paid_until:base.toISOString().slice(0,10),active:true}});if(r.error){toast(r.error.message);return}toast("📅 Pago até "+base.toLocaleDateString("pt-BR"));list()});
}
const segSel=v=>`<select class="in" id="sg">${Object.entries(SEG).map(([k,l])=>`<option value="${k}" ${k===v?"selected":""}>${l}</option>`).join("")}</select>`;
function createStore(){
  const dr=drawer("➕ Nova loja",`
    <label class="fld"><span>Nome da loja</span><input class="in" id="nm" placeholder="Ex.: Pizzaria do Zé"></label>
    <label class="fld"><span>Endereço do cardápio</span><div class="row" style="flex-wrap:nowrap"><span class="muted" style="white-space:nowrap">${esc(SITE.replace(/^https?:\/\//,""))}/</span><input class="in" id="sl" placeholder="pizzaria-do-ze"></div></label>
    <label class="fld"><span>Tipo de negócio</span>${segSel("bebidas")}</label>
    <div class="grid g2"><label class="fld"><span>Nome do dono</span><input class="in" id="on"></label><label class="fld"><span>WhatsApp do dono / loja</span><input class="in" id="op" inputmode="tel" placeholder="(85) 99999-9999"></label></div>
    <div class="card grid" style="gap:8px"><b>🔑 Login do dono no painel</b>
      <div class="grid g2"><label class="fld"><span>Usuário</span><input class="in" id="ou" autocapitalize="none" placeholder="ex.: ze.pizzaria"></label><label class="fld"><span>Senha (mín. 4)</span><input class="in" id="ow"></label></div>
      <p class="muted" style="margin:0;font-size:12px">O usuário não pode existir em outra loja. Dica: use nome + loja (ex.: <b>ze.pizzaria</b>).</p></div>
    <div class="grid g2"><label class="fld"><span>Pago até (opcional)</span><input class="in" id="pu" type="date"></label><label class="fld"><span>Plano (opcional)</span><input class="in" id="pl" placeholder="Ex.: Mensal R$ 99"></label></div>
    <label class="fld"><span>Observação</span><input class="in" id="nt"></label><p class="err" id="e" hidden></p>`,`<button class="btn" id="sv">Criar loja</button>`);
  let touched=false; $("#sl",dr).oninput=()=>touched=true;
  $("#nm",dr).oninput=e=>{if(!touched)$("#sl",dr).value=slugify(e.target.value)};
  $("#sv",dr).onclick=async e=>{const p={name:$("#nm",dr).value.trim(),slug:slugify($("#sl",dr).value),segment:$("#sg",dr).value,owner_name:$("#on",dr).value.trim(),owner_phone:$("#op",dr).value.trim(),
      owner_user:$("#ou",dr).value.trim(),owner_pass:$("#ow",dr).value,paid_until:$("#pu",dr).value,plan:$("#pl",dr).value.trim(),notes:$("#nt",dr).value.trim()};
    if(!p.name||!p.slug){$("#e",dr).hidden=false;$("#e",dr).textContent="Preencha o nome e o endereço.";return}
    if(p.owner_user&&p.owner_pass.length<4){$("#e",dr).hidden=false;$("#e",dr).textContent="A senha precisa ter pelo menos 4 caracteres.";return}
    e.target.disabled=true;const r=await sb.rpc("admin_create_store",{p});e.target.disabled=false;
    if(r.error){$("#e",dr).hidden=false;$("#e",dr).textContent=r.error.message;return}
    drawer("✅ Loja criada",`<p style="margin-top:0">Mande isso pro dono da <b>${esc(p.name)}</b>:</p>
      <textarea class="in" id="msg" rows="9" readonly>Olá${p.owner_name?", "+p.owner_name.split(" ")[0]:""}! Seu sistema está pronto 🎉

🛒 Cardápio pros clientes:
${SITE}/${r.data.slug}

🖥️ Painel da loja:
${SITE}/painel/
Usuário: ${r.data.login||"(criar)"}
Senha: ${p.owner_pass?p.owner_pass:"(criar)"}

No painel, comece por Configurações (logo, horário, WhatsApp) e depois Catálogo (produtos).</textarea>`,`<button class="btn" id="cp">📋 Copiar mensagem</button>`);
    $("#cp",ov).onclick=async()=>{try{await navigator.clipboard.writeText($("#msg",ov).value);toast("Mensagem copiada")}catch{$("#msg",ov).select()}};
    list()};
}
function edit(x){
  const dr=drawer("✎ "+esc(x.name),`
    <label class="fld"><span>Nome da loja</span><input class="in" id="nm" value="${esc(x.name)}"></label>
    <label class="fld"><span>Endereço do cardápio</span><div class="row" style="flex-wrap:nowrap"><span class="muted" style="white-space:nowrap">${esc(SITE.replace(/^https?:\/\//,""))}/</span><input class="in" id="sl" value="${esc(x.slug)}"></div></label>
    <p class="muted" style="margin:-6px 0 0;font-size:12px">⚠️ Se mudar o endereço, o link antigo para de funcionar.</p>
    <label class="fld"><span>Tipo de negócio</span>${segSel(x.segment)}</label>
    <div class="grid g2"><label class="fld"><span>Nome do dono</span><input class="in" id="on" value="${esc(x.owner_name||"")}"></label><label class="fld"><span>WhatsApp do dono</span><input class="in" id="op" value="${esc(x.owner_phone||"")}"></label></div>
    <div class="grid g2"><label class="fld"><span>Pago até</span><input class="in" id="pu" type="date" value="${x.paid_until||""}"></label><label class="fld"><span>Plano</span><input class="in" id="pl" value="${esc(x.plan||"")}"></label></div>
    <label class="fld"><span>Observação</span><textarea class="in" id="nt" rows="2">${esc(x.notes||"")}</textarea></label>
    <p class="muted" style="margin:0;font-size:12px">Com a mensalidade vencida há mais de 5 dias, a loja é bloqueada sozinha (cardápio e painel). Lance o pagamento com "+1 mês" pra liberar.</p>
    <div class="card grid" style="gap:8px"><b>🔑 Login do dono</b><p class="muted" style="margin:0;font-size:12px">Crie um login novo ou troque a senha de um que já existe nessa loja.</p>
      <div class="grid g2"><label class="fld"><span>Usuário</span><input class="in" id="ou" autocapitalize="none" value="${esc(((x.logins||[]).find(l=>l.role==="dono")||{}).username||"")}"></label><label class="fld"><span>Nova senha</span><input class="in" id="ow"></label></div>
      <button class="btn o sm" id="lg" style="justify-self:start">Salvar login</button></div><p class="err" id="e" hidden></p>`,
    `<button class="btn" id="sv">Salvar</button>`);
  $("#sv",dr).onclick=async()=>{const r=await sb.rpc("admin_update_store",{p:{id:x.id,name:$("#nm",dr).value.trim(),slug:slugify($("#sl",dr).value),segment:$("#sg",dr).value,owner_name:$("#on",dr).value.trim(),owner_phone:$("#op",dr).value.trim(),paid_until:$("#pu",dr).value,plan:$("#pl",dr).value.trim(),notes:$("#nt",dr).value.trim()}});
    if(r.error){$("#e",dr).hidden=false;$("#e",dr).textContent=r.error.message;return}ov.innerHTML="";toast("Salvo");list()};
  $("#lg",dr).onclick=async()=>{const u=$("#ou",dr).value.trim(),pw=$("#ow",dr).value;if(!u||pw.length<4){$("#e",dr).hidden=false;$("#e",dr).textContent="Usuário e senha (mín. 4) obrigatórios.";return}
    const r=await sb.rpc("admin_store_login",{p:{store_id:x.id,username:u,password:pw,name:$("#on",dr).value.trim()||"Dono"}});
    if(r.error){$("#e",dr).hidden=false;$("#e",dr).textContent=r.error.message;return}toast("🔑 Login "+r.data.login+" salvo");list()};
}
boot();
