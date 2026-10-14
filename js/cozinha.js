/* =========================================================
   Tela da cozinha (KDS): mostra os pedidos aceitos com os itens que a cozinha
   prepara (categorias marcadas "vai pra cozinha"). A cozinha toca em
   "✔ Pronto" e o caixa/entregador já vê. Bom pra deixar numa TV ou tablet.
   (usa as funções do painel.js: sb, q, $, $$, esc, toast, beep, ME…)
   ========================================================= */
let KDS_SEEN=null, KDS_TIMER=null;
const kdsAge=t=>Math.max(0,Math.floor((Date.now()-new Date(t))/60000));
const kdsOpt=x=>/^\d+\/\d+ /.test(x.name)||!(x.qty>1)?x.name:x.qty+"x "+x.name;   // "1/2 Calabresa" já vem pronto
async function pageCozinha(m,soft){
  if(typeof mzSub==="function") mzSub();
  const [rows,cats,prods,tabsR]=await Promise.all([
    q(sb.from("orders").select("*,order_items(*)").in("status",["novo","em_preparo","saiu_entrega","pronto","concluido"]).gte("created_at",new Date(Date.now()-36e5*14).toISOString()).order("created_at").limit(200)),
    q(sb.from("categories").select("*")),
    q(sb.from("products").select("id,category_id")),
    sb.from("tabs").select("*,tab_items(*)").eq("status","aberta")]);   // mesas (parte 23)
  const catOf=Object.fromEntries(prods.map(p=>[p.id,p.category_id]));
  const noK=new Set(cats.filter(c=>c.to_kitchen===false).map(c=>c.id));
  const kItems=o=>(o.order_items||[]).sort((a,b)=>a.id-b.id).filter(i=>!i.product_id||!noK.has(catOf[i.product_id]));
  const showNew=(()=>{try{return localStorage.getItem("gb_kds_new")==="1"}catch{return false}})();
  const todo=rows.filter(o=>!o.kitchen_at&&o.type!=="balcao"&&(o.status==="em_preparo"||(showNew&&o.status==="novo"))&&kItems(o).length);
  // comandas das mesas: cada mesa com itens ainda não prontos vira um cartão
  (tabsR&&!tabsR.error?tabsR.data:[]).forEach(t=>{const its=(t.tab_items||[]).filter(i=>!i.canceled&&!i.kitchen_at&&(!i.product_id||!noK.has(catOf[i.product_id]))).sort((a,b)=>a.id-b.id);
    if(its.length) todo.push({id:"t"+t.id,tab:t,number:t.label,type:"mesa",status:"em_preparo",customer_name:t.customer_name||"",created_at:its[0].created_at,order_items:its.map(i=>({...i,options:(i.options||[]).map(x=>({name:x.label||x.name,qty:1}))}))})});
  todo.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const done=rows.filter(o=>o.kitchen_at).sort((a,b)=>new Date(b.kitchen_at)-new Date(a.kitchen_at)).slice(0,8);
  // som quando entra pedido novo na cozinha
  const ids=todo.map(o=>o.tab?o.id+":"+o.order_items[o.order_items.length-1].id:o.id);
  if(KDS_SEEN&&ids.some(id=>!KDS_SEEN.has(id))){beep();toast("🍳 Pedido novo na cozinha!")}
  KDS_SEEN=new Set(ids);
  const typ=o=>o.type==="delivery"?"🛵 ENTREGA":o.type==="retirada"?"🏪 RETIRADA":o.type==="mesa"?"🍽️ MESA":"🧾 BALCÃO";
  const col=n=>n>=20?"var(--red)":n>=10?"var(--orange)":"var(--green)";
  m.innerHTML=`<div class="top"><h1>🍳 Cozinha</h1><div class="row">
      <label class="chk" style="margin:0"><input type="checkbox" id="kn" ${showNew?"checked":""}> Mostrar também os que ainda não foram aceitos</label>
      <button class="btn o sm" id="kfs">⛶ Tela cheia</button></div></div>
    <p class="muted" style="margin-top:-6px">Aparecem aqui os pedidos <b>aceitos</b> com os itens que a cozinha faz. Toque em <b>✔ Pronto</b> quando terminar. O tempo fica <span style="color:var(--orange);font-weight:700">amarelo</span> com 10 min e <span style="color:var(--red);font-weight:700">vermelho</span> com 20 min.</p>
    <div class="kds">${todo.map(o=>{const n=kdsAge(o.accepted_at||o.created_at);return `<div class="card kt" style="border-top:6px solid ${col(n)}">
      <div class="row" style="justify-content:space-between"><b style="font-size:22px">${o.tab?"🍽️ "+esc(o.number):"#"+o.number}</b><b style="font-size:20px;color:${col(n)}">⏱ ${n} min</b></div>
      <div class="muted" style="font-weight:700">${o.tab?"MESA / COMANDA · "+esc((o.order_items[0].created_by||"").split(" ")[0]):typ(o)}${o.status==="novo"?' · <span style="color:var(--red)">AINDA NÃO ACEITO</span>':""}${o.customer_name?" · "+esc((o.customer_name||"").split(" ")[0]):""}</div>
      <div class="ki">${kItems(o).map(i=>`<div><b>${+i.qty}x</b> ${esc(i.name)}${(i.options||[]).map(x=>`<div class="ko">• ${esc(kdsOpt(x))}</div>`).join("")}${i.notes?`<div class="kobs">⚠️ ${esc(i.notes)}</div>`:""}</div>`).join("")}</div>
      ${o.notes?`<div class="kobs">📝 ${esc(o.notes)}</div>`:""}
      <button class="btn" data-kok="${o.id}" style="width:100%;justify-content:center;font-size:18px;padding:14px">✔ Pronto</button></div>`}).join("")||'<div class="empty" style="grid-column:1/-1">Nada pra preparar agora. 👨‍🍳</div>'}</div>
    ${done.length?`<h3 style="margin:22px 0 8px">Prontos agora há pouco</h3><div class="row" style="flex-wrap:wrap;gap:8px">${done.map(o=>`<span class="pill p-concluido" style="font-size:14px;padding:6px 10px">#${o.number} · ${hm(o.kitchen_at)}${o.kitchen_by?" · "+esc(o.kitchen_by):""} <button class="icb" data-kun="${o.id}" title="Voltar pra cozinha" aria-label="Voltar pra cozinha">↩</button></span>`).join("")}</div>`:""}`;
  $("#kn").onchange=e=>{try{localStorage.setItem("gb_kds_new",e.target.checked?"1":"0")}catch{};pageCozinha(m)};
  $("#kfs").onclick=()=>{const d=document;if(d.fullscreenElement)d.exitFullscreen();else d.documentElement.requestFullscreen&&d.documentElement.requestFullscreen()};
  $$("[data-kok]",m).forEach(b=>b.onclick=async()=>{b.disabled=true;const o=todo.find(x=>String(x.id)===b.dataset.kok);
    if(o.tab){await q(sb.from("tab_items").update({kitchen_at:new Date().toISOString()}).in("id",o.order_items.map(i=>i.id)));toast(`✔ ${o.number} pronto`);pageCozinha(m);return}
    const up={kitchen_at:new Date().toISOString(),kitchen_by:ME.name||null};
    if(o.type==="retirada"&&o.status==="em_preparo") up.status="pronto";      // retirada: já avisa que está pronto
    const r=await sb.from("orders").update(up).eq("id",o.id);
    if(r.error){b.disabled=false;toast(/kitchen/.test(r.error.message)?"Falta rodar a parte 22 no Supabase.":"Erro: "+r.error.message);return}
    toast(`✔ Pedido #${o.number} pronto`);pageCozinha(m)});
  $$("[data-kun]",m).forEach(b=>b.onclick=async()=>{const o=rows.find(x=>x.id==b.dataset.kun);
    await q(sb.from("orders").update({kitchen_at:null,kitchen_by:null}).eq("id",o.id));toast(`#${o.number} voltou pra cozinha`);pageCozinha(m)});
  clearInterval(KDS_TIMER); KDS_TIMER=setInterval(()=>{if(page==="cozinha"&&!ov.innerHTML)pageCozinha($("#main"),true);else clearInterval(KDS_TIMER)},30000);
}
