/* =========================================================
   Entregas ao vivo: mapa com a loja, os entregadores (GPS do celular deles)
   e o destino de cada pedido que saiu pra entrega.
   (usa as funções do painel.js: sb, q, $, $$, esc, brl, toast, S…)
   ========================================================= */
function loadLeaflet(){
  if(window.L&&L.map) return Promise.resolve();
  if(window.__lf) return window.__lf;
  return window.__lf=new Promise((ok,no)=>{
    const c=document.createElement("link");c.rel="stylesheet";c.href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";document.head.appendChild(c);
    const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";s.onload=ok;s.onerror=()=>{window.__lf=null;no(new Error("Não carregou o mapa (internet?)"))};document.head.appendChild(s)});
}
const courierLink=c=>c&&c.token?location.origin+"/entregador/?k="+c.token:"";
const kmBetween=(a,b,c,d)=>{const R=6371,r=x=>x*Math.PI/180,x=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const kmTxt=d=>d<1?Math.round(d*1000)+" m":d.toFixed(1).replace(".",",")+" km";
const seenTxt=t=>{if(!t)return "GPS nunca ligado";const s=Math.round((Date.now()-new Date(t))/1000);return s<60?"agora":s<3600?"há "+Math.round(s/60)+" min":"há "+Math.floor(s/3600)+"h"};
const fresh=t=>t&&Date.now()-new Date(t)<3*60000;
function linkDrawer(c){
  const url=courierLink(c);
  const msg=`🏍️ Olá, ${c.name.split(" ")[0]}! Este é o seu link de entregador do *${S.name}*:\n${url}\n\nAbra no celular, toque em *LIGAR O GPS* e deixe a página aberta durante as entregas. Suas entregas aparecem ali, com a rota, o valor pra cobrar e o botão *ENTREGUE*.`;
  const dr=drawer("🔗 Link do celular · "+esc(c.name),`<p class="muted" style="margin-top:0">Esse link é <b>só dele</b> (não precisa de senha). Ele abre no celular, liga o GPS e pronto: você vê ele no mapa e o cliente acompanha o motoboy chegando.</p>
    <input class="in" readonly value="${esc(url)}" id="lu" onclick="this.select()">
    <div class="row"><button class="btn o" id="cp">📋 Copiar link</button>${c.phone?`<a class="btn" target="_blank" rel="noopener" href="${waURL(c.phone,msg)}">💬 Mandar pro WhatsApp dele</a>`:""}</div>
    ${OWNER()?`<details style="margin-top:10px"><summary class="muted" style="cursor:pointer">O link vazou ou o entregador saiu?</summary><button class="btn r sm" id="nt" style="margin-top:8px">Gerar link novo (o antigo para de funcionar)</button></details>`:""}`);
  $("#cp",dr).onclick=async()=>{try{await navigator.clipboard.writeText(url);toast("Link copiado")}catch{$("#lu",dr).select();document.execCommand("copy");toast("Link copiado")}};
  if($("#nt",dr))$("#nt",dr).onclick=async e=>{if(!e.target.dataset.sure){e.target.dataset.sure=1;e.target.textContent="Confirmar: gerar link novo";return}
    const tk=(crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)+Date.now()).replace(/-/g,"");
    await q(sb.from("couriers").update({token:tk}).eq("id",c.id));c.token=tk;COURIERS=null;toast("Link novo gerado. Mande pra ele de novo.");linkDrawer(c)};
}
let LV={map:null,layer:null,timer:null,fit:false};
async function pageAoVivo(m){
  const r0=await sb.from("couriers").select("*").order("name");
  if(r0.error||(r0.data[0]&&!("token" in r0.data[0]))){m.innerHTML=`<div class="top"><h1>🗺️ Entregas ao vivo</h1></div><div class="card"><b>Falta um passo no banco.</b><p class="muted">Rode a <b>parte 24</b> (arquivo 24-entregador-ao-vivo.sql) no Supabase → SQL Editor e recarregue a página.</p></div>`;return}
  m.innerHTML=`<div class="top"><h1>🗺️ Entregas ao vivo</h1><div class="muted" id="lvt">atualiza sozinho a cada 10 s</div></div>
    <div class="lvw"><div id="lvm" class="card" style="padding:0;overflow:hidden;min-height:420px"></div><div id="lvl" class="grid" style="align-content:start;gap:10px"></div></div>`;
  try{await loadLeaflet()}catch(e){$("#lvm").innerHTML=`<div class="empty">${esc(e.message)}</div>`}
  if(window.L&&L.map){
    const c0=S.store_lat!=null?[+S.store_lat,+S.store_lng]:[-3.7319,-38.5267];
    LV.map=L.map($("#lvm"),{zoomControl:true}).setView(c0,14);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{maxZoom:19,attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(LV.map);
    LV.layer=L.layerGroup().addTo(LV.map); LV.fit=false;
    setTimeout(()=>LV.map&&LV.map.invalidateSize(),200);
  }
  await lvTick(m,r0.data);
  clearInterval(LV.timer); LV.timer=setInterval(()=>{if(page!=="aovivo"){clearInterval(LV.timer);LV.map=null;return}lvTick(m)},10000);
}
async function lvTick(m,cs){
  if(!cs){const r=await sb.from("couriers").select("*").order("name");if(r.error)return;cs=r.data}
  const os=await q(sb.from("orders").select("id,number,status,customer_name,neighborhood,street,street_number,lat,lng,courier_id,dispatched_at,total,payment_method").eq("status","saiu_entrega").order("dispatched_at"));
  const active=cs.filter(c=>c.active);
  const pin=(html,cls)=>L.divIcon({className:"",html:`<div class="lvpin ${cls||""}">${html}</div>`,iconSize:null,iconAnchor:[18,18]});
  const pts=[];
  if(LV.map){LV.layer.clearLayers();
    if(S.store_lat!=null){L.marker([+S.store_lat,+S.store_lng],{icon:pin("🏪","st")}).addTo(LV.layer).bindTooltip(S.name);pts.push([+S.store_lat,+S.store_lng])}
    os.forEach(o=>{if(o.lat&&o.lng){L.marker([o.lat,o.lng],{icon:pin("📦 #"+o.number,"od")}).addTo(LV.layer).bindTooltip(`#${o.number} · ${o.customer_name||""} · ${o.neighborhood||""}`);pts.push([o.lat,o.lng])}});
    active.filter(c=>c.last_lat&&c.last_seen&&Date.now()-new Date(c.last_seen)<6*3600e3).forEach(c=>{
      L.marker([c.last_lat,c.last_lng],{icon:pin("🏍️ "+esc(c.name.split(" ")[0]),fresh(c.last_seen)?"cr":"cr old"),zIndexOffset:1000}).addTo(LV.layer).bindTooltip(`${c.name} · ${seenTxt(c.last_seen)}`);
      if(fresh(c.last_seen)) pts.push([c.last_lat,c.last_lng]);
      os.filter(o=>o.courier_id===c.id&&o.lat&&o.lng).forEach(o=>L.polyline([[c.last_lat,c.last_lng],[o.lat,o.lng]],{color:"#FFC400",weight:3,opacity:.7,dashArray:"6 8"}).addTo(LV.layer))});
    if(!LV.fit&&pts.length>1){LV.map.fitBounds(pts,{padding:[40,40],maxZoom:16});LV.fit=true}
  }
  const card=c=>{const mine=os.filter(o=>o.courier_id===c.id),on=fresh(c.last_seen);
    return `<div class="card grid" style="gap:6px"><div class="row" style="justify-content:space-between"><b>🏍️ ${esc(c.name)}</b><span class="pill ${on?"p-concluido":"p-inativo"}">${on?"● online":seenTxt(c.last_seen)}</span></div>
      ${mine.map(o=>{const d=on&&o.lat&&o.lng?kmBetween(c.last_lat,c.last_lng,o.lat,o.lng):null;
        return `<div class="line" data-ov="${o.id}" style="cursor:pointer"><span>📦 <b>#${o.number}</b> · ${esc(o.neighborhood||o.street||"")}<br><span class="muted" style="font-size:12px">saiu ${o.dispatched_at?hm(o.dispatched_at)+" ("+Math.round((Date.now()-new Date(o.dispatched_at))/60000)+" min)":""}</span></span><b style="color:var(--y)">${d!=null?kmTxt(d)+"<br><small class=muted>~"+Math.max(1,Math.round(d/22*60+1))+" min</small>":""}</b></div>`}).join("")||'<span class="muted" style="font-size:12.5px">Sem entrega agora.</span>'}
      <button class="btn o sm" data-lk="${c.id}" style="justify-self:start">🔗 Link do celular dele</button></div>`};
  const loose=os.filter(o=>!o.courier_id);
  $("#lvl",m).innerHTML=`${active.map(card).join("")||`<div class="card"><b>Nenhum entregador cadastrado.</b><p class="muted" style="margin:4px 0 0">Cadastre em Gestão → Entregadores.</p></div>`}
    ${loose.length?`<div class="card"><b>Saiu sem entregador escolhido</b>${loose.map(o=>`<div class="line" data-ov="${o.id}" style="cursor:pointer"><span>#${o.number} · ${esc(o.neighborhood||"")}</span></div>`).join("")}</div>`:""}
    <p class="muted" style="font-size:12px;margin:0">O entregador aparece no mapa quando abre o <b>link do celular</b> dele e liga o GPS. Pedido sem 📦 no mapa é porque o cliente não marcou a localização.</p>`;
  $$("[data-lk]",m).forEach(b=>b.onclick=()=>linkDrawer(cs.find(c=>c.id==b.dataset.lk)));
  $$("[data-ov]",m).forEach(b=>b.onclick=()=>orderDrawer(+b.dataset.ov));
  const t=$("#lvt",m); if(t) t.textContent="atualizado "+hm(new Date())+" · atualiza sozinho";
}
