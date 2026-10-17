/* =========================================================
   Catálogo · Importar do Cardápio Web
   O dono cola o link do cardápio dele no Cardápio Web e o VYNTRA traz
   categorias, produtos, preços, promoções e fotos (função vyntra-importar).
   Usa as funções do painel.js (sb, $, $$, esc, drawer, closeDr, toast, brl).
   ========================================================= */
async function cwCall(body){
  const r=await sb.functions.invoke("vyntra-importar",{body});
  if(r.error){let m=r.error.message||"Erro";try{const j=await r.error.context.json();m=j.erro||j.message||m}catch{}throw new Error(m)}
  if(!r.data||r.data.ok===false) throw new Error((r.data&&r.data.erro)||"Não deu certo. Tente de novo.");
  return r.data;
}
function importCWDrawer(done){
  let link="";
  const step1=(msg)=>{
    const dr=drawer("⬇️ Importar do Cardápio Web",`
      <p style="margin-top:0">Traga o seu cardápio do <b>Cardápio Web</b> pro VYNTRA em poucos minutos: <b>categorias, produtos, preços, promoções e fotos</b>.</p>
      <label class="fld"><span>Link do seu cardápio no Cardápio Web</span><input class="in" id="cwl" placeholder="ex.: app.cardapioweb.com/minha_loja" autocapitalize="none" spellcheck="false" value="${esc(link)}"></label>
      <p class="muted" style="font-size:12.5px;margin:6px 0 0">É o link que você manda pros clientes. Pode colar inteiro ou só o nome da loja (o que vem depois de <b>app.cardapioweb.com/</b>).</p>
      <div class="card" style="margin-top:12px;font-size:13px;line-height:1.55"><b>Fique tranquilo:</b><br>• Nada muda no seu Cardápio Web: o VYNTRA só <b>lê</b> o cardápio público.<br>• Produtos com o mesmo nome que já existem aqui <b>não são duplicados</b>.<br>• Antes de importar, você vê tudo que vai entrar.</div>
      <p class="err" id="e" ${msg?"":"hidden"}>${esc(msg||"")}</p>`,
      `<button class="btn" id="go">Ver o que vai entrar →</button>`);
    const inp=$("#cwl",dr); inp.focus();
    inp.onkeydown=e=>{if(e.key==="Enter")$("#go",dr).click()};
    $("#go",dr).onclick=async()=>{link=inp.value.trim();if(!link){$("#e",dr).hidden=false;$("#e",dr).textContent="Cole o link do seu cardápio.";return}
      const b=$("#go",dr);b.disabled=true;b.textContent="Lendo o seu cardápio…";
      try{step2(await cwCall({acao:"previa",link}))}catch(e){step1(e.message)}};
  };
  const step2=(p)=>{
    const dr=drawer("⬇️ Importar do Cardápio Web",`
      <div class="card" style="margin-bottom:12px"><div class="muted" style="font-size:12.5px">Cardápio encontrado</div><b style="font-size:17px">${esc(p.loja)}</b>
        <div class="row" style="gap:16px;margin-top:8px;flex-wrap:wrap"><span><b>${p.total}</b> produtos</span><span><b>${p.categorias.length}</b> categorias</span><span><b>${p.com_foto}</b> com foto</span></div></div>
      ${p.novos?`<p style="margin:0 0 8px">Vão entrar <b>${p.novos} produtos novos</b>.${p.ja_existem?` <span class="muted">${p.ja_existem} já existem aqui com o mesmo nome e ficam como estão.</span>`:""}</p>`:`<p class="alert">Todos os ${p.total} produtos já existem aqui com o mesmo nome. Não tem nada novo pra importar.</p>`}
      <div class="grid" style="gap:6px;max-height:42vh;overflow:auto">${p.categorias.map(c=>`<div class="card" style="padding:9px 11px;${c.novos?"":"opacity:.55"}"><div class="row" style="justify-content:space-between"><b>${esc(c.nome)}</b><span class="muted" style="font-size:12.5px">${c.novos} novo${c.novos===1?"":"s"}${c.novos!==c.itens?` de ${c.itens}`:""}</span></div><div class="muted" style="font-size:12px">${c.exemplos.map(esc).join(" · ")}${c.itens>3?"…":""}</div></div>`).join("")}</div>
      ${p.novos?`<label class="chk" style="margin-top:12px"><input type="checkbox" id="fo" checked> <span>📷 Trazer as fotos</span></label>
      <label class="chk"><input type="checkbox" id="sa"> <span>Deixar de fora os produtos que estão <b>em falta</b> no Cardápio Web</span></label>`:""}
      <div class="card" style="margin-top:10px;font-size:12.5px;line-height:1.55"><b>O que não vem:</b> o <b>preço de custo</b> (o Cardápio Web não mostra no cardápio público). Coloque depois no Catálogo, ou ele entra sozinho quando você lançar a primeira <b>entrada de mercadoria</b> no Estoque.${p.com_complementos?`<br><b>${p.com_complementos} produtos têm complementos</b> (adicionais/opções) no Cardápio Web. Esses complementos não vêm: monte em <b>Complementos</b>.`:""}</div>
      <p class="err" id="e" hidden></p>`,
      `<button class="btn o" id="bk">← Voltar</button>${p.novos?`<button class="btn" id="go">⬇️ Importar ${p.novos} produtos</button>`:""}`);
    $("#bk",dr).onclick=()=>step1();
    if(p.novos) $("#go",dr).onclick=async()=>{const b=$("#go",dr);b.disabled=true;$("#bk",dr).disabled=true;b.textContent="Importando produtos…";
      try{step3(await cwCall({acao:"importar",link,so_ativos:$("#sa",dr).checked,fotos:$("#fo",dr).checked}))}
      catch(e){b.disabled=false;$("#bk",dr).disabled=false;b.textContent=`⬇️ Importar ${p.novos} produtos`;$("#e",dr).hidden=false;$("#e",dr).textContent=e.message}};
  };
  const step3=async(r)=>{
    const total=r.fotos.length;let ok=0,bad=0;
    const dr=drawer("⬇️ Importar do Cardápio Web",`
      <h2 style="margin:0 0 6px;color:var(--green)">✓ ${r.produtos_novos} produtos importados</h2>
      <p class="muted" style="margin:0 0 12px">${r.categorias_novas?`${r.categorias_novas} categorias novas criadas. `:""}${r.pulados_iguais?`${r.pulados_iguais} já existiam e ficaram como estavam. `:""}${r.pulados_inativos?`${r.pulados_inativos} em falta ficaram de fora.`:""}</p>
      ${total?`<div id="fbx"><b>📷 Copiando as fotos…</b> <span id="fn">0 de ${total}</span>
        <div style="height:10px;background:var(--card-2);border-radius:99px;overflow:hidden;margin-top:8px"><div id="fb" style="height:100%;width:0;background:var(--y);transition:width .3s"></div></div>
        <p class="muted" style="font-size:12.5px">Deixe esta janela aberta até terminar.</p></div>`:""}
      <div id="fim" ${total?"hidden":""}><p>Confira o catálogo: os preços e as fotos já estão no cardápio.</p></div>`,
      `<button class="btn" id="ok" ${total?"disabled":""}>Ver o catálogo</button>`);
    $("#ok",dr).onclick=()=>{closeDr();done&&done()};
    for(let i=0;i<total;i+=6){
      const lote=r.fotos.slice(i,i+6);
      try{const x=await cwCall({acao:"fotos",itens:lote});x.resultado.forEach(y=>y.ok?ok++:bad++)}catch{bad+=lote.length}
      if(!document.body.contains(dr)) return;   // fechou a janela
      $("#fn",dr).textContent=`${ok+bad} de ${total}`; $("#fb",dr).style.width=Math.round((ok+bad)/total*100)+"%";
    }
    if(total){$("#fbx",dr).innerHTML=`<p><b>📷 ${ok} fotos copiadas</b>${bad?` · <span class="err">${bad} não vieram</span> <span class="muted">(coloque essas pelo Catálogo, em Editar)</span>`:""}</p>`;$("#fim",dr).hidden=false;$("#ok",dr).disabled=false}
  };
  step1();
}
