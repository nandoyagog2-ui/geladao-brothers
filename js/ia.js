/* VYNTRA · página "Conectar à IA" do painel.
   Mostra o link do conector e o passo a passo pro dono (ou funcionário) ligar a loja no Claude. */
const IA_URL="https://qjhhewvwptjnswaxofkn.supabase.co/functions/v1/vyntra-mcp";

async function pageIA(m){
  const ex=OWNER()
    ?["Quanto eu vendi essa semana e qual foi o lucro?","Quais os 10 produtos que mais vendem no fim de semana?","O que está acabando no estoque?","Chegaram 10 fardos de Heineken com 24, custo R$ 5,65 a unidade. Lança a entrada.","Coloca a Corona em promoção por R$ 6,99","Quais clientes mais compram e o que eles pedem?","Tem pedido esperando há muito tempo?"]
    :["Tem pedido esperando agora?","O que está acabando no estoque?","Qual o estoque de Heineken?"];
  m.innerHTML=`<div class="top"><h1>🧠 Conectar à IA</h1></div>
  <div class="grid g2">
    <div class="card grid" style="align-content:start">
      <p style="margin:0">Converse com a sua loja como se fosse um gerente: pergunte vendas, lucro, estoque e pedidos, e peça pra IA <b>lançar entrada de mercadoria, mudar preço, criar cupom</b> e muito mais. Tudo em português, falando normal.</p>
      <label class="fld"><span>Link do conector VYNTRA</span>
        <div class="row" style="flex-wrap:nowrap;gap:8px"><input class="in" id="iau" readonly value="${IA_URL}" onclick="this.select()"><button class="btn sm" id="iac">📋 Copiar</button></div></label>
      <b style="margin-top:6px">Como conectar no Claude (computador)</b>
      <ol style="margin:0;padding-left:20px;line-height:1.75">
        <li>Entre em <a href="https://claude.ai" target="_blank" rel="noopener"><b>claude.ai</b></a> com a sua conta.</li>
        <li>Clique no seu nome (canto de baixo, à esquerda) → <b>Configurações</b> → <b>Conectores</b>.</li>
        <li>Clique em <b>Adicionar conector personalizado</b>.</li>
        <li>Em <b>Nome</b> escreva <b>VYNTRA</b>. Em <b>URL</b> cole o link de cima (botão <b>📋 Copiar</b>). Clique em <b>Adicionar</b>.</li>
        <li>Clique em <b>Conectar</b>. Vai abrir a página do VYNTRA: entre com o <b>mesmo usuário e senha deste painel</b> e clique em <b>Permitir</b>.</li>
        <li>Pronto! Abra uma conversa nova no Claude e pergunte o que quiser da loja.</li>
      </ol>
      <p class="muted" style="margin:0;font-size:12.5px">Depois de conectado no computador, funciona também no app do Claude no celular, com a mesma conta.</p>
      <p class="muted" style="margin:0;font-size:12.5px">💡 Dica: em <b>Configurações → Conectores → VYNTRA</b>, deixe as <b>ferramentas somente leitura</b> em <b>Sempre permitir</b>. Assim a IA consulta sem ficar pedindo aprovação. As que alteram (preço, estoque, pedidos) continuam pedindo.</p>
    </div>
    <div class="grid" style="align-content:start;gap:12px">
      <div class="card grid" style="align-content:start;gap:6px"><b>💬 Exemplos do que perguntar</b>
        ${ex.map(t=>`<div style="background:var(--card-2);border-radius:10px;padding:8px 10px">“${esc(t)}”</div>`).join("")}</div>
      <div class="card grid" style="align-content:start;gap:6px"><b>🔒 Segurança</b>
        <ul style="margin:0;padding-left:20px;line-height:1.6">
          <li>A IA <b>sempre mostra o que vai mudar e pede sua confirmação</b> antes de alterar qualquer coisa.</li>
          <li>Ela só vê a <b>sua loja</b>, com as mesmas permissões do seu login${OWNER()?". Funcionário que conectar só faz o que você liberou pra ele em <b>Equipe e acessos</b>":""}.</li>
          <li>Sua senha não vai pra IA. Pra cortar o acesso, remova o conector em <b>Configurações → Conectores</b> no Claude${OWNER()?" (ou troque a senha do usuário)":""}.</li>
        </ul></div>
    </div>
  </div>`;
  $("#iac").onclick=async()=>{try{await navigator.clipboard.writeText(IA_URL);toast("Link copiado")}catch{$("#iau").select();document.execCommand("copy");toast("Link copiado")}};
}
