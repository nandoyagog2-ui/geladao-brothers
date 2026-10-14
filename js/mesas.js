/* =========================================================
   Mesas e comandas (restaurante, bar, pizzaria):
   - o garçom abre a mesa, lança os itens pelo celular e envia pra cozinha
   - os itens aparecem na tela da cozinha (e pode imprimir a via da cozinha)
   - no fim, "Fechar conta" vira uma venda do caixa (com 10% de serviço, se quiser)
   (usa as funções do painel.js: sb, q, $, $$, esc, brl, money, num, drawer, toast, ME, S…)
   ========================================================= */
let MZ_CH=null;
function mzSub(){if(MZ_CH)return;MZ_CH=sb.channel("tabs").on("postgres_changes",{event:"*",schema:"public",table:"tabs"},mzRefresh).on("postgres_changes",{event:"*",schema:"public",table:"tab_items"},mzRefresh).subscribe()}
const MZ_KEY=id=>"gb_tab_draft_"+SID()+"_"+id;
const mzDraft={get(id){try{return JSON.parse(localStorage.getItem(MZ_KEY(id))||"[]")}catch{return []}},
  set(id,v){try{v.length?localStorage.setItem(MZ_KEY(id),JSON.stringify(v)):localStorage.removeItem(MZ_KEY(id))}catch{}}};
const mzMin=t=>Math.max(0,Math.floor((Date.now()-new Date(t))/60000));
const mzAge=t=>{const n=mzMin(t);return n<60?n+" min":Math.floor(n/60)+"h"+String(n%60).padStart(2,"0")};
const mzLive=it=>(it||[]).filter(i=>!i.canceled);
const mzSum=it=>Math.round(mzLive(it).reduce((s,i)=>s+ +i.unit_price*i.qty,0)*100)/100;
const mzPct=()=>S.service_pct==null?10:+S.service_pct;
/* complementos: mesmo jeito de cobrar do cardápio (somar / pizza pelo mais caro / pela média) */
function mzOptsTotal(opts,groups){const by={};(opts||[]).forEach(o=>{(by[o.g]=by[o.g]||[]).push(o)});
  return Object.entries(by).reduce((s,[g,l])=>{const r=((groups.find(x=>x.id==g)||{}).pricing)||"soma",n=l.reduce((a,o)=>a+o.qty,0);
    return s+(r==="maior"?Math.max(...l.map(o=>o.price)):r==="media"?Math.round(l.reduce((a,o)=>a+o.price*o.qty,0)/n*100)/100:l.reduce((a,o)=>a+o.price*o.qty,0))},0)}
function mzOptNames(opts,groups){const by={};(opts||[]).forEach(o=>{(by[o.g]=by[o.g]||[]).push(o)});
  return Object.entries(by).flatMap(([g,l])=>{const r=((groups.find(x=>x.id==g)||{}).pricing)||"soma",n=l.reduce((a,o)=>a+o.qty,0);
    return l.map(o=>(r!=="soma"&&n>1?o.qty+"/"+n+" ":o.qty>1?o.qty+"x ":"")+o.name)})}

async function pageMesas(m){
  const [tb,tbs]=await Promise.all([sb.from("dining_tables").select("*").order("sort_order").order("id"),sb.from("tabs").select("*,tab_items(*)").eq("status","aberta").order("opened_at")]);
  if(tb.error||tbs.error){m.innerHTML=`<div class="top"><h1>🍽️ Mesas e comandas</h1></div><div class="card"><b>Falta um passo no banco.</b><p class="muted">Rode a <b>parte 23</b> (arquivo 23-mesas-comandas.sql) no Supabase → SQL Editor e recarregue a página.</p><p class="muted" style="font-size:12px">${esc((tb.error||tbs.error).message)}</p></div>`;return}
  const tables=tb.data.filter(t=>t.active), open=tbs.data;
  mzSub();
  if(m._tab){const t=open.find(x=>x.id===m._tab);if(t)return tabView(m,t,tables,open);m._tab=null}
  const tabOf=t=>open.find(x=>x.table_id===t.id), loose=open.filter(x=>!x.table_id||!tables.some(t=>t.id===x.table_id));
  const card=(t,x)=>{const busy=!!x,pend=x?mzLive(x.tab_items).filter(i=>!i.kitchen_at).length:0,dr=x?mzDraft.get(x.id).length:0;
    return `<button class="card mzt ${busy?"on":""}" ${x?`data-tab="${x.id}"`:`data-free="${t.id}"`}>
      <b class="mzn">${esc(t?t.name:x.label)}</b>
      ${busy?`<span class="mzv">${brl(mzSum(x.tab_items))}</span><span class="muted" style="font-size:12px">⏱ ${mzAge(x.opened_at)}${x.customer_name?" · "+esc(x.customer_name):""}${x.people>1?" · "+x.people+" pessoas":""}</span>
        ${pend?`<span class="mzb">🍳 ${pend} na cozinha</span>`:""}${dr?`<span class="mzb r">📝 ${dr} não enviado(s)</span>`:""}`:`<span class="muted">Livre</span>`}</button>`};
  m.innerHTML=`<div class="top"><h1>🍽️ Mesas e comandas</h1><div class="row"><button class="btn" id="mzav">➕ Comanda avulsa</button>${OWNER()?'<button class="btn o" id="mzcf">⚙️ Configurar mesas</button>':""}</div></div>
    <div class="stats" style="margin-bottom:12px"><div class="stat"><small>Mesas ocupadas</small><b>${open.filter(x=>x.table_id).length} de ${tables.length}</b></div><div class="stat"><small>Comandas abertas</small><b>${open.length}</b></div><div class="stat"><small>Em aberto (consumo)</small><b>${brl(open.reduce((s,x)=>s+mzSum(x.tab_items),0))}</b></div></div>
    ${!tables.length?`<div class="card" style="margin-bottom:12px"><b>Nenhuma mesa cadastrada ainda.</b><p class="muted" style="margin:4px 0 0">${OWNER()?'Toque em <b>⚙️ Configurar mesas</b> e crie as mesas da loja (ex.: 10 mesas). Também dá pra usar só <b>comanda avulsa</b> (pelo nome do cliente ou número da ficha).':"Peça pro dono criar as mesas. Enquanto isso, use <b>comanda avulsa</b>."}</p></div>`:""}
    <div class="mzg">${tables.map(t=>card(t,tabOf(t))).join("")}${loose.map(x=>card(null,x)).join("")}</div>`;
  $$("[data-tab]",m).forEach(b=>b.onclick=()=>{m._tab=+b.dataset.tab;pageMesas(m)});
  $$("[data-free]",m).forEach(b=>b.onclick=()=>openTab(m,tables.find(t=>t.id==b.dataset.free)));
  $("#mzav").onclick=()=>openTab(m,null);
  if($("#mzcf"))$("#mzcf").onclick=()=>mzConfig(m,tb.data);
}
let MZ_T=null;
function mzRefresh(){clearTimeout(MZ_T);MZ_T=setTimeout(()=>{if(ov.innerHTML)return;if(page==="mesas")pageMesas($("#main"));else if(page==="cozinha")pageCozinha($("#main"),true)},400)}

function openTab(m,t){
  const dr=drawer(t?"Abrir "+esc(t.name):"Nova comanda avulsa",`
    ${t?"":`<label class="fld"><span>Identificação (número da ficha ou nome)</span><input class="in" id="ol" placeholder="Ex.: Comanda 15 ou João"></label>`}
    <label class="fld"><span>Nome do cliente (opcional)</span><input class="in" id="oc"></label>
    <label class="fld"><span>Quantas pessoas</span><input class="in" id="op" inputmode="numeric" value="1"></label><p class="err" id="e" hidden></p>`,`<button class="btn" id="ok">✔ Abrir ${t?"mesa":"comanda"}</button>`);
  setTimeout(()=>{const f=$(t?"#oc":"#ol",dr);if(f)f.focus()},60);
  $("#ok",dr).onclick=async()=>{const label=t?t.name:$("#ol",dr).value.trim();if(!label){$("#e",dr).hidden=false;$("#e",dr).textContent="Coloque um número ou nome pra comanda.";return}
    $("#ok",dr).disabled=true;
    const r=await sb.from("tabs").insert({table_id:t?t.id:null,label,customer_name:$("#oc",dr).value.trim()||null,people:Math.max(1,parseInt($("#op",dr).value,10)||1)}).select().single();
    if(r.error){$("#ok",dr).disabled=false;$("#e",dr).hidden=false;$("#e",dr).textContent=/uma_por_mesa/.test(r.error.message)?"Essa mesa acabou de ser aberta por outra pessoa. Volte e toque nela.":r.error.message;return}
    closeDr();m._tab=r.data.id;pageMesas(m)};
}

async function tabView(m,t,tables,open){
  const [cats,prods,groups,opts,pcs]=await Promise.all([q(sb.from("categories").select("*").eq("active",true).order("sort_order")),
    q(sb.from("products").select("id,name,price,promo_price,price_tiers,category_id,status,image_url").eq("status","ativo").order("name")),
    q(sb.from("complement_groups").select("*").eq("active",true)),q(sb.from("complement_options").select("*").eq("active",true).order("sort_order")),q(sb.from("product_complements").select("*").order("sort_order"))]);
  const PROMO=!!S.promos_no_balcao, price=p=>PROMO&&p.promo_price!=null&&+p.promo_price<+p.price?+p.promo_price:+p.price;
  const gOf=p=>pcs.filter(x=>x.product_id===p.id).map(x=>groups.find(g=>g.id===x.group_id)).filter(Boolean);
  const st0=m._mzs&&m._mzs.id===t.id?m._mzs:{};
  let draft=mzDraft.get(t.id), term=st0.term||"", cat=st0.cat||"", kprint=(()=>{try{return localStorage.getItem("gb_kprint")==="1"}catch{return false}})();
  const save=()=>mzDraft.set(t.id,draft);
  const items=()=>t.tab_items.sort((a,b)=>a.id-b.id);
  const draw=()=>{
    m._mzs={id:t.id,term,cat};
    const list=prods.filter(p=>(!cat||String(p.category_id)===cat)&&(!term||p.name.toLowerCase().includes(term))).slice(0,150);
    const sub=mzSum(t.tab_items), svc=Math.round(sub*mzPct())/100, dsum=draft.reduce((s,i)=>s+i.unit_price*i.qty,0);
    m.innerHTML=`<div class="top"><div><button class="btn o sm" id="bk">← Mesas</button><h1 style="margin:6px 0 0">🍽️ ${esc(t.label)}</h1>
        <div class="muted">Aberta por <b>${esc(t.opened_by||"—")}</b> às ${hm(t.opened_at)} (${mzAge(t.opened_at)})${t.customer_name?" · 👤 "+esc(t.customer_name):""} · <a href="#" id="pp">${t.people} pessoa(s) ✎</a></div></div>
      <div class="row"><button class="btn o" id="pc">🖨️ Conferência</button><button class="btn o" id="mv">🔀 Trocar mesa</button><button class="btn" id="fc">💰 Fechar conta</button></div></div>
    <div class="mzw">
      <div class="grid" style="align-content:start;gap:10px">
        <input class="in" id="ps" placeholder="🔍 Buscar produto…" value="${esc(term)}" autocomplete="off">
        <div class="tabs" style="margin:0"><button data-c="" aria-current="${!cat}">Todos</button>${cats.map(c=>`<button data-c="${c.id}" aria-current="${String(c.id)===cat}">${esc(c.name)}</button>`).join("")}</div>
        <div class="mzp">${list.map(p=>`<button class="card" data-a="${p.id}"><b>${esc(p.name)}</b><span class="price">${+price(p)?brl(price(p)):gOf(p).length?"escolher":brl(0)}</span>${gOf(p).length?'<small class="muted">+ opções</small>':""}</button>`).join("")||'<p class="muted">Nada encontrado.</p>'}</div>
      </div>
      <div class="grid" style="align-content:start;gap:12px">
        ${draft.length?`<button class="btn mzfab" id="fab"><span>📝 Ver pedido (${draft.reduce((s,i)=>s+i.qty,0)}) · enviar</span><span>${brl(dsum)}</span></button>`:""}
        <div class="card grid" id="mzd" style="gap:8px;scroll-margin-top:12px;border-color:${draft.length?"var(--y)":"var(--line)"}">
          <b>📝 Novo pedido ${draft.length?"(ainda não enviado)":""}</b>
          ${draft.map((i,k)=>`<div class="line"><div style="min-width:0"><b>${esc(i.name)}</b>${i.optNames.length?`<div class="muted" style="font-size:12px">${i.optNames.map(esc).join(", ")}</div>`:""}${i.notes?`<div class="muted" style="font-size:12px">Obs.: ${esc(i.notes)}</div>`:""}</div>
            <div class="row" style="flex-wrap:nowrap"><button class="icb" data-dm="${k}" aria-label="Menos">−</button><b style="min-width:20px;text-align:center">${i.qty}</b><button class="icb" data-dp="${k}" aria-label="Mais">+</button><button class="icb" data-dn="${k}" title="Observação" aria-label="Observação">✎</button><span style="width:70px;text-align:right">${brl(i.unit_price*i.qty)}</span></div></div>`).join("")||'<p class="muted" style="margin:0">Toque nos produtos pra lançar.</p>'}
          ${draft.length?`<label class="chk"><input type="checkbox" id="kp" ${kprint?"checked":""}> <span>Imprimir a via da cozinha</span></label>
          <button class="btn" id="sd" style="padding:13px;justify-content:space-between"><span>📤 ENVIAR PEDIDO</span><span>${brl(dsum)}</span></button><button class="btn o sm" id="dx">Limpar</button>`:""}
        </div>
        <div class="card grid" style="gap:6px"><b>🧾 Já lançado na comanda</b>
          ${items().map(i=>`<div class="line" style="${i.canceled?"opacity:.45;text-decoration:line-through":""}"><div style="min-width:0"><b>${i.qty}x</b> ${esc(i.name)}${(i.options||[]).length?`<div class="muted" style="font-size:12px">${i.options.map(x=>esc(x.label||x.name)).join(", ")}</div>`:""}${i.notes?`<div class="muted" style="font-size:12px">Obs.: ${esc(i.notes)}</div>`:""}
              <div class="muted" style="font-size:11.5px">${hm(i.created_at)} · ${esc(i.created_by||"")} · ${i.canceled?"cancelado":i.kitchen_at?"✔ pronto":"🍳 preparando"}</div></div>
            <div class="row" style="flex-wrap:nowrap"><span>${brl(i.unit_price*i.qty)}</span>${i.canceled?"":`<button class="icb" data-ci="${i.id}" title="Cancelar item" aria-label="Cancelar item">🗑</button>`}</div></div>`).join("")||'<p class="muted" style="margin:0">Nada lançado ainda.</p>'}
          <div class="line"><span class="muted">Consumo</span><span>${brl(sub)}</span></div>
          ${mzPct()?`<div class="line"><span class="muted">Serviço (${String(mzPct()).replace(".",",")}%)</span><span>${brl(svc)}</span></div>`:""}
          <div class="line big"><span>Total</span><span class="price">${brl(sub+svc)}</span></div>
          ${t.people>1?`<div class="line"><span class="muted">Por pessoa (${t.people})</span><b>${brl((sub+svc)/t.people)}</b></div>`:""}
          ${OWNER()&&!mzLive(t.tab_items).length?'<button class="btn r sm" id="xt">Cancelar esta comanda</button>':""}
        </div></div></div>`;
    $("#bk").onclick=()=>{m._tab=null;pageMesas(m)};
    $("#ps").oninput=e=>{term=e.target.value.toLowerCase();const pos=e.target.selectionStart;draw();$("#ps").focus();$("#ps").setSelectionRange(pos,pos)};
    $("#ps").onkeydown=e=>{if(e.key==="Enter"&&list[0]){pick(list[0]);term="";}};
    $$("[data-c]",m).forEach(b=>b.onclick=()=>{cat=b.dataset.c;draw()});
    $$("[data-a]",m).forEach(b=>b.onclick=()=>pick(prods.find(p=>p.id==b.dataset.a)));
    $$("[data-dm]",m).forEach(b=>b.onclick=()=>{const i=draft[+b.dataset.dm];i.qty--;if(!i.qty)draft.splice(+b.dataset.dm,1);save();draw()});
    $$("[data-dp]",m).forEach(b=>b.onclick=()=>{draft[+b.dataset.dp].qty++;save();draw()});
    $$("[data-dn]",m).forEach(b=>b.onclick=()=>{const i=draft[+b.dataset.dn];const dr=drawer("Observação · "+esc(i.name),`<label class="fld"><span>Ex.: sem cebola, bem passado, gelo à parte</span><input class="in" id="nt" value="${esc(i.notes||"")}"></label>`,`<button class="btn" id="ok">Salvar</button>`);
      setTimeout(()=>$("#nt",dr).focus(),60);$("#ok",dr).onclick=()=>{i.notes=$("#nt",dr).value.trim();save();closeDr();draw()}});
    if($("#kp"))$("#kp").onchange=e=>{kprint=e.target.checked;try{localStorage.setItem("gb_kprint",kprint?"1":"0")}catch{}};
    if($("#dx"))$("#dx").onclick=()=>{draft=[];save();draw()};
    if($("#sd"))$("#sd").onclick=send;
    if($("#fab"))$("#fab").onclick=()=>$("#mzd").scrollIntoView({behavior:"smooth"});
    $$("[data-ci]",m).forEach(b=>b.onclick=async e=>{const i=t.tab_items.find(x=>x.id==b.dataset.ci);
      if(i.kitchen_at&&!OWNER()){toast("Esse item já ficou pronto. Só o dono pode cancelar.");return}
      if(!b.dataset.sure){b.dataset.sure=1;b.textContent="Cancelar?";b.style.width="auto";b.style.padding="0 8px";return}
      await q(sb.from("tab_items").update({canceled:true}).eq("id",i.id));i.canceled=true;toast("Item cancelado");draw()});
    $("#pp").onclick=e=>{e.preventDefault();const dr=drawer("Pessoas na mesa",`<label class="fld"><span>Quantas pessoas (pra dividir a conta)</span><input class="in" id="np" inputmode="numeric" value="${t.people}"></label>`,`<button class="btn" id="ok">Salvar</button>`);
      $("#ok",dr).onclick=async()=>{const n=Math.max(1,parseInt($("#np",dr).value,10)||1);await q(sb.from("tabs").update({people:n}).eq("id",t.id));t.people=n;closeDr();draw()}};
    $("#pc").onclick=()=>mzPrintBill(t);
    $("#mv").onclick=()=>moveTab();
    $("#fc").onclick=()=>{if(draft.length){toast("Tem itens no novo pedido que não foram enviados. Envie ou limpe antes de fechar.");return}closeTab(m,t)};
    if($("#xt"))$("#xt").onclick=async e=>{if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar: cancelar comanda";return}
      await q(sb.from("tabs").update({status:"cancelada",closed_at:new Date().toISOString(),closed_by:ME.name||null}).eq("id",t.id));mzDraft.set(t.id,[]);m._tab=null;toast("Comanda cancelada");pageMesas(m)};
  };
  function pushDraft(it){const same=draft.find(x=>x.product_id===it.product_id&&JSON.stringify(x.options)===JSON.stringify(it.options)&&!x.notes);
    same?same.qty+=it.qty:draft.push(it);save();draw();toast("➕ "+it.name)}
  function pick(p){if(!p)return;const gs=gOf(p);
    if(!gs.length) return pushDraft({product_id:p.id,name:p.name,qty:1,unit_price:price(p),options:[],optNames:[],notes:""});
    const sel={};
    const body=()=>gs.map(g=>{const pz=g.pricing==="maior"||g.pricing==="media",os=opts.filter(o=>o.group_id===g.id),n=os.reduce((s,o)=>s+(sel[o.id]||0),0);
      return `<div style="margin:10px 0 4px"><b>${pz?"🍕 ":""}${esc(g.name)}</b> <span class="muted" style="font-size:12px">${g.min_select>0?"obrigatório · ":""}até ${g.max_select}${pz&&g.max_select>1?` · cobra ${g.pricing==="maior"?"o mais caro":"a média"}`:""} · ${n}/${g.max_select}</span></div>
      ${os.map(o=>`<div class="line"><span>${esc(o.name)}${+o.price?` <span class="muted">${pz?"":"+ "}${brl(o.price)}</span>`:""}</span><span class="row" style="flex-wrap:nowrap"><button class="icb" data-o="${o.id}" data-g="${g.id}" data-d="-1">−</button><b style="min-width:18px;text-align:center">${sel[o.id]||0}</b><button class="icb" data-o="${o.id}" data-g="${g.id}" data-d="1">+</button></span></div>`).join("")}`}).join("");
    const chosen=()=>gs.flatMap(g=>opts.filter(o=>o.group_id===g.id&&sel[o.id]).map(o=>({id:o.id,g:g.id,name:o.name,price:+o.price,qty:sel[o.id]})));
    const unit=()=>price(p)+mzOptsTotal(chosen(),groups);
    const dr=drawer(esc(p.name),`<div id="ob">${body()}</div><label class="fld" style="margin-top:10px"><span>Observação (opcional)</span><input class="in" id="on"></label><p class="err" id="e" hidden></p>`,`<button class="btn" id="ok" style="justify-content:space-between;min-width:220px"><span>➕ Lançar</span><span id="ou">${brl(unit())}</span></button>`);
    const wire=()=>$$("[data-o]",dr).forEach(b=>b.onclick=()=>{const g=gs.find(x=>x.id==b.dataset.g),id=+b.dataset.o,d=+b.dataset.d,os=opts.filter(o=>o.group_id===g.id);
      const n=os.reduce((s,o)=>s+(sel[o.id]||0),0),cur=sel[id]||0;
      if(d>0){if(n>=g.max_select){if(g.max_select===1){os.forEach(o=>delete sel[o.id]);sel[id]=1}else{toast("Máximo de "+g.max_select);return}}else if(!g.allow_repeat&&cur>=1)return;else sel[id]=cur+1}
      else{if(cur<=1)delete sel[id];else sel[id]=cur-1}
      $("#ob",dr).innerHTML=body();$("#ou",dr).textContent=brl(unit());wire()});
    wire();
    $("#ok",dr).onclick=()=>{for(const g of gs){const n=opts.filter(o=>o.group_id===g.id).reduce((s,o)=>s+(sel[o.id]||0),0);if(n<g.min_select){$("#e",dr).hidden=false;$("#e",dr).textContent=`Escolha ${g.min_select>1?"pelo menos "+g.min_select:"uma opção"} em "${g.name}".`;return}}
      const c=chosen();closeDr();pushDraft({product_id:p.id,name:p.name,qty:1,unit_price:Math.round(unit()*100)/100,options:c,optNames:mzOptNames(c,groups),notes:$("#on",dr).value.trim()})};
  }
  async function send(){
    const b=$("#sd");b.disabled=true;
    const rows=draft.map(i=>({tab_id:t.id,product_id:i.product_id,name:i.name,qty:i.qty,unit_price:i.unit_price,notes:i.notes||null,
      options:i.options.map((o,k)=>({id:o.id,g:o.g,name:o.name,price:o.price,qty:o.qty,label:i.optNames[k]||o.name}))}));
    const r=await sb.from("tab_items").insert(rows).select();
    if(r.error){b.disabled=false;toast("Não enviou: "+r.error.message);return}
    if(kprint) printRows("COZINHA · "+t.label.toUpperCase(),draft.flatMap(i=>[[`<b>${i.qty}x ${esc(i.name)}</b>`,""]].concat(i.optNames.map(x=>["&nbsp;&nbsp;+ "+esc(x),""])).concat(i.notes?[["&nbsp;&nbsp;OBS: "+esc(i.notes),""]]:[])),`Garçom: ${ME.name||""} · ${hm(new Date())}`,{nosign:1});
    t.tab_items=t.tab_items.concat(r.data);draft=[];save();toast("📤 Pedido enviado pra cozinha");draw();
  }
  function moveTab(){
    const free=tables.filter(x=>!open.some(o=>o.table_id===x.id));
    const dr=drawer("Trocar de mesa · "+esc(t.label),`<p class="muted" style="margin-top:0">Escolha a mesa livre pra onde a comanda vai:</p><div class="mzg">${free.map(x=>`<button class="card mzt" data-to="${x.id}"><b class="mzn">${esc(x.name)}</b><span class="muted">Livre</span></button>`).join("")||'<p class="muted">Nenhuma mesa livre.</p>'}</div>`);
    $$("[data-to]",dr).forEach(b=>b.onclick=async()=>{const x=free.find(y=>y.id==b.dataset.to);const r=await sb.from("tabs").update({table_id:x.id,label:x.name}).eq("id",t.id);
      if(r.error){toast(/uma_por_mesa/.test(r.error.message)?"Essa mesa acabou de ser ocupada.":r.error.message);return}
      t.table_id=x.id;t.label=x.name;closeDr();toast("Comanda passou pra "+x.name);draw()});
  }
  draw();
}

function mzPrintBill(t){
  const sub=mzSum(t.tab_items), svc=Math.round(sub*mzPct())/100;
  const rows=mzLive(t.tab_items).map(i=>[`${i.qty}x ${esc(i.name)}${(i.options||[]).length?" ("+i.options.map(x=>esc(x.label||x.name)).join(", ")+")":""}`,brl(i.unit_price*i.qty)])
    .concat([["<b>Consumo</b>",brl(sub)]]).concat(mzPct()?[[`Serviço (${String(mzPct()).replace(".",",")}%) opcional`,brl(svc)]]:[]).concat([["<b>TOTAL</b>","<b>"+brl(sub+svc)+"</b>"]])
    .concat(t.people>1?[[`Por pessoa (${t.people})`,brl((sub+svc)/t.people)]]:[]);
  printRows("CONFERÊNCIA · "+t.label.toUpperCase(),rows,"Não é documento fiscal · confira antes de pagar",{nosign:1});
}

async function closeTab(m,t){
  const cs=await q(sb.from("cash_sessions").select("*").is("closed_at",null).order("opened_at",{ascending:false}).limit(1));
  const open=cs[0];
  if(!open){const dr=drawer("Fechar conta · "+esc(t.label),`<div class="alert" style="margin:0"><b>O caixa está fechado.</b> Pra receber a conta, abra o caixa primeiro.</div>`,`<button class="btn" id="gc">💰 Ir pro caixa</button>`);$("#gc",dr).onclick=()=>go("caixa");return}
  const live=mzLive(t.tab_items);
  if(!live.length){toast("A comanda está vazia.");return}
  const PM=[...new Set(["Pix","Dinheiro","Cartão de crédito","Cartão de débito"].concat(S.payment_methods||[]))];
  const ico=x=>/pix/i.test(x)?"⚡":/dinheiro/i.test(x)?"💵":"💳";
  const r2=v=>Math.round(v*100)/100, sub=mzSum(t.tab_items);
  let svcOn=mzPct()>0, disc="", pay="Pix", troco="", split=false, parts=[], printIt=!!(window.PRN&&PRN.cfg().balcao!=="nunca");
  const svc=()=>svcOn?r2(sub*mzPct()/100):0, tot=()=>Math.max(0,r2(sub+svc()-(num(disc)||0)));
  const paid=()=>r2(parts.reduce((s,x)=>s+(num(x.v)||0),0));
  const body=()=>{const T=tot(),tr=num(troco);return `
    <div class="card">${live.map(i=>`<div class="line"><span>${i.qty}x ${esc(i.name)}</span><span>${brl(i.unit_price*i.qty)}</span></div>`).join("")}</div>
    <div class="line"><span class="muted">Consumo</span><span>${brl(sub)}</span></div>
    ${mzPct()?`<label class="chk"><input type="checkbox" id="sv" ${svcOn?"checked":""}> <span>Cobrar serviço (${String(mzPct()).replace(".",",")}%) · ${brl(r2(sub*mzPct()/100))}</span></label>`:""}
    ${can("desconto")?`<label class="row" style="flex-wrap:nowrap"><span class="muted" style="flex:1">Desconto (R$)</span><input class="in" id="ds" inputmode="decimal" style="width:110px" value="${esc(disc)}" placeholder="0,00"></label>`:""}
    <div class="line big"><span>Total</span><span class="price">${brl(T)}</span></div>
    ${t.people>1?`<div class="line"><span class="muted">Dividido por ${t.people} pessoas</span><b>${brl(T/t.people)} cada</b></div>`:""}
    <div class="row" style="justify-content:space-between"><b style="font-size:13px">${split?"Pagamento dividido":"Forma de pagamento"}</b><button class="btn o sm" id="spl">${split?"↩ Uma forma só":"➗ Dividir pagamento"}</button></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:6px">${PM.map(x=>`<button class="btn ${!split&&x===pay?"":"o"} sm" data-pay="${esc(x)}">${ico(x)} ${esc(x)}</button>`).join("")}</div>
    ${split?`${parts.map((x,k)=>`<div class="row" style="flex-wrap:nowrap"><span style="flex:1">${ico(x.m)} ${esc(x.m)}</span><input class="in" data-pv="${k}" inputmode="decimal" style="width:110px" value="${esc(x.v)}"><button class="icb" data-px="${k}" aria-label="Tirar">✕</button></div>`).join("")||`<p class="muted" style="margin:0;font-size:12px">Toque na forma de pagamento de cada pessoa.${t.people>1?` Cada uma já entra com ${brl(T/t.people)}.`:""}</p>`}
      ${parts.length?(Math.abs(paid()-T)<0.01?'<p class="ok" style="margin:0">✓ Pagamento fechou certinho</p>':paid()<T?`<p class="err" style="margin:0">Falta ${brl(T-paid())}</p>`:`<p class="err" style="margin:0">Passou ${brl(paid()-T)} do total</p>`):""}`
    :/dinheiro/i.test(pay)?`<label class="row" style="flex-wrap:nowrap"><span class="muted" style="flex:1">Cliente pagou com</span><input class="in" id="tr" inputmode="decimal" style="width:110px" value="${esc(troco)}" placeholder="0,00"></label>${tr>T?`<div class="line big" style="color:var(--green)"><span>Troco</span><span>${brl(tr-T)}</span></div>`:""}`:""}
    ${window.PRN&&PRN.cfg().balcao==="perguntar"?"":`<label class="chk"><input type="checkbox" id="pi" ${printIt?"checked":""}> <span>Imprimir cupom</span></label>`}
    <p class="err" id="e" hidden></p>`};
  const dr=drawer("💰 Fechar conta · "+esc(t.label),`<div id="cb">${body()}</div>`,`<button class="btn" id="ok" style="padding:13px 18px">✔ RECEBER E FECHAR</button>`);
  const redraw=(focus)=>{$("#cb",dr).innerHTML=body();wire();if(focus){const f=$(focus,dr);if(f){f.focus();const v=f.value;f.setSelectionRange(v.length,v.length)}}};
  const wire=()=>{
    if($("#sv",dr))$("#sv",dr).onchange=e=>{svcOn=e.target.checked;redraw()};
    if($("#ds",dr))$("#ds",dr).onchange=e=>{disc=e.target.value;redraw()};
    $("#spl",dr).onclick=()=>{split=!split;parts=[];troco="";redraw()};
    $$("[data-pay]",dr).forEach(b=>b.onclick=()=>{const x=b.dataset.pay;
      if(split){const T=tot(),rest=r2(T-paid()),each=t.people>1?r2(T/t.people):rest;parts.push({m:x,v:rest>0?money(Math.min(each,rest)):""});redraw();const ins=$$("[data-pv]",dr);const l=ins[ins.length-1];if(l){l.focus();l.select()}return}
      pay=x;if(!/dinheiro/i.test(pay))troco="";redraw()});
    $$("[data-pv]",dr).forEach(i=>i.onchange=()=>{parts[+i.dataset.pv].v=i.value;redraw()});
    $$("[data-px]",dr).forEach(b=>b.onclick=()=>{parts.splice(+b.dataset.px,1);redraw()});
    if($("#tr",dr))$("#tr",dr).oninput=e=>{troco=e.target.value;redraw("#tr")};
    if($("#pi",dr))$("#pi",dr).onchange=e=>printIt=e.target.checked;
  };
  wire();
  $("#ok",dr).onclick=async()=>{
    const err=x=>{const e=$("#e",dr);e.hidden=false;e.textContent=x};
    const T=tot(), tr=num(troco); let ps=null, method=pay, chg="";
    if(split){ps=parts.map(x=>({method:x.m,amount:r2(num(x.v)||0)})).filter(x=>x.amount>0);
      if(ps.length<2) return err("No pagamento dividido, coloque pelo menos 2 partes com valor.");
      if(Math.abs(ps.reduce((s,x)=>s+x.amount,0)-T)>=0.01) return err("A soma das partes tem que dar "+brl(T)+".");
      method=[...new Set(ps.map(x=>x.method))].join(" + ")}
    else{if(/dinheiro/i.test(pay)&&tr&&tr<T) return err("O valor pago é menor que o total.");chg=/dinheiro/i.test(pay)&&tr>T?String(tr):""}
    if(live.some(i=>!i.product_id)) return err("Um produto desta comanda foi apagado do catálogo. Cancele esse item e lance de novo.");
    $("#ok",dr).disabled=true;
    try{
      const people=[...new Set([t.opened_by].concat(live.map(i=>i.created_by)).filter(Boolean))].join(", ");
      const r=await q(sb.rpc("create_order",{p:{customer_name:t.customer_name?t.customer_name+" · "+t.label:t.label,customer_phone:"",type:"balcao",payment_method:method,
        change_for:"",discount_override:num(disc)?String(num(disc)):"",notes:`🍽️ ${t.label}${t.people>1?" · "+t.people+" pessoas":""} · Atendido por: ${people}`+(ps?" · Pagamento: "+ps.map(x=>x.method+" "+brl(x.amount)).join(" + "):""),
        items:live.map(i=>({product_id:i.product_id,qty:i.qty,notes:i.notes||"",options:(i.options||[]).map(o=>({option_id:o.id,qty:o.qty}))}))}}));
      const service=svcOn?r2(+r.subtotal*mzPct()/100):0, total=r2(+r.total+service);
      if(Math.abs(total-T)>=0.01&&ps) return err(`O total do caixa deu ${brl(total)} (preço mudou no catálogo). Ajuste as partes do pagamento.`);
      const up={status:"concluido",cash_session_id:open.id,service_fee:service,total,tab_id:t.id}; if(chg) up.change_for=chg; if(ps) up.payments=ps;
      await q(sb.from("orders").update(up).eq("id",r.id));
      await q(sb.from("tabs").update({status:"fechada",closed_at:new Date().toISOString(),closed_by:ME.name||null,order_id:r.id}).eq("id",t.id));
      mzDraft.set(t.id,[]); closeDr(); m._tab=null;
      toast(`✔ ${t.label} fechada · ${brl(total)}${chg?` · troco ${brl(+chg-total)}`:""}`);
      const ask=window.PRN&&PRN.cfg().balcao==="perguntar";
      if(printIt||ask){const doPrint=async()=>{const o=await q(sb.from("orders").select("*,order_items(*)").eq("id",r.id).single());printOrder(o,o.order_items.sort((a,b)=>a.id-b.id),"",o.change_for?o.change_for-o.total:0)};
        if(ask) setTimeout(()=>askPrint(r.number,total,doPrint),0); else await doPrint()}
      pageMesas(m);
    }catch(x){$("#ok",dr).disabled=false;err(x.message)}
  };
}

function mzConfig(m,all){
  const dr=drawer("⚙️ Configurar mesas",`
    <div class="card grid" style="gap:8px"><b>Criar mesas</b><div class="row" style="flex-wrap:nowrap;gap:8px"><input class="in" id="qn" inputmode="numeric" placeholder="Quantas? ex.: 10" style="flex:1"><button class="btn" id="qc">➕ Criar</button></div>
      <div class="muted" style="font-size:12px">Cria "Mesa 1", "Mesa 2"… continuando do número que já existe.</div>
      <div class="row" style="flex-wrap:nowrap;gap:8px"><input class="in" id="qx" placeholder="Ou um nome: Varanda 1, Balcão…" style="flex:1"><button class="btn o" id="qa">➕</button></div></div>
    <div class="card grid" style="gap:6px"><b>Mesas da loja</b>${all.map(t=>`<div class="line"><input class="in" data-rn="${t.id}" value="${esc(t.name)}" style="flex:1;${t.active?"":"opacity:.5"}"><label class="chk" style="margin:0 0 0 8px"><input type="checkbox" data-ac="${t.id}" ${t.active?"checked":""}> <span>Ativa</span></label></div>`).join("")||'<p class="muted" style="margin:0">Nenhuma ainda.</p>'}</div>
    <label class="fld"><span>Taxa de serviço do garçom (%) · 0 = não cobra</span><input class="in" id="sp" inputmode="decimal" value="${String(mzPct()).replace(".",",")}"></label>`,`<button class="btn" id="ok">Salvar</button>`);
  const reload=async()=>{const r=await q(sb.from("dining_tables").select("*").order("sort_order").order("id"));closeDr();mzConfig(m,r)};
  const nextN=()=>Math.max(0,...all.map(t=>+((t.name.match(/^mesa\s*(\d+)$/i)||[])[1]||0)));
  $("#qc",dr).onclick=async()=>{const n=Math.min(100,parseInt($("#qn",dr).value,10)||0);if(!n){toast("Digite quantas mesas");return}const s=nextN(),so=Math.max(0,...all.map(t=>t.sort_order||0));
    await q(sb.from("dining_tables").insert(Array.from({length:n},(_,k)=>({name:"Mesa "+(s+k+1),sort_order:so+k+1}))));toast(n+" mesa(s) criada(s)");reload()};
  $("#qa",dr).onclick=async()=>{const v=$("#qx",dr).value.trim();if(!v)return;const r=await sb.from("dining_tables").insert({name:v,sort_order:Math.max(0,...all.map(t=>t.sort_order||0))+1});
    if(r.error){toast(/nome/.test(r.error.message)?"Já existe uma mesa com esse nome":r.error.message);return}reload()};
  $("#ok",dr).onclick=async()=>{
    for(const t of all){const nm=$(`[data-rn="${t.id}"]`,dr).value.trim(),ac=$(`[data-ac="${t.id}"]`,dr).checked;
      if((nm&&nm!==t.name)||ac!==t.active){const r=await sb.from("dining_tables").update({name:nm||t.name,active:ac}).eq("id",t.id);if(r.error){toast(t.name+": "+(/nome/.test(r.error.message)?"nome repetido":r.error.message));return}}}
    const sp=num($("#sp",dr).value); if(sp!=null&&sp!==mzPct()){const r=await sb.from("store_settings").update({service_pct:sp}).eq("id",SID());if(r.error){toast(r.error.message);return}S.service_pct=sp}
    closeDr();toast("Mesas salvas");pageMesas(m)};
}
