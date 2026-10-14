/* =========================================================
   Gestão: trocar usuário, movimentação do caixa, trocas e devoluções,
   inventário (contagem) e validade dos produtos.
   (usa as funções do painel.js: sb, q, $, $$, drawer, toast, brl…)
   ========================================================= */

/* ---------- imprimir uma lista simples (cupom térmico ou janela) ---------- */
function printRows(title,rows,notes,opt){
  if(window.PRN&&PRN.direct()){PRN.textDoc(title,rows,notes,opt).catch(e=>toast("Impressora: "+(e.message||e)));return}
  $("#print").innerHTML=`<h2>${esc(S.name)}</h2><div style="text-align:center">${esc(title)}</div><hr>${rows.map(([l,v])=>`<div>${String(l).replace(/&nbsp;/g," ")} <span style="float:right">${v}</span></div>`).join("")}${notes?`<hr><div>${esc(notes)}</div>`:""}`;
  window.print();
}

/* ================= TROCAR USUÁRIO (sem sair do sistema) ================= */
async function switchUser(){
  let mine=null;
  try{const r=await sb.from("cash_sessions").select("id,operator,user_id").is("closed_at",null);mine=(r.data||[]).find(x=>x.user_id?x.user_id===ME.id:x.operator===ME.name)||null}catch{}
  const dr=drawer("🔄 Trocar usuário",`
    <p class="muted" style="margin-top:0">Agora: <b>${esc(ME.name)}</b> (${OWNER()?"dono":"funcionário"}). Quem vai usar agora digita o usuário e a senha dele.</p>
    ${mine?`<div class="alert" style="margin:0 0 10px">⚠️ O seu caixa <b>continua aberto</b> no seu nome. Pra passar o caixa pro próximo, feche o seu antes.<br><button class="btn sm" id="fcx" style="margin-top:8px">🔒 Fechar meu caixa primeiro</button></div>`:""}
    <label class="fld"><span>Usuário</span><input class="in" id="su" autocomplete="username" autocapitalize="none" placeholder="ex.: joao"></label>
    <label class="fld"><span>Senha</span><input class="in" id="sp" type="password" autocomplete="current-password"></label>
    <p class="err" id="se" hidden></p>`,`<button class="btn" id="sgo">Entrar</button>`);
  if($("#fcx",dr)) $("#fcx",dr).onclick=()=>{closeDr();go("caixa");setTimeout(()=>{const b=$("#fc");if(b)b.click()},900)};
  const doIt=async()=>{const u=$("#su",dr).value.trim(),pw=$("#sp",dr).value;if(!u||!pw){$("#se",dr).hidden=false;$("#se",dr).textContent="Digite o usuário e a senha.";return}
    $("#sgo",dr).disabled=true;$("#sgo",dr).textContent="Entrando…";
    const r=await sb.auth.signInWithPassword({email:loginEmail(u),password:pw});
    if(r.error){$("#sgo",dr).disabled=false;$("#sgo",dr).textContent="Entrar";$("#se",dr).hidden=false;$("#se",dr).textContent="Usuário ou senha errados.";return}
    location.hash="caixa";location.reload()};
  $("#sgo",dr).onclick=doIt; $("#sp",dr).onkeydown=e=>{if(e.key==="Enter")doIt()}; $("#su",dr).onkeydown=e=>{if(e.key==="Enter")$("#sp",dr).focus()};
  setTimeout(()=>$("#su",dr).focus(),60);
}

/* ================= MOVIMENTAÇÃO DO CAIXA (igual "Controle de Caixa") ================= */
async function cashMoves(open,SM,SEE){
  let rets=[]; try{const r=await sb.from("returns").select("*").eq("cash_session_id",open.id);rets=r.data||[]}catch{}
  const TYP={delivery:"Delivery",retirada:"Retirada",balcao:"Venda balcão"};
  const KL={entrada:"Entrada",saida:"Saída",sangria:"Sangria",suprimento:"Suprimento"};
  const ev=[{t:open.opened_at,d:"ABERTURA DE CAIXA · "+(open.operator||""),f:"Dinheiro",v:+open.opening_amount,s:1}];
  SM.done.forEach(o=>{const ps=Array.isArray(o.payments)&&o.payments.length?o.payments.map(x=>x.method).join(" + "):o.payment_method||"—";
    ev.push({t:o.created_at,d:`${(TYP[o.type]||"Venda").toUpperCase()} #${o.number} · ${o.customer_name||"consumidor não identificado"}`,f:ps,v:+o.total,s:1,o:o.id})});
  SM.mv.filter(x=>!(x.kind==="saida"&&/^Devolução/.test(x.description||""))).forEach(x=>ev.push({t:x.created_at,d:(KL[x.kind]||x.kind).toUpperCase()+(x.description?" · "+x.description:""),f:x.payment_method||"Dinheiro",v:+x.amount,s:/saida|sangria/.test(x.kind)?-1:1}));
  rets.forEach(r=>ev.push({t:r.created_at,d:`DEVOLUÇÃO #${r.order_number} · ${(r.items||[]).map(i=>i.qty+"x "+i.name).join(", ")}`,f:({dinheiro:"Dinheiro",pix:"Pix",cartao:"Cartão",fiado:"Fiado",troca:"Troca"})[r.refund_method]||r.refund_method,v:+r.amount,s:-1}));
  ev.sort((a,b)=>new Date(a.t)-new Date(b.t));
  const pend=SM.pending||[];
  drawer("📋 Movimentação do caixa",`
    <div class="muted" style="font-size:12.5px;margin-bottom:8px">Caixa aberto por <b>${esc(open.operator||"—")}</b> em ${dt(open.opened_at)} · ${ev.length} lançamento(s)</div>
    <div class="tw"><table><thead><tr><th>Hora</th><th>Descrição</th><th>Forma</th>${SEE?'<th class="num">Valor</th>':""}</tr></thead><tbody>
    ${ev.map(e=>`<tr ${e.o?`data-mo="${e.o}" style="cursor:pointer"`:""}><td>${hm(e.t)}</td><td style="font-size:12.5px">${esc(e.d)}</td><td style="font-size:12.5px">${esc(e.f)}</td>${SEE?`<td class="num" style="color:${e.s<0?"var(--red)":"inherit"}">${e.s<0?"− ":""}${brl(e.v)}</td>`:""}</tr>`).join("")}
    </tbody></table></div>
    ${pend.length?`<p class="alert" style="margin-top:10px">⏳ ${pend.length} pedido(s) em aberto: ${pend.map(o=>"#"+o.number).join(", ")}</p>`:""}
    ${SEE?`<div class="card" style="margin-top:10px">${Object.entries(SM.byPay).map(([k,v])=>`<div class="line"><span>${esc(k)}</span><b>${brl(v)}</b></div>`).join("")}${rets.length?`<div class="line"><span>Devoluções</span><b style="color:var(--red)">− ${brl(rets.reduce((s,r)=>s+ +r.amount,0))}</b></div>`:""}<div class="line big"><span>💵 Dinheiro esperado na gaveta</span><span class="price">${brl(SM.expected)}</span></div></div>`:""}`,
    `<button class="btn o" id="mpr">🖨️ Imprimir</button>`);
  $$("[data-mo]",ov).forEach(r=>r.onclick=()=>{closeDr();orderDrawer(+r.dataset.mo)});
  $("#mpr",ov).onclick=()=>printRows("MOVIMENTACAO DO CAIXA",ev.map(e=>[hm(e.t)+" "+e.d.slice(0,22),SEE?(e.s<0?"-":"")+brl(e.v):e.f]).concat(SEE?[["Dinheiro esperado",brl(SM.expected)]]:[]));
}

/* ================= TROCAS E DEVOLUÇÕES ================= */
const REFUND={dinheiro:"💵 Devolver em dinheiro (sai do caixa)",pix:"⚡ Devolvi no Pix",cartao:"💳 Estornei no cartão",fiado:"📒 Abater no fiado do cliente",troca:"🔄 Troca por outro produto (vira desconto na próxima venda)"};
async function pageDevolucoes(m){
  const r0=await sb.from("returns").select("*").order("created_at",{ascending:false}).limit(60);
  if(r0.error){m.innerHTML=`<div class="top"><h1>Trocas e devoluções</h1></div><p class="alert">Rode a <b>parte 19</b> do banco no Supabase pra usar as trocas e devoluções.</p>`;return}
  const since=new Date(Date.now()-3*864e5).toISOString();
  const recent=await q(sb.from("orders").select("id,number,created_at,type,customer_name,total,status,payment_method").gte("created_at",since).neq("status","cancelado").order("created_at",{ascending:false}).limit(40));
  m.innerHTML=`<div class="top"><h1>Trocas e devoluções</h1></div>
    <div class="grid g2"><div class="card grid" style="align-content:start">
      <b>1. Qual foi a venda?</b>
      <div class="row" style="flex-wrap:nowrap"><input class="in" id="dn" inputmode="numeric" placeholder="Número do pedido (ex.: 1523)"><button class="btn" id="dgo">Buscar</button></div>
      <p class="muted" style="margin:0;font-size:12.5px">Ou escolha uma venda dos últimos 3 dias:</p>
      <div class="grid" style="gap:4px;max-height:420px;overflow:auto">${recent.map(o=>`<button class="line" data-ro="${o.id}" style="text-align:left;cursor:pointer"><span>#${o.number} · ${dt(o.created_at)} · ${o.type==="delivery"?"🛵":o.type==="retirada"?"🏪":"🧾"} ${esc(o.customer_name||"")}</span><b>${brl(o.total)}</b></button>`).join("")||'<p class="muted">Nenhuma venda recente.</p>'}</div>
    </div>
    <div class="card" style="align-content:start"><b>Últimas trocas e devoluções</b>
      ${r0.data.map(r=>`<div class="line" style="align-items:flex-start"><span><b>#${r.order_number}</b> · ${dt(r.created_at)} · ${esc(r.created_by_name||"")}<br><span class="muted" style="font-size:12.5px">${(r.items||[]).map(i=>esc(i.qty+"x "+i.name)).join(", ")}${r.reason?" · "+esc(r.reason):""}<br>${esc((REFUND[r.refund_method]||r.refund_method).replace(/ \(.*\)/,""))}${r.restock?"":" · não voltou pro estoque"}</span></span><b style="color:var(--red)">− ${brl(r.amount)}</b></div>`).join("")||'<p class="muted">Nenhuma ainda.</p>'}</div></div>`;
  const find=async()=>{const n=parseInt($("#dn").value,10);if(!n){toast("Digite o número do pedido");return}
    const r=await q(sb.from("orders").select("id").eq("number",n).limit(1));if(!r.length){toast("Pedido #"+n+" não encontrado");return}returnDrawer(r[0].id,m)};
  $("#dgo").onclick=find; $("#dn").onkeydown=e=>{if(e.key==="Enter")find()};
  $$("[data-ro]",m).forEach(b=>b.onclick=()=>returnDrawer(+b.dataset.ro,m));
}
async function returnDrawer(id,m){
  const o=await q(sb.from("orders").select("*,order_items(*)").eq("id",id).single());
  const prev=await q(sb.from("returns").select("items").eq("order_id",id));
  const back={}; prev.forEach(r=>(r.items||[]).forEach(i=>back[i.order_item_id]=(back[i.order_item_id]||0)+ +i.qty));
  const items=(o.order_items||[]).sort((a,b)=>a.id-b.id).map(i=>({...i,left:+i.qty-(back[i.id]||0),n:0}));
  const factor=+o.subtotal>0?Math.max(0,Math.min(1,(+o.subtotal-(+o.discount||0))/+o.subtotal)):1;
  if(o.status==="cancelado"){toast("Esse pedido foi cancelado");return}
  const methods=Object.keys(REFUND).filter(k=>k!=="fiado"||o.customer_id);
  let method=/dinheiro/i.test(o.payment_method||"")?"dinheiro":/pix/i.test(o.payment_method||"")?"pix":/cart/i.test(o.payment_method||"")?"cartao":/fiado/i.test(o.payment_method||"")&&o.customer_id?"fiado":"dinheiro";
  const total=()=>Math.round(items.reduce((s,i)=>s+ +i.unit_price*i.n*factor,0)*100)/100;
  const dr=drawer(`🔄 Devolução · pedido #${o.number}`,`
    <div class="muted" style="font-size:12.5px">${dt(o.created_at)} · ${esc(o.customer_name||"Cliente balcão")} · pago com ${esc(o.payment_method||"—")} · total ${brl(o.total)}</div>
    <b style="margin-top:6px">2. O que o cliente está devolvendo?</b>
    <div class="grid" style="gap:6px">${items.map((i,k)=>`<div class="line"><div style="min-width:0"><b>${esc(i.name)}</b><div class="muted" style="font-size:12px">${brl(i.unit_price)} cada · comprou ${+i.qty}${back[i.id]?` · já devolveu ${back[i.id]}`:""}</div></div>
      ${i.left>0?`<div class="row" style="flex-wrap:nowrap"><button class="icb" data-dm="${k}">−</button><b id="dq${k}" style="min-width:22px;text-align:center">0</b><button class="icb" data-dp="${k}">+</button><button class="btn o sm" data-da="${k}">Tudo</button></div>`:'<span class="muted">já devolvido</span>'}</div>`).join("")}</div>
    <b>3. Como devolver o valor?</b>
    <div class="grid" style="gap:6px">${methods.map(k=>`<label class="chk"><input type="radio" name="rf" value="${k}" ${k===method?"checked":""}> ${REFUND[k]}</label>`).join("")}</div>
    <label class="chk"><input type="checkbox" id="rs" checked> 📦 Voltar pro estoque (produto em bom estado)</label>
    <label class="fld"><span>Motivo (opcional)</span><input class="in" id="rr" placeholder="Ex.: vencido, quente, cliente desistiu, trocou o sabor"></label>
    <div class="line big"><span>Valor da devolução</span><span class="price" id="rt">R$ 0,00</span></div>
    ${factor<1?`<p class="muted" style="margin:0;font-size:12px">O desconto que o pedido teve já foi descontado do valor.</p>`:""}<p class="err" id="re" hidden></p>`,
    `<button class="btn" id="rgo">✔ Confirmar devolução</button>`);
  const upd=()=>{items.forEach((i,k)=>{const e=$("#dq"+k,dr);if(e)e.textContent=i.n});$("#rt",dr).textContent=brl(total())};
  $$("[data-dp]",dr).forEach(b=>b.onclick=()=>{const i=items[+b.dataset.dp];if(i.n<i.left)i.n++;upd()});
  $$("[data-dm]",dr).forEach(b=>b.onclick=()=>{const i=items[+b.dataset.dm];if(i.n>0)i.n--;upd()});
  $$("[data-da]",dr).forEach(b=>b.onclick=()=>{const i=items[+b.dataset.da];i.n=i.left;upd()});
  $$("[name=rf]",dr).forEach(r=>r.onchange=()=>method=r.value);
  $("#rgo",dr).onclick=async e=>{const sel=items.filter(i=>i.n>0);if(!sel.length){$("#re",dr).hidden=false;$("#re",dr).textContent="Escolha pelo menos um item.";return}
    if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent=`Confirmar: devolver ${brl(total())}`;return}
    e.target.disabled=true;
    const r=await sb.rpc("register_return",{p:{order_id:o.id,refund_method:method,restock:$("#rs",dr).checked,reason:$("#rr",dr).value.trim(),items:sel.map(i=>({order_item_id:i.id,qty:i.n}))}});
    if(r.error){e.target.disabled=false;e.target.textContent="✔ Confirmar devolução";delete e.target.dataset.sure;$("#re",dr).hidden=false;$("#re",dr).textContent=r.error.message;return}
    const reason=$("#rr",dr).value.trim(), amt=+r.data.amount, rows=[["Pedido","#"+o.number],["Data",dt(new Date())],["Atendente",ME.name]].concat(sel.map(i=>[i.n+"x "+i.name,""])).concat([["Valor",brl(amt)],["Forma",(REFUND[method]||"").replace(/^\S+\s/,"").replace(/ \(.*\)/,"")]]);
    closeDr();
    drawer("✅ Devolução registrada",`<p style="font-size:16px;margin-top:0">Pedido <b>#${o.number}</b> · <b class="price">${brl(amt)}</b></p>
      <p class="muted">${method==="dinheiro"?"💵 O valor saiu do caixa (aparece na Movimentação).":method==="fiado"?"📒 O valor foi abatido do fiado do cliente.":method==="troca"?"🔄 Agora passe no caixa os produtos que o cliente vai levar: o desconto da troca já entra sozinho.":"✔ Registrado. Lembre de devolver pelo "+(method==="pix"?"Pix":"cartão")+"."}</p>`,
      `<button class="btn o" id="rpp">🖨️ Imprimir comprovante</button>${method==="troca"?'<button class="btn" id="rtc">🔄 Ir pro caixa fazer a troca</button>':'<button class="btn" id="rok">OK</button>'}`);
    $("#rpp",ov).onclick=()=>printRows("COMPROVANTE DE DEVOLUCAO",rows,reason?"Motivo: "+reason:null);
    if($("#rtc",ov)) $("#rtc",ov).onclick=()=>{window.__gbTroca={amount:amt,number:o.number};go("caixa")};
    if($("#rok",ov)) $("#rok",ov).onclick=()=>{closeDr();pageDevolucoes(m)};
    toast("Devolução registrada");
  };
  upd();
}

/* ================= INVENTÁRIO (contagem de estoque) ================= */
async function pageInventario(m){
  const h0=await sb.from("inventories").select("id,created_at,created_by_name,diff_value,notes,items").order("created_at",{ascending:false}).limit(20);
  if(h0.error){m.innerHTML=`<div class="top"><h1>Inventário</h1></div><p class="alert">Rode a <b>parte 19</b> do banco no Supabase pra usar o inventário.</p>`;return}
  const [prods,cats]=await Promise.all([q(sb.from("products").select("id,name,barcode,stock_qty,track_stock,cost_price,category_id,stock_parent_id,stock_factor,status").neq("status","inativo").order("name")),q(sb.from("categories").select("id,name").order("sort_order"))]);
  const seeQty=OWNER()||can("estoque");
  const KEY="gb_inv_draft"; let cnt={}; try{cnt=JSON.parse(localStorage.getItem(KEY)||"{}")}catch{}
  const keep=()=>{try{localStorage.setItem(KEY,JSON.stringify(cnt))}catch{}};
  const base=prods.filter(p=>!p.stock_parent_id);
  let term="", cat="", onlyTracked=base.some(p=>p.track_stock);
  const draw=()=>{
    const list=base.filter(p=>(!onlyTracked||p.track_stock)&&(!cat||String(p.category_id)===cat)&&(!term||p.name.toLowerCase().includes(term)||String(p.barcode||"")===term));
    const n=Object.keys(cnt).length;
    m.innerHTML=`<div class="top"><div><h1>Inventário · contagem de estoque</h1><div class="muted">Conte o que tem na loja e digite. Pode bipar o produto: cada bipe soma 1. ${n?`<b style="color:var(--y)">${n} produto(s) contado(s)</b> (fica salvo neste aparelho até você concluir)`:""}</div></div>
      <div class="row"><button class="btn o" id="ivh">📜 Inventários anteriores</button>${n?'<button class="btn o" id="ivc">Limpar contagem</button>':""}<button class="btn" id="ivs" ${n?"":"disabled"}>✔ Conferir e salvar</button></div></div>
      <div class="row" style="flex-wrap:nowrap;margin-bottom:8px"><input class="in" id="ivq" placeholder="🔍 Buscar produto ou bipar o código de barras…" value="${esc(term)}" autocomplete="off">${matchMedia("(pointer:coarse)").matches?'<button class="btn o" id="ivcam">📷</button>':""}</div>
      <div class="row" style="margin-bottom:8px;gap:12px"><div class="tabs" style="margin:0"><button data-ic="" aria-current="${!cat}">Todos</button>${cats.map(c=>`<button data-ic="${c.id}" aria-current="${String(c.id)===cat}">${esc(c.name)}</button>`).join("")}</div>
        <label class="chk"><input type="checkbox" id="ivt" ${onlyTracked?"checked":""}> Só produtos com estoque controlado</label></div>
      <div class="tw"><table><thead><tr><th>Produto</th>${seeQty?'<th class="num">No sistema</th>':""}<th class="num" style="width:150px">Contado</th>${seeQty?'<th class="num">Diferença</th>':""}</tr></thead><tbody>
      ${list.map(p=>{const c=cnt[p.id],d=c!=null?c-(+p.stock_qty||0):null;return `<tr><td><b>${esc(p.name)}</b>${p.track_stock?"":' <span class="muted" style="font-size:11px">(sem controle)</span>'}</td>${seeQty?`<td class="num">${+p.stock_qty||0}</td>`:""}
        <td class="num"><input class="in" data-iv="${p.id}" inputmode="decimal" value="${c??""}" placeholder="—" style="width:110px;text-align:center"></td>
        ${seeQty?`<td class="num" id="ivd${p.id}" style="color:${d==null?"inherit":d<0?"var(--red)":d>0?"var(--green)":"inherit"}">${d==null?"":d>0?"+"+d:d}</td>`:""}</tr>`}).join("")||'<tr><td colspan="4" class="empty">Nada encontrado.</td></tr>'}</tbody></table></div>`;
    const q1=$("#ivq",m);
    q1.oninput=e=>{term=e.target.value.toLowerCase().trim();const pos=e.target.selectionStart;draw();const f=$("#ivq",m);f.focus();f.setSelectionRange(pos,pos)};
    q1.onkeydown=e=>{if(e.key!=="Enter")return;const code=e.target.value.trim();const hit=prods.find(p=>p.barcode&&String(p.barcode)===code);if(hit)bip(hit);else if(/^\d{6,}$/.test(code))toast("Código "+code+" não cadastrado");term="";draw();$("#ivq",m).focus()};
    if($("#ivcam",m))$("#ivcam",m).onclick=async()=>{const c=await scanBarcode();if(!c)return;const hit=prods.find(p=>p.barcode&&String(p.barcode)===c);if(hit){bip(hit);draw()}else toast("Código "+c+" não cadastrado")};
    $$("[data-ic]",m).forEach(b=>b.onclick=()=>{cat=b.dataset.ic;draw()});
    $("#ivt",m).onchange=e=>{onlyTracked=e.target.checked;draw()};
    $$("[data-iv]",m).forEach(i=>{i.onfocus=()=>i.select();i.onchange=()=>{const v=num(i.value);if(v==null)delete cnt[i.dataset.iv];else cnt[i.dataset.iv]=v;keep();draw()};
      i.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();const all=$$("[data-iv]",m),k=all.indexOf(i);i.blur();setTimeout(()=>{const nx=$$("[data-iv]",m)[k+1];if(nx)nx.focus()},30)}}});
    if($("#ivc",m))$("#ivc",m).onclick=e=>{if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar: apagar contagem";return}cnt={};keep();draw()};
    $("#ivs",m).onclick=review; $("#ivh",m).onclick=history;
  };
  // fardo bipado conta como 12 unidades da unidade
  const bip=p=>{const par=p.stock_parent_id?prods.find(x=>x.id===p.stock_parent_id):p, add=p.stock_parent_id?(+p.stock_factor||1):1;
    cnt[par.id]=(+cnt[par.id]||0)+add;keep();toast(`➕ ${par.name}: ${cnt[par.id]}`)};
  const review=()=>{
    const rows=Object.entries(cnt).map(([id,c])=>{const p=prods.find(x=>x.id==id);return p?{p,c,d:c-(+p.stock_qty||0)}:null}).filter(Boolean);
    const val=rows.reduce((s,r)=>s+r.d*(+r.p.cost_price||0),0), faltas=rows.filter(r=>r.d<0), sobras=rows.filter(r=>r.d>0);
    const dr=drawer("✔ Conferir inventário",`
      <p class="muted" style="margin-top:0">${rows.length} produto(s) contado(s). Ao salvar, o estoque do sistema passa a ser o que você contou.</p>
      ${seeQty?`<div class="stats"><div class="stat"><small>Faltando</small><b style="color:${faltas.length?"var(--red)":"inherit"}">${faltas.length}</b></div><div class="stat"><small>Sobrando</small><b>${sobras.length}</b></div>${OWNER()?`<div class="stat"><small>Diferença (pelo custo)</small><b style="color:${val<0?"var(--red)":"var(--green)"}">${brl(val)}</b></div>`:""}</div>
      <div class="grid" style="gap:2px;margin-top:8px">${rows.filter(r=>r.d!==0).sort((a,b)=>a.d-b.d).map(r=>`<div class="line"><span>${esc(r.p.name)} <span class="muted" style="font-size:12px">${+r.p.stock_qty||0} → ${r.c}</span></span><b style="color:${r.d<0?"var(--red)":"var(--green)"}">${r.d>0?"+":""}${r.d}</b></div>`).join("")||'<p class="muted">Tudo bateu certinho ✓</p>'}</div>`:""}
      <label class="fld"><span>Observação (opcional)</span><input class="in" id="ivn" placeholder="Ex.: contagem do fim do mês"></label><p class="err" id="ive" hidden></p>`,
      `<button class="btn" id="ivok">💾 Salvar inventário</button>`);
    $("#ivok",dr).onclick=async e=>{e.target.disabled=true;
      const r=await sb.rpc("apply_inventory",{p:{notes:$("#ivn",dr).value.trim(),items:rows.map(x=>({product_id:x.p.id,counted:x.c}))}});
      if(r.error){e.target.disabled=false;$("#ive",dr).hidden=false;$("#ive",dr).textContent=r.error.message;return}
      cnt={};keep();closeDr();toast(`✅ Inventário #${r.data.id} salvo`);pageInventario(m)};
  };
  const history=()=>{
    drawer("📜 Inventários anteriores",(h0.data||[]).map(h=>`<button class="line" data-ih="${h.id}" style="text-align:left;cursor:pointer;width:100%"><span>#${h.id} · ${dt(h.created_at)} · ${esc(h.created_by_name||"")}<br><span class="muted" style="font-size:12px">${(h.items||[]).length} produto(s) · ${(h.items||[]).filter(i=>+i.diff!==0).length} com diferença${h.notes?" · "+esc(h.notes):""}</span></span>${OWNER()?`<b style="color:${+h.diff_value<0?"var(--red)":"inherit"}">${brl(h.diff_value)}</b>`:""}</button>`).join("")||'<p class="muted">Nenhum ainda.</p>');
    $$("[data-ih]",ov).forEach(b=>b.onclick=()=>{const h=h0.data.find(x=>x.id==b.dataset.ih);
      drawer("Inventário #"+h.id+" · "+dt(h.created_at),`<div class="tw"><table><thead><tr><th>Produto</th><th class="num">Antes</th><th class="num">Contado</th><th class="num">Dif.</th></tr></thead><tbody>${(h.items||[]).map(i=>`<tr><td>${esc(i.name)}</td><td class="num">${+i.before}</td><td class="num">${+i.counted}</td><td class="num" style="color:${+i.diff<0?"var(--red)":+i.diff>0?"var(--green)":"inherit"}">${+i.diff>0?"+":""}${+i.diff}</td></tr>`).join("")}</tbody></table></div>`,
        `<button class="btn o" id="ihp">🖨️ Imprimir</button>`);
      $("#ihp",ov).onclick=()=>printRows("INVENTARIO #"+h.id,(h.items||[]).map(i=>[i.name.slice(0,20),`${+i.before}>${+i.counted} (${+i.diff>0?"+":""}${+i.diff})`]),h.notes)});
  };
  draw(); setTimeout(()=>{const f=$("#ivq",m);if(f)f.focus()},50);
}

/* ================= VALIDADES ================= */
const daysTo=d=>Math.round((new Date(d+"T12:00:00")-new Date(new Date().toDateString()+" 12:00:00"))/864e5);
async function lotsSoon(){try{const lim=new Date(Date.now()+7*864e5).toISOString().slice(0,10);const r=await sb.from("product_lots").select("id",{count:"exact",head:true}).eq("done",false).lte("expires_on",lim);if(!r.error){window.__lotsSoon=r.count||0;menu()}}catch{}}
async function pageValidades(m){
  const r0=await sb.from("product_lots").select("*").eq("done",false).order("expires_on").limit(500);
  if(r0.error){m.innerHTML=`<div class="top"><h1>Validades</h1></div><p class="alert">Rode a <b>parte 19</b> do banco no Supabase pra controlar as validades.</p>`;return}
  const prods=await q(sb.from("products").select("id,name,barcode,stock_parent_id").neq("status","inativo").order("name"));
  const P=Object.fromEntries(prods.map(p=>[p.id,p]));
  const canEdit=OWNER()||can("inventario");
  const lots=r0.data, venc=lots.filter(l=>daysTo(l.expires_on)<0), sem=lots.filter(l=>{const d=daysTo(l.expires_on);return d>=0&&d<=7}), mes=lots.filter(l=>{const d=daysTo(l.expires_on);return d>7&&d<=30});
  const tag=d=>d<0?`<span class="pill p-cancelado">Vencido há ${-d} dia(s)</span>`:d===0?'<span class="pill p-cancelado">Vence HOJE</span>':d<=7?`<span class="pill p-novo">Vence em ${d} dia(s)</span>`:d<=30?`<span class="pill p-em_preparo">Vence em ${d} dias</span>`:`<span class="pill p-concluido">${d} dias</span>`;
  let pick=null;
  m.innerHTML=`<div class="top"><div><h1>Validades</h1><div class="muted">Lance a data de vencimento quando o produto chegar. O sistema avisa antes de vencer.</div></div></div>
    <div class="stats"><div class="stat"><small>Vencidos</small><b style="color:${venc.length?"var(--red)":"inherit"}">${venc.length}</b></div><div class="stat"><small>Vencem em 7 dias</small><b style="color:${sem.length?"#FF8A00":"inherit"}">${sem.length}</b></div><div class="stat"><small>Vencem em 30 dias</small><b>${mes.length}</b></div></div>
    <div class="grid g2" style="margin-top:12px">
      ${canEdit?`<div class="card grid" style="align-content:start"><b>➕ Lançar validade</b>
        <label class="fld"><span>Produto (busque pelo nome ou bipe o código)</span><input class="in" id="vp" autocomplete="off" placeholder="🔍 Ex.: Heineken"></label><div id="vpl" class="grid" style="gap:4px"></div>
        <div class="grid g2"><label class="fld"><span>Quantidade (opcional)</span><input class="in" id="vqq" inputmode="decimal"></label><label class="fld"><span>Vence em</span><input class="in" id="vd" type="date"></label></div>
        <label class="fld"><span>Observação (opcional)</span><input class="in" id="vo" placeholder="Ex.: lote do fornecedor X, prateleira 2"></label>
        <button class="btn" id="vsv">Salvar</button></div>`:""}
      <div class="card" style="align-content:start"><b>📅 Por data de vencimento</b>
        ${lots.map(l=>{const d=daysTo(l.expires_on);return `<div class="line" style="align-items:center"><span><b>${esc((P[l.product_id]||{}).name||"Produto")}</b>${l.qty!=null?` · ${+l.qty} un`:""}<br><span class="muted" style="font-size:12px">${new Date(l.expires_on+"T12:00:00").toLocaleDateString("pt-BR")}${l.note?" · "+esc(l.note):""}</span></span><span class="row" style="flex-wrap:nowrap;gap:6px">${tag(d)}${canEdit?`<button class="btn o sm" data-ld="${l.id}" title="Já vendeu tudo ou tirou da prateleira">✓ Resolvido</button>`:""}</span></div>`}).join("")||'<p class="muted">Nenhuma validade lançada.</p>'}</div></div>`;
  if(canEdit){
    const list=()=>{const t=$("#vp",m).value.toLowerCase().trim();$("#vpl",m).innerHTML=t&&!pick?prods.filter(p=>p.name.toLowerCase().includes(t)).slice(0,8).map(p=>`<button class="btn o sm" data-vp="${p.id}" style="justify-content:flex-start">${esc(p.name)}</button>`).join(""):"";
      $$("[data-vp]",m).forEach(b=>b.onclick=()=>choose(P[b.dataset.vp]))};
    const choose=p=>{pick=p.stock_parent_id?P[p.stock_parent_id]||p:p;$("#vp",m).value=pick.name;$("#vpl",m).innerHTML="";$("#vd",m).focus()};
    $("#vp",m).oninput=()=>{pick=null;list()};
    $("#vp",m).onkeydown=e=>{if(e.key!=="Enter")return;e.preventDefault();const c=e.target.value.trim(),hit=prods.find(p=>p.barcode&&String(p.barcode)===c);if(hit)choose(hit);else{const b=$("[data-vp]",m);if(b)b.click()}};
    $("#vsv",m).onclick=async()=>{if(!pick){toast("Escolha o produto");return}if(!$("#vd",m).value){toast("Coloque a data de vencimento");return}
      await q(sb.from("product_lots").insert({product_id:pick.id,qty:num($("#vqq",m).value),expires_on:$("#vd",m).value,note:$("#vo",m).value.trim()||null,created_by_name:ME.name}));
      toast("📅 Validade lançada");lotsSoon();pageValidades(m)};
    $$("[data-ld]",m).forEach(b=>b.onclick=async()=>{await q(sb.from("product_lots").update({done:true}).eq("id",b.dataset.ld));toast("✓ Resolvido");lotsSoon();pageValidades(m)});
  }
}
