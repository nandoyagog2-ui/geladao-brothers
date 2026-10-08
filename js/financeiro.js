/* =========================================================
   GELADÃO BROTHERS — Financeiro completo (painel do dono)
   Usa as funções do painel.js (sb, q, brl, esc, $, $$, drawer...)
   ========================================================= */
const FIN_CATS=["Mercadoria (compra pra revenda)","Aluguel","Contas (luz, água, internet)","Salários e funcionários","Entregador / motoboy","Impostos / MEI","Gelo, copos e descartáveis","Manutenção e equipamentos","Marketing e divulgação","Taxas bancárias / sistema","Retirada do dono (pró-labore)","Outros"];
const isMerc=c=>/^mercadoria/i.test(c||"");
const isProLabore=c=>/pr[oó]-?labore|retirada do dono/i.test(c||"");
const pct=(a,b)=>b?a/b*100:0;
const fmtPct=v=>(isFinite(v)?v:0).toFixed(1).replace(".",",")+"%";
const ymd=d=>{const x=new Date(d);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0")};
const parseYmd=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
async function fetchAll(mk){let out=[],i=0;for(;;){const r=await q(mk().range(i,i+999));out=out.concat(r);if(r.length<1000)break;i+=1000}return out}
function delta(cur,prev,invert){if(!prev)return "";const d=(cur-prev)/Math.abs(prev)*100;if(!isFinite(d))return "";const good=invert?d<=0:d>=0;
  return `<span style="font-size:12px;font-weight:700;color:${good?"var(--green)":"var(--red)"}">${d>=0?"▲":"▼"} ${fmtPct(Math.abs(d))}</span>`}
const expDate=e=>e.due_date||e.paid_at||(e.created_at||"").slice(0,10);

function periodRange(key,custom){
  const t=new Date();t.setHours(0,0,0,0);const add=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  let a,b,label;
  if(key==="hoje"){a=t;b=add(t,1);label="Hoje"}
  else if(key==="ontem"){a=add(t,-1);b=t;label="Ontem"}
  else if(key==="7"){a=add(t,-6);b=add(t,1);label="Últimos 7 dias"}
  else if(key==="30"){a=add(t,-29);b=add(t,1);label="Últimos 30 dias"}
  else if(key==="mes"){a=new Date(t.getFullYear(),t.getMonth(),1);b=add(t,1);label="Este mês"}
  else if(key==="mespass"){a=new Date(t.getFullYear(),t.getMonth()-1,1);b=new Date(t.getFullYear(),t.getMonth(),1);label="Mês passado"}
  else if(key==="ano"){a=new Date(t.getFullYear(),0,1);b=add(t,1);label="Este ano"}
  else {a=parseYmd(custom.a);b=add(parseYmd(custom.b),1);label="Período escolhido"}
  const len=b-a, pa=new Date(a.getTime()-len), pb=a;
  if(key==="mes"||key==="mespass"){const pm=new Date(a.getFullYear(),a.getMonth()-1,1);return {a,b,label,pa:pm,pb:key==="mes"?new Date(pm.getFullYear(),pm.getMonth(),t.getDate()+1):a}}
  return {a,b,label,pa,pb};
}

/* ---------- cálculo ---------- */
function crunch(orders,exps,prods,fees){
  const P=Object.fromEntries(prods.map(p=>[p.id,p]));
  const costOf=i=>{if(i.unit_cost!=null)return +i.unit_cost;const p=P[i.product_id];if(!p)return null;
    if(+p.cost_price)return +p.cost_price;const par=p.stock_parent_id&&P[p.stock_parent_id];return par&&+par.cost_price?+par.cost_price*(+p.stock_factor||1):null};
  const done=orders.filter(o=>o.status==="concluido"), canc=orders.filter(o=>o.status==="cancelado"), open=orders.filter(o=>o.status!=="concluido"&&o.status!=="cancelado");
  const R={done,canc,open,fat:0,prod:0,fee:0,disc:0,cmv:0,noCostRev:0,taxas:0,byPay:{},byType:{},byDay:{},byHour:Array(24).fill(0),byHourV:Array(24).fill(0),byDow:Array(7).fill(0),items:{},cats:{},custs:{},fiadoVend:0};
  done.forEach(o=>{
    const tot=+o.total; R.fat+=tot; R.prod+= +o.subtotal; R.fee+= +o.delivery_fee||0; R.disc+= +o.discount||0;
    const ps=Array.isArray(o.payments)&&o.payments.length?o.payments:[{method:o.payment_method||"—",amount:tot}];
    let tx=0; ps.forEach(x=>{const m=x.method||"—",v=+x.amount;const f=v*((+fees[m]||0)/100);tx+=f;R.byPay[m]=R.byPay[m]||{v:0,n:0,tx:0};R.byPay[m].v+=v;R.byPay[m].n++;R.byPay[m].tx+=f;if(/fiado/i.test(m))R.fiadoVend+=v});
    R.taxas+=tx;
    const ty=o.type||"delivery"; R.byType[ty]=R.byType[ty]||{v:0,n:0,lb:0}; R.byType[ty].v+=tot; R.byType[ty].n++;
    let oc=0;
    (o.order_items||[]).forEach(i=>{const c=costOf(i),q2=+i.qty||0,v=+i.total||0;const k=i.product_id||i.name;
      R.items[k]=R.items[k]||{name:i.name,id:i.product_id,q:0,v:0,c:0,noCost:false};const it=R.items[k];it.q+=q2;it.v+=v;
      if(c==null){it.noCost=true;R.noCostRev+=v}else{it.c+=c*q2;oc+=c*q2}
      const cat=(P[i.product_id]||{}).category_id||0;R.cats[cat]=R.cats[cat]||{v:0,c:0,q:0};R.cats[cat].v+=v;R.cats[cat].c+=c==null?0:c*q2;R.cats[cat].q+=q2});
    R.cmv+=oc;
    const lb=tot-oc-tx; R.byType[ty].lb+=lb;
    const d=new Date(o.created_at), dk=ymd(d); R.byDay[dk]=R.byDay[dk]||{v:0,lb:0,n:0}; R.byDay[dk].v+=tot; R.byDay[dk].lb+=lb; R.byDay[dk].n++;
    R.byHour[d.getHours()]++; R.byHourV[d.getHours()]+=tot; R.byDow[d.getDay()]+=tot;
    const ck=o.customer_id||o.customer_phone||null; if(ck&&!/venda balc/i.test(o.customer_name||"")){R.custs[ck]=R.custs[ck]||{name:o.customer_name,n:0,v:0};R.custs[ck].n++;R.custs[ck].v+=tot}
  });
  R.lb=R.fat-R.cmv-R.taxas;
  R.despOp=exps.filter(e=>!isMerc(e.category)&&!isProLabore(e.category)).reduce((s,e)=>s+ +e.amount,0);
  R.proLabore=exps.filter(e=>isProLabore(e.category)).reduce((s,e)=>s+ +e.amount,0);
  R.compras=exps.filter(e=>isMerc(e.category)).reduce((s,e)=>s+ +e.amount,0);
  R.lucro=R.lb-R.despOp;
  R.ticket=done.length?R.fat/done.length:0;
  R.cancV=canc.reduce((s,o)=>s+ +o.total,0);
  return R;
}

/* ---------- tela: FINANCEIRO E LUCRO ---------- */
async function finDash(m){
  let key=(()=>{try{return localStorage.getItem("gb_fin_p")||"mes"}catch{return "mes"}})(), custom={a:ymd(new Date(Date.now()-6*864e5)),b:ymd(new Date())}, sortBy="lucro";
  m.innerHTML=`<div class="top"><h1>Financeiro e lucro</h1><div class="row"><button class="btn o sm" id="fx">⚙️ Taxas e meta</button><button class="btn o sm" id="csv">⬇️ Exportar vendas</button></div></div>
    <div class="tabs" id="pt" style="flex-wrap:wrap">${[["hoje","Hoje"],["ontem","Ontem"],["7","7 dias"],["30","30 dias"],["mes","Este mês"],["mespass","Mês passado"],["ano","Este ano"],["cust","📅 Escolher datas"]].map(([k,l])=>`<button data-k="${k}" aria-current="${k===key}">${l}</button>`).join("")}</div>
    <div class="row" id="cr" ${key==="cust"?"":"hidden"} style="margin-bottom:12px"><input class="in" type="date" id="ca" value="${custom.a}" style="width:170px"> até <input class="in" type="date" id="cb" value="${custom.b}" style="width:170px"><button class="btn sm" id="cg">Ver</button></div>
    <div id="fr"><div class="empty">Calculando…</div></div>`;
  $$("#pt [data-k]",m).forEach(b=>b.onclick=()=>{key=b.dataset.k;try{localStorage.setItem("gb_fin_p",key)}catch{};$$("#pt [data-k]",m).forEach(x=>x.setAttribute("aria-current",x===b));$("#cr",m).hidden=key!=="cust";if(key!=="cust")load()});
  $("#cg",m).onclick=()=>{custom={a:$("#ca",m).value,b:$("#cb",m).value};if(custom.a&&custom.b&&custom.a<=custom.b)load();else toast("Escolha as duas datas")};
  $("#fx",m).onclick=feesDrawer;
  let last=null;
  $("#csv",m).onclick=()=>{if(!last)return;const rows=[["Pedido","Data","Hora","Tipo","Cliente","Pagamento","Subtotal","Entrega","Desconto","Total","Custo","Lucro bruto","Situação"]];
    last.orders.forEach(o=>{const c=(o.order_items||[]).reduce((s,i)=>s+(i.unit_cost!=null?+i.unit_cost*i.qty:0),0);const d=new Date(o.created_at);
      rows.push([o.number,d.toLocaleDateString("pt-BR"),d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),o.type,o.customer_name||"",o.payment_method||"",money(o.subtotal),money(o.delivery_fee),money(o.discount),money(o.total),money(c),money(+o.total-c),o.status])});
    const csv="﻿"+rows.map(r=>r.map(x=>`"${String(x??"").replace(/"/g,'""')}"`).join(";")).join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`vendas-${ymd(last.rg.a)}-a-${ymd(new Date(last.rg.b-1))}.csv`;a.click()};

  function feesDrawer(){
    const methods=[...new Set(["Pix","Dinheiro","Cartão de crédito","Cartão de débito","Vale-refeição"].concat(S.payment_methods||[]))];
    const fees=S.payment_fees||{};
    const dr=drawer("Taxas e meta",`<p class="muted" style="margin:0">Quanto a maquininha / banco / app cobra em cada forma de pagamento. Essa taxa sai do seu lucro.</p>
      ${methods.map(x=>`<label class="row" style="flex-wrap:nowrap"><span style="flex:1">${esc(x)}</span><input class="in" data-fee="${esc(x)}" inputmode="decimal" style="width:90px" value="${fees[x]!=null?String(fees[x]).replace(".",","):""}" placeholder="0"> %</label>`).join("")}
      <label class="fld"><span>Meta de faturamento do mês (R$)</span><input class="in" id="mg" inputmode="decimal" value="${S.monthly_goal?money(S.monthly_goal):""}" placeholder="Ex.: 30.000,00"></label>`,`<button class="btn" id="sv">Salvar</button>`);
    $("#sv",dr).onclick=async()=>{const f={};$$("[data-fee]",dr).forEach(i=>{const v=num(i.value);if(v!=null)f[i.dataset.fee]=v});
      const {error}=await sb.from("store_settings").update({payment_fees:f,monthly_goal:num($("#mg",dr).value)}).eq("id",1);
      if(error){toast(/payment_fees|monthly_goal/.test(error.message)?"Rode a parte 12 do banco no Supabase primeiro":error.message);return}
      S.payment_fees=f;S.monthly_goal=num($("#mg",dr).value);closeDr();toast("Salvo");load()};
  }

  async function load(){
    const rg=periodRange(key,custom); $("#fr",m).innerHTML='<div class="empty">Calculando…</div>';
    const sel="id,number,total,subtotal,delivery_fee,discount,payment_method,payments,type,status,created_at,customer_id,customer_name,customer_phone,cash_session_id,coupon_code,order_items(product_id,name,qty,total,unit_cost)";
    const getO=(a,b)=>fetchAll(()=>sb.from("orders").select(sel).gte("created_at",a.toISOString()).lt("created_at",b.toISOString()).order("created_at"));
    let orders,prev,needSql=false;
    try{[orders,prev]=await Promise.all([getO(rg.a,rg.b),getO(rg.pa,rg.pb)])}
    catch(e){if(!/unit_cost|payments/.test(e.message))throw e;needSql=true;
      const sel2=sel.replace(",payments","").replace(",unit_cost","");const g2=(a,b)=>fetchAll(()=>sb.from("orders").select(sel2).gte("created_at",a.toISOString()).lt("created_at",b.toISOString()).order("created_at"));
      [orders,prev]=await Promise.all([g2(rg.a,rg.b),g2(rg.pa,rg.pb)])}
    const [exAll,prods,cats,bal,cred,sess]=await Promise.all([
      q(sb.from("expenses").select("*").limit(5000)),
      q(sb.from("products").select("id,name,price,cost_price,stock_parent_id,stock_factor,category_id,status").limit(5000)),
      q(sb.from("categories").select("id,name")),
      q(sb.from("customer_balances").select("id,balance")),
      q(sb.from("credit_entries").select("kind,amount,created_at").gte("created_at",rg.a.toISOString()).lt("created_at",rg.b.toISOString())),
      q(sb.from("cash_sessions").select("*").gte("opened_at",rg.a.toISOString()).lt("opened_at",rg.b.toISOString()))]);
    const inRg=(e,a,b)=>{const d=expDate(e);return d>=ymd(a)&&d<ymd(b)};
    const fees=S.payment_fees||{};
    const R=crunch(orders,exAll.filter(e=>inRg(e,rg.a,rg.b)),prods,fees), PR=crunch(prev,exAll.filter(e=>inRg(e,rg.pa,rg.pb)),prods,fees);
    last={orders,rg};
    const C=Object.fromEntries(cats.map(c=>[c.id,c.name]));
    const today=ymd(new Date());
    const aReceber=bal.filter(b=>+b.balance>0).reduce((s,b)=>s+ +b.balance,0);
    const venc=exAll.filter(e=>!e.paid&&e.due_date&&e.due_date<today), prox=exAll.filter(e=>!e.paid&&e.due_date&&e.due_date>=today&&e.due_date<=ymd(new Date(Date.now()+7*864e5)));
    const fiadoRec=cred.filter(c=>c.kind==="pagamento").reduce((s,c)=>s+ +c.amount,0);
    const entradas=Object.entries(R.byPay).filter(([k])=>!/fiado/i.test(k)).reduce((s,[,x])=>s+x.v,0)-R.taxas+fiadoRec;
    const pagas=exAll.filter(e=>e.paid&&(e.paid_at||expDate(e))>=ymd(rg.a)&&(e.paid_at||expDate(e))<ymd(rg.b));
    const saidas=pagas.reduce((s,e)=>s+ +e.amount,0);
    const quebra=sess.filter(s=>s.closed_at&&s.expected_amount!=null).reduce((s,x)=>s+(+x.closing_amount-+x.expected_amount),0);
    const ops={}; sess.forEach(s=>{const k=s.operator||"—";ops[k]=ops[k]||{t:0,v:0,n:0,q:0};ops[k].t++;if(s.closed_at&&s.expected_amount!=null)ops[k].q+= +s.closing_amount-+s.expected_amount});
    R.done.forEach(o=>{if(!o.cash_session_id)return;const s=sess.find(x=>x.id===o.cash_session_id);if(!s)return;const k=s.operator||"—";ops[k].v+= +o.total;ops[k].n++});
    const margem=pct(R.lucro,R.fat), mc=pct(R.lb,R.fat);
    // mês corrente: projeção, meta, ponto de equilíbrio
    const isMonth=key==="mes";
    const now=new Date(), dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(), dPassed=now.getDate();
    const proj=isMonth?R.fat/dPassed*dim:0, projL=isMonth?(R.lb/dPassed*dim)-R.despOp:0;
    const pe=mc>0?R.despOp/(mc/100):0;
    const goal=+S.monthly_goal||0;
    const noCostShare=pct(R.noCostRev,R.prod||R.fat);
    const missing=Object.values(R.items).filter(i=>i.noCost&&i.id).sort((a,b)=>b.v-a.v);
    const items=Object.values(R.items).map(i=>({...i,l:i.v-i.c})).sort((a,b)=>sortBy==="lucro"?b.l-a.l:sortBy==="q"?b.q-a.q:sortBy==="margem"?(pct(b.l,b.v)-pct(a.l,a.v)):b.v-a.v);
    const days=[]; for(let d=new Date(rg.a);d<rg.b;d.setDate(d.getDate()+1))days.push(ymd(d));
    const hourly=days.length<=1;
    const series=hourly?R.byHourV.map((v,h)=>({k:h+"h",v,lb:null})):days.map(k=>({k,v:(R.byDay[k]||{}).v||0,lb:(R.byDay[k]||{}).lb||0}));
    const mx=Math.max(1,...series.map(x=>x.v));
    const TYP={delivery:"🛵 Entrega",retirada:"🏪 Retirada",balcao:"🧾 Balcão"};
    const DOWN=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
    const topC=Object.values(R.custs).sort((a,b)=>b.v-a.v).slice(0,8);
    const dre=[
      ["Vendas de produtos",R.prod,""],["+ Taxas de entrega cobradas",R.fee,""],["− Descontos e cupons",-R.disc,""],
      ["= Faturamento (receita)",R.fat,"b"],
      ["− Custo das mercadorias vendidas (CMV)",-R.cmv,""],["− Taxas da maquininha / apps",-R.taxas,""],
      ["= Lucro bruto",R.lb,"b"],
      ["− Despesas da loja (aluguel, luz, salários…)",-R.despOp,""],
      ["= LUCRO REAL (líquido)",R.lucro,"big"],
      ["− Retirada do dono (pró-labore)",-R.proLabore,""],["= Sobra no negócio",R.lucro-R.proLabore,"b"]];

    $("#fr",m).innerHTML=`
      ${needSql?'<p class="alert">⚠️ Rode a <b>parte 12</b> do banco no Supabase pra o lucro ficar exato (custo guardado em cada venda).</p>':""}
      ${R.noCostRev>0?`<p class="alert">⚠️ <b>${fmtPct(noCostShare)}</b> das vendas são de produtos <b>sem preço de custo</b> cadastrado, então o lucro está maior do que o real. <button class="btn sm" id="fixc" style="margin-left:6px">Cadastrar custos (${missing.length})</button></p>`:""}
      <div class="muted" style="margin:-4px 0 10px;font-size:12.5px">${rg.label}: ${rg.a.toLocaleDateString("pt-BR")} a ${new Date(rg.b-1).toLocaleDateString("pt-BR")} · comparando com o período anterior</div>
      <div class="stats">
        <div class="stat"><small>Faturamento</small><b>${brl(R.fat)}</b>${delta(R.fat,PR.fat)}</div>
        <div class="stat" style="border-color:${R.lucro>=0?"var(--green)":"var(--red)"}"><small>💰 Lucro real</small><b style="color:${R.lucro>=0?"var(--green)":"var(--red)"}">${brl(R.lucro)}</b>${delta(R.lucro,PR.lucro)}</div>
        <div class="stat"><small>Margem de lucro</small><b>${fmtPct(margem)}</b><span class="muted" style="font-size:12px">bruta ${fmtPct(mc)}</span></div>
        <div class="stat"><small>Pedidos · ticket médio</small><b>${R.done.length} · ${brl(R.ticket)}</b>${delta(R.done.length,PR.done.length)}</div>
      </div>
      ${isMonth?`<div class="stats">
        <div class="stat"><small>📈 Previsão do mês (faturamento)</small><b>${brl(proj)}</b><span class="muted" style="font-size:12px">no ritmo de ${brl(R.fat/dPassed)}/dia</span></div>
        <div class="stat"><small>Previsão de lucro real no mês</small><b style="color:${projL>=0?"var(--green)":"var(--red)"}">${brl(projL)}</b></div>
        <div class="stat"><small>⚖️ Ponto de equilíbrio</small><b>${pe?brl(pe):"—"}</b><span class="muted" style="font-size:12px">${pe?(R.fat>=pe?"✓ já pagou as despesas":"falta vender "+brl(pe-R.fat)):"lance as despesas"}</span></div>
        <div class="stat"><small>🎯 Meta do mês</small>${goal?`<b>${fmtPct(pct(R.fat,goal))}</b><div style="height:6px;background:var(--card-2);border-radius:3px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${Math.min(100,pct(R.fat,goal))}%;background:var(--y)"></div></div><span class="muted" style="font-size:12px">${brl(R.fat)} de ${brl(goal)}</span>`:`<b>—</b><span class="muted" style="font-size:12px">defina em ⚙️ Taxas e meta</span>`}</div>
      </div>`:""}
      <div class="grid g2">
        <div class="card"><b>📊 Demonstrativo de resultado (DRE)</b>
          ${dre.map(([l,v,c])=>`<div class="line ${c==="big"?"big":""}" style="${c?"font-weight:800;":""}${c==="big"?"border-top:2px solid var(--line);":""}"><span>${l}</span><span style="color:${c==="big"?(v>=0?"var(--green)":"var(--red)"):v<0?"var(--red)":"inherit"}">${brl(v)}</span></div>`).join("")}
          <p class="muted" style="font-size:12px;margin:8px 0 0">Compras de mercadoria (${brl(R.compras)}) não entram aqui como despesa: o custo já entra no CMV quando o produto é vendido. Elas aparecem no fluxo de caixa.</p></div>
        <div class="card"><b>${hourly?"Faturamento por hora":"Faturamento e lucro bruto por dia"}</b>
          <div style="display:flex;align-items:flex-end;gap:3px;height:170px;padding-top:10px;margin-bottom:22px">${series.map(x=>`<div title="${hourly?x.k:parseYmd(x.k).toLocaleDateString("pt-BR")}: ${brl(x.v)}${x.lb!=null?" · lucro bruto "+brl(x.lb):""}" style="flex:1;min-width:4px;height:100%;display:flex;align-items:flex-end;gap:1px;position:relative">
            <div style="flex:1;height:${Math.max(1,x.v/mx*100)}%;background:var(--y);border-radius:3px 3px 0 0"></div>${x.lb!=null?`<div style="flex:1;height:${Math.max(0,x.lb/mx*100)}%;background:var(--green);border-radius:3px 3px 0 0"></div>`:""}
            <span style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--muted);white-space:nowrap">${hourly?(+x.k.replace("h","")%3===0?x.k:""):series.length<=16?parseYmd(x.k).getDate():(parseYmd(x.k).getDate()%5===1?parseYmd(x.k).getDate():"")}</span></div>`).join("")}</div>
          <div class="row" style="font-size:12px"><span><span style="display:inline-block;width:10px;height:10px;background:var(--y);border-radius:2px"></span> Faturamento</span>${hourly?"":`<span><span style="display:inline-block;width:10px;height:10px;background:var(--green);border-radius:2px"></span> Lucro bruto</span>`}</div></div>
      </div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><b>💵 Fluxo de caixa (dinheiro que entrou e saiu)</b>
          <div class="line"><span>Recebido nas vendas (sem fiado)</span><span>${brl(entradas+R.taxas-fiadoRec)}</span></div>
          <div class="line"><span>− Taxas da maquininha</span><span style="color:var(--red)">${brl(-R.taxas)}</span></div>
          <div class="line"><span>+ Fiado recebido</span><span>${brl(fiadoRec)}</span></div>
          <div class="line"><span>− Contas pagas no período</span><span style="color:var(--red)">${brl(-saidas)}</span></div>
          <div class="line big"><span>Saldo do período</span><span style="color:${entradas-saidas>=0?"var(--green)":"var(--red)"}">${brl(entradas-saidas)}</span></div>
          <div class="line"><span class="muted">Vendido no fiado (ainda não entrou)</span><span>${brl(R.fiadoVend)}</span></div></div>
        <div class="card"><b>📌 A receber e a pagar</b>
          <div class="line"><span>📒 Fiado a receber (total)</span><b style="color:var(--y)">${brl(aReceber)}</b></div>
          <div class="line"><span>🔴 Contas vencidas</span><b style="color:${venc.length?"var(--red)":"inherit"}">${venc.length} · ${brl(venc.reduce((s,e)=>s+ +e.amount,0))}</b></div>
          <div class="line"><span>🟡 Vencem nos próximos 7 dias</span><b>${prox.length} · ${brl(prox.reduce((s,e)=>s+ +e.amount,0))}</b></div>
          ${venc.concat(prox).slice(0,6).map(e=>`<div class="line" style="font-size:12.5px"><span class="muted">${parseYmd(e.due_date).toLocaleDateString("pt-BR")} · ${esc(e.description)}</span><span>${brl(e.amount)}</span></div>`).join("")}
          <div class="line"><span>⚠️ Quebra de caixa no período</span><b style="color:${quebra<-0.009?"var(--red)":quebra>0.009?"var(--green)":"inherit"}">${Math.abs(quebra)<0.01?"✓ nenhuma":(quebra<0?"faltou ":"sobrou ")+brl(Math.abs(quebra))}</b></div>
          <div class="line"><span>❌ Cancelados</span><b>${R.canc.length} · ${brl(R.cancV)}</b></div>
          <div class="line"><span>🎟️ Descontos dados</span><b>${brl(R.disc)}</b></div>
          ${R.open.length?`<div class="line"><span>⏳ Pedidos ainda em andamento</span><b>${R.open.length} · ${brl(R.open.reduce((s,o)=>s+ +o.total,0))}</b></div>`:""}</div>
      </div>
      <div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between"><b>🍺 Lucro por produto</b><div class="tabs" style="margin:0">${[["lucro","Mais lucro"],["v","Mais faturamento"],["q","Mais vendidos"],["margem","Maior margem"]].map(([k,l])=>`<button data-sb="${k}" aria-current="${k===sortBy}">${l}</button>`).join("")}</div></div>
        <div class="tw" style="margin-top:8px"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Vendeu</th><th class="num">Custo</th><th class="num">Lucro</th><th class="num">Margem</th></tr></thead><tbody>
        ${items.slice(0,40).map(i=>`<tr><td>${esc(i.name)} ${i.noCost?'<span class="pill p-novo">sem custo</span>':""}</td><td class="num">${i.q}</td><td class="num">${brl(i.v)}</td><td class="num">${i.noCost&&!i.c?"—":brl(i.c)}</td><td class="num" style="color:${i.l<0?"var(--red)":"inherit"}"><b>${i.noCost&&!i.c?"—":brl(i.l)}</b></td><td class="num">${i.noCost&&!i.c?"—":fmtPct(pct(i.l,i.v))}</td></tr>`).join("")||'<tr><td colspan="6" class="empty">Sem vendas no período.</td></tr>'}</tbody></table></div></div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><b>Por canal de venda</b>${Object.entries(R.byType).sort((a,b)=>b[1].v-a[1].v).map(([k,x])=>`<div class="line"><span>${TYP[k]||esc(k)} <span class="muted">· ${x.n} pedidos · ticket ${brl(x.v/x.n)}</span></span><span style="text-align:right"><b>${brl(x.v)}</b><div class="muted" style="font-size:11.5px">lucro bruto ${brl(x.lb)}</div></span></div>`).join("")||'<p class="muted">—</p>'}</div>
        <div class="card"><b>Por forma de pagamento</b>${Object.entries(R.byPay).sort((a,b)=>b[1].v-a[1].v).map(([k,x])=>`<div class="line"><span>${esc(k)} <span class="muted">· ${fmtPct(pct(x.v,R.fat))}</span></span><span style="text-align:right"><b>${brl(x.v)}</b>${x.tx?`<div class="muted" style="font-size:11.5px">taxa ${brl(x.tx)}</div>`:""}</span></div>`).join("")||'<p class="muted">—</p>'}
          ${!Object.keys(S.payment_fees||{}).length?'<p class="muted" style="font-size:12px;margin:6px 0 0">Cadastre as taxas da maquininha em ⚙️ Taxas e meta pra calcular o lucro certinho.</p>':""}</div>
      </div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><b>Por categoria</b>${Object.entries(R.cats).sort((a,b)=>b[1].v-a[1].v).map(([k,x])=>`<div class="line"><span>${esc(C[k]||"Sem categoria")} <span class="muted">· ${x.q} un</span></span><span style="text-align:right"><b>${brl(x.v)}</b><div class="muted" style="font-size:11.5px">lucro ${brl(x.v-x.c)}</div></span></div>`).join("")||'<p class="muted">—</p>'}</div>
        <div class="card"><b>Melhores dias e horários</b>
          ${DOWN.map((d,i)=>({d,v:R.byDow[i]})).sort((a,b)=>b.v-a.v).slice(0,3).map((x,i)=>`<div class="line"><span>${["🥇","🥈","🥉"][i]} ${x.d}</span><b>${brl(x.v)}</b></div>`).join("")}
          <div class="muted" style="font-size:12px;margin-top:8px">Pedidos por horário</div>
          <div class="bars" style="height:90px;margin-bottom:20px">${R.byHour.map((h,i)=>`<div title="${i}h: ${h} pedidos" style="height:${Math.max(2,h/Math.max(1,...R.byHour)*100)}%"><span>${i%4===0?i+"h":""}</span></div>`).join("")}</div></div>
      </div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><b>👤 Por funcionário (caixa)</b>${Object.entries(ops).map(([k,x])=>`<div class="line"><span>${esc(k)} <span class="muted">· ${x.t} turno(s) · ${x.n} vendas</span></span><span style="text-align:right"><b>${brl(x.v)}</b>${Math.abs(x.q)>=0.01?`<div style="font-size:11.5px;color:${x.q<0?"var(--red)":"var(--green)"}">${x.q<0?"faltou":"sobrou"} ${brl(Math.abs(x.q))}</div>`:""}</span></div>`).join("")||'<p class="muted">Nenhum turno de caixa no período.</p>'}</div>
        <div class="card"><b>⭐ Melhores clientes</b>${topC.map((c,i)=>`<div class="line"><span>${i+1}. ${esc(c.name||"—")} <span class="muted">· ${c.n} pedidos</span></span><b>${brl(c.v)}</b></div>`).join("")||'<p class="muted">—</p>'}</div>
      </div>`;
    $$("[data-sb]",m).forEach(b=>b.onclick=()=>{sortBy=b.dataset.sb;load()});
    if($("#fixc",m))$("#fixc",m).onclick=()=>{
      const dr=drawer("Cadastrar preço de custo",`<p class="muted" style="margin:0">Quanto <b>você paga</b> em cada unidade (ou no fardo). Os fardos ligados à unidade usam o custo da unidade sozinhos.</p>
        ${missing.slice(0,80).map(i=>`<label class="row" style="flex-wrap:nowrap"><span style="flex:1;font-size:13px">${esc(i.name)} <span class="muted">· vendeu ${brl(i.v)}</span></span><input class="in" data-cp="${i.id}" inputmode="decimal" style="width:100px" placeholder="R$ 0,00"></label>`).join("")}`,`<button class="btn" id="sv">Salvar custos</button>`);
      $("#sv",dr).onclick=async()=>{const ups=$$("[data-cp]",dr).map(i=>({id:+i.dataset.cp,v:num(i.value)})).filter(x=>x.v!=null&&x.v>0);
        if(!ups.length){toast("Preencha pelo menos um custo");return} $("#sv",dr).disabled=true;
        for(const u of ups) await q(sb.from("products").update({cost_price:u.v}).eq("id",u.id));
        const r=await sb.rpc("backfill_costs"); closeDr(); toast(ups.length+" custo(s) salvo(s)"+(r.error?"":" · vendas antigas atualizadas")); load()};
    };
  }
  await load();
}

/* ---------- tela: DESPESAS E CONTAS ---------- */
async function finDesp(m){
  let f="mes";
  const ex=await q(sb.from("expenses").select("*").order("due_date",{ascending:true,nullsFirst:false}).limit(3000));
  const today=ymd(new Date()), mA=ymd(new Date(new Date().getFullYear(),new Date().getMonth(),1)), mB=ymd(new Date(new Date().getFullYear(),new Date().getMonth()+1,1));
  const inMonth=e=>{const d=expDate(e);return d>=mA&&d<mB};
  const draw=()=>{
    const list=ex.filter(e=>f==="todas"?true:f==="mes"?inMonth(e):f==="pagar"?!e.paid:f==="vencidas"?!e.paid&&e.due_date&&e.due_date<today:f==="pagas"?e.paid:f==="fixas"?e.recurring:true);
    const month=ex.filter(inMonth), byCat={}; month.forEach(e=>{const c=e.category||"Outros";byCat[c]=(byCat[c]||0)+ +e.amount});
    const venc=ex.filter(e=>!e.paid&&e.due_date&&e.due_date<today);
    $("#dl",m).innerHTML=`<div class="stats">
        <div class="stat"><small>Despesas do mês</small><b style="color:var(--red)">${brl(month.reduce((s,e)=>s+ +e.amount,0))}</b></div>
        <div class="stat"><small>Já pagas no mês</small><b>${brl(month.filter(e=>e.paid).reduce((s,e)=>s+ +e.amount,0))}</b></div>
        <div class="stat"><small>A pagar (todas)</small><b>${brl(ex.filter(e=>!e.paid).reduce((s,e)=>s+ +e.amount,0))}</b></div>
        <div class="stat"><small>Vencidas</small><b style="color:${venc.length?"var(--red)":"inherit"}">${venc.length} · ${brl(venc.reduce((s,e)=>s+ +e.amount,0))}</b></div></div>
      <div class="grid g2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <div class="tw"><table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
      ${list.map(e=>{const late=!e.paid&&e.due_date&&e.due_date<today;return `<tr><td>${e.due_date?parseYmd(e.due_date).toLocaleDateString("pt-BR"):"—"}</td><td>${esc(e.description)}${e.recurring?' <span class="muted" title="Fixa todo mês">🔁</span>':""}</td><td class="muted" style="font-size:12.5px">${esc(e.category||"")}</td><td class="num">${brl(e.amount)}</td><td><button data-pd="${e.id}" title="Clique pra marcar como ${e.paid?"não paga":"paga"}">${e.paid?`<span class="pill p-concluido">Paga${e.paid_at?" "+parseYmd(e.paid_at).toLocaleDateString("pt-BR").slice(0,5):""}</span>`:late?'<span class="pill p-cancelado">Vencida</span>':'<span class="pill p-novo">A pagar</span>'}</button></td><td class="num"><button class="btn o sm" data-e="${e.id}">Editar</button></td></tr>`}).join("")||'<tr><td colspan="6" class="empty">Nada aqui.</td></tr>'}</tbody></table></div>
      <div class="card"><b>Despesas do mês por categoria</b>${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="line"><span style="font-size:13px">${esc(k)}</span><b>${brl(v)}</b></div>`).join("")||'<p class="muted">Nenhuma ainda.</p>'}</div></div>`;
    $$("[data-pd]",m).forEach(b=>b.onclick=async()=>{const e=ex.find(x=>x.id==b.dataset.pd);const v=e.paid?{paid:false,paid_at:null}:{paid:true,paid_at:today};
      const r=await sb.from("expenses").update(v).eq("id",e.id);if(r.error){await q(sb.from("expenses").update({paid:v.paid}).eq("id",e.id));delete v.paid_at}Object.assign(e,v);draw()});
    $$("[data-e]",m).forEach(b=>b.onclick=()=>edit(ex.find(x=>x.id==b.dataset.e)));
  };
  const F=[{k:"description",l:"Descrição (ex.: conta de luz, compra na distribuidora)"},{k:"amount",l:"Valor (R$)",t:"money"},{k:"category",l:"Categoria",t:"select",o:FIN_CATS.map(c=>[c,c])},{k:"due_date",l:"Vencimento"},{k:"paid",l:"Já está paga",t:"check"},{k:"paid_at",l:"Paga em"},{k:"payment_method",l:"Pago com",t:"select",o:[["",""],["Dinheiro do caixa","Dinheiro do caixa"],["Pix","Pix"],["Cartão","Cartão"],["Boleto","Boleto"],["Transferência","Transferência"]]},{k:"recurring",l:"🔁 Despesa fixa (repete todo mês)",t:"check"},{k:"notes",l:"Observação",t:"area"}];
  const edit=e=>{const base=e?{...e,category:e.category&&!FIN_CATS.includes(e.category)?(/mercad/i.test(e.category)?FIN_CATS[0]:/aluguel/i.test(e.category)?"Aluguel":/conta/i.test(e.category)?"Contas (luz, água, internet)":/func|entreg/i.test(e.category)?"Salários e funcionários":"Outros"):e.category}:{due_date:today,category:FIN_CATS[0]};
    const dr=drawer(e?"Editar despesa":"Nova despesa",formHTML(F,base)+'<p class="muted" style="font-size:12px;margin:0">💡 <b>Mercadoria</b> = compra de produto pra revender (cerveja, refri…). Ela não tira do lucro na hora: o custo entra quando o produto é vendido.</p><p class="err" id="er" hidden></p>',`${e?'<button class="btn r" id="del">Excluir</button>':""}<button class="btn" id="sv">Salvar</button>`);
    $("#f_due_date",dr).type="date"; $("#f_paid_at",dr).type="date";
    $("#f_paid",dr).onchange=ev=>{if(ev.target.checked&&!$("#f_paid_at",dr).value)$("#f_paid_at",dr).value=today};
    $("#sv",dr).onclick=async()=>{const v=readForm(F,dr);if(!v.description||!v.amount){$("#er",dr).hidden=false;$("#er",dr).textContent="Preencha descrição e valor.";return}
      if(v.paid&&!v.paid_at)v.paid_at=today; if(!v.paid)v.paid_at=null; v.due_date=v.due_date||null; v.payment_method=v.payment_method||null;
      let r=e?await sb.from("expenses").update(v).eq("id",e.id):await sb.from("expenses").insert(v);
      if(r.error&&/paid_at|recurring|payment_method|notes/.test(r.error.message)){["paid_at","recurring","payment_method","notes"].forEach(k=>delete v[k]);toast("Rode a parte 12 do banco pra salvar todos os campos");r=e?await sb.from("expenses").update(v).eq("id",e.id):await sb.from("expenses").insert(v)}
      if(r.error){$("#er",dr).hidden=false;$("#er",dr).textContent=r.error.message;return}
      closeDr();toast("Salvo");finDesp(m)};
    if(e)$("#del",dr).onclick=async x=>{if(!x.target.dataset.sure){x.target.dataset.sure=1;x.target.textContent="Confirmar exclusão";return}await q(sb.from("expenses").delete().eq("id",e.id));closeDr();finDesp(m)}};
  m.innerHTML=`<div class="top"><h1>Despesas e contas</h1><div class="row"><button class="btn o" id="rf">🔁 Lançar fixas do mês</button><button class="btn" id="ne">➕ Nova despesa</button></div></div>
    <div class="tabs">${[["mes","Este mês"],["pagar","A pagar"],["vencidas","Vencidas"],["pagas","Pagas"],["fixas","🔁 Fixas"],["todas","Todas"]].map(([k,l])=>`<button data-f="${k}" aria-current="${k===f}">${l}</button>`).join("")}</div><div id="dl"></div>`;
  $$("[data-f]",m).forEach(b=>b.onclick=()=>{f=b.dataset.f;$$("[data-f]",m).forEach(x=>x.setAttribute("aria-current",x===b));draw()});
  $("#ne",m).onclick=()=>edit(null);
  $("#rf",m).onclick=async()=>{
    const fixed=ex.filter(e=>e.recurring), seen=new Set();const todo=[];
    fixed.sort((a,b)=>expDate(b).localeCompare(expDate(a))).forEach(e=>{const k=(e.description+"|"+e.category).toLowerCase();if(seen.has(k))return;seen.add(k);
      if(ex.some(x=>(x.description+"|"+x.category).toLowerCase()===k&&inMonth(x)))return;
      const day=e.due_date?parseYmd(e.due_date).getDate():10, now=new Date(), last=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
      todo.push({description:e.description,amount:e.amount,category:e.category,recurring:true,paid:false,due_date:ymd(new Date(now.getFullYear(),now.getMonth(),Math.min(day,last))),payment_method:e.payment_method||null})});
    if(!fixed.length){toast("Nenhuma despesa marcada como 🔁 fixa ainda");return}
    if(!todo.length){toast("As despesas fixas deste mês já estão lançadas ✓");return}
    await q(sb.from("expenses").insert(todo));toast(todo.length+" despesa(s) fixa(s) lançada(s) pra este mês");finDesp(m)};
  draw();
}
