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
  const dr=drawer(`Mandar pedido #${o.number} pro entregador`,`<p class="muted" style="margin:0">Toque no entregador: ele recebe no WhatsApp o endereço, o mapa, os itens e quanto cobrar, e o cliente recebe o aviso de <b>Saiu para entrega</b>. Tudo sozinho, pela extensão do WhatsApp.</p>
    ${list.map(c=>`<button class="btn ${o.courier_id===c.id?"":"o"}" data-cr="${c.id}" style="justify-content:space-between"><span>🏍️ ${esc(c.name)}</span><span class="muted" style="font-size:12px">${esc(c.phone||"sem telefone")}</span></button>`).join("")}
    <details><summary class="muted" style="cursor:pointer">Ver a mensagem</summary><pre style="white-space:pre-wrap;font:12.5px/1.4 inherit;background:var(--card-2);padding:10px;border-radius:8px">${esc(courierMsg(o,items))}</pre></details>`);
  $$("[data-cr]",dr).forEach(b=>b.onclick=async()=>{const c=list.find(x=>x.id==b.dataset.cr);
    let w=null, queued=false;
    if(c.phone&&digits(c.phone).length>=10){
      if(waOnline()) queued=await waQueue(c.phone,courierMsg(o,items),"entregador",o.id);   // extensão ligada: vai sozinho
      else w=window.open(waURL(c.phone,courierMsg(o,items)),"_blank");                     // desligada: abre o WhatsApp
      if(!queued&&!w) w=window.open(waURL(c.phone,courierMsg(o,items)),"_blank")}
    const up={courier_id:c.id,dispatched_at:new Date().toISOString()}; if(["novo","em_preparo","pronto"].includes(o.status))up.status="saiu_entrega";
    const r=await sb.from("orders").update(up).eq("id",o.id);
    if(r.error){toast(/courier_id|dispatched_at/.test(r.error.message)?"Rode a parte 14 do banco no Supabase":r.error.message);return}
    if(!w&&!c.phone)toast("Esse entregador está sem telefone; cadastre o WhatsApp dele");
    toast(queued?`🏍️ Pedido #${o.number} com ${c.name} · a extensão manda pra ele e avisa o cliente`:`Pedido #${o.number} com ${c.name} 🏍️`); if(page==="pedidos")PAGES.pedidos($("#main")); orderDrawer(o.id)});
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

/* ---------- CHATBOT E AVISOS AUTOMÁTICOS ---------- */
const BOT_DEFAULT={enabled:false,
  greet_open:"Olá, {nome}! 👋 Bem-vindo ao *{loja}* 🍻\nComo posso te ajudar?",
  greet_closed:"Olá, {nome}! 👋 No momento o *{loja}* está fechado. 😴\n{horario}\n\nMas você já pode olhar o cardápio:\n{link}",
  menu:[{key:"1",label:"Ver o cardápio e fazer pedido",reply:"É só tocar no link, escolher e finalizar por lá 👇\n{link}"},
    {key:"2",label:"Horário e endereço",reply:"🕐 {horario}\n📍 {endereco}"},
    {key:"3",label:"Falar com um atendente",reply:"Certo! Já vou chamar um atendente pra falar com você. 🙋 Só um instante.",human:true}],
  menu_footer:"Responda com o *número* da opção.",
  keywords:[{words:"cardapio, cardápio, menu, preço, precos, preços",reply:"Nosso cardápio com todos os preços 👇\n{link}"},
    {words:"pix",reply:"Aceitamos Pix sim! 😉 O pagamento é feito na entrega ou na retirada."},
    {words:"horario, horário, que horas, aberto, abre, fecha, funcionando",reply:"🕐 {horario}"},
    {words:"endereco, endereço, onde fica, localizacao, localização, onde voces ficam",reply:"📍 Estamos em: {endereco}"},
    {words:"entrega, entregam, delivery, taxa, frete, demora quanto",reply:"🛵 Entregamos sim! A taxa aparece no cardápio quando você coloca o endereço 👇\n{link}"},
    {words:"cartao, cartão, credito, crédito, debito, débito, maquininha",reply:"💳 Aceitamos cartão de crédito e débito na entrega ou na retirada."},
    {words:"meu pedido, cade, cadê, demorando, ta chegando, tá chegando",reply:"Vou verificar seu pedido agora! 🙏 Um atendente já te responde.",human:true},
    {words:"obrigado, obrigada, valeu, vlw, agradeco, agradeço",reply:"Nós que agradecemos! 🍻💛 Qualquer coisa é só chamar."},
    {words:"atendente, humano, pessoa, falar com alguem, falar com alguém",reply:"Certo! Já vou chamar um atendente. 🙋",human:true}],
  cooldown_hours:6,pause_hours:2,save_contacts:true};
const AUTO_DEFAULT={enabled:true,types:["delivery","retirada"],statuses:["em_preparo","saiu_entrega","pronto","concluido"]};
async function pageChatbot(m){
  const r0=await sb.from("store_settings").select("bot,wa_auto").eq("id",1).single();
  if(r0.error){m.innerHTML=`<div class="top"><h1>Chatbot e avisos</h1></div><p class="alert">Rode a <b>parte 15</b> do banco no Supabase pra configurar o robô.</p>`;return}
  const B=JSON.parse(JSON.stringify(Object.assign({},BOT_DEFAULT,r0.data.bot||{}))), A=Object.assign({},AUTO_DEFAULT,r0.data.wa_auto||{});
  const VARS='<span class="muted" style="font-size:12px">Pode usar: <b>{nome}</b> nome do cliente · <b>{loja}</b> · <b>{link}</b> link do cardápio · <b>{horario}</b> horário de funcionamento · <b>{endereco}</b></span>';
  const ST={em_preparo:"Pedido aceito / em preparo",saiu_entrega:"Saiu para entrega",pronto:"Pronto para retirada",concluido:"Concluído (obrigado + avaliação)",cancelado:"Cancelado"};
  const draw=()=>{
    m.innerHTML=`<div class="top"><h1>Chatbot e avisos</h1><button class="btn" id="sv">💾 Salvar</button></div>
    <div class="grid g2">
      <div class="card grid" style="align-content:start">
        <label class="chk" style="font-size:16px;font-weight:800"><input type="checkbox" id="be" ${B.enabled?"checked":""}> 🤖 Robô de respostas automáticas ligado</label>
        <p class="muted" style="margin:0;font-size:12.5px">Responde sozinho quem manda mensagem no WhatsApp da loja. Funciona com o <b>WhatsApp Web aberto</b> no computador e a extensão com <b>"Robô responde os clientes"</b> marcado.</p>
        <div class="row" style="font-size:12.5px;gap:14px"><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#25D366"></i> robô respondendo</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#FF8A00"></i> pediu atendente (toca som + botão AJUDA)</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3B82F6"></i> robô pausado</span></div>
        <label class="fld"><span>Mensagem de boas-vindas (loja aberta)</span><textarea class="in" id="go" rows="3">${esc(B.greet_open)}</textarea></label>
        <label class="fld"><span>Mensagem quando a loja está fechada</span><textarea class="in" id="gc" rows="4">${esc(B.greet_closed)}</textarea></label>${VARS}
        <div class="grid g2"><label class="fld"><span>Cumprimentar de novo depois de (horas)</span><input class="in" id="ch" inputmode="numeric" value="${B.cooldown_hours}"></label>
          <label class="fld"><span>Quando você responde na mão, pausar o robô por (horas)</span><input class="in" id="ph" inputmode="numeric" value="${B.pause_hours}"></label></div>
        <label class="chk"><input type="checkbox" id="scc" ${B.save_contacts!==false?"checked":""}> 📇 Salvar automaticamente os contatos novos em Clientes</label>
      </div>
      <div class="card grid" style="align-content:start"><b>📋 Menu de opções (vai junto com a boas-vindas)</b>
        ${B.menu.map((i,k)=>`<div class="card grid" style="gap:6px;background:var(--card-2)"><div class="row" style="flex-wrap:nowrap"><b style="width:28px">${k+1}</b><input class="in" data-ml="${k}" value="${esc(i.label)}" placeholder="Texto da opção"><button class="icb" data-mx="${k}" aria-label="Tirar">✕</button></div>
          <textarea class="in" data-mr="${k}" rows="2" placeholder="Resposta quando o cliente digitar ${k+1}">${esc(i.reply)}</textarea>
          <label class="chk" style="font-size:12.5px"><input type="checkbox" data-mh="${k}" ${i.human?"checked":""}> Essa opção chama um atendente (fica laranja e toca o som)</label></div>`).join("")}
        <button class="btn o sm" id="ma" style="justify-self:start">➕ Adicionar opção</button>
        <label class="fld"><span>Frase no fim do menu</span><input class="in" id="mf" value="${esc(B.menu_footer||"")}"></label>
      </div>
    </div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card grid" style="align-content:start"><b>🔑 Palavras-chave</b><p class="muted" style="margin:0;font-size:12.5px">Se o cliente escrever uma dessas palavras, o robô responde na hora. Separe as palavras com vírgula.</p>
        ${B.keywords.map((k,i)=>`<div class="card grid" style="gap:6px;background:var(--card-2)"><div class="row" style="flex-wrap:nowrap"><input class="in" data-kw="${i}" value="${esc(k.words)}" placeholder="pix, chave pix"><button class="icb" data-kx="${i}" aria-label="Tirar">✕</button></div>
          <textarea class="in" data-kr="${i}" rows="2" placeholder="Resposta">${esc(k.reply)}</textarea><label class="chk" style="font-size:12.5px"><input type="checkbox" data-kh="${i}" ${k.human?"checked":""}> Chama um atendente</label></div>`).join("")}
        <div class="row"><button class="btn o sm" id="ka">➕ Adicionar palavra-chave</button><button class="btn o sm" id="ks">✨ Adicionar respostas sugeridas</button></div></div>
      <div class="card grid" style="align-content:start">
        <label class="chk" style="font-size:16px;font-weight:800"><input type="checkbox" id="ae" ${A.enabled?"checked":""}> 📲 Avisos automáticos de status do pedido</label>
        <p class="muted" style="margin:0;font-size:12.5px">Quando o status do pedido muda (no painel, no caixa ou na extensão), o cliente recebe a mensagem no WhatsApp <b>sozinho</b>. Precisa do WhatsApp Web aberto, o painel do Geladão aberto dentro do WhatsApp e <b>"Envia os avisos de status sozinho"</b> marcado em um computador.</p>
        <b style="font-size:13px">Pra quais pedidos</b><div class="row">${[["delivery","🛵 Entrega"],["retirada","🏪 Retirada"],["balcao","🧾 Balcão"]].map(([k,l])=>`<label class="chk"><input type="checkbox" data-at="${k}" ${A.types.includes(k)?"checked":""}> ${l}</label>`).join("")}</div>
        <b style="font-size:13px">Quais avisos</b>${Object.entries(ST).map(([k,l])=>`<label class="chk"><input type="checkbox" data-as="${k}" ${A.statuses.includes(k)?"checked":""}> ${l}</label>`).join("")}
        <p class="muted" style="margin:0;font-size:12.5px">O texto de cada aviso você edita em <a href="#config" id="gcfg">Configurações → Mensagens do WhatsApp</a>.</p></div>
    </div>`;
    const read=()=>{B.enabled=$("#be").checked;B.greet_open=$("#go").value;B.greet_closed=$("#gc").value;B.cooldown_hours=+$("#ch").value||6;B.pause_hours=+$("#ph").value||2;B.save_contacts=$("#scc").checked;B.menu_footer=$("#mf").value;
      B.menu=B.menu.map((i,k)=>({key:String(k+1),label:$(`[data-ml="${k}"]`).value.trim(),reply:$(`[data-mr="${k}"]`).value,human:$(`[data-mh="${k}"]`).checked})).filter(i=>i.label);
      B.menu.forEach((i,k)=>i.key=String(k+1));
      B.keywords=B.keywords.map((x,i)=>({words:$(`[data-kw="${i}"]`).value,reply:$(`[data-kr="${i}"]`).value,human:$(`[data-kh="${i}"]`).checked})).filter(x=>x.words.trim()&&x.reply.trim());
      A.enabled=$("#ae").checked;A.types=$$("[data-at]",m).filter(c=>c.checked).map(c=>c.dataset.at);A.statuses=$$("[data-as]",m).filter(c=>c.checked).map(c=>c.dataset.as)};
    $("#ma",m).onclick=()=>{read();B.menu.push({key:"",label:"Nova opção",reply:""});draw()};
    $("#ka",m).onclick=()=>{read();B.keywords.push({words:"",reply:""});draw()};
    $("#ks",m).onclick=()=>{read();const have=new Set(B.keywords.map(k=>k.words.split(",")[0].trim().toLowerCase()));let n=0;
      BOT_DEFAULT.keywords.forEach(k=>{if(!have.has(k.words.split(",")[0].trim().toLowerCase())){B.keywords.push({...k});n++}});draw();toast(n?n+" resposta(s) adicionada(s) · confira e clique em Salvar":"Você já tem todas as sugeridas")};
    $$("[data-mx]",m).forEach(b=>b.onclick=()=>{read();B.menu.splice(+b.dataset.mx,1);draw()});
    $$("[data-kx]",m).forEach(b=>b.onclick=()=>{read();B.keywords.splice(+b.dataset.kx,1);draw()});
    $("#gcfg",m).onclick=e=>{e.preventDefault();go("config")};
    $("#sv",m).onclick=async()=>{read();const r=await sb.from("store_settings").update({bot:B,wa_auto:A}).eq("id",1);
      if(r.error){toast(r.error.message);return} S.bot=B;S.wa_auto=A;toast("Salvo · a extensão atualiza em até 1 minuto");draw()};
  };
  draw();
}
