/* =========================================================
   Celular do entregador (link só dele, sem senha):
   liga o GPS, vê as entregas, abre a rota, liga pro cliente e marca "Entregue".
   Enquanto esta página fica aberta, a loja e o cliente veem onde ele está.
   ========================================================= */
const sb=supabase.createClient(GB_CONFIG.SUPABASE_URL,GB_CONFIG.SUPABASE_KEY,{auth:{persistSession:false}});
const K=new URLSearchParams(location.search).get("k")||"";
const app=document.getElementById("app");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl=v=>"R$ "+Number(v||0).toFixed(2).replace(".",",").replace(/\B(?=(\d{3})+(?!\d))/g,".");
const digits=s=>String(s||"").replace(/\D/g,"");
const hm=d=>new Date(d).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
const optName=x=>/^\d+\/\d+ /.test(x.name)||!(x.qty>1)?x.name:x.qty+"x "+x.name;
const OPEN=new Set();
let ME=null, gps={on:false,id:null,last:null,sent:null,err:"",pos:null}, wake=null, sure={};
try{gps.want=localStorage.getItem("gb_gps_"+K)==="1"}catch{}

function km(a,b,c,d){const R=6371,r=x=>x*Math.PI/180,x=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
async function load(){
  const {data,error}=await sb.rpc("courier_me",{p_token:K});
  if(error){if(!ME)app.innerHTML=`<div class="card"><b>Sem conexão.</b><p class="muted">Confira a internet do celular. Tentando de novo…</p></div>`;return}
  if(!data||!data.ok){stopGps();app.innerHTML=`<div class="card"><h2 style="margin:0 0 6px">🔗 Link inválido</h2><p class="muted">${data&&data.erro==="loja_bloqueada"?"A loja está fora do ar no momento.":"Esse link de entregador não existe ou foi desativado. Peça um link novo pra loja."}</p></div>`;return}
  ME=data; draw();
}
function gpsBox(){
  if(!("geolocation" in navigator)) return `<div class="gps err">Este celular não tem GPS no navegador.</div>`;
  if(gps.err) return `<button class="gps err" id="gp">⚠️ ${esc(gps.err)} · toque pra tentar de novo</button>`;
  if(gps.on) return `<button class="gps on" id="gp">📍 GPS LIGADO · a loja está vendo você${gps.sent?` · ${Math.max(0,Math.round((Date.now()-gps.sent)/1000))}s`:""}</button>`;
  return `<button class="gps off" id="gp">📍 LIGAR O GPS (toque aqui)</button>`;
}
function draw(){
  const os=ME.orders||[], p=gps.pos;
  document.title=(os.length?`(${os.length}) `:"")+"Entregador · "+ME.store;
  app.innerHTML=`<div class="row" style="justify-content:space-between"><div><b style="font-size:18px">🏍️ ${esc(ME.name)}</b><div class="muted">${esc(ME.store)} · ${ME.done_today} entregue(s) hoje</div></div><button class="btn o sm" id="rf">↻</button></div>
    <div id="gpsb">${gpsBox()}</div>
    <p class="muted" style="margin:-4px 0 0;font-size:12.5px">Enquanto esta página estiver <b>aberta na tela</b>, a loja e o cliente veem você chegando (a tela não apaga sozinha). Se abrir a rota no Maps ou Waze, <b>volte pra cá</b> quando der.</p>
    ${os.map(o=>{const addr=[[o.street,o.street_number].filter(Boolean).join(", "),o.neighborhood].filter(Boolean).join(" - ");
      const dest=o.lat&&o.lng?`${o.lat},${o.lng}`:encodeURIComponent(addr+", Fortaleza");
      const dist=p&&o.lat&&o.lng?km(p.lat,p.lng,o.lat,o.lng):null;
      const tr=o.change_for&&+o.change_for>+o.total?+o.change_for-o.total:0;
      const pay=/dinheiro/i.test(o.payment_method||"")?`💵 Dinheiro${tr?` · paga com ${brl(o.change_for)} → <b style="color:var(--y)">levar ${brl(tr)} de troco</b>`:" · sem troco"}`:/fiado/i.test(o.payment_method||"")?"📒 Fiado · não cobrar":/pix/i.test(o.payment_method||"")?"⚡ Pix":"💳 "+esc(o.payment_method||"");
      const wa=digits(o.customer_phone).length>=10?"https://wa.me/"+(digits(o.customer_phone).length<=11?"55":"")+digits(o.customer_phone)+"?text="+encodeURIComponent(`Olá, ${(o.customer_name||"").split(" ")[0]}! Aqui é o entregador do ${ME.store}. Estou chegando com seu pedido #${o.number} 🏍️`):"";
      return `<div class="card eo"><div class="row" style="justify-content:space-between"><h2>#${o.number}</h2>${dist!=null?`<b style="color:var(--y)">${dist<1?Math.round(dist*1000)+" m":dist.toFixed(1).replace(".",",")+" km"}</b>`:""}</div>
        <div class="big">👤 ${esc(o.customer_name||"Cliente")}</div>
        <div class="big">📍 ${esc(addr)}</div>${o.complement?`<div>🏠 ${esc(o.complement)}</div>`:""}${o.reference?`<div>📌 Ref.: ${esc(o.reference)}</div>`:""}
        <div class="pay">💰 Cobrar <span style="font-size:18px">${brl(o.total)}</span><br><span style="font-weight:600">${pay}</span></div>
        <details data-d="${o.id}" ${OPEN.has(o.id)?"open":""}><summary class="muted">Ver itens (${o.items.length})</summary>${o.items.map(i=>`<div>${+i.qty}x ${esc(i.name)}${(i.options||[]).length?` <span class="muted">(${i.options.map(x=>esc(optName(x))).join(", ")})</span>`:""}</div>`).join("")}</details>
        ${o.notes?`<div class="muted">📝 ${esc(o.notes)}</div>`:""}
        <div class="acts"><a class="btn o" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving">🗺️ Rota (Maps)</a><a class="btn o" target="_blank" rel="noopener" href="https://waze.com/ul?${o.lat&&o.lng?`ll=${o.lat},${o.lng}`:"q="+encodeURIComponent(addr)}&navigate=yes">🚗 Waze</a>
          ${o.customer_phone?`<a class="btn o" href="tel:${digits(o.customer_phone)}">📞 Ligar</a>`:""}${wa?`<a class="btn o" target="_blank" rel="noopener" href="${wa}">💬 "Estou chegando"</a>`:""}</div>
        <button class="btn" data-ok="${o.id}" style="padding:15px;justify-content:center;font-size:16px">${sure[o.id]?"Toque de novo pra confirmar ✔":"✔ ENTREGUE"}</button></div>`}).join("")||`<div class="card" style="text-align:center;padding:30px 16px"><div style="font-size:40px">🏍️</div><b>Nenhuma entrega com você agora.</b><p class="muted" style="margin:6px 0 0">Quando a loja mandar um pedido pra você, ele aparece aqui sozinho.</p></div>`}
    ${ME.store_phone?`<a class="btn o" style="justify-content:center" target="_blank" rel="noopener" href="https://wa.me/${digits(ME.store_phone).length<=11?"55":""}${digits(ME.store_phone)}">💬 Falar com a loja</a>`:""}
    <p class="muted" style="text-align:center;font-size:11px">Sistema VYNTRA</p>`;
  wire();
}
function wire(){
  const g=document.getElementById("gp"); if(g) g.onclick=()=>gps.on?stopGps(true):startGps();
  document.getElementById("rf").onclick=load;
  app.querySelectorAll("[data-d]").forEach(d=>d.ontoggle=()=>{d.open?OPEN.add(+d.dataset.d):OPEN.delete(+d.dataset.d)});
  app.querySelectorAll("[data-ok]").forEach(b=>b.onclick=async()=>{const id=+b.dataset.ok;
    if(!sure[id]){sure[id]=1;draw();setTimeout(()=>{if(sure[id]){delete sure[id];if(ME)draw()}},5000);return}
    b.disabled=true;b.textContent="Salvando…";
    const {data,error}=await sb.rpc("courier_done",{p_token:K,p_order:id}); delete sure[id];
    if(error||!data){alert("Não deu pra marcar. Confira a internet e tente de novo.");}
    await load()});
}
/* ---------- GPS ---------- */
async function keepAwake(){try{if("wakeLock" in navigator&&document.visibilityState==="visible"){wake=await navigator.wakeLock.request("screen")}}catch{}}
function startGps(){
  if(!("geolocation" in navigator)) return;
  gps.err=""; try{localStorage.setItem("gb_gps_"+K,"1")}catch{}
  if(gps.id!=null) navigator.geolocation.clearWatch(gps.id);
  gps.id=navigator.geolocation.watchPosition(onPos,e=>{gps.on=false;gps.err=e.code===1?"Você não deixou usar a localização. Libere nas configurações do navegador":"Não achei o sinal do GPS";redrawGps()},{enableHighAccuracy:true,maximumAge:5000,timeout:30000});
  gps.on=true; keepAwake(); redrawGps();
}
function stopGps(user){if(gps.id!=null)navigator.geolocation.clearWatch(gps.id);gps.id=null;gps.on=false;if(user){try{localStorage.setItem("gb_gps_"+K,"0")}catch{}}redrawGps()}
async function onPos(p){
  const c=p.coords; gps.pos={lat:c.latitude,lng:c.longitude}; gps.on=true; gps.err="";
  const moved=!gps.last||km(gps.last.lat,gps.last.lng,c.latitude,c.longitude)>0.03;
  if(gps.sent&&Date.now()-gps.sent<10000&&!moved) return redrawGps();
  if(gps.sent&&Date.now()-gps.sent<4000) return;
  gps.sent=Date.now(); gps.last={lat:c.latitude,lng:c.longitude};
  try{await sb.rpc("courier_ping",{p_token:K,p_lat:c.latitude,p_lng:c.longitude,p_acc:Math.round(c.accuracy||0)})}catch{}
  if(ME) draw();
}
function redrawGps(){const b=document.getElementById("gpsb");if(b){b.innerHTML=gpsBox();const g=document.getElementById("gp");if(g)g.onclick=()=>gps.on?stopGps(true):startGps()}}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){keepAwake();load()}});
// manda a posição de novo a cada 30 s mesmo parado (pra loja saber que está online)
setInterval(()=>{if(gps.on&&gps.last&&Date.now()-(gps.sent||0)>30000){gps.sent=Date.now();sb.rpc("courier_ping",{p_token:K,p_lat:gps.last.lat,p_lng:gps.last.lng,p_acc:null}).then(()=>{},()=>{})}redrawGps()},5000);
setInterval(load,20000);
if(!K){app.innerHTML=`<div class="card"><h2 style="margin:0 0 6px">🔗 Falta o link</h2><p class="muted">Abra o link que a loja mandou no seu WhatsApp.</p></div>`}
else{load().then(()=>{if(ME&&gps.want)startGps()})}
