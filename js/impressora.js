/* =========================================================
   Impressora térmica (cupom não fiscal)
   - Bluetooth (BLE) pelo Chrome do computador ou do Android
   - USB / Bluetooth "COM" pelo Chrome do computador (Web Serial)
   - Sem impressora conectada: usa a janela de impressão normal
   Imprime sozinho ao finalizar venda no balcão e quando cai pedido novo.
   Configuração fica guardada NESTE aparelho.
   ========================================================= */
const PRN=(()=>{
  const KEY="gb_prn", DONE="gb_prn_done";
  const SERVICES=["000018f0-0000-1000-8000-00805f9b34fb","e7810a71-73ae-499d-8c15-faa9aef0c3f2","49535343-fe7d-4ae5-8fa9-9fafd205e455",
    "0000ff00-0000-1000-8000-00805f9b34fb","0000fee7-0000-1000-8000-00805f9b34fb","0000ae30-0000-1000-8000-00805f9b34fb",
    "0000ffe0-0000-1000-8000-00805f9b34fb","0000ff12-0000-1000-8000-00805f9b34fb","0000af30-0000-1000-8000-00805f9b34fb",
    "0000fff0-0000-1000-8000-00805f9b34fb","0000ae00-0000-1000-8000-00805f9b34fb","0000ffb0-0000-1000-8000-00805f9b34fb"];
  const def={mode:"janela",cols:32,autoBalcao:true,balcao:"",autoDelivery:false,since:0,copies:1,acc:false,name:""};
  let C; try{C={...def,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{C={...def}}
  if(!C.balcao) C.balcao=C.autoBalcao===false?"nunca":"auto";
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(C))}catch{}};
  let ch=null, dev=null, port=null, busy=Promise.resolve(), localOk=false, localInfo=null;
  /* programa de impressão do Windows (pasta /impressora): recebe o cupom e manda direto pra impressora, sem janela */
  const LOCAL="http://127.0.0.1:9123";
  async function localStatus(){
    try{const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),2500);
      const r=await fetch(LOCAL+"/status",{signal:ctl.signal,cache:"no-store"});clearTimeout(t);const j=await r.json();localOk=!!j.ok;localInfo=j;return j}
    catch{localOk=false;localInfo=null;return null}
  }
  async function pickLocal(){
    const j=await localStatus();
    if(!j) throw new Error("O programa de impressão não está aberto neste computador. Instale e abra o \"Impressora Geladão\" (passo 1).");
    C.mode="local"; if(!C.printer||!(j.printers||[]).includes(C.printer)) C.printer=j.printer||""; C.name=C.printer||"Impressora do computador"; if(C.cols==32) C.cols=48; save(); ui();
  }
  const hasBT=!!(navigator.bluetooth), hasSerial=!!(navigator.serial);

  /* ---------- conexão ---------- */
  async function charOf(server){
    const svcs=await server.getPrimaryServices();
    for(const s of svcs){ let cs=[]; try{cs=await s.getCharacteristics()}catch{continue}
      for(const c of cs) if(c.properties.writeWithoutResponse||c.properties.write) return c; }
    throw new Error("Essa impressora não aceitou a conexão. Tente o modo USB/COM ou a janela normal.");
  }
  async function linkBT(d){
    dev=d; d.ongattserverdisconnected=()=>{ch=null;ui()};
    const server=await d.gatt.connect(); ch=await charOf(server); C.name=d.name||"Impressora"; save(); ui();
  }
  async function pickBT(){
    const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:SERVICES});
    await linkBT(d); C.mode="bluetooth"; save();
  }
  async function pickSerial(){
    const p=await navigator.serial.requestPort(); await openSerial(p); C.mode="usb"; C.name="Impressora USB/COM"; save();
  }
  async function openSerial(p){ try{await p.open({baudRate:9600})}catch(e){ if(!/already open/i.test(e.message||""))throw e } port=p; ui(); }
  async function reconnect(){
    try{
      if(C.mode==="bluetooth"&&hasBT&&!ch&&navigator.bluetooth.getDevices){
        const ds=await navigator.bluetooth.getDevices(); const d=ds.find(x=>x.name===C.name)||ds[0]; if(d) await linkBT(d);
      }
      if(C.mode==="local") await localStatus();
      if(C.mode==="usb"&&hasSerial&&!port){ const ps=await navigator.serial.getPorts(); if(ps[0]) await openSerial(ps[0]); }
    }catch{}
    ui(); return ready();
  }
  const ready=()=>C.mode==="sistema"?true:C.mode==="local"?localOk:C.mode==="bluetooth"?!!ch:C.mode==="usb"?!!port:false;
  const direct=()=>C.mode==="bluetooth"||C.mode==="usb"||C.mode==="local";
  let htmlFn=null;

  /* ---------- envio ---------- */
  async function write(bytes){
    if(C.mode==="local"){
      const r=await fetch(LOCAL+"/print?printer="+encodeURIComponent(C.printer||""),{method:"POST",body:bytes,headers:{"Content-Type":"application/octet-stream"}});
      const j=await r.json().catch(()=>({ok:false,error:"sem resposta"})); if(!j.ok){localOk=r.ok; throw new Error(j.error||"não imprimiu")} return;
    }
    if(C.mode==="usb"){ const w=port.writable.getWriter(); try{await w.write(bytes)}finally{w.releaseLock()} return; }
    const n=ch.properties.writeWithoutResponse?100:180;
    for(let i=0;i<bytes.length;i+=n){ const part=bytes.slice(i,i+n);
      if(ch.properties.writeWithoutResponse&&ch.writeValueWithoutResponse){ await ch.writeValueWithoutResponse(part); await new Promise(r=>setTimeout(r,18)); }
      else await ch.writeValue(part);
    }
  }
  function send(bytes){ busy=busy.then(async()=>{ if(!ready()&&!(await reconnect())) throw new Error("Impressora desconectada"); await write(bytes) }); return busy; }

  /* ---------- montar o cupom (ESC/POS) ---------- */
  const clean=s=>{s=String(s??""); if(!C.acc) s=s.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^\x20-\x7E\n]/g,""); return s};
  const money=v=>"R$ "+Number(v||0).toFixed(2).replace(".",",");
  function enc(s){ s=clean(s); const out=[]; for(const c of s){ const k=c.charCodeAt(0); out.push(C.acc?(CP860[c]??(k<128?k:63)):(k<128?k:63)) } return out }
  const CP860={"Ç":128,"ü":129,"é":130,"â":131,"ã":132,"à":133,"Á":134,"ç":135,"ê":136,"Ê":137,"è":138,"Í":139,"Ô":140,"ì":141,"Ã":142,"Â":143,"É":144,"À":145,"È":146,"ô":147,"õ":148,"ò":149,"Ú":150,"ù":151,"Ì":152,"Õ":153,"Ü":154,"á":160,"í":161,"ó":162,"ú":163,"ñ":164,"Ñ":165,"º":167,"Ó":159,"Ò":169};
  function Doc(){
    const b=[27,64]; if(C.acc) b.push(27,116,3);          // inicia; tabela de acentos português
    let isBig=false; const W=()=>isBig?Math.floor(C.cols/2):C.cols;
    const api={
      text(s){b.push(...enc(s),10);return api},
      center(on){b.push(27,97,on?1:0);return api},
      bold(on){b.push(27,69,on?1:0);return api},
      big(on){isBig=!!on;b.push(29,33,on?0x11:0);return api},
      line(ch="-"){return api.text(ch.repeat(W()))},
      wrap(s,ind=""){ s=clean(s); const lead=(s.match(/^ */)||[""])[0]; s=s.trim(); const w=W(); let cur=lead; for(const word of s.split(/\s+/)){ if(cur.trim()&&(cur+" "+word).length>w){ api.text(cur); cur=ind+word } else cur=(cur.trim()?cur+" ":cur)+word } if(cur.trim()) api.text(cur); return api },
      lr(l,r){ l=clean(l); r=clean(r); const w=W(); if(l.length+r.length+1>w){ api.wrap(l); return api.text(" ".repeat(Math.max(0,w-r.length))+r) } return api.text(l+" ".repeat(w-l.length-r.length)+r) },
      feed(n=1){for(let i=0;i<n;i++)b.push(10);return api},
      cut(){b.push(10,10,10,29,86,66,0);return api},
      bytes:()=>new Uint8Array(b)
    };
    return api;
  }
  const TYPE={delivery:"ENTREGA",retirada:"RETIRADA",balcao:"BALCAO"};
  function orderDoc(o,items,addr,change,store){
    const d=Doc(), st=store||{}, W=C.cols;
    const head=String(C.header||"").split("\n").map(x=>x.trim()).filter(Boolean);
    if(!head.length){ if(st.address) head.push(st.address); if(st.whatsapp) head.push("FONE: "+st.whatsapp) }
    d.center(1).bold(1).big(1).text(st.name||"Pedido").big(0).bold(0); head.forEach(x=>d.wrap(x)); d.center(0).line();
    const dts=new Date(o.created_at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
    d.bold(1).lr((o.type==="balcao"?"RECIBO: ":"PEDIDO: ")+o.number,dts).bold(0);
    if(o.type!=="balcao") d.bold(1).big(1).text(TYPE[o.type]||"").big(0).bold(0);
    d.wrap(String(o.customer_name||"CONSUMIDOR NAO IDENTIFICADO").toUpperCase());
    if(o.customer_phone) d.text("FONE: "+o.customer_phone);
    if(o.type==="delivery"){ d.bold(1).wrap(addr||"").bold(0); if(o.neighborhood) d.wrap("BAIRRO: "+o.neighborhood); if(o.complement) d.wrap("COMPL.: "+o.complement); if(o.reference) d.wrap("REF.: "+o.reference) }
    if(C.user) d.wrap("USUARIO: "+String(C.user).toUpperCase());
    d.line();
    // QTD DESCRIÇÃO ............ UNIT  TOTAL
    const col=(q,desc,u,t)=>{const qw=4,uw=W>=48?9:0,tw=9,dw=W-qw-uw-tw;const L=clean(desc);const first=L.slice(0,dw),rest=L.slice(dw);
      d.text(String(q).padEnd(qw)+first.padEnd(dw)+(uw?String(u).padStart(uw):"")+String(t).padStart(tw));
      for(let k=0;k<rest.length;k+=dw) d.text(" ".repeat(qw)+rest.slice(k,k+dw))};
    d.bold(1); col("QTD","DESCRICAO",W>=48?"UNIT.":"","TOTAL"); d.bold(0);
    const num2=v=>Number(v||0).toFixed(2).replace(".",",");
    for(const i of items){
      col(+i.qty,i.name,num2(i.unit_price??(i.total/i.qty)),num2(i.total));
      (i.options||[]).forEach(x=>d.wrap(`    + ${x.qty>1?x.qty+"x ":""}${x.name}`,"      "));
      if(i.notes) d.wrap("    Obs: "+i.notes,"      ");
    }
    d.line().lr("Total bruto dos itens",num2(o.subtotal)).lr("Desconto",num2(o.discount||0));
    if(o.type==="delivery") d.lr("Taxa de entrega",num2(o.delivery_fee||0));
    d.bold(1).big(1).lr("TOTAL R$",num2(o.total)).big(0).bold(0);
    const pays=Array.isArray(o.payments)&&o.payments.length?o.payments:[{method:o.payment_method||"-",amount:o.total}];
    pays.forEach(p=>d.lr(String(p.method).toUpperCase(),num2(p.amount)));
    if(o.change_for&&+o.change_for>+o.total) d.lr("Paga com",num2(o.change_for)).bold(1).lr("TROCO R$",num2(change)).bold(0); else d.lr("Troco R$","0,00");
    if(o.notes) d.line().wrap("OBS: "+o.notes);
    d.line().center(1).text("Obrigado pela preferencia!").text("Documento sem valor fiscal").center(0).cut();
    return d.bytes();
  }
  async function printOrder(o,items,addr,change,store){
    if(C.mode==="sistema"){ if(htmlFn) htmlFn(o,items,addr,change); markDone(o.id); await new Promise(r=>setTimeout(r,1500)); return; }
    const bytes=orderDoc(o,items,addr,change,store);
    for(let i=0;i<Math.max(1,C.copies|0);i++) await send(bytes);
    markDone(o.id);
  }
  function textDoc(title,rows,notes){
    const d=Doc(); d.center(1).bold(1).text(title).bold(0).center(0).line();
    rows.forEach(([l,v])=>d.lr(String(l).replace(/<[^>]+>/g,"").replace(/&nbsp;/g," "),String(v).replace(/<[^>]+>/g,"")));
    if(notes) d.line().wrap("Obs.: "+notes);
    d.feed(2).text("Assinatura: ____________________").cut(); return send(d.bytes());
  }
  async function test(store){
    if(C.mode==="sistema"){ if(htmlFn) htmlFn({id:0,number:0,type:"balcao",created_at:new Date().toISOString(),customer_name:"TESTE DA IMPRESSORA",subtotal:10,discount:0,total:10,payment_method:"Dinheiro"},[{qty:1,name:"Produto exemplo",total:10,options:[]}],"",0); return; }
    const d=Doc(); d.center(1).bold(1).big(1).text(store&&store.name||"Teste").big(0).text("Impressora funcionando!").bold(0)
      .text(new Date().toLocaleString("pt-BR")).center(0).line().lr("1x Produto exemplo","R$ 10,00").lr("TOTAL","R$ 10,00").cut();
    await send(d.bytes());
  }

  /* ---------- pedidos que já foram impressos (não imprime duas vezes) ---------- */
  const doneSet=()=>{try{return new Set(JSON.parse(localStorage.getItem(DONE)||"[]"))}catch{return new Set()}};
  function markDone(id){ if(!id) return; const s=[...doneSet()]; if(!s.includes(id)) s.push(id); try{localStorage.setItem(DONE,JSON.stringify(s.slice(-400)))}catch{} }
  let ticking=false;
  async function tick(sb,store,addrOf){
    if(!C.autoDelivery||ticking||!ready()&&!(await reconnect())) return;
    ticking=true;
    try{
      const since=new Date(Math.max(C.since||0,Date.now()-6*3600e3)).toISOString();
      const {data}=await sb.from("orders").select("*,order_items(*)").neq("type","balcao").neq("status","cancelado").gte("created_at",since).order("created_at");
      const done=doneSet();
      for(const o of data||[]){ if(done.has(o.id)) continue;
        await printOrder(o,(o.order_items||[]).sort((a,b)=>a.id-b.id),addrOf(o),o.change_for?o.change_for-o.total:0,store);
      }
    }catch(e){ console.warn("impressão automática:",e) } finally{ ticking=false }
  }

  /* ---------- tela de configuração ---------- */
  let uiCb=null; const ui=()=>{ try{uiCb&&uiCb()}catch{} ; const b=document.getElementById("prnb"); if(b) b.innerHTML=badge() };
  const badge=()=>C.mode==="janela"?"🖨️ Impressora":ready()?"🖨️ <span style='color:#2ecc71'>●</span> "+esc2(C.name||"Conectada"):"🖨️ <span style='color:#e74c3c'>●</span> Reconectar";
  const esc2=s=>String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function panelHTML(){
    const iphone=/iPhone|iPad/i.test(navigator.userAgent);
    return `<div class="grid" id="prnp">
      ${iphone?`<div class="card" style="border-color:var(--red)">⚠️ No iPhone/iPad o navegador <b>não conecta</b> em impressora Bluetooth. Use um computador ou celular Android com o Chrome. Aqui ele usa a janela de impressão normal.</div>`:""}
      ${!iphone&&!/Android/i.test(navigator.userAgent)?`<div class="card grid" style="border-color:${C.mode==="local"&&localOk?"var(--green)":"var(--y)"}"><b>⭐ Impressão direta no computador (recomendado)</b>
        <p class="muted" style="margin:0;font-size:12.5px">Igual ao Datacaixa: finalizou, a notinha sai na hora, <b>sem abrir janela nenhuma</b>. Funciona com a impressora instalada no Windows (USB, rede ou Bluetooth).</p>
        <div><b>1.</b> Baixe e instale o programinha (só uma vez): <a class="btn o sm" href="/impressora/Impressora-Geladao.zip" download>⬇️ Baixar Impressora Geladão</a></div>
        <div><b>2.</b> Depois de instalado: <button class="btn${C.mode==="local"?"":" o"} sm" id="plc">🔗 Conectar no programa</button></div>
        ${C.mode==="local"?(localOk?`<div class="ok">✅ Programa ligado · imprimindo em <b>${esc2(C.printer||"impressora padrão")}</b></div>${localInfo&&(localInfo.printers||[]).length>1?`<label class="fld"><span>Qual impressora</span><select class="in" id="plp">${localInfo.printers.map(n=>`<option ${n===C.printer?"selected":""}>${esc2(n)}</option>`).join("")}</select></label>`:""}`:`<div class="err">⚠️ O programa de impressão não está respondendo. Abra o "Impressora Geladão" no computador (ou reinicie o computador) e toque em Reconectar.</div>`):""}
      </div>`:""}
      <div class="card grid"><b>Status: ${C.mode==="local"?(localOk?"✅ impressão direta pelo programa":"⚠️ programa de impressão desligado"):C.mode==="janela"?"usando a janela de impressão normal":C.mode==="sistema"?"✅ impressora instalada no computador (driver)":ready()?"✅ conectada em "+esc2(C.name):"⚠️ desconectada"}</b>
        <div class="row" style="flex-wrap:wrap">
          ${!iphone?`<button class="btn${C.mode==="sistema"?"":" o"}" id="psy">🖥️ Impressora com cabo USB (instalada no Windows)</button>`:""}
          ${hasBT?`<button class="btn o" id="pbt">🔵 Conectar impressora Bluetooth</button>`:""}
          ${hasSerial?`<button class="btn o" id="pus">🔌 Impressora USB / porta COM</button>`:""}
          ${direct()&&!ready()?`<button class="btn o" id="prc">🔄 Reconectar</button>`:""}
          ${C.mode!=="janela"?`<button class="btn o" id="pts">🧾 Imprimir teste</button><button class="btn o sm" id="pjn">Desligar (usar janela normal)</button>`:""}
        </div>
        ${C.mode==="sistema"?`<p class="muted" style="margin:0;font-size:12px">Pra sair <b>sem abrir a janela</b> de impressão, abra o painel pelo atalho do Chrome com <b>--kiosk-printing</b> e deixe a impressora como <b>padrão</b> no Windows.</p>`:""}
        ${!hasBT&&!hasSerial?`<p class="muted" style="margin:0">Este navegador não conecta direto na impressora. Use o <b>Google Chrome</b> no computador ou no Android.</p>`:""}
        <div id="pmsg" class="muted" style="font-size:12.5px"></div></div>
      <div class="card grid"><b>Imprimir sozinho</b>
        <label class="fld"><span>Ao finalizar venda no <b>balcão</b></span><select class="in" id="pab">
          <option value="auto" ${C.balcao==="auto"?"selected":""}>Imprimir sozinho</option>
          <option value="perguntar" ${C.balcao==="perguntar"?"selected":""}>Perguntar "Imprimir cupom?" (Sim / Não)</option>
          <option value="nunca" ${C.balcao==="nunca"?"selected":""}>Não imprimir</option></select></label>
        <label class="chk"><input type="checkbox" id="pad" ${C.autoDelivery?"checked":""}> Quando cair <b>pedido novo</b> do cardápio (entrega e retirada)</label>
        <p class="muted" style="margin:0;font-size:12px">Deixe o painel aberto neste aparelho. Marque o pedido novo em <b>só um</b> aparelho, senão sai duas vezes.</p></div>
      <div class="card grid"><b>Papel</b>
        <div class="row"><label class="chk"><input type="radio" name="pcw" value="32" ${C.cols==32?"checked":""}> 58 mm (pequena)</label><label class="chk"><input type="radio" name="pcw" value="48" ${C.cols==48?"checked":""}> 80 mm (grande)</label></div>
        <label class="fld"><span>Vias de cada pedido</span><select class="in" id="pcp">${[1,2,3].map(n=>`<option ${C.copies==n?"selected":""}>${n}</option>`).join("")}</select></label>
        <label class="chk"><input type="checkbox" id="pac" ${C.acc?"checked":""}> Imprimir com acentos (desmarque se sair letra estranha)</label>
        <label class="fld"><span>Cabeçalho da notinha (embaixo do nome da loja) · ex.: razão social, CNPJ, endereço, telefone</span><textarea class="in" id="phd" rows="4" placeholder="ALEF TROY MARQUES MORAES&#10;CNPJ: 00.000.000/0001-00&#10;AV MINISTRO ALBUQUERQUE LIMA, Q22&#10;FONE: (85) 98522-4282">${esc2(C.header||"")}</textarea></label></div>
    </div>`;
  }
  function wire(root,store,toast){
    const $=s=>root.querySelector(s), msg=t=>{const e=$("#pmsg"); if(e) e.textContent=t};
    const redo=()=>{ const p=$("#prnp"); if(p){ p.outerHTML=panelHTML(); wire(root,store,toast) } };
    const go=fn=>async e=>{ e.target.disabled=true; msg("Conectando…"); try{ await fn(); redo(); toast&&toast("Impressora conectada") }catch(x){ msg(/cancel|chosen/i.test(x.message||"")?"Nenhuma impressora escolhida.":"Não conectou: "+(x.message||x)); e.target.disabled=false } };
    if($("#pbt")) $("#pbt").onclick=go(pickBT);
    if($("#plc")) $("#plc").onclick=go(pickLocal);
    if($("#plp")) $("#plp").onchange=e=>{C.printer=e.target.value;C.name=C.printer;save();ui()};
    if($("#psy")) $("#psy").onclick=()=>{ C.mode="sistema"; C.name="Impressora do computador"; if(C.cols==32) C.cols=48; save(); redo(); ui(); toast&&toast("Usando a impressora instalada no computador") };
    if($("#pus")) $("#pus").onclick=go(pickSerial);
    if($("#prc")) $("#prc").onclick=async()=>{ msg("Reconectando…"); if(await reconnect()) redo(); else if(C.mode==="bluetooth"&&hasBT) { try{await pickBT();redo()}catch(x){msg("Não conectou: "+(x.message||x))} } else msg("Não achei a impressora. Ligue ela e tente de novo.") };
    if($("#pts")) $("#pts").onclick=async()=>{ msg("Imprimindo teste…"); try{await test(store);msg("✅ Teste enviado. Saiu o papel?")}catch(x){msg("Não imprimiu: "+(x.message||x))} };
    if($("#pjn")) $("#pjn").onclick=()=>{ C.mode="janela"; ch=null; localOk=false; try{dev&&dev.gatt.disconnect()}catch{} save(); redo() };
    $("#pab").onchange=e=>{C.balcao=e.target.value;C.autoBalcao=C.balcao!=="nunca";save()};
    $("#pad").onchange=e=>{C.autoDelivery=e.target.checked; if(C.autoDelivery) C.since=Date.now(); save()};
    root.querySelectorAll("[name=pcw]").forEach(r=>r.onchange=()=>{C.cols=+r.value;save()});
    $("#pcp").onchange=e=>{C.copies=+e.target.value;save()};
    $("#pac").onchange=e=>{C.acc=e.target.checked;save()};
    $("#phd").onchange=e=>{C.header=e.target.value;save()};
  }

  if(direct()) setTimeout(reconnect,800);
  setInterval(()=>{ if(C.mode==="local") localStatus().then(ui) },30000);
  return { cfg:()=>C, ready, reconnect, printOrder, textDoc, tick, panelHTML, wire, badge, hasBT, hasSerial, markDone, direct, setHtml:f=>htmlFn=f, onUi:f=>uiCb=f };
})();
window.PRN=PRN;
