/* =========================================================
   Estoque · entrada de mercadoria (vários produtos, por fardo ou unidade),
   saída com motivo (quebra, vencido, consumo, brinde) e histórico de compras.
   Precisa da parte 27 do banco. Usa as funções do painel.js (sb, q, $, $$, drawer, toast, brl…).
   ========================================================= */
const EST_REASONS=[["quebra","💥 Quebra / avaria"],["vencido","📅 Vencido"],["consumo","🍺 Consumo próprio"],["brinde","🎁 Brinde"],["outro","✏️ Outro"]];
const estNm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const estQty=v=>Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:2});
// "24 x Heineken" → 24
const estPack=name=>{const m=String(name||"").match(/^\s*(\d+)\s*x\s/i);return m&&+m[1]>1?+m[1]:null};
const estNeed27=e=>/register_stock_|stock_entries|auto_out|schema cache|does not exist|could not find/i.test(e&&e.message||"");
const estErr=e=>toast(estNeed27(e)?"Rode a parte 27 do banco no Supabase pra usar isso":"Erro: "+(e.message||e));

/* lista de produtos pra escolher (com busca pelo nome ou código de barras) */
function estPicker(prods,id){
  const opts=prods.filter(p=>p.status!=="inativo"||p.track_stock).map(p=>`<option value="${esc(p.name)}">${p.stock_parent_id?"fardo · ":""}${p.track_stock?"estoque "+estQty(p.stock_qty):""}</option>`).join("");
  return `<datalist id="${id}">${opts}</datalist>`;
}
function estFind(prods,v){const t=estNm(v);if(!t)return null;return prods.find(p=>estNm(p.name)===t)||prods.find(p=>p.barcode&&String(p.barcode)===String(v).trim())||null}

/* ================= ENTRADA DE MERCADORIA ================= */
function stockEntryDrawer(prods,preset,done){
  let rows=[]; const newRow=p=>{const pk=p&&!p.stock_parent_id&&estPack(p.name);return{name:p?p.name:"",mode:p&&p.stock_parent_id?"unit":(pk||!p?"box":"unit"),boxes:"",per:pk?String(pk):"",qty:"",cost:p&&p.cost_price?money(p.cost_price):"",costBy:"unit",price:"",exp:"",showMore:false}};
  rows.push(newRow(preset||null));
  const dr=drawer("📥 Entrada de mercadoria",`
    <div class="grid g2"><label class="fld"><span>Fornecedor (opcional)</span><input class="in" id="es" placeholder="Ex.: Distribuidora Ambev"></label>
    <label class="fld"><span>Nº da nota (opcional)</span><input class="in" id="ed"></label></div>
    ${estPicker(prods,"estp")}<div id="erows" class="grid" style="gap:12px;margin-top:12px"></div>
    <button class="btn o sm" id="eadd" style="margin-top:10px">＋ Adicionar outro produto</button>
    <label class="fld" style="margin-top:12px"><span>Observação</span><input class="in" id="eo" placeholder="Ex.: compra da sexta"></label>
    <div class="card" id="etot" style="margin-top:12px"></div>`,`<button class="btn" id="esv">Lançar entrada</button>`);
  const KID=r=>{const p=estFind(prods,r.name);return p&&p.stock_parent_id?prods.find(x=>x.id===p.stock_parent_id):null};
  const calc=r=>{const p=estFind(prods,r.name);const per=num(r.per)||1;
    const units=r.mode==="box"?(num(r.boxes)||0)*per:(num(r.qty)||0);
    const c=num(r.cost); const ucost=c==null?null:(r.mode==="box"&&r.costBy==="box"?c/per:c);
    const sale=num(r.price)??(p?(p.promo_price&&+p.promo_price<+p.price?+p.promo_price:+p.price):null);
    const kid=p&&p.stock_parent_id?prods.find(x=>x.id===p.stock_parent_id):null; const f=kid?(+p.stock_factor||1):1;
    return{p,units,ucost,sale,kid,f,line:ucost==null?0:units*ucost}};
  const info=r=>{const x=calc(r);if(!x.p)return r.name?'<span class="err">Produto não encontrado. Escolha da lista.</span>':"";
    if(!x.units)return"";
    const un=x.kid?`${estQty(x.units)} × ${x.f} = <b>${estQty(x.units*x.f)} un</b> de ${esc(x.kid.name)}`:`<b>${estQty(x.units)} un</b>`;
    const marg=x.ucost!=null&&x.sale?x.sale-x.ucost:null;
    return `<span class="muted">Entra ${un}${x.ucost!=null?` · custo ${brl(x.ucost)}/${x.kid?"fardo":"un"} · total <b>${brl(x.line)}</b>`:""}${marg!=null?` · lucro ${brl(marg)}/${x.kid?"fardo":"un"} <b style="color:${marg>0?"var(--green)":"var(--red)"}">(${Math.round(marg/x.sale*100)}%)</b>`:""}</span>`};
  const draw=()=>{
    $("#erows",dr).innerHTML=rows.map((r,i)=>`<div class="card grid" style="gap:8px;padding:12px" data-r="${i}">
      <div class="row" style="flex-wrap:nowrap;gap:6px"><input class="in" list="estp" data-k="name" value="${esc(r.name)}" placeholder="Produto (digite pra buscar)…" style="flex:1">${rows.length>1?`<button class="btn o sm" data-del="${i}" aria-label="Remover">✕</button>`:""}</div>
      ${KID(r)?`<p class="muted" style="margin:0;font-size:12.5px">Esse fardo usa o estoque de <b>${esc(KID(r).name)}</b>: cada fardo soma ${+estFind(prods,r.name).stock_factor||1} un lá.</p>`:`<div class="row" style="gap:6px"><button class="btn sm ${r.mode==="box"?"":"o"}" data-mode="box">📦 Por fardo/caixa</button><button class="btn sm ${r.mode==="unit"?"":"o"}" data-mode="unit">Por unidade</button></div>`}
      ${KID(r)?`<label class="fld"><span>Quantos fardos chegaram</span><input class="in" data-k="qty" inputmode="decimal" value="${esc(r.qty)}" placeholder="Ex.: 10"></label>`:r.mode==="box"?`<div class="grid g2"><label class="fld"><span>Quantos fardos/caixas</span><input class="in" data-k="boxes" inputmode="decimal" value="${esc(r.boxes)}" placeholder="Ex.: 10"></label><label class="fld"><span>Unidades em cada um</span><input class="in" data-k="per" inputmode="decimal" value="${esc(r.per)}" placeholder="Ex.: 24"></label></div>`
        :`<label class="fld"><span>Quantas unidades chegaram</span><input class="in" data-k="qty" inputmode="decimal" value="${esc(r.qty)}" placeholder="Ex.: 240"></label>`}
      <div class="grid g2"><label class="fld"><span>Custo ${KID(r)?"do fardo":r.mode==="box"?`<select class="in" data-k="costBy" style="display:inline;width:auto;padding:2px 6px;font-size:12px"><option value="unit" ${r.costBy==="unit"?"selected":""}>da unidade</option><option value="box" ${r.costBy==="box"?"selected":""}>do fardo</option></select>`:KID(r)?"":"da unidade"} (R$)</span><input class="in" data-k="cost" inputmode="decimal" value="${esc(r.cost)}" placeholder="0,00"></label>
      <label class="fld"><span>Novo preço de venda (opcional)</span><input class="in" data-k="price" inputmode="decimal" value="${esc(r.price)}" placeholder="manter"></label></div>
      ${r.showMore?`<label class="fld"><span>📅 Validade deste lote (opcional)</span><input class="in" type="date" data-k="exp" value="${esc(r.exp)}"></label>`:`<button class="btn o sm" data-more style="justify-self:start">📅 Informar validade</button>`}
      <div data-info style="font-size:13px">${info(r)}</div></div>`).join("");
    tot();
    $$("[data-r]",dr).forEach(el=>{const i=+el.dataset.r,r=rows[i];
      $$("[data-k]",el).forEach(inp=>{const ev=inp.tagName==="SELECT"?"onchange":"oninput";inp[ev]=()=>{r[inp.dataset.k]=inp.value;
        if(inp.dataset.k==="name"){const p=estFind(prods,inp.value);if(p){if(p.stock_parent_id){r.mode="unit";r.per=""}else{const pk=estPack(p.name);if(!r.per&&pk)r.per=String(pk)}if(!r.cost&&p.cost_price)r.cost=money(p.cost_price)}}
        if(inp.dataset.k==="costBy"||(inp.dataset.k==="name"&&estFind(prods,inp.value))){draw();return}
        $("[data-info]",el).innerHTML=info(r);tot()}});
      $$("[data-mode]",el).forEach(b=>b.onclick=()=>{r.mode=b.dataset.mode;draw()});
      const mo=$("[data-more]",el);if(mo)mo.onclick=()=>{r.showMore=true;draw()};
      const dl=$("[data-del]",el);if(dl)dl.onclick=()=>{rows.splice(i,1);draw()};
    });
  };
  const tot=()=>{const xs=rows.map(calc).filter(x=>x.p&&x.units);const t=xs.reduce((s,x)=>s+x.line,0);
    $("#etot",dr).innerHTML=`<div class="line"><span>Produtos</span><b>${xs.length}</b></div><div class="line"><span>Total da compra</span><b>${brl(t)}</b></div>`};
  $("#eadd",dr).onclick=()=>{rows.push(newRow(null));draw();const ins=$$('[data-k="name"]',dr);ins[ins.length-1].focus()};
  $("#esv",dr).onclick=async()=>{
    const items=[];for(const r of rows){if(!r.name.trim())continue;const x=calc(r);
      if(!x.p){toast("Escolha o produto da lista: "+r.name);return}
      if(!x.units){toast("Informe a quantidade de "+x.p.name);return}
      const it={product_id:x.p.id};
      if(r.mode==="box"){it.boxes=num(r.boxes);it.per_box=num(r.per)||1}else it.qty=num(r.qty);
      if(num(r.cost)!=null){if(r.mode==="box"&&r.costBy==="box")it.box_cost=num(r.cost);else it.unit_cost=num(r.cost)}
      if(num(r.price)!=null)it.sale_price=num(r.price); if(r.exp)it.expires_on=r.exp; items.push(it)}
    if(!items.length){toast("Adicione pelo menos um produto");return}
    const b=$("#esv",dr);b.disabled=true;b.textContent="Lançando…";
    const {data,error}=await sb.rpc("register_stock_entry",{p:{supplier:$("#es",dr).value,doc:$("#ed",dr).value,notes:$("#eo",dr).value,items}});
    if(error){b.disabled=false;b.textContent="Lançar entrada";estErr(error);return}
    closeDr();toast(`Entrada #${data.id} lançada · ${items.length} produto(s) · ${brl(data.total_cost)}`);done&&done();
  };
  draw();
}

/* ================= SAÍDA (quebra, vencido, consumo, brinde) ================= */
function stockExitDrawer(prods,preset,done){
  let rows=[{name:preset?preset.name:"",qty:""}];
  const dr=drawer("📤 Saída de estoque",`
    <label class="fld"><span>Motivo</span><select class="in" id="xr">${EST_REASONS.map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select></label>
    ${estPicker(prods,"estx")}<div id="xrows" class="grid" style="gap:8px;margin-top:12px"></div>
    <button class="btn o sm" id="xadd" style="margin-top:10px">＋ Adicionar outro produto</button>
    <label class="fld" style="margin-top:12px"><span>Observação</span><input class="in" id="xo" placeholder="Ex.: caiu da prateleira"></label>
    <p class="muted" id="xtot" style="margin:10px 0 0"></p>`,`<button class="btn r" id="xsv">Lançar saída</button>`);
  const calc=r=>{const p=estFind(prods,r.name);const n=num(r.qty)||0;const kid=p&&p.stock_parent_id?prods.find(x=>x.id===p.stock_parent_id):null;const f=kid?(+p.stock_factor||1):1;const t=kid||p;return{p,t,units:n*f,cost:t?(+t.cost_price||0)*n*f:0}};
  const info=r=>{const x=calc(r);if(!x.p)return r.name?'<span class="err">Produto não encontrado. Escolha da lista.</span>':"";if(!x.units)return"";
    return `<span class="muted">Sai <b>${estQty(x.units)} un</b>${x.t!==x.p?" de "+esc(x.t.name):""} · fica ${estQty((+x.t.stock_qty||0)-x.units)}${x.cost?` · prejuízo ${brl(x.cost)}`:""}</span>`};
  const tot=()=>{const v=rows.map(calc).reduce((s,x)=>s+x.cost,0);$("#xtot",dr).innerHTML=v?`Valor perdido (pelo custo): <b style="color:var(--red)">${brl(v)}</b>`:""};
  const draw=()=>{
    $("#xrows",dr).innerHTML=rows.map((r,i)=>`<div class="card grid" style="gap:6px;padding:10px" data-r="${i}"><div class="row" style="flex-wrap:nowrap;gap:6px"><input class="in" list="estx" data-k="name" value="${esc(r.name)}" placeholder="Produto…" style="flex:1"><input class="in" data-k="qty" inputmode="decimal" value="${esc(r.qty)}" placeholder="Qtd" style="width:80px">${rows.length>1?`<button class="btn o sm" data-del="${i}" aria-label="Remover">✕</button>`:""}</div><div data-info style="font-size:13px">${info(r)}</div></div>`).join("");
    tot();
    $$("[data-r]",dr).forEach(el=>{const i=+el.dataset.r,r=rows[i];
      $$("[data-k]",el).forEach(inp=>inp.oninput=()=>{r[inp.dataset.k]=inp.value;$("[data-info]",el).innerHTML=info(r);tot()});
      const dl=$("[data-del]",el);if(dl)dl.onclick=()=>{rows.splice(i,1);draw()}});
  };
  $("#xadd",dr).onclick=()=>{rows.push({name:"",qty:""});draw();const ins=$$('[data-k="name"]',dr);ins[ins.length-1].focus()};
  $("#xsv",dr).onclick=async()=>{
    const items=[];for(const r of rows){if(!r.name.trim())continue;const x=calc(r);
      if(!x.p){toast("Escolha o produto da lista: "+r.name);return} if(!num(r.qty)){toast("Informe a quantidade de "+x.p.name);return}
      items.push({product_id:x.p.id,qty:num(r.qty)})}
    if(!items.length){toast("Adicione pelo menos um produto");return}
    const b=$("#xsv",dr);b.disabled=true;
    const {data,error}=await sb.rpc("register_stock_exit",{p:{reason:$("#xr",dr).value,notes:$("#xo",dr).value,items}});
    if(error){b.disabled=false;estErr(error);return}
    closeDr();toast(`Saída lançada${+data.loss_value?" · "+brl(data.loss_value)+" pelo custo":""}`);done&&done();
  };
  draw();
}

/* ================= HISTÓRICO DE ENTRADAS (compras) ================= */
async function stockEntriesDrawer(){
  const {data,error}=await sb.from("stock_entries").select("*").order("created_at",{ascending:false}).limit(50);
  if(error){estErr(error);return}
  const total=data.reduce((s,e)=>s+(+e.total_cost||0),0);
  const dr=drawer("🧾 Entradas de mercadoria",`<p class="muted" style="margin-top:0">Últimas ${data.length} entradas · total ${brl(total)}</p>${data.map(e=>`<button class="line" data-e="${e.id}" style="width:100%;background:none;border:0;border-bottom:1px dashed var(--line);color:inherit;text-align:left;cursor:pointer"><span><b>#${e.id}</b> · ${dt(e.created_at)}${e.supplier?" · "+esc(e.supplier):""}<br><span class="muted" style="font-size:12px">${(e.items||[]).length} produto(s) · ${esc(e.created_by_name||"")}${e.doc?" · nota "+esc(e.doc):""}</span></span><b>${brl(e.total_cost)}</b></button>`).join("")||'<p class="muted">Nenhuma entrada ainda.</p>'}`);
  $$("[data-e]",dr).forEach(b=>b.onclick=()=>{const e=data.find(x=>x.id==b.dataset.e);
    drawer(`Entrada #${e.id} · ${dt(e.created_at)}`,`${e.supplier?`<p style="margin-top:0">Fornecedor: <b>${esc(e.supplier)}</b>${e.doc?` · Nota ${esc(e.doc)}`:""}</p>`:""}${(e.items||[]).map(i=>`<div class="line"><span><b>${esc(i.name)}</b>${i.via?` <span class="muted">(via ${esc(i.via)})</span>`:""}<br><span class="muted" style="font-size:12px">${i.boxes!=null?`${estQty(i.boxes)} × ${estQty(i.per_box||1)} = `:""}${estQty(i.units)} un${i.unit_cost!=null?" · "+brl(i.unit_cost)+"/un":""}${i.sale_price?" · venda "+brl(i.sale_price):""}${i.expires_on?" · vence "+new Date(i.expires_on+"T12:00").toLocaleDateString("pt-BR"):""}</span></span><b>${brl(i.line_cost)}</b></div>`).join("")}<div class="line"><span><b>Total</b></span><b>${brl(e.total_cost)}</b></div>${e.notes?`<p class="muted">${esc(e.notes)}</p>`:""}`)});
}

/* ---------- liga/desliga "em falta automático" ---------- */
async function stockAutoOutToggle(on){
  const {error}=await sb.from("store_settings").update({auto_out_of_stock:on}).eq("id",SID());
  if(error){estErr(error);return false}
  S.auto_out_of_stock=on;toast(on?"Em falta automático ligado":"Em falta automático desligado");return true;
}
