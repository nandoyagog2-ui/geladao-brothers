// Cardápio do cliente — Geladão Brothers
const sb = supabase.createClient(GB_CONFIG.SUPABASE_URL, GB_CONFIG.SUPABASE_KEY);

/* ---------- ícones (usados quando não tem foto) ---------- */
const ICON={can:'<rect x="16" y="8" width="32" height="48" rx="6"/><path d="M16 18h32M16 46h32M26 4h12"/>',long:'<path d="M28 4h8v10c0 4 6 8 6 16v26a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V30c0-8 6-12 6-16z"/><path d="M22 36h20"/>',small:'<path d="M27 6h10v8c6 3 9 9 9 16v24a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V30c0-7 3-13 9-16z"/><path d="M18 38h28"/>',bolt:'<rect x="16" y="6" width="32" height="52" rx="6"/><path d="M34 16l-8 16h8l-4 14 10-18h-8l4-12z"/>',ice:'<path d="M12 22l20-10 20 10v22L32 54 12 44z"/><path d="M12 22l20 10 20-10M32 32v22"/>',whisky:'<path d="M14 18h36l-4 36H18z"/><path d="M16 34h32"/><rect x="24" y="36" width="10" height="10" rx="2"/>',bottle:'<path d="M27 4h10v12l6 6v32a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4V22l6-6z"/><rect x="24" y="30" width="16" height="14"/>',gin:'<path d="M16 10h32L34 34v16h8v4H22v-4h8V34z"/><circle cx="46" cy="14" r="6"/>',cocktail:'<path d="M12 10h40L32 34z"/><path d="M32 34v18M22 54h20M44 4l-6 14"/>',wine:'<path d="M20 6h24c0 16-4 26-12 26S20 22 20 6z"/><path d="M32 32v18M22 54h20M21 16h22"/>',soda:'<path d="M26 4h12v6l4 6v38a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V16l4-6z"/><path d="M22 28h20v12H22z"/>',drop:'<path d="M32 6c10 14 16 23 16 32a16 16 0 0 1-32 0c0-9 6-18 16-32z"/>',chips:'<path d="M16 8h32l-3 8 3 8-3 8 3 8-3 8 3 8H16l3-8-3-8 3-8-3-8 3-8z"/>',smoke:'<rect x="8" y="34" width="48" height="10" rx="2"/><path d="M44 34v10M48 26c0-6 6-6 6-12M40 26c0-6 6-6 6-12"/>',combo:'<rect x="10" y="22" width="44" height="32" rx="3"/><path d="M10 32h44M32 22v32M32 22c-4-10-14-10-12-2s12 2 12 2c4-10 14-10 12-2s-12 2-12 2"/>'};
function iconFor(cat){const c=(cat||"").toLowerCase();
  if(c.includes("combo"))return"combo"; if(c.includes("lata"))return"can"; if(c.includes("buchud")||c.includes("litrinho"))return"small";
  if(c.includes("long"))return"long"; if(c.includes("energ"))return"bolt"; if(c.includes("gelo"))return"ice"; if(c.includes("whisk"))return"whisky";
  if(c.includes("gin"))return"gin"; if(c.includes("ice")||c.includes("drink")||c.includes("beats"))return"cocktail"; if(c.includes("vinho"))return"wine";
  if(c.includes("refri"))return"soda"; if(c.includes("água")||c.includes("agua"))return"drop"; if(c.includes("salgad")||c.includes("gulos"))return"chips";
  if(c.includes("taba")||c.includes("cigar"))return"smoke"; return"bottle";}
const svg=c=>`<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${ICON[iconFor(c)]}</svg>`;
const pic=p=>p.img?`<img src="${esc(p.img)}" alt="" loading="lazy">`:svg(p.c);
const NAVI={home:'<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',promo:'<circle cx="12" cy="12" r="8"/><path d="M9 15l6-6M9.5 9.5h0M14.5 14.5h0"/>',orders:'<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>',me:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'};

/* ---------- utilidades ---------- */
const brl=v=>"R$ "+Number(v||0).toFixed(2).replace(".",",");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\(.*?\)/g,"").toLowerCase().trim();
const digits=s=>String(s||"").replace(/\D/g,"");
const store={get(k,d){try{return JSON.parse(localStorage.getItem("gb_"+k))??d}catch{return d}},set(k,v){try{localStorage.setItem("gb_"+k,JSON.stringify(v))}catch{}}};

/* ---------- dados ---------- */
let S={}, CATS=[], PRODS=[], GROUPS=[], ZONES=[], PC=[], SUGG=[];
const price=p=>p.promo??p.p;
const pct=p=>p.promo?Math.round((1-p.promo/p.p)*100):0;
const priceHTML=p=>`<span class="price">${brl(price(p))}</span>${p.promo?`<span class="was">${brl(p.p)}</span><span class="off">-${pct(p)}%</span>`:""}`;
const byId=id=>PRODS.find(p=>p.id===id);

async function load(){
  const [s,c,p,g,o,pc,z,ps]=await Promise.all([
    sb.from("store_settings").select("*").eq("id",1).single(),
    sb.from("categories").select("*").eq("active",true).order("sort_order").order("name"),
    sb.from("products").select("id,category_id,name,description,price,promo_price,image_url,status,is_combo,featured,is_new,sort_order").neq("status","inativo").order("sort_order").order("name"),
    sb.from("complement_groups").select("*").eq("active",true),
    sb.from("complement_options").select("*").eq("active",true).order("sort_order"),
    sb.from("product_complements").select("*").order("sort_order"),
    sb.from("delivery_zones").select("*").eq("active",true).order("neighborhood"),
    sb.from("product_suggestions").select("*")
  ]);
  const err=[s,c,p].find(r=>r.error); if(err) throw err.error;
  S=s.data; CATS=c.data;
  const catName=Object.fromEntries(CATS.map(x=>[x.id,x.name]));
  PRODS=p.data.filter(x=>catName[x.category_id]).map(x=>({id:x.id,cid:x.category_id,c:catName[x.category_id],n:x.name,d:x.description,p:+x.price,promo:x.promo_price!=null&&+x.promo_price<+x.price?+x.promo_price:null,s:x.status==="ativo",img:x.image_url,feat:x.featured,isNew:x.is_new}));
  GROUPS=(g.data||[]).map(gr=>({...gr,options:(o.data||[]).filter(op=>op.group_id===gr.id)}));
  PC=pc.data||[]; ZONES=z.data||[]; SUGG=ps.data||[];
  document.title=S.name+" · Cardápio";
  if(S.primary_color) document.documentElement.style.setProperty("--y",S.primary_color);
}

/* ---------- horário ---------- */
const DAYS=["dom","seg","ter","qua","qui","sex","sab"];
function openInfo(){
  if(!S.is_open) return {open:false,text:"Fechado no momento"};
  const h=S.opening_hours||{}, now=new Date(), mins=now.getHours()*60+now.getMinutes(), toM=t=>{const[a,b]=(t||"0:0").split(":");return +a*60+ +b};
  const today=h[DAYS[now.getDay()]], yest=h[DAYS[(now.getDay()+6)%7]];
  if(yest&&!yest.closed&&toM(yest.close)<toM(yest.open)&&mins<toM(yest.close)) return {open:true,text:"Aberto até "+yest.close};
  if(today&&!today.closed){const o=toM(today.open),c=toM(today.close);
    if(c>o?(mins>=o&&mins<c):(mins>=o)) return {open:true,text:"Aberto até "+(c<o?"amanhã às ":"")+today.close};
    if(mins<o) return {open:false,text:"Fechado · abre hoje às "+today.open};}
  return {open:false,text:"Fechado no momento"};
}

/* ---------- estado ---------- */
let tab="home", cat=null, q="", searching=false, cart=store.get("cart",[]), ck=store.get("ck",{}), coupon=null;
const app=document.getElementById("app"), layer=document.getElementById("layer");
const saveCart=()=>store.set("cart",cart.map(i=>({id:i.p.id,n:i.n,obs:i.obs,opts:i.opts})));
function restoreCart(){cart=cart.map(i=>{const p=byId(i.id);return p&&p.s?{p,n:i.n,obs:i.obs||"",opts:i.opts||[]}:null}).filter(Boolean)}
const lineUnit=i=>price(i.p)+(i.opts||[]).reduce((s,o)=>s+o.price*o.qty,0);
const sub=()=>cart.reduce((s,i)=>s+lineUnit(i)*i.n,0);

/* ---------- telas ---------- */
function render(){
  if(tab==="home") cat?catView():homeView();
  if(tab==="promo") promoView();
  if(tab==="orders") ordersView();
  if(tab==="me") meView();
  navR(); fab();
}
function barHTML(){
  return `<div class="bar"><div class="wrap">
    ${cat?`<button class="ico" id="back" aria-label="Voltar">←</button>`:`<span class="mini">${esc(initials(S.name))}</span>`}
    <label class="sel"><select id="catsel" aria-label="Lista de categorias"><option value="">Lista de categorias</option>${CATS.map(c=>`<option value="${c.id}" ${cat&&c.id===cat.id?"selected":""}>${esc(c.name)}</option>`).join("")}</select>▾</label>
    <button class="ico" id="srch" aria-label="Buscar">🔍</button></div>
    ${searching?`<div class="wrap searchbox"><input id="q" placeholder="O que você procura?" value="${esc(q)}" autocomplete="off"></div>`:""}</div>`;
}
const initials=n=>String(n||"").split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
function wireBar(){
  app.querySelector("#catsel").onchange=e=>{cat=CATS.find(c=>c.id==e.target.value)||null;q="";searching=false;render();scrollTo(0,0)};
  app.querySelector("#srch").onclick=()=>{searching=!searching;q="";render();searching&&app.querySelector("#q").focus()};
  const b=app.querySelector("#back"); if(b) b.onclick=()=>{cat=null;render();scrollTo(0,0)};
  const i=app.querySelector("#q"); if(i) i.oninput=e=>{q=e.target.value;const pos=e.target.selectionStart;render();const n=app.querySelector("#q");n.focus();n.setSelectionRange(pos,pos)};
}
function homeView(){
  const term=norm(q), oi=openInfo();
  app.innerHTML=`${oi.open?"":`<div class="closed">${esc(oi.text)} · você pode olhar o cardápio</div>`}
  <div class="cover"${S.banner_url?` style="background:url('${esc(S.banner_url)}') center/cover"`:""}></div><div class="store"><div class="wrap">
    <div class="logo">${S.logo_url?`<img src="${esc(S.logo_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:esc(initials(S.name))}</div>
    <h1>${esc(S.name)}</h1>${S.address?`<div class="loc">📍 ${esc(S.address)}</div>`:""}
    <div class="open" style="${oi.open?"":"color:var(--red)"}">${esc(oi.text)}</div>
    <button class="fee" id="fee"><span>📍 Calcular taxa e tempo de entrega</span><b>›</b></button></div></div>
  ${barHTML()}<main class="wrap" id="m"></main>`;
  wireBar(); app.querySelector("#fee").onclick=feeSheet;
  const m=app.querySelector("#m");
  if(term){ m.innerHTML=`<div class="h2">Resultados</div><div class="rows"></div>`; list(m.querySelector(".rows"),PRODS.filter(p=>norm(p.n).includes(term))); return; }
  const feats=PRODS.filter(p=>p.feat);
  m.innerHTML=`${feats.length?`<div class="h2">Destaques</div><div class="rail" id="rail"></div>`:""}<div class="h2">Categorias</div><div class="cats" id="cats"></div><div class="foot">${esc(S.name)} · ${new Date().getFullYear()} · Todos os direitos reservados</div>`;
  feats.forEach(p=>m.querySelector("#rail").append(featCard(p)));
  CATS.forEach(c=>{
    const b=document.createElement("button"); b.className="ct";
    b.innerHTML=`<div class="tile${c.image_url?" has-img":""}">${c.image_url?`<img src="${esc(c.image_url)}" alt="">`:`<span class="brand">${esc(S.name).replace(" ","<br>")}</span>${svg(c.name)}`}</div><span>${esc(c.name)}</span>`;
    b.onclick=()=>{cat=c;render();scrollTo(0,0)}; m.querySelector("#cats").append(b);
  });
}
function featCard(p){
  const b=document.createElement("button"); b.className="feat"+(p.s?"":" out");
  b.innerHTML=`${p.s?"":'<span class="ribbon">Esgotado</span>'}<div class="ph">${pic(p)}</div><div class="b">${p.isNew?'<span class="new">NOVIDADE</span>':""}<div class="n">${esc(p.n)}</div><div class="pr">${priceHTML(p)}</div></div>`;
  b.onclick=()=>productSheet(p); return b;
}
function list(el,items){
  items.sort((a,b)=>b.s-a.s).forEach(p=>{
    const b=document.createElement("button"); b.className="row"+(p.s?"":" out");
    b.innerHTML=`${p.s?"":'<span class="ribbon">Esgotado</span>'}<div class="t">${p.isNew?'<span class="new">NOVIDADE</span>':""}<div class="n">${esc(p.n)}</div>${p.d?`<div class="d">${esc(p.d)}</div>`:""}<div class="pr">${priceHTML(p)}</div></div><div class="ph">${pic(p)}</div>`;
    b.onclick=()=>productSheet(p); el.append(b);
  });
  if(!items.length) el.innerHTML='<div class="empty">Nada encontrado.</div>';
}
function catView(){
  app.innerHTML=`${barHTML()}<main class="wrap"><div class="cathead"><div class="h2">${esc(cat.name)}</div></div><div class="rows" id="rows"></div><div class="foot">${esc(S.name)} · ${new Date().getFullYear()} · Todos os direitos reservados</div></main>`;
  wireBar(); const term=norm(q);
  list(app.querySelector("#rows"),PRODS.filter(p=>p.cid===cat.id&&(!term||norm(p.n).includes(term))));
}
function promoView(){
  app.innerHTML=`<main class="wrap"><div class="h2" style="margin-top:22px">Promoções</div><div class="rows" id="rows"></div></main>`;
  list(app.querySelector("#rows"),PRODS.filter(p=>p.promo));
}
function ordersView(){
  const mine=store.get("orders",[]);
  app.innerHTML=`<main class="wrap"><div class="h2" style="margin-top:22px">Seus pedidos</div><div id="o"></div></main>`;
  const o=app.querySelector("#o");
  if(!mine.length){o.innerHTML='<div class="empty">Você ainda não fez nenhum pedido por este celular.</div>';return}
  mine.slice().reverse().forEach(x=>{
    const b=document.createElement("button"); b.className="opt";
    b.innerHTML=`<div class="t">Pedido Nº ${x.number}<small>${new Date(x.at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})} · ${brl(x.total)}</small></div><span style="color:var(--y);font-size:12px;font-weight:700">Ver ›</span>`;
    b.onclick=()=>trackSheet(x.id,x.phone); o.append(b);
  });
}
function meView(){
  app.innerHTML=`<main class="wrap"><div class="h2" style="margin-top:22px">Perfil</div>
    <label class="field"><span>Seu nome</span><input id="nm" class="in" value="${esc(ck.nm||"")}" autocomplete="name"></label>
    <label class="field"><span>WhatsApp</span><input id="tel" class="in" inputmode="tel" value="${esc(ck.tel||"")}"></label>
    ${ck.addr?`<div class="grp">Endereço salvo</div><div class="ci"><div class="t"><b>${esc(ck.addr.street)}, ${esc(ck.addr.num)}</b><div class="sub">${esc(ck.addr.zoneName||"")} · ${esc(ck.addr.ref||"")}</div></div></div>`:""}
    <button class="btn c" id="sv" style="margin-top:16px">Salvar</button><p class="sub" id="ok" hidden style="color:var(--green)">Salvo ✓</p></main>`;
  app.querySelector("#tel").oninput=maskTel;
  app.querySelector("#sv").onclick=()=>{ck.nm=app.querySelector("#nm").value.trim();ck.tel=app.querySelector("#tel").value;store.set("ck",ck);app.querySelector("#ok").hidden=false};
}
function navR(){
  const w=document.querySelector("#nav .wrap"); w.innerHTML="";
  [["home","Início"],["promo","Promoções"],["orders","Pedidos"],["me","Perfil"]].forEach(([k,l])=>{
    const b=document.createElement("button"); b.setAttribute("aria-current",tab===k);
    b.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${NAVI[k]}</svg>${l}`;
    b.onclick=()=>{tab=k;if(k==="home"){cat=null;q="";searching=false}render();scrollTo(0,0)}; w.append(b);
  });
}
function fab(){
  const f=document.getElementById("fab"); f.hidden=!cart.length||!!layer.innerHTML;
  document.getElementById("fabq").textContent=cart.reduce((s,i)=>s+i.n,0);
  document.getElementById("fabt").textContent=brl(sub());
}
document.getElementById("fabb").onclick=()=>cartSheet();

/* ---------- camadas ---------- */
function sheet(title,body,foot,pop){
  layer.innerHTML=pop?`<div class="sheet pop">${body}</div>`:`<div class="sheet"><div class="sh"><div class="wrap"><b>${title}</b><button class="x" data-close aria-label="Fechar">✕</button></div></div><div class="wrap" id="sb">${body}</div>${foot?`<div class="sticky-b"><div class="wrap">${foot}</div></div>`:""}</div>`;
  layer.querySelectorAll("[data-close]").forEach(b=>b.onclick=close);
  layer.querySelectorAll("[data-home]").forEach(b=>b.onclick=()=>{close();tab="home";cat=null;render();scrollTo(0,0)});
  layer.querySelectorAll("[data-orders]").forEach(b=>b.onclick=()=>{close();tab="orders";render();scrollTo(0,0)});
  fab(); return layer;
}
function close(){layer.innerHTML="";fab()}
const L=s=>layer.querySelector(s);
layer.addEventListener("click",e=>{if(e.target.classList&&e.target.classList.contains("pop"))close()});
function maskTel(e){let d=digits(e.target.value).slice(0,11);e.target.value=d.length>2?`(${d.slice(0,2)}) ${d.slice(2,7)}${d.length>7?"-"+d.slice(7):""}`:d}

/* ---------- produto ---------- */
function productSheet(p,editIdx){
  if(!p.s) return;
  const ed=editIdx!=null?cart[editIdx]:null; let n=ed?ed.n:1;
  const groups=PC.filter(x=>x.product_id===p.id).map(x=>GROUPS.find(g=>g.id===x.group_id)).filter(g=>g&&g.options.length);
  const sel={}; (ed?ed.opts:[]).forEach(o=>sel[o.id]=o.qty);
  let obs=ed?ed.obs:"";
  const extra=()=>groups.flatMap(g=>g.options).reduce((s,o)=>s+(sel[o.id]||0)*o.price,0);
  const draw=()=>{
    sheet("",`<div class="ph bigph" style="margin-inline:-16px">${pic(p)}</div>
      <h2 style="margin:14px 0 4px;font-size:18px">${esc(p.n)}</h2>${p.d?`<p class="sub" style="color:var(--muted);margin:0 0 6px">${esc(p.d)}</p>`:""}<div class="pr">${priceHTML(p)}</div>
      ${groups.map(g=>`<div class="grp">${esc(g.name)}<small class="sub" style="color:var(--muted);font-weight:500"> · ${g.min_select>0?"obrigatório, ":""}escolha até ${g.max_select}</small></div><div class="opts">${g.options.map(o=>`<div class="optrow"><span>${esc(o.name)}${+o.price?` <span class="sub" style="color:var(--muted)">+ ${brl(o.price)}</span>`:""}</span><span class="step"><button data-o="${o.id}" data-g="${g.id}" data-d="-1" aria-label="Menos">−</button><span>${sel[o.id]||0}</span><button data-o="${o.id}" data-g="${g.id}" data-d="1" aria-label="Mais">+</button></span></div>`).join("")}</div>`).join("")}
      <div class="lbl"><span>Alguma observação?</span><span id="cnt">${obs.length} / 140</span></div>
      <textarea id="obs" class="in" rows="3" maxlength="140" placeholder="Ex.: bem gelada">${esc(obs)}</textarea><p class="err" id="e" hidden></p>`,
      `<div class="addrow"><span class="step"><button id="mi" aria-label="Menos">−</button><span>${n}</span><button id="pl" aria-label="Mais">+</button></span><button class="btn" id="add"><span>${ed?"Atualizar":"Adicionar"}</span><span>${brl((price(p)+extra())*n)}</span></button></div>`);
    const o=L("#obs"); o.oninput=()=>{obs=o.value;L("#cnt").textContent=o.value.length+" / 140"};
    L("#mi").onclick=()=>{n=Math.max(1,n-1);draw()}; L("#pl").onclick=()=>{n++;draw()};
    layer.querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>{
      const g=groups.find(x=>x.id==b.dataset.g), id=+b.dataset.o, d=+b.dataset.d;
      const used=g.options.reduce((s,x)=>s+(sel[x.id]||0),0);
      if(d>0&&(used>=g.max_select||(!g.allow_repeat&&(sel[id]||0)>=1))) return;
      sel[id]=Math.max(0,(sel[id]||0)+d); draw();
    });
    L("#add").onclick=()=>{
      const miss=groups.find(g=>g.options.reduce((s,x)=>s+(sel[x.id]||0),0)<g.min_select);
      if(miss){L("#e").hidden=false;L("#e").textContent="Escolha "+miss.name+".";return}
      const opts=groups.flatMap(g=>g.options).filter(x=>sel[x.id]).map(x=>({id:x.id,name:x.name,price:+x.price,qty:sel[x.id]}));
      if(ed){Object.assign(ed,{n,obs:obs.trim(),opts});saveCart();return cartSheet()}
      cart.push({p,n,obs:obs.trim(),opts}); saveCart(); close(); render();
    };
  }; draw();
}

/* ---------- sacola ---------- */
function suggestions(){
  const ids=new Set(cart.map(i=>i.p.id));
  let s=SUGG.filter(x=>ids.has(x.product_id)).map(x=>byId(x.suggested_id));
  if(!s.length) s=PRODS.filter(p=>p.feat);
  return [...new Set(s)].filter(p=>p&&p.s&&!ids.has(p.id)).slice(0,8);
}
function cartSheet(){
  if(!cart.length) return close();
  const sugs=suggestions();
  sheet(esc(S.name),`<div class="lbl" style="margin-top:12px"><span>Sua sacola</span></div>
    ${cart.map((i,k)=>`<div class="ci"><div class="ph mini-ph">${pic(i.p)}</div><div class="t"><div><span class="q">${i.n}x</span> ${esc(i.p.n)}</div>${i.opts.length?`<div class="sub">${i.opts.map(o=>o.qty+"x "+esc(o.name)).join(", ")}</div>`:""}${i.obs?`<div class="sub">Obs.: ${esc(i.obs)}</div>`:""}<div class="acts"><button data-ed="${k}">Editar</button><button data-rm="${k}">Remover</button></div></div><b>${brl(lineUnit(i)*i.n)}</b></div>`).join("")}
    <button class="link" data-close>Adicionar mais itens</button>
    ${sugs.length?`<div class="grp">Peça também</div><div class="rail" style="margin-top:8px">${sugs.map(p=>`<button class="sug" data-sg="${p.id}"><div class="ph">${pic(p)}</div><div class="b">${esc(p.n)}<div class="price">${brl(price(p))}</div></div></button>`).join("")}</div>`:""}
    <div class="sum"><div><span>Subtotal</span><span>${brl(sub())}</span></div><div><span>Taxa de entrega</span><span>A definir</span></div>${coupon?`<div><span>Cupom ${esc(coupon.code)}</span><span>${coupon.kind==="free_delivery"?"Entrega grátis":"- "+brl(discount())}</span></div>`:""}<div class="tot"><span>Total</span><span>${brl(sub()-discount())}</span></div></div>
    <button class="coupon" id="cup"><span>🎟️</span><span class="t"><b>Tem um cupom?</b><small>${coupon?"Cupom "+esc(coupon.code)+" aplicado":"Clique e insira o código"}</small></span>›</button>
    ${+S.min_order>0?`<p class="sub" style="color:var(--muted)">Pedido mínimo: ${brl(S.min_order)}</p>`:""}<p class="err" id="e" hidden></p><div style="height:12px"></div>`,
    `<button class="btn c" id="go">Continuar pedido</button>`);
  layer.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{cart.splice(+b.dataset.rm,1);saveCart();render();cartSheet()});
  layer.querySelectorAll("[data-ed]").forEach(b=>b.onclick=()=>productSheet(cart[+b.dataset.ed].p,+b.dataset.ed));
  layer.querySelectorAll("[data-sg]").forEach(b=>b.onclick=()=>{const p=byId(+b.dataset.sg);const needs=PC.some(x=>x.product_id===p.id);if(needs)return productSheet(p);cart.push({p,n:1,obs:"",opts:[]});saveCart();render();cartSheet()});
  L("#cup").onclick=couponPop;
  L("#go").onclick=()=>{
    const oi=openInfo(); if(!oi.open){L("#e").hidden=false;L("#e").textContent="A loja está fechada agora. "+oi.text+".";return}
    if(sub()<+S.min_order){L("#e").hidden=false;L("#e").textContent="O pedido mínimo é "+brl(S.min_order)+".";return}
    phonePop();
  };
}
function discount(){ if(!coupon) return 0; const s=sub(); if(coupon.kind==="percent") return Math.round(s*coupon.value)/100; if(coupon.kind==="fixed") return Math.min(+coupon.value,s); return 0; }
function couponPop(){
  sheet("",`<div class="modal"><h3>Cupom de desconto</h3><p>Digite o código do cupom</p><input id="cc" class="in" style="text-transform:uppercase;text-align:center" placeholder="EX.: BEMVINDO"><p class="err" id="e" hidden></p><div class="two"><button class="btn c o" id="cb">Voltar</button><button class="btn c" id="ok">Aplicar</button></div></div>`,"",true);
  L("#cb").onclick=cartSheet;
  L("#ok").onclick=async()=>{
    const code=L("#cc").value.trim().toUpperCase(); if(!code){coupon=null;return cartSheet()}
    L("#ok").disabled=true;
    const {data,error}=await sb.rpc("check_coupon",{p_code:code,p_subtotal:sub()});
    if(error||!data||!data.valid){L("#ok").disabled=false;L("#e").hidden=false;L("#e").textContent="Cupom inválido, vencido ou o pedido não atingiu o valor mínimo.";return}
    coupon={code,kind:data.kind,value:+data.value}; cartSheet();
  };
}

/* ---------- checkout ---------- */
function phonePop(){
  sheet("",`<div class="modal"><h3>Informe seu telefone</h3><p>Ele é importante para falarmos com você caso necessário</p>
    <input id="tel" class="in" inputmode="tel" placeholder="(00) 90000-0000" value="${esc(ck.tel||"")}" autocomplete="tel">
    <input id="nm" class="in" style="margin-top:8px" placeholder="Seu nome" value="${esc(ck.nm||"")}" autocomplete="name">
    <p class="err" id="e" hidden></p><button class="btn c" id="ok" style="margin-top:14px">Confirmar</button><button class="link" id="cb">Voltar</button></div>`,"",true);
  L("#tel").oninput=maskTel; L("#cb").onclick=cartSheet;
  L("#ok").onclick=()=>{const t=L("#tel").value,n=L("#nm").value.trim();if(digits(t).length<10||!n){L("#e").hidden=false;L("#e").textContent="Preencha seu nome e um telefone com DDD.";return}
    ck.tel=t;ck.nm=n;if(!ck.mode)ck.mode=S.accepts_delivery?"entrega":"retirada";store.set("ck",ck);step1()};
}
const stepsHTML=s=>`<div class="steps">${["Entrega","Pagamento","Confirmação"].map((l,i)=>`<div class="${i<s?"on":""}"><i></i>${l}</div>`).join("")}</div>`;
const KM=()=>S.delivery_mode==="km";
const zoneOf=()=>ck.addr&&!KM()?ZONES.find(z=>z.id===ck.addr.zone):null;
function distKm(la,ln){if(S.store_lat==null||la==null)return null;const R=6371,r=x=>x*Math.PI/180,dLa=r(la-S.store_lat),dLn=r(ln-S.store_lng);
  const h=Math.sin(dLa/2)**2+Math.cos(r(S.store_lat))*Math.cos(r(la))*Math.sin(dLn/2)**2;return Math.round(2*R*Math.asin(Math.sqrt(h))*10)/10}
const kmFee=d=>(+S.km_base_fee||0)+Math.max(0,Math.ceil(d-(+S.km_base_km||0)))*(+S.km_price||0);
const addrOk=()=>{const a=ck.addr;if(!a)return false;if(KM())return a.lat!=null&&a.dist!=null&&!(+S.km_max>0&&a.dist>+S.km_max);return !!zoneOf()};
const nbName=a=>KM()?(a&&a.bairro)||"":((ZONES.find(z=>z.id===(a&&a.zone))||{}).neighborhood||"");
const rawFee=()=>!addrOk()?0:KM()?kmFee(ck.addr.dist):+zoneOf().fee;
const fee=()=>ck.mode==="entrega"&&addrOk()&&!(coupon&&coupon.kind==="free_delivery")?rawFee():0;
const etaTxt=()=>{const z=zoneOf(),m=(z&&z.eta_minutes)||S.delivery_time_min;return `${m}-${z&&z.eta_minutes?m+10:S.delivery_time_max} min`};
const total=()=>sub()+fee()-discount();
const trocoTxt=()=>ck.troco?`Troco para ${brl(ck.troco)} · levar ${brl(ck.troco-total())} de troco`:"Não precisa de troco";
const sumHTML=()=>`<div class="sum"><div><span>Subtotal</span><span>${brl(sub())}</span></div><div><span>Taxa de entrega</span><span>${ck.mode==="retirada"?"Grátis":addrOk()?(fee()?brl(fee()):"Grátis"):"A definir"}</span></div>${discount()?`<div><span>Cupom ${esc(coupon.code)}</span><span>- ${brl(discount())}</span></div>`:""}<div class="tot"><span>Total</span><span>${brl(total())}</span></div></div>`;
function step1(){
  const a=addrOk()?ck.addr:null;
  sheet("Checkout",`${stepsHTML(1)}
    ${S.accepts_delivery?`<button class="opt" id="m1" aria-pressed="${ck.mode==="entrega"}"><span>🛵</span><span class="t">Receber no seu endereço${a?`<small>${esc(a.street)}, ${esc(a.num)} · ${esc(nbName(a))}</small><small>${KM()?String(a.dist).replace(".",",")+" km · ":""}Taxa ${rawFee()?brl(rawFee()):"grátis"} · ${etaTxt()}</small>`:"<small>Clique aqui e informe o endereço</small>"}</span><span class="radio"></span></button>
    ${a&&ck.mode==="entrega"?`<button class="link" id="ea" style="text-align:right;padding:6px 0">Editar endereço</button>`:""}`:""}
    ${S.accepts_pickup?`<button class="opt" id="m2" aria-pressed="${ck.mode==="retirada"}"><span>🏪</span><span class="t">Retirar no estabelecimento<small>${S.address?esc(S.address)+" · ":""}pronto em ${S.prep_time_min||10} min</small></span><span class="radio"></span></button>`:""}
    <p class="err" id="e" hidden></p>`,`<button class="btn" id="go"><span>CONTINUAR</span><span>›</span></button>`);
  const m1=L("#m1"),m2=L("#m2"),ea=L("#ea");
  if(m1) m1.onclick=()=>{ck.mode="entrega";a?step1():addrSheet()};
  if(m2) m2.onclick=()=>{ck.mode="retirada";step1()};
  if(ea) ea.onclick=addrSheet;
  L("#go").onclick=()=>{if(ck.mode==="entrega"&&!a){L("#e").hidden=false;L("#e").textContent="Informe o endereço de entrega.";return}store.set("ck",ck);step2()};
}
function addrSheet(){
  const a=ck.addr||{cep:"",street:"",num:"",zone:null,bairro:"",city:"",comp:"",ref:""};
  let gps=null;
  sheet("Endereço de entrega",`<div class="grid2"><label class="field"><span>CEP</span><input id="cep" class="in" inputmode="numeric" placeholder="00000-000" value="${esc(a.cep)}"></label><label class="field"><span>&nbsp;</span><button class="btn c o cepbtn" id="bc">Buscar</button></label></div>
    <p class="sub" id="cepmsg" style="color:var(--muted);font-size:12px;margin:6px 0 0">Não sabe o CEP? Preencha abaixo e escolha o bairro.</p>
    <div class="grid2"><label class="field"><span>Rua*</span><input id="street" class="in" value="${esc(a.street)}" autocomplete="address-line1"></label><label class="field"><span>Nº*</span><input id="num" class="in" value="${esc(a.num)}" inputmode="numeric"></label></div>
    ${KM()?`<label class="field"><span>Bairro*</span><input id="bairro" class="in" value="${esc(a.bairro||"")}"></label>
      <button class="btn c o" id="gps" type="button" style="margin-top:10px">📍 Usar minha localização (mais preciso)</button><p class="sub" id="gpsmsg" style="color:var(--muted);font-size:12px;margin:6px 0 0">Ajuda a calcular a taxa certinha. Use se estiver no endereço da entrega.</p>`
    :`<label class="field"><span>Bairro*</span><select id="zone" class="in"><option value="">Escolha seu bairro</option>${ZONES.map(z=>`<option value="${z.id}" ${z.id===a.zone?"selected":""}>${esc(z.neighborhood)} · ${+z.fee?"taxa "+brl(z.fee):"grátis"}</option>`).join("")}</select></label>`}
    <label class="field"><span>Complemento (Apto/Bloco/Casa)</span><input id="comp" class="in" value="${esc(a.comp)}"></label>
    <label class="field"><span>Ponto de referência*</span><input id="ref" class="in" value="${esc(a.ref)}"></label>
    <p class="err" id="e" hidden></p><div style="height:14px"></div>`,`<button class="btn c" id="ok">Confirmar</button><button class="link" id="cb">Voltar</button>`);
  L("#cep").oninput=e=>{let d=digits(e.target.value).slice(0,8);e.target.value=d.length>5?d.slice(0,5)+"-"+d.slice(5):d;if(d.length===8)lookup()};
  L("#bc").onclick=lookup;
  async function lookup(){
    const d=digits(L("#cep").value), msg=L("#cepmsg"); if(d.length!==8){msg.textContent="Digite os 8 números do CEP.";return}
    msg.textContent="Buscando…";
    try{const r=await fetch(`https://viacep.com.br/ws/${d}/json/`);const j=await r.json();
      if(j.erro){msg.textContent="CEP não encontrado. Preencha o endereço abaixo.";return}
      if(j.logradouro) L("#street").value=j.logradouro;
      a.city=j.localidade||""; a.uf=j.uf||"";
      if(KM()){L("#bairro").value=j.bairro||"";msg.textContent=`${j.bairro||""} · ${j.localidade}. Agora é só o número e a referência.`;L("#num").focus();return}
      const z=ZONES.find(z=>norm(z.neighborhood)===norm(j.bairro))||ZONES.find(z=>norm(j.bairro)&&(norm(z.neighborhood).includes(norm(j.bairro))||norm(j.bairro).includes(norm(z.neighborhood))));
      if(z){L("#zone").value=z.id;msg.textContent=`${j.bairro} · ${j.localidade}. Agora é só o número e a referência.`}
      else msg.textContent=!ZONES.length?"A loja ainda não cadastrou os bairros de entrega. Escolha Retirar no estabelecimento ou fale com a loja.":`Seu CEP é do bairro ${j.bairro||"?"} (${j.localidade}), que ainda não está na nossa área de entrega. Se você estiver perto de algum bairro da lista, escolha ele.`;
      L("#num").focus();
    }catch{msg.textContent="Não deu pra buscar o CEP agora. Preencha o endereço abaixo."}
  }
  if(L("#gps")) L("#gps").onclick=()=>{const m=L("#gpsmsg");if(!navigator.geolocation){m.textContent="Seu celular não liberou a localização.";return}m.textContent="Pegando sua localização…";
    navigator.geolocation.getCurrentPosition(p=>{gps={lat:p.coords.latitude,lng:p.coords.longitude};const d=distKm(gps.lat,gps.lng);m.innerHTML=`📍 Localização pega · <b>${String(d).replace(".",",")} km</b> da loja · taxa ${brl(kmFee(d))}`},
      ()=>{m.textContent="Não deu pra pegar a localização. Sem problema: calculamos pelo endereço."},{enableHighAccuracy:true,timeout:15000})};
  L("#cb").onclick=step1;
  if(KM()){L("#ok").onclick=async()=>{const v=k=>L("#"+k).value.trim();
    const n={...a,cep:v("cep"),street:v("street"),num:v("num"),bairro:v("bairro"),comp:v("comp"),ref:v("ref")};
    if(!n.street||!n.num||!n.ref||!n.bairro){L("#e").hidden=false;L("#e").textContent="Preencha rua, número, bairro e ponto de referência.";return}
    const btn=L("#ok"); btn.disabled=true; btn.textContent="Calculando a distância…";
    let pos=gps; if(!pos){const city=n.city||"";
      const tries=[`${n.street}, ${n.num}, ${n.bairro}, ${city}`,`${n.street}, ${n.bairro}, ${city}`,`${n.street}, ${city}`,`${n.bairro}, ${city}`];
      for(const qy of tries){try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(qy)}`);const j=await r.json();if(j[0]){pos={lat:+j[0].lat,lng:+j[0].lon};break}}catch{}}}
    btn.disabled=false; btn.textContent="Confirmar";
    if(!pos){L("#e").hidden=false;L("#e").textContent="Não achamos esse endereço no mapa. Toque em \"Usar minha localização\" ou confira a rua.";return}
    n.lat=pos.lat;n.lng=pos.lng;n.dist=distKm(pos.lat,pos.lng);
    if(+S.km_max>0&&n.dist>+S.km_max){L("#e").hidden=false;L("#e").textContent=`Esse endereço fica a ${String(n.dist).replace(".",",")} km. Entregamos até ${String(+S.km_max).replace(".",",")} km.`;return}
    ck.addr=n;ck.mode="entrega";store.set("ck",ck);step1()};return}
  L("#ok").onclick=()=>{const v=k=>L("#"+k).value.trim();const zid=+L("#zone").value||null;
    const n={cep:v("cep"),street:v("street"),num:v("num"),zone:zid,zoneName:(ZONES.find(z=>z.id===zid)||{}).neighborhood,comp:v("comp"),ref:v("ref")};
    if(!n.street||!n.num||!n.ref||!zid){L("#e").hidden=false;L("#e").textContent="Preencha rua, número, bairro e ponto de referência.";return}
    ck.addr=n;ck.mode="entrega";store.set("ck",ck);step1()};
}
function step2(){
  const methods=(S.payment_methods||[]);
  const online=methods.filter(m=>/pix/i.test(m)), onDel=methods.filter(m=>!/pix/i.test(m));
  if(ck.pay&&!methods.includes(ck.pay)) ck.pay=null;
  if(ck.pay&&/dinheiro/i.test(ck.pay)&&ck.troco&&ck.troco<=total()) ck.troco=null;
  sheet("Checkout",`${stepsHTML(2)}
    ${online.length?`<div class="grp">Pagar online</div>${online.map(optP).join("")}`:""}
    ${onDel.length?`<div class="grp">Pagar na ${ck.mode==="retirada"?"retirada":"entrega"}</div>${onDel.map(optP).join("")}`:""}
    ${sumHTML()}<p class="err" id="e" hidden></p><div style="height:14px"></div>`,`<button class="btn" id="go"><span>CONTINUAR</span><span>›</span></button><button class="link" id="bk">Voltar</button>`);
  layer.querySelectorAll("[data-pay]").forEach(b=>b.onclick=()=>{ck.pay=b.dataset.pay;ck.troco=null;/dinheiro/i.test(ck.pay)?trocoAsk():step2()});
  const et=L("#et"); if(et) et.onclick=e=>{e.stopPropagation();trocoVal()};
  L("#bk").onclick=step1;
  L("#go").onclick=()=>{if(!ck.pay){L("#e").hidden=false;L("#e").textContent="Escolha a forma de pagamento.";return}store.set("ck",{...ck,troco:null});step3()};
  function optP(n){const on=ck.pay===n,cash=/dinheiro/i.test(n);return `<button class="opt" data-pay="${esc(n)}" aria-pressed="${on}"><span>${/pix/i.test(n)?"⚡":cash?"💵":"💳"}</span><span class="t">${esc(n)}${on&&cash?`<small>${trocoTxt()} · <span id="et" style="color:var(--y);font-weight:700">EDITAR TROCO</span></small>`:""}${on&&/pix/i.test(n)&&S.pix_key?`<small>Chave Pix: ${esc(S.pix_key)}</small>`:""}</span><span class="radio"></span></button>`}
}
function trocoAsk(){
  sheet("",`<div class="modal"><p style="color:var(--fg)">Você vai pagar <b>${brl(total())}</b> em dinheiro</p><h3>Vai precisar de troco?</h3><div class="two"><button class="btn c o" id="no">Não</button><button class="btn c" id="yes">Sim</button></div></div>`,"",true);
  L("#no").onclick=step2; L("#yes").onclick=trocoVal;
}
function trocoVal(){
  sheet("",`<div class="modal"><h3>Troco pra quanto?</h3><p>Informe quanto você irá dar que calculamos o troco</p><p style="color:var(--fg);margin:0 0 8px">Total do pedido: <b>${brl(total())}</b></p><input id="tv" class="in" inputmode="decimal" placeholder="R$ 0,00" style="text-align:center"><div class="chips">${[20,50,100,200].filter(v=>v>total()).slice(0,3).map(v=>`<button data-v="${v}">${brl(v)}</button>`).join("")}</div><div class="change" id="chg"></div><p class="err" id="e" hidden></p><div class="two"><button class="btn c o" id="cb">Voltar</button><button class="btn c" id="ok">Confirmar</button></div></div>`,"",true);
  const val=()=>parseFloat(L("#tv").value.replace(/[^\d,\.]/g,"").replace(",","."));
  const upd=()=>{const v=val();L("#chg").textContent=v>total()?"Levar "+brl(v-total())+" de troco":""};
  L("#tv").oninput=upd; layer.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{L("#tv").value=b.dataset.v;upd()});
  L("#cb").onclick=step2;
  L("#ok").onclick=()=>{const v=val();if(!(v>total())){L("#e").hidden=false;L("#e").textContent="Informe um valor maior que "+brl(total());return}ck.troco=v;step2()};
}
function step3(){
  const a=ck.addr;
  sheet("Checkout",`${stepsHTML(3)}
    <div class="grp">Informações para ${ck.mode==="entrega"?"entrega":"retirada"}</div>
    <div class="ci"><div class="t"><b>👤 ${esc(ck.nm)}</b><div class="sub">${esc(ck.tel)}</div></div></div>
    <div class="ci"><div class="t">${ck.mode==="entrega"?`<b>📍 ${esc(a.street)}, ${esc(a.num)}</b><div class="sub">${esc(nbName(a))}${a.comp?" · "+esc(a.comp):""}<br>Ref.: ${esc(a.ref)}</div>`:"<b>🏪 Retirar no estabelecimento</b>"}</div><button data-e1 aria-label="Editar">✏️</button></div>
    <div class="grp">Itens</div>
    ${cart.map(i=>`<div class="ci"><div class="t"><span class="q">${i.n}x</span> ${esc(i.p.n)}${i.opts.length?`<div class="sub">${i.opts.map(o=>o.qty+"x "+esc(o.name)).join(", ")}</div>`:""}</div><b>${brl(lineUnit(i)*i.n)}</b></div>`).join("")}
    ${sumHTML()}
    <div class="grp">Pagamento</div><div class="ci"><div class="t"><b>${esc(ck.pay)}</b>${/dinheiro/i.test(ck.pay)?`<div class="sub">${trocoTxt()}</div>`:""}</div><button data-e2 aria-label="Editar">✏️</button></div>
    <label class="field"><span>Observação do pedido (opcional)</span><input id="nt" class="in" maxlength="200"></label>
    <p class="err" id="e" hidden></p><div style="height:14px"></div>`,
    `<button class="btn c" id="send">Enviar pedido</button><button class="link" id="bk">Voltar</button>`);
  L("[data-e1]").onclick=step1; L("[data-e2]").onclick=step2; L("#bk").onclick=step2;
  L("#send").onclick=async()=>{
    const btn=L("#send"); btn.disabled=true; btn.textContent="Enviando…";
    const payload={customer_name:ck.nm,customer_phone:ck.tel,type:ck.mode==="entrega"?"delivery":"retirada",
      zone_id:ck.mode==="entrega"&&!KM()?a.zone:null,lat:ck.mode==="entrega"&&KM()?String(a.lat):"",lng:ck.mode==="entrega"&&KM()?String(a.lng):"",neighborhood:ck.mode==="entrega"?nbName(a):"",cep:ck.mode==="entrega"?a.cep:null,street:ck.mode==="entrega"?a.street:null,
      street_number:ck.mode==="entrega"?a.num:null,complement:ck.mode==="entrega"?a.comp:null,reference:ck.mode==="entrega"?a.ref:null,
      payment_method:ck.pay,change_for:/dinheiro/i.test(ck.pay)&&ck.troco?String(ck.troco):"",coupon_code:coupon?coupon.code:"",notes:L("#nt").value.trim(),
      items:cart.map(i=>({product_id:i.p.id,qty:i.n,notes:i.obs,options:i.opts.map(o=>({option_id:o.id,qty:o.qty}))}))};
    const {data,error}=await sb.rpc("create_order",{p:payload});
    if(error){btn.disabled=false;btn.textContent="Enviar pedido";L("#e").hidden=false;L("#e").textContent="Não foi possível enviar: "+(error.message||"tente de novo")+".";return}
    const order={...data,at:new Date().toISOString(),items:cart.map(i=>({...i})),ck:JSON.parse(JSON.stringify(ck)),coupon,nb:ck.mode==="entrega"?nbName(a):""};
    const mine=store.get("orders",[]); mine.push({id:data.id,number:data.number,total:data.total,at:order.at,phone:ck.tel}); store.set("orders",mine.slice(-20));
    cart=[]; coupon=null; saveCart(); ck.troco=null; store.set("ck",ck); render(); sentSheet(order);
  };
}
function waMsg(o){
  const d=new Date(o.at), pad=x=>String(x).padStart(2,"0"), c=o.ck, a=c.addr;
  const M=["#### NOVO PEDIDO ####","",`#️⃣ Nº pedido: ${o.number}`,`feito em ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`,"",`👤 ${c.nm}`,c.tel,""];
  if(c.mode==="entrega") M.push("🛵 Endereço de entrega",`${a.street} ${a.num}`,...(a.comp?["Complemento: "+a.comp]:[]),`Bairro: ${o.nb}`,...(a.cep?["CEP: "+a.cep]:[]),`(${a.ref})`,"",`Link do endereço:`,a.lat!=null&&KM()?`https://maps.google.com/?q=${a.lat},${a.lng}`:`https://maps.google.com/?q=${encodeURIComponent(`${a.street}, ${a.num}, ${o.nb}`)}`,"");
  else M.push("🏪 Retirar no estabelecimento","");
  M.push("------- ITENS DO PEDIDO -------","");
  o.items.forEach(i=>{M.push(`*${i.n} x ${i.p.n}*`,`💵 ${i.n} x ${brl(lineUnit(i))} = ${brl(lineUnit(i)*i.n)}`);i.opts.forEach(x=>M.push(`   + ${x.qty}x ${x.name}`));if(i.obs)M.push("Obs.: "+i.obs);M.push("")});
  M.push("-------------------------------","",`SUBTOTAL: ${brl(o.subtotal)}`,`ENTREGA: ${c.mode==="entrega"?(+o.delivery_fee?brl(o.delivery_fee):"Grátis")+(o.distance_km!=null?` (${String(o.distance_km).replace(".",",")} km)`:""):"Retirada"}`);
  if(+o.discount) M.push(`CUPOM ${o.coupon?o.coupon.code:""}: - ${brl(o.discount)}`);
  M.push(`*VALOR FINAL: ${brl(o.total)}*`,"","PAGAMENTO",`*${c.pay}*: ${brl(o.total)}`);
  if(/dinheiro/i.test(c.pay)) M.push(...(c.troco?[`💵 Cliente vai pagar com: ${brl(c.troco)}`,`🔁 *Levar troco de: ${brl(o.change)}*`]:["Não precisa de troco"]));
  M.push("",`🕐 Prazo para ${c.mode==="entrega"?"entrega: "+S.delivery_time_min+"-"+S.delivery_time_max:"retirada: "+(S.prep_time_min||10)} min`);
  return M.join("\n");
}
function sentSheet(o){
  const msg=waMsg(o);
  sheet("Pedido enviado",`<div class="track"><small>Pedido Nº ${o.number}</small><b>Recebido!</b><div class="status"><i></i>Já chegou na loja</div></div>
    <p style="margin-top:16px">Pra confirmar mais rápido, mande o pedido também pelo WhatsApp da loja:</p>
    ${S.whatsapp?`<a class="btn c wa" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${digits(S.whatsapp).replace(/^(?!55)/,"55")}?text=${encodeURIComponent(msg)}">Enviar pedido pelo WhatsApp</a>`:""}
    <div class="lbl"><span>Resumo do pedido</span></div><pre class="msg" id="msg"></pre>
    <button class="link" id="cp">Copiar mensagem</button><div style="height:14px"></div>`,
    `<button class="btn c" id="tr">Acompanhar pedido</button><div class="two"><button class="btn c o" data-home>Voltar ao cardápio</button><button class="btn c o" data-orders>Meus pedidos</button></div>`);
  L("#msg").textContent=msg;
  L("#cp").onclick=async e=>{try{await navigator.clipboard.writeText(msg);e.target.textContent="Copiado ✓"}catch{const r=document.createRange();r.selectNodeContents(L("#msg"));getSelection().removeAllRanges();getSelection().addRange(r);e.target.textContent="Texto selecionado"}};
  L("#tr").onclick=()=>trackSheet(o.id,o.ck.tel);
}
const STATUS={novo:"Pedido recebido",em_preparo:"Pedido em preparação",saiu_entrega:"Saiu para entrega",pronto:"Pronto para retirada",concluido:"Pedido concluído",cancelado:"Pedido cancelado"};
async function trackSheet(id,phone){
  sheet("Detalhes do pedido",`<div class="loading" style="min-height:40vh">Carregando…</div>`);
  const {data:o,error}=await sb.rpc("get_order",{p_id:id,p_phone:phone});
  if(error||!o){sheet("Detalhes do pedido",`<div class="empty">Não encontramos esse pedido.</div>`,`<button class="btn c o" data-home>Voltar ao cardápio</button>`);return}
  const t0=new Date(o.created_at), mm=o.type==="delivery"?[S.delivery_time_min,S.delivery_time_max]:[S.prep_time_min||10,(S.prep_time_min||10)+10], hm=n=>new Date(t0.getTime()+n*6e4).toTimeString().slice(0,5);
  const cancel=o.status==="cancelado";
  sheet("Detalhes do pedido",`<div class="track"><small>Previsão de ${o.type==="delivery"?"entrega":"retirada"}</small><b>${hm(mm[0])} - ${hm(mm[1])}</b><div class="status"><i style="${cancel?"background:var(--red)":""}"></i>${STATUS[o.status]||o.status}</div></div>
    <div class="grp">Pedido Nº ${o.number}</div>
    ${o.items.map(i=>`<div class="ci"><div class="t"><span class="q">${i.qty}x</span> ${esc(i.name)}${(i.options||[]).length?`<div class="sub">${i.options.map(x=>x.qty+"x "+esc(x.name)).join(", ")}</div>`:""}</div><b>${brl(i.total)}</b></div>`).join("")}
    <div class="sum"><div><span>Subtotal</span><span>${brl(o.subtotal)}</span></div><div><span>Taxa de entrega</span><span>${o.type==="delivery"?(+o.delivery_fee?brl(o.delivery_fee):"Grátis"):"Retirada"}</span></div>${+o.discount?`<div><span>Desconto</span><span>- ${brl(o.discount)}</span></div>`:""}<div class="tot"><span>Total</span><span>${brl(o.total)}</span></div></div>
    <div class="grp">Pagamento</div><div class="ci"><div class="t"><b>${esc(o.payment_method)}</b>${o.change_for?`<div class="sub">Troco para ${brl(o.change_for)} · levar ${brl(o.change_for-o.total)} de troco</div>`:""}</div></div>
    <div class="grp">Informações para ${o.type==="delivery"?"entrega":"retirada"}</div>
    <div class="ci"><div class="t"><b>👤 ${esc(o.customer_name)}</b><div class="sub">${esc(o.customer_phone)}</div></div></div>
    ${o.type==="delivery"?`<div class="ci"><div class="t"><b>📍 ${esc(o.street)}, ${esc(o.street_number)}</b><div class="sub">${esc(o.neighborhood)}${o.complement?" · "+esc(o.complement):""}<br>${esc(o.reference||"")}</div></div></div>`:""}
    <button class="link" id="rf">Atualizar status</button><div style="height:14px"></div>`,
    `${S.whatsapp?`<a class="btn c" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${digits(S.whatsapp).replace(/^(?!55)/,"55")}">Falar com o estabelecimento</a>`:""}<div class="two"><button class="btn c o" data-home>Voltar ao cardápio</button><button class="btn c o" data-orders>Meus pedidos</button></div>`);
  L("#rf").onclick=()=>trackSheet(id,phone);
}
function feeSheet(){
  if(KM()){const ex=d=>brl(kmFee(d));return sheet("Taxa de entrega",`<p class="sub" style="color:var(--muted);margin-top:14px">A taxa depende da distância até você</p>
    <div class="ci"><div class="t"><b>Até ${String(+S.km_base_km).replace(".",",")} km</b></div><b class="price">${brl(S.km_base_fee)}</b></div>
    <div class="ci"><div class="t"><b>Cada km a mais</b></div><b class="price">+ ${brl(S.km_price)}</b></div>
    ${+S.km_max>0?`<div class="ci"><div class="t"><b>Entregamos até</b></div><b class="price">${String(+S.km_max).replace(".",",")} km</b></div>`:""}
    <p class="sub" style="color:var(--muted)">Exemplos: 3 km = ${ex(3)} · 5 km = ${ex(5)}. Tempo: ${S.delivery_time_min}-${S.delivery_time_max} min.</p>`)}
  sheet("Taxa de entrega",`<p class="sub" style="color:var(--muted);margin-top:14px">Bairros que atendemos</p>${ZONES.map(z=>`<div class="ci"><div class="t"><b>${esc(z.neighborhood)}</b><div class="sub">${z.eta_minutes||S.delivery_time_min}-${(z.eta_minutes||S.delivery_time_min)+10} min</div></div><b class="price">${+z.fee?brl(z.fee):"Grátis"}</b></div>`).join("")||'<div class="empty">Nenhum bairro cadastrado ainda.</div>'}`);
}
function promoPop(){
  const ps=PRODS.filter(p=>p.promo&&p.s); if(!ps.length) return;
  sheet("",`<div class="modal" style="max-width:420px;max-height:80vh;overflow:auto;text-align:left;padding:0"><div class="sh" style="background:var(--card)"><div class="wrap" style="padding-inline:16px"><b>Promoções</b><button class="x" data-close aria-label="Fechar">✕</button></div></div><div class="rows" id="pp" style="padding:12px"></div></div>`,"",true);
  list(L("#pp"),ps);
}

/* ---------- início ---------- */
(async()=>{
  try{ await load(); }
  catch(e){ app.innerHTML=`<div class="empty">Não foi possível carregar o cardápio agora. Tente de novo em instantes.</div>`; console.error(e); return; }
  restoreCart(); render();
  const qs=new URLSearchParams(location.search);
  if(qs.get("pedido")&&qs.get("tel")){ history.replaceState(null,"",location.pathname); trackSheet(+qs.get("pedido"),qs.get("tel")); return; }
  if(!sessionStorage.getItem("gb_promo")){ try{sessionStorage.setItem("gb_promo","1")}catch{} promoPop(); }
})();
