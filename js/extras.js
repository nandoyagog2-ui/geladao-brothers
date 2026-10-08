/* =========================================================
   GELADÃO BROTHERS — entregadores e leitor de código de barras
   Usa as funções do painel.js (sb, q, brl, esc, $, $$, drawer...)
   ========================================================= */

/* ---------- leitor de código de barras pela câmera ---------- */
function loadScript(src){return new Promise((ok,err)=>{if(document.querySelector(`script[src="${src}"]`))return ok();const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=err;document.head.appendChild(s)})}
async function scanBarcode(){
  const box=document.createElement("div");
  box.style.cssText="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:grid;place-items:center;padding:16px";
  box.innerHTML=`<div style="width:min(420px,100%);display:grid;gap:10px"><b style="color:#fff;text-align:center">📷 Aponte a câmera pro código de barras</b><div id="gbscan" style="width:100%;border-radius:12px;overflow:hidden;background:#000;min-height:220px"></div><p id="gbsm" style="color:#bbb;text-align:center;margin:0;font-size:13px">Abrindo a câmera…</p><button class="btn o" id="gbsc">Cancelar</button></div>`;
  document.body.appendChild(box);
  let reader=null;
  const stop=async()=>{try{if(reader){await reader.stop();await reader.clear()}}catch{} box.remove()};
  return new Promise(async res=>{
    box.querySelector("#gbsc").onclick=async()=>{await stop();res(null)};
    try{
      await loadScript("https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js");
      reader=new Html5Qrcode("gbscan",{verbose:false,experimentalFeatures:{useBarCodeDetectorIfSupported:true}});
      await reader.start({facingMode:"environment"},{fps:12,qrbox:(w,h)=>({width:Math.min(300,w*0.9),height:Math.min(140,h*0.5)})},
        async txt=>{try{navigator.vibrate&&navigator.vibrate(80)}catch{} await stop();res(String(txt).trim())},()=>{});
      box.querySelector("#gbsm").textContent="Segure firme a uns 15 cm do código";
    }catch(e){box.querySelector("#gbsm").textContent="Não deu pra abrir a câmera. Libere a câmera no navegador ou use um leitor USB.";}
  });
}

/* ---------- entregadores ---------- */
let COURIERS=null;
async function couriers(force){if(!COURIERS||force){const r=await sb.from("couriers").select("*").order("name");COURIERS=r.error?[]:r.data}return COURIERS}
function courierMsg(o,items){
  const addr=`${o.street||o.address||""}${o.street_number?", "+o.street_number:""}`;
  const full=[addr,o.neighborhood,"Fortaleza"].filter(Boolean).join(", ");
  const map=o.lat&&o.lng?`https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;
  const pay=/dinheiro/i.test(o.payment_method||"")?(o.change_for?`💵 Dinheiro · cliente paga com ${brl(o.change_for)} → *levar ${brl(o.change_for-o.total)} de troco*`:"💵 Dinheiro · sem troco"):/fiado/i.test(o.payment_method||"")?"📒 Fiado · não cobrar":`💳 ${o.payment_method||""} · cobrar na entrega`;
  return [`🏍️ *ENTREGA #${o.number}* · ${S.name}`,"",
    `👤 *${o.customer_name||"Cliente"}*${o.customer_phone?" · "+o.customer_phone:""}`,
    `📍 ${addr}${o.neighborhood?" - "+o.neighborhood:""}`,
    o.complement?`🏠 ${o.complement}`:null, o.reference?`📌 Ref.: ${o.reference}`:null,
    `🗺️ ${map}`,"",
    "🧾 *Itens*", ...items.map(i=>`${i.qty}x ${i.name}${(i.options||[]).length?" ("+i.options.map(x=>x.qty+"x "+x.name).join(", ")+")":""}`),"",
    `💰 *Cobrar: ${brl(o.total)}*`, pay,
    o.notes?`📝 ${o.notes}`:null].filter(x=>x!==null).join("\n");
}
async function courierDrawer(o,items){
  const list=(await couriers(true)).filter(c=>c.active);
  if(!list.length){toast(OWNER()?"Cadastre os entregadores em Gestão → Entregadores":"Nenhum entregador cadastrado ainda");return}
  const dr=drawer(`Mandar pedido #${o.number} pro entregador`,`<p class="muted" style="margin:0">Toque no entregador: o WhatsApp abre com o endereço, o mapa, os itens e quanto cobrar. O pedido muda pra <b>Saiu para entrega</b>.</p>
    ${list.map(c=>`<button class="btn ${o.courier_id===c.id?"":"o"}" data-cr="${c.id}" style="justify-content:space-between"><span>🏍️ ${esc(c.name)}</span><span class="muted" style="font-size:12px">${esc(c.phone||"sem telefone")}</span></button>`).join("")}
    <details><summary class="muted" style="cursor:pointer">Ver a mensagem</summary><pre style="white-space:pre-wrap;font:12.5px/1.4 inherit;background:var(--card-2);padding:10px;border-radius:8px">${esc(courierMsg(o,items))}</pre></details>`);
  $$("[data-cr]",dr).forEach(b=>b.onclick=async()=>{const c=list.find(x=>x.id==b.dataset.cr);
    const w=c.phone&&digits(c.phone).length>=10?window.open(waURL(c.phone,courierMsg(o,items)),"_blank"):null;
    const up={courier_id:c.id,dispatched_at:new Date().toISOString()}; if(["novo","em_preparo","pronto"].includes(o.status))up.status="saiu_entrega";
    const r=await sb.from("orders").update(up).eq("id",o.id);
    if(r.error){toast(/courier_id|dispatched_at/.test(r.error.message)?"Rode a parte 14 do banco no Supabase":r.error.message);return}
    if(!w&&!c.phone)toast("Esse entregador está sem telefone; cadastre o WhatsApp dele");
    toast(`Pedido #${o.number} com ${c.name} 🏍️`); if(page==="pedidos")PAGES.pedidos($("#main")); orderDrawer(o.id)});
}

async function pageEntregadores(m){
  const list=await couriers(true);
  const r0=await sb.from("couriers").select("id").limit(1);
  if(r0.error){m.innerHTML=`<div class="top"><h1>Entregadores</h1></div><p class="alert">Rode a <b>parte 14</b> do banco no Supabase pra cadastrar entregadores.</p>`;return}
  let key="hoje";
  const PAY={taxa:"Recebe a taxa de entrega",fixo:"Valor fixo por entrega",nada:"Não recebe por entrega (fixo/mensal)"};
  m.innerHTML=`<div class="top"><h1>Entregadores</h1><button class="btn" id="nc">➕ Novo entregador</button></div>
    <div class="grid g2"><div class="card"><b>Cadastrados</b>${list.map(c=>`<div class="line"><span><b>${esc(c.name)}</b> ${c.active?"":'<span class="pill p-inativo">Inativo</span>'}<br><span class="muted" style="font-size:12.5px">${esc(c.phone||"sem telefone")} · ${PAY[c.pay_mode]}${c.pay_mode==="fixo"?" "+brl(c.pay_value):""}</span></span><button class="btn o sm" data-e="${c.id}">Editar</button></div>`).join("")||'<p class="muted">Nenhum entregador ainda.</p>'}</div>
    <div class="card grid" style="align-content:start"><b>Como mandar o pedido pro entregador</b><ol style="margin:0;padding-left:18px;line-height:1.6"><li>Em <b>Pedidos</b>, abra o pedido de entrega.</li><li>Clique em <b>🏍️ Mandar pro entregador</b> e escolha quem vai levar.</li><li>O WhatsApp abre com endereço, mapa, itens, valor e troco. É só enviar.</li></ol></div></div>
    <div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><b>💵 Acerto dos entregadores</b><div class="tabs" style="margin:0">${[["hoje","Hoje"],["ontem","Ontem"],["7","7 dias"],["mes","Este mês"]].map(([k,l])=>`<button data-k="${k}" aria-current="${k===key}">${l}</button>`).join("")}</div></div><div id="ac" style="margin-top:8px"></div></div>`;
  const edit=c=>{const F=[{k:"name",l:"Nome"},{k:"phone",l:"WhatsApp (com DDD)"},{k:"pay_mode",l:"Como ele recebe",t:"select",o:Object.entries(PAY)},{k:"pay_value",l:"Valor fixo por entrega (R$) — só se escolheu valor fixo",t:"money"},{k:"active",l:"Ativo",t:"check"},{k:"notes",l:"Observação (moto, placa, pix…)",t:"area"}];
    const dr=drawer(c?"Editar entregador":"Novo entregador",formHTML(F,c||{active:true,pay_mode:"taxa"})+'<p class="err" id="e" hidden></p>',`<button class="btn" id="sv">Salvar</button>`);
    $("#sv",dr).onclick=async()=>{const v=readForm(F,dr);if(!v.name){$("#e",dr).hidden=false;$("#e",dr).textContent="Informe o nome.";return}v.pay_value=v.pay_value??0;
      c?await q(sb.from("couriers").update(v).eq("id",c.id)):await q(sb.from("couriers").insert(v));closeDr();toast("Entregador salvo");PAGES.entregadores(m)}};
  $("#nc",m).onclick=()=>edit(null); $$("[data-e]",m).forEach(b=>b.onclick=()=>edit(list.find(c=>c.id==b.dataset.e)));
  const acerto=async()=>{
    const t=new Date();t.setHours(0,0,0,0);const a=key==="ontem"?new Date(t-864e5):key==="7"?new Date(t-6*864e5):key==="mes"?new Date(t.getFullYear(),t.getMonth(),1):t, b=key==="ontem"?t:new Date(t.getTime()+864e5);
    const ords=await q(sb.from("orders").select("id,number,total,delivery_fee,courier_id,created_at,neighborhood,customer_name,status").not("courier_id","is",null).gte("created_at",a.toISOString()).lt("created_at",b.toISOString()).neq("status","cancelado").order("created_at"));
    const rows=list.map(c=>{const os=ords.filter(o=>o.courier_id===c.id);const fees=os.reduce((s,o)=>s+ +o.delivery_fee,0);const pay=c.pay_mode==="taxa"?fees:c.pay_mode==="fixo"?os.length*+c.pay_value:0;return {c,os,fees,pay}}).filter(x=>x.os.length);
    $("#ac",m).innerHTML=rows.map(x=>`<div class="card" style="margin-bottom:8px"><div class="row" style="justify-content:space-between"><b>🏍️ ${esc(x.c.name)} · ${x.os.length} entrega(s)</b><b style="color:var(--y)">A pagar: ${brl(x.pay)}</b></div>
      <div class="muted" style="font-size:12.5px">Taxas de entrega cobradas dos clientes: ${brl(x.fees)}</div>
      <details><summary class="muted" style="cursor:pointer;font-size:12.5px">Ver entregas</summary>${x.os.map(o=>`<div class="line" style="font-size:12.5px"><span>#${o.number} · ${hm(o.created_at)} · ${esc(o.neighborhood||"")} · ${esc(o.customer_name||"")}</span><span>${brl(o.delivery_fee)}</span></div>`).join("")}</details>
      <div class="row" style="margin-top:6px">${x.pay>0?`<button class="btn sm" data-pg="${x.c.id}">✔ Lançar pagamento nas despesas</button>`:""}${x.c.phone?`<a class="btn o sm" target="_blank" rel="noopener" href="${waURL(x.c.phone,`🏍️ Acerto ${S.name}\n${x.os.length} entrega(s)\n`+x.os.map(o=>`#${o.number} ${o.neighborhood||""} ${brl(o.delivery_fee)}`).join("\n")+`\n\n*Total: ${brl(x.pay)}*`)}">📲 Mandar resumo pra ele</a>`:""}</div></div>`).join("")||'<p class="muted">Nenhuma entrega com entregador nesse período.</p>';
    $$("[data-pg]",m).forEach(bt=>bt.onclick=async()=>{const x=rows.find(r=>r.c.id==bt.dataset.pg);const today=new Date().toISOString().slice(0,10);
      let r=await sb.from("expenses").insert({description:`Entregas ${x.c.name} (${x.os.length})`,amount:Math.round(x.pay*100)/100,category:"Entregador / motoboy",due_date:today,paid:true,paid_at:today});
      if(r.error)r=await sb.from("expenses").insert({description:`Entregas ${x.c.name} (${x.os.length})`,amount:Math.round(x.pay*100)/100,category:"Entregador / motoboy",due_date:today,paid:true});
      if(r.error){toast(r.error.message);return} bt.disabled=true;bt.textContent="✓ Lançado nas despesas";toast("Pagamento lançado nas despesas")});
  };
  $$("[data-k]",m).forEach(b=>b.onclick=()=>{key=b.dataset.k;$$("[data-k]",m).forEach(x=>x.setAttribute("aria-current",x===b));acerto()});
  acerto();
}
