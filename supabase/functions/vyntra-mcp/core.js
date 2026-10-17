// =========================================================
//  VYNTRA · Conector de IA (MCP) — lógica principal
//  Fala o protocolo MCP (JSON-RPC por HTTP) e age COMO a pessoa logada:
//  as regras do banco (RLS + funções) garantem que cada um só vê a própria loja.
//  Sem dependências: recebe createClient de fora (Deno na Supabase, mock nos testes).
// =========================================================

export const SERVER_VERSION = "1.1.0";
const SITE = "https://www.cardapiovyntra.com.br";
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const OPEN_STATUSES = ["novo", "em_preparo", "saiu_entrega", "pronto"];
const ALL_STATUSES = ["novo", "em_preparo", "saiu_entrega", "pronto", "concluido", "cancelado"];
const STATUS_TXT = { novo: "Novo", em_preparo: "Em preparo", saiu_entrega: "Saiu p/ entrega", pronto: "Pronto p/ retirada", concluido: "Concluído", cancelado: "Cancelado" };
const SIT_IN = { ativo: "ativo", em_falta: "em_falta", oculto: "inativo", inativo: "inativo" };
const SIT_OUT = { ativo: "ativo", em_falta: "em_falta", inativo: "oculto" };

class ToolError extends Error {}
const fail = (m) => { throw new ToolError(m); };
const r2 = (v) => v == null ? null : Math.round(Number(v) * 100) / 100;
const num = (v) => v == null || v === "" ? null : Number(String(v).replace(",", "."));

// ---------- datas no fuso da loja ----------
function tzOffset(tz, at = new Date()) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(at);
    const v = (p.find((x) => x.type === "timeZoneName") || {}).value || "GMT-03:00";
    const m = v.match(/GMT([+-]\d{2}):?(\d{2})?/);
    return m ? `${m[1]}:${m[2] || "00"}` : "-03:00";
  } catch { return "-03:00"; }
}
function localDate(tz, at = new Date()) { return at.toLocaleDateString("en-CA", { timeZone: tz }); }
function addDays(ymd, n) { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

export function resolvePeriod(args, tz, now = new Date()) {
  const off = tzOffset(tz, now), today = localDate(tz, now);
  let from, to, label = args.periodo || "";
  if (isYmd(args.inicio) || isYmd(args.fim)) {
    from = isYmd(args.inicio) ? args.inicio : (args.fim || today);
    to = addDays(isYmd(args.fim) ? args.fim : from, 1);
    label = `${from} a ${addDays(to, -1)}`;
  } else {
    const dow = new Date(today + "T12:00:00Z").getUTCDay(); // 0 dom
    const ym = today.slice(0, 7);
    switch (args.periodo || "hoje") {
      case "ontem": from = addDays(today, -1); to = today; break;
      case "semana": from = addDays(today, -((dow + 6) % 7)); to = addDays(today, 1); break;
      case "semana_passada": { const mon = addDays(today, -((dow + 6) % 7)); from = addDays(mon, -7); to = mon; break; }
      case "ultimos_7_dias": from = addDays(today, -6); to = addDays(today, 1); break;
      case "ultimos_30_dias": from = addDays(today, -29); to = addDays(today, 1); break;
      case "mes": from = ym + "-01"; to = addDays(today, 1); break;
      case "mes_passado": { const first = ym + "-01"; const prev = addDays(first, -1); from = prev.slice(0, 7) + "-01"; to = first; break; }
      case "ano": from = today.slice(0, 4) + "-01-01"; to = addDays(today, 1); break;
      default: from = today; to = addDays(today, 1); label = "hoje";
    }
    label = label || "hoje";
    label += ` (${from} a ${addDays(to, -1)})`;
  }
  return { from: `${from}T00:00:00${off}`, to: `${to}T00:00:00${off}`, label };
}

// ---------- definição das ferramentas ----------
const PERIOD_PROPS = {
  periodo: { type: "string", enum: ["hoje", "ontem", "semana", "semana_passada", "ultimos_7_dias", "ultimos_30_dias", "mes", "mes_passado", "ano"], description: "Atalho de período. Semana começa na segunda. Ignorado se 'inicio'/'fim' forem informados." },
  inicio: { type: "string", description: "Data inicial AAAA-MM-DD (inclusive), no fuso da loja." },
  fim: { type: "string", description: "Data final AAAA-MM-DD (inclusive)." },
};
const RO = { readOnlyHint: true, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const TOOLS = [
  { name: "minha_loja", title: "Dados da loja", annotations: RO,
    description: "Mostra a loja da pessoa conectada: nome, se está aberta, link do cardápio, quem está logado e o papel (dono/funcionário). Use primeiro se precisar saber de qual loja se trata.",
    inputSchema: { type: "object", properties: {} } },
  { name: "resumo_vendas", title: "Resumo de vendas", annotations: RO,
    description: "Faturamento, número de pedidos, ticket médio, taxas, descontos, custo e lucro bruto num período (sem pedidos cancelados). Pode agrupar por dia, dia da semana, hora, forma de pagamento ou tipo de pedido.",
    inputSchema: { type: "object", properties: { ...PERIOD_PROPS, agrupar: { type: "string", enum: ["nenhum", "dia", "dia_semana", "hora", "pagamento", "tipo"], default: "nenhum" } } } },
  { name: "produtos_mais_vendidos", title: "Ranking de produtos", annotations: RO,
    description: "Ranking dos produtos vendidos no período, com quantidade, faturamento, preço médio e custo.",
    inputSchema: { type: "object", properties: { ...PERIOD_PROPS, ordenar_por: { type: "string", enum: ["faturamento", "quantidade"], default: "faturamento" }, limite: { type: "integer", minimum: 1, maximum: 200, default: 20 } } } },
  { name: "melhores_clientes", title: "Melhores clientes", annotations: RO,
    description: "Clientes que mais compraram no período (por valor gasto), com número de pedidos e ticket médio.",
    inputSchema: { type: "object", properties: { ...PERIOD_PROPS, limite: { type: "integer", minimum: 1, maximum: 100, default: 15 } } } },
  { name: "listar_pedidos", title: "Listar pedidos", annotations: RO,
    description: "Lista pedidos. Sem filtros, mostra os pedidos EM ABERTO (novo, em preparo, saiu p/ entrega, pronto) com há quanto tempo estão esperando. Com 'status' e período, lista o histórico.",
    inputSchema: { type: "object", properties: { status: { type: "array", items: { type: "string", enum: ALL_STATUSES } }, ...PERIOD_PROPS, limite: { type: "integer", minimum: 1, maximum: 200, default: 50 } } } },
  { name: "ver_pedido", title: "Ver pedido", annotations: RO,
    description: "Detalhes completos de um pedido pelo número: cliente, endereço, itens, valores, pagamento e status.",
    inputSchema: { type: "object", properties: { numero: { type: "integer", description: "Número do pedido (ex.: 1234)" } }, required: ["numero"] } },
  { name: "mudar_status_pedido", title: "Mudar status do pedido", annotations: { ...WR, destructiveHint: true },
    description: "Muda o status de um pedido: novo, em_preparo, saiu_entrega, pronto, concluido ou cancelado. Cancelar devolve o estoque. O cliente pode receber aviso no WhatsApp conforme a configuração da loja. Confirme com o usuário antes.",
    inputSchema: { type: "object", properties: { numero: { type: "integer" }, status: { type: "string", enum: ALL_STATUSES } }, required: ["numero", "status"] } },
  { name: "buscar_produtos", title: "Buscar produtos", annotations: RO,
    description: "Procura produtos do cardápio por nome, categoria ou situação. Retorna id, preço, promoção, custo, situação, destaque e estoque. Use para achar o produto_id antes de alterar algo.",
    inputSchema: { type: "object", properties: { busca: { type: "string", description: "Parte do nome ou código de barras" }, categoria_id: { type: "integer" }, situacao: { type: "string", enum: ["ativo", "em_falta", "oculto"] }, so_com_controle_de_estoque: { type: "boolean" }, sem_foto: { type: "boolean", description: "true = só produtos sem foto" }, limite: { type: "integer", minimum: 1, maximum: 300, default: 50 } } } },
  { name: "listar_categorias", title: "Categorias", annotations: RO,
    description: "Lista as categorias do cardápio com id e quantos produtos ativos cada uma tem.",
    inputSchema: { type: "object", properties: {} } },
  { name: "atualizar_produto", title: "Alterar produto", annotations: WR,
    description: "Altera um produto (só o dono): preço, preço promocional (0 tira a promoção), situação (ativo = vende, em_falta = aparece esgotado, oculto = some do cardápio), destaque, nome, descrição, custo, estoque mínimo. Envie só o que muda. Confirme com o usuário antes.",
    inputSchema: { type: "object", properties: { produto_id: { type: "integer" }, preco: { type: "number" }, preco_promocional: { type: "number", description: "0 remove a promoção" }, situacao: { type: "string", enum: ["ativo", "em_falta", "oculto"] }, destaque: { type: "boolean" }, nome: { type: "string" }, descricao: { type: "string" }, custo: { type: "number" }, estoque_minimo: { type: "number" } }, required: ["produto_id"] } },
  { name: "criar_produto", title: "Cadastrar produto", annotations: WR,
    description: "Cadastra um produto novo no cardápio (só o dono). Informe a categoria pelo categoria_id (use listar_categorias) ou pelo nome. Antes de criar, procure com buscar_produtos se já existe um parecido. Pode mandar foto_url (link direto de uma imagem .jpg/.png/.webp da internet, ex.: foto oficial do produto) que o sistema baixa e salva. Mostre ao usuário o que vai cadastrar e confirme antes.",
    inputSchema: { type: "object", properties: { nome: { type: "string" }, preco: { type: "number", description: "Preço de venda" }, custo: { type: "number", description: "Preço de custo (unidade)" }, categoria_id: { type: "integer" }, categoria: { type: "string", description: "Nome da categoria, se não souber o id" }, descricao: { type: "string" }, preco_promocional: { type: "number" }, codigo_barras: { type: "string" }, destaque: { type: "boolean" }, situacao: { type: "string", enum: ["ativo", "em_falta", "oculto"], default: "ativo" }, estoque_minimo: { type: "number" }, foto_url: { type: "string", description: "Link direto da imagem (opcional)" } }, required: ["nome", "preco"] } },
  { name: "definir_foto_produto", title: "Colocar foto no produto", annotations: WR,
    description: "Coloca ou troca a foto de um produto (só o dono) a partir de um link direto de imagem (.jpg, .png, .webp) da internet: o sistema baixa a imagem e salva no VYNTRA. Para achar a foto, busque na web a imagem oficial/do fabricante do produto exato (mesmo tamanho/volume) e prefira fundo branco. A IA NÃO consegue repassar uma foto que o usuário mandou no chat: nesse caso use link_foto_produto. Confirme antes.",
    inputSchema: { type: "object", properties: { produto_id: { type: "integer" }, foto_url: { type: "string" }, remover: { type: "boolean", description: "true tira a foto atual" } }, required: ["produto_id"] } },
  { name: "link_foto_produto", title: "Link para enviar foto pelo celular", annotations: RO,
    description: "Gera um link que o usuário abre no celular ou computador para tirar/escolher a foto de um produto e enviar direto pro cardápio. Use quando o usuário quiser usar uma foto própria (a IA não consegue repassar fotos do chat).",
    inputSchema: { type: "object", properties: { produto_id: { type: "integer" } }, required: ["produto_id"] } },
  { name: "estoque_baixo", title: "Estoque baixo e em falta", annotations: RO,
    description: "Produtos com estoque no mínimo ou abaixo (precisam repor) e produtos marcados como em falta.",
    inputSchema: { type: "object", properties: {} } },
  { name: "lancar_entrada_estoque", title: "Entrada de mercadoria", annotations: WR,
    description: "Lança mercadoria que chegou (vários produtos de uma vez). Por fardo: fardos + unidades_por_fardo (10 x 24 = 240 un). Por unidade: quantidade. Custo pela unidade (custo_unidade) ou pelo fardo (custo_fardo). preco_venda opcional já muda o preço. Se o produto for um fardo ligado à unidade (ex.: '12 x Heineken'), quantidade = nº de fardos e a entrada vai pro estoque da unidade. O produto passa a ter controle de estoque e volta a vender se estava em falta automático. Mostre o resumo ao usuário e confirme antes.",
    inputSchema: { type: "object", properties: {
      itens: { type: "array", minItems: 1, items: { type: "object", properties: {
        produto_id: { type: "integer" }, fardos: { type: "number" }, unidades_por_fardo: { type: "number" }, quantidade: { type: "number" },
        custo_unidade: { type: "number" }, custo_fardo: { type: "number" }, preco_venda: { type: "number" }, validade: { type: "string", description: "AAAA-MM-DD" } }, required: ["produto_id"] } },
      fornecedor: { type: "string" }, nota: { type: "string", description: "Número da nota/pedido" }, observacao: { type: "string" } }, required: ["itens"] } },
  { name: "lancar_saida_estoque", title: "Saída de estoque", annotations: { ...WR, destructiveHint: true },
    description: "Tira do estoque por motivo: quebra, vencido, consumo (próprio), brinde ou outro. Quantidade em unidades (ou em fardos, se o produto for um fardo ligado). Confirme antes.",
    inputSchema: { type: "object", properties: {
      itens: { type: "array", minItems: 1, items: { type: "object", properties: { produto_id: { type: "integer" }, quantidade: { type: "number" }, motivo: { type: "string", enum: ["quebra", "vencido", "consumo", "brinde", "outro"] } }, required: ["produto_id", "quantidade"] } },
      motivo: { type: "string", enum: ["quebra", "vencido", "consumo", "brinde", "outro"], description: "Motivo padrão pros itens" }, observacao: { type: "string" } }, required: ["itens"] } },
  { name: "contar_estoque", title: "Inventário (contagem)", annotations: { ...WR, destructiveHint: true },
    description: "Corrige o estoque com a contagem real (inventário): informa quanto tem de verdade e o sistema ajusta a diferença e registra. Confirme antes.",
    inputSchema: { type: "object", properties: { itens: { type: "array", minItems: 1, items: { type: "object", properties: { produto_id: { type: "integer" }, contado: { type: "number" } }, required: ["produto_id", "contado"] } }, observacao: { type: "string" } }, required: ["itens"] } },
  { name: "historico_estoque", title: "Histórico do estoque", annotations: RO,
    description: "Movimentações de estoque de um produto (entradas, vendas, saídas com motivo, ajustes), da mais recente pra mais antiga.",
    inputSchema: { type: "object", properties: { produto_id: { type: "integer" }, limite: { type: "integer", minimum: 1, maximum: 200, default: 30 } }, required: ["produto_id"] } },
  { name: "listar_compras", title: "Entradas de mercadoria", annotations: RO,
    description: "Últimas entradas de mercadoria (compras) com fornecedor, itens e total gasto.",
    inputSchema: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 100, default: 10 } } } },
  { name: "abrir_fechar_loja", title: "Abrir ou fechar a loja", annotations: WR,
    description: "Abre ou fecha a loja pro cardápio online (aberta=true abre, false fecha). Confirme antes.",
    inputSchema: { type: "object", properties: { aberta: { type: "boolean" } }, required: ["aberta"] } },
  { name: "listar_cupons", title: "Cupons", annotations: RO,
    description: "Lista os cupons de desconto da loja com tipo, valor, usos e validade.",
    inputSchema: { type: "object", properties: {} } },
  { name: "criar_cupom", title: "Criar cupom", annotations: WR,
    description: "Cria um cupom de desconto (só o dono). tipo: percentual (valor = %), valor (valor = R$) ou frete_gratis. Confirme antes.",
    inputSchema: { type: "object", properties: { codigo: { type: "string" }, tipo: { type: "string", enum: ["percentual", "valor", "frete_gratis"] }, valor: { type: "number" }, pedido_minimo: { type: "number", default: 0 }, limite_usos: { type: "integer" }, validade: { type: "string", description: "AAAA-MM-DD (último dia válido)" } }, required: ["codigo", "tipo"] } },
  { name: "avaliacoes", title: "Avaliações", annotations: RO,
    description: "Últimas avaliações dos clientes com nota e comentário, e a média.",
    inputSchema: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 100, default: 20 } } } },
];

// ---------- contexto da pessoa logada ----------
async function ctxOf(sb, userId) {
  const a = await sb.rpc("my_access");
  if (a.error) fail("Não consegui ler seu acesso: " + a.error.message);
  const acc = a.data || {};
  if (!acc.ok) {
    const why = { sem_cadastro: "Esse login não está cadastrado em nenhuma loja do VYNTRA.", loja_bloqueada: "A loja está bloqueada (mensalidade em atraso ou desativada).", bloqueado: "Esse login está bloqueado pelo dono da loja.", fora_horario: "Fora do horário de trabalho cadastrado pra esse funcionário." }[acc.reason] || "Sem acesso.";
    fail(why);
  }
  const st = await sb.from("staff").select("role,perms").eq("user_id", userId).maybeSingle();
  const perms = st.data && Array.isArray(st.data.perms) ? st.data.perms : null;
  const s = await sb.from("store_settings").select("name,is_open,timezone,whatsapp,address,min_order,auto_out_of_stock,delivery_mode,accepts_delivery,accepts_pickup").eq("id", acc.store_id).maybeSingle();
  return { ...acc, perms, owner: acc.role === "dono", settings: s.data || {}, tz: (s.data && s.data.timezone) || "America/Fortaleza" };
}
const can = (c, k) => c.owner || (c.perms ? c.perms.includes(k) : ["pedidos", "novo", "historico", "entregas", "cancelar", "resumo", "desconto", "fiado_vender", "estoque", "clientes"].includes(k));
const needOwner = (c) => { if (!c.owner) fail("Só o dono da loja pode fazer isso."); };
const dbErr = (r) => { if (r.error) fail(r.error.message); return r.data; };
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const fmtDt = (iso, tz) => new Date(iso).toLocaleString("pt-BR", { timeZone: tz, dateStyle: "short", timeStyle: "short" });

async function fetchAll(q, max = 20000) {
  const out = []; let i = 0;
  for (;;) { const r = await q().range(i, i + 999); if (r.error) fail(r.error.message); out.push(...r.data); if (r.data.length < 1000 || out.length >= max) break; i += 1000; }
  return out;
}

const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// baixa uma imagem da internet e salva no armazenamento "fotos" da loja (como o dono logado)
function imgType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ["image/jpeg", "jpg"];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ["image/png", "png"];
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return ["image/webp", "webp"];
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return ["image/gif", "gif"];
  return null;
}
export async function savePhotoFromUrl(sb, productId, rawUrl, fetcher = fetch) {
  let u; try { u = new URL(String(rawUrl).trim()); } catch { fail("Link da foto inválido."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") fail("O link da foto precisa começar com https://");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || u.hostname.endsWith(".internal")) fail("Link da foto inválido.");
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
  let r; try { r = await fetcher(u.href, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (VYNTRA foto)", Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" } }); }
  catch { fail("Não consegui baixar a imagem desse link (site fora do ar ou bloqueou). Tente outro link ou use link_foto_produto."); }
  finally { clearTimeout(tm); }
  if (!r.ok) fail(`O site da imagem respondeu erro ${r.status}. Tente outro link.`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length < 2000) fail("Esse link não tem uma imagem de verdade (arquivo pequeno demais).");
  if (buf.length > 6 * 1024 * 1024) fail("Imagem grande demais (máx. 6 MB). Escolha outra.");
  const t = imgType(buf);
  if (!t) fail("Esse link não é uma imagem JPG, PNG ou WEBP (pode ser uma página). Use o link direto da imagem.");
  const path = `ia-${productId}-${Date.now()}.${t[1]}`;
  const up = await sb.storage.from("fotos").upload(path, buf, { contentType: t[0], cacheControl: "31536000", upsert: false });
  if (up.error) fail("Não consegui salvar a foto: " + up.error.message);
  const pub = sb.storage.from("fotos").getPublicUrl(path).data.publicUrl;
  const done = dbErr(await sb.from("products").update({ image_url: pub }).eq("id", productId).select("id"));
  if (!done.length) fail("Não consegui ligar a foto ao produto (sem permissão).");
  return pub;
}

// ---------- execução das ferramentas ----------
const HANDLERS = {
  async minha_loja(sb, c) {
    return { loja: c.settings.name || c.store_slug, aberta: !!c.settings.is_open, link_cardapio: `https://cardapiovyntra.com.br/${c.store_slug}`,
      logado_como: c.name, papel: c.owner ? "dono" : "funcionário", fuso: c.tz, pedido_minimo: c.settings.min_order,
      entrega: c.settings.accepts_delivery !== false, retirada: c.settings.accepts_pickup !== false,
      em_falta_automatico_ao_zerar: c.settings.auto_out_of_stock !== false, whatsapp: c.settings.whatsapp, endereco: c.settings.address };
  },
  async resumo_vendas(sb, c, a) {
    if (!can(c, "resumo")) fail("Você não tem permissão pra ver as vendas.");
    const p = resolvePeriod(a, c.tz);
    const d = dbErr(await sb.rpc("mcp_sales", { p_from: p.from, p_to: p.to, p_group: a.agrupar || "nenhum" }));
    return { periodo: p.label, ...d };
  },
  async produtos_mais_vendidos(sb, c, a) {
    if (!can(c, "resumo")) fail("Você não tem permissão pra ver as vendas.");
    const p = resolvePeriod(a, c.tz);
    const d = dbErr(await sb.rpc("mcp_top_products", { p_from: p.from, p_to: p.to, p_limit: a.limite || 20, p_order: a.ordenar_por || "faturamento" }));
    return { periodo: p.label, produtos: d };
  },
  async melhores_clientes(sb, c, a) {
    if (!can(c, "clientes") && !can(c, "resumo")) fail("Você não tem permissão pra ver os clientes.");
    const p = resolvePeriod(a, c.tz);
    const rows = await fetchAll(() => sb.from("orders").select("customer_id,customer_name,customer_phone,total").neq("status", "cancelado").gte("created_at", p.from).lt("created_at", p.to));
    const m = new Map();
    for (const o of rows) { const k = o.customer_id || o.customer_phone || o.customer_name || "?"; const x = m.get(k) || { cliente: o.customer_name || "Sem nome", telefone: o.customer_phone || null, pedidos: 0, total: 0 }; x.pedidos++; x.total += Number(o.total || 0); m.set(k, x); }
    const list = [...m.values()].sort((x, y) => y.total - x.total).slice(0, a.limite || 15).map((x) => ({ ...x, total: r2(x.total), ticket_medio: r2(x.total / x.pedidos) }));
    return { periodo: p.label, clientes_no_periodo: m.size, ranking: list };
  },
  async listar_pedidos(sb, c, a) {
    if (!can(c, "pedidos") && !can(c, "historico")) fail("Você não tem permissão pra ver pedidos.");
    const st = a.status && a.status.length ? a.status : OPEN_STATUSES;
    let q = sb.from("orders").select("number,status,type,customer_name,neighborhood,total,payment_method,created_at,status_at").in("status", st).order("created_at", { ascending: false }).limit(a.limite || 50);
    let label = "em aberto";
    if (a.periodo || a.inicio || a.fim || (a.status && a.status.some((s) => !OPEN_STATUSES.includes(s)))) { const p = resolvePeriod(a, c.tz); q = q.gte("created_at", p.from).lt("created_at", p.to); label = p.label; }
    const rows = dbErr(await q);
    return { filtro: label, quantidade: rows.length, pedidos: rows.map((o) => ({ numero: o.number, status: STATUS_TXT[o.status] || o.status, tipo: o.type, cliente: o.customer_name, bairro: o.neighborhood, total: r2(o.total), pagamento: o.payment_method, feito_em: fmtDt(o.created_at, c.tz), ...(OPEN_STATUSES.includes(o.status) ? { esperando_ha: ago(o.created_at) } : {}) })) };
  },
  async ver_pedido(sb, c, a) {
    const o = dbErr(await sb.from("orders").select("id,number,status,type,customer_name,customer_phone,street,street_number,complement,reference,neighborhood,subtotal,delivery_fee,discount,service_fee,total,coupon_code,payment_method,change_for,payments,notes,created_at,status_at,distance_km").eq("number", a.numero).order("created_at", { ascending: false }).limit(1));
    if (!o.length) fail(`Pedido #${a.numero} não encontrado.`);
    const x = o[0];
    const it = dbErr(await sb.from("order_items").select("name,qty,unit_price,total,options,notes").eq("order_id", x.id));
    return { numero: x.number, status: STATUS_TXT[x.status] || x.status, tipo: x.type, feito_em: fmtDt(x.created_at, c.tz), cliente: x.customer_name, telefone: x.customer_phone,
      endereco: x.type === "delivery" ? [x.street, x.street_number, x.complement, x.neighborhood].filter(Boolean).join(", ") + (x.reference ? ` (ref.: ${x.reference})` : "") : null,
      distancia_km: x.distance_km, itens: it.map((i) => ({ qtd: i.qty, produto: i.name, unitario: r2(i.unit_price), total: r2(i.total), complementos: (i.options || []).map((o) => `${o.qty > 1 ? o.qty + "x " : ""}${o.name}`).join(", ") || undefined, obs: i.notes || undefined })),
      subtotal: r2(x.subtotal), taxa_entrega: r2(x.delivery_fee), desconto: r2(x.discount), taxa_servico: r2(x.service_fee), total: r2(x.total), cupom: x.coupon_code, pagamento: x.payment_method, troco_para: x.change_for, observacao: x.notes };
  },
  async mudar_status_pedido(sb, c, a) {
    if (!ALL_STATUSES.includes(a.status)) fail("Status inválido.");
    if (a.status === "cancelado" && !can(c, "cancelar")) fail("Você não tem permissão pra cancelar pedidos.");
    if (!can(c, "pedidos")) fail("Você não tem permissão pra mexer nos pedidos.");
    const o = dbErr(await sb.from("orders").select("id,number,status").eq("number", a.numero).order("created_at", { ascending: false }).limit(1));
    if (!o.length) fail(`Pedido #${a.numero} não encontrado.`);
    if (o[0].status === "cancelado") fail("Esse pedido já está cancelado.");
    const up = dbErr(await sb.from("orders").update({ status: a.status }).eq("id", o[0].id).select("number,status"));
    if (!up.length) fail("Não consegui alterar (sem permissão).");
    return { ok: true, numero: up[0].number, antes: STATUS_TXT[o[0].status], agora: STATUS_TXT[up[0].status] };
  },
  async buscar_produtos(sb, c, a) {
    let q = sb.from("products").select("id,name,price,promo_price,status,featured,cost_price,track_stock,stock_qty,stock_min,stock_parent_id,stock_factor,category_id,barcode,image_url,categories(name)").order("name").limit(a.limite || 50);
    if (a.busca) { const t = String(a.busca).trim(); q = /^\d{6,}$/.test(t) ? q.eq("barcode", t) : q.ilike("name", `%${t.replace(/[%_]/g, "")}%`); }
    if (a.categoria_id) q = q.eq("category_id", a.categoria_id);
    if (a.situacao) q = q.eq("status", SIT_IN[a.situacao]);
    if (a.so_com_controle_de_estoque) q = q.eq("track_stock", true);
    if (a.sem_foto) q = q.or("image_url.is.null,image_url.eq.");
    const rows = dbErr(await q);
    return { quantidade: rows.length, produtos: rows.map((p) => ({ produto_id: p.id, nome: p.name, categoria: p.categories && p.categories.name, preco: r2(p.price), promocao: p.promo_price != null && +p.promo_price < +p.price ? r2(p.promo_price) : null, ...(c.owner ? { custo: r2(p.cost_price) } : {}), situacao: SIT_OUT[p.status] || p.status, destaque: !!p.featured, tem_foto: !!p.image_url,
      estoque: p.stock_parent_id ? `usa o estoque do produto ${p.stock_parent_id} (${+p.stock_factor || 1} un por venda)` : p.track_stock ? { atual: +p.stock_qty, minimo: +p.stock_min } : "sem controle" })) };
  },
  async listar_categorias(sb) {
    const cats = dbErr(await sb.from("categories").select("id,name,active,sort_order").order("sort_order"));
    const prods = await fetchAll(() => sb.from("products").select("category_id,status"));
    return cats.map((k) => ({ categoria_id: k.id, nome: k.name, ativa: k.active, produtos_ativos: prods.filter((p) => p.category_id === k.id && p.status === "ativo").length, produtos_total: prods.filter((p) => p.category_id === k.id).length }));
  },
  async atualizar_produto(sb, c, a) {
    needOwner(c);
    const up = {};
    if (a.preco != null) { if (!(num(a.preco) > 0)) fail("Preço inválido."); up.price = r2(num(a.preco)); }
    if (a.preco_promocional != null) up.promo_price = num(a.preco_promocional) > 0 ? r2(num(a.preco_promocional)) : null;
    if (a.situacao) { if (!SIT_IN[a.situacao]) fail("Situação inválida."); up.status = SIT_IN[a.situacao]; }
    if (a.destaque != null) up.featured = !!a.destaque;
    if (a.nome) up.name = String(a.nome).trim();
    if (a.descricao != null) up.description = String(a.descricao);
    if (a.custo != null) up.cost_price = r2(num(a.custo));
    if (a.estoque_minimo != null) up.stock_min = num(a.estoque_minimo);
    if (!Object.keys(up).length) fail("Nada pra alterar.");
    const before = dbErr(await sb.from("products").select("id,name,price,promo_price,status,featured,cost_price,stock_min").eq("id", a.produto_id).maybeSingle());
    if (!before) fail(`Produto ${a.produto_id} não encontrado.`);
    const p = up.price ?? before.price;
    if (up.promo_price != null && +up.promo_price >= +p) fail("O preço promocional precisa ser menor que o preço normal.");
    const after = dbErr(await sb.from("products").update(up).eq("id", a.produto_id).select("id,name,price,promo_price,status,featured,cost_price,stock_min"));
    if (!after.length) fail("Não consegui alterar (sem permissão).");
    const show = (x) => ({ nome: x.name, preco: r2(x.price), promocao: x.promo_price != null ? r2(x.promo_price) : null, situacao: SIT_OUT[x.status], destaque: !!x.featured, custo: r2(x.cost_price), estoque_minimo: x.stock_min });
    return { ok: true, produto_id: a.produto_id, antes: show(before), agora: show(after[0]) };
  },
  async criar_produto(sb, c, a) {
    needOwner(c);
    const name = String(a.nome || "").trim();
    if (name.length < 2) fail("Informe o nome do produto.");
    const price = num(a.preco); if (!(price > 0)) fail("Preço de venda inválido.");
    let cat = null;
    if (a.categoria_id) cat = dbErr(await sb.from("categories").select("id,name").eq("id", a.categoria_id).maybeSingle());
    else if (a.categoria) { const cs = dbErr(await sb.from("categories").select("id,name")); const t = norm(a.categoria); cat = cs.find((k) => norm(k.name) === t) || cs.find((k) => norm(k.name).includes(t) || t.includes(norm(k.name))) || null; }
    if (!cat) fail("Categoria não encontrada. Use listar_categorias e informe o categoria_id.");
    const dup = dbErr(await sb.from("products").select("id,name").ilike("name", name.replace(/[%_]/g, "")).limit(1));
    if (dup.length) fail(`Já existe um produto com esse nome: "${dup[0].name}" (produto_id ${dup[0].id}). Use atualizar_produto para alterar.`);
    const promo = num(a.preco_promocional);
    if (promo != null && promo > 0 && promo >= price) fail("O preço promocional precisa ser menor que o preço de venda.");
    const last = dbErr(await sb.from("products").select("sort_order").eq("category_id", cat.id).order("sort_order", { ascending: false }).limit(1));
    const row = { name, price: r2(price), category_id: cat.id, status: SIT_IN[a.situacao || "ativo"] || "ativo", featured: !!a.destaque, is_new: true,
      sort_order: ((last[0] && last[0].sort_order) || 0) + 1, description: a.descricao ? String(a.descricao) : null,
      cost_price: a.custo != null ? r2(num(a.custo)) : null, promo_price: promo > 0 ? r2(promo) : null,
      barcode: a.codigo_barras ? String(a.codigo_barras).replace(/\D/g, "") || null : null, stock_min: a.estoque_minimo != null ? num(a.estoque_minimo) : 0 };
    const ins = dbErr(await sb.from("products").insert(row).select("id,name,price,promo_price,cost_price,status"));
    if (!ins.length) fail("Não consegui cadastrar (sem permissão).");
    const p = ins[0]; let foto = "sem foto (dá pra colocar com definir_foto_produto ou link_foto_produto)";
    if (a.foto_url) { try { await savePhotoFromUrl(sb, p.id, a.foto_url); foto = "foto salva"; } catch (e) { foto = "produto criado, mas a foto falhou: " + e.message; } }
    return { ok: true, produto_id: p.id, nome: p.name, categoria: cat.name, preco: r2(p.price), promocao: p.promo_price != null ? r2(p.promo_price) : null, custo: r2(p.cost_price),
      margem: p.cost_price ? `${Math.round((1 - p.cost_price / (p.promo_price || p.price)) * 100)}%` : undefined, situacao: SIT_OUT[p.status], foto,
      link_foto_pelo_celular: `${SITE}/foto/?p=${p.id}` };
  },
  async definir_foto_produto(sb, c, a) {
    needOwner(c);
    const p = dbErr(await sb.from("products").select("id,name,image_url").eq("id", a.produto_id).maybeSingle());
    if (!p) fail(`Produto ${a.produto_id} não encontrado.`);
    if (a.remover) { dbErr(await sb.from("products").update({ image_url: null }).eq("id", p.id).select("id")); return { ok: true, produto: p.name, foto: "removida" }; }
    if (!a.foto_url) fail("Informe foto_url (link direto da imagem) ou use link_foto_produto.");
    const url = await savePhotoFromUrl(sb, p.id, a.foto_url);
    return { ok: true, produto_id: p.id, produto: p.name, foto: url, antes: p.image_url ? "tinha outra foto (foi trocada)" : "não tinha foto" };
  },
  async link_foto_produto(sb, c, a) {
    needOwner(c);
    const p = dbErr(await sb.from("products").select("id,name,image_url").eq("id", a.produto_id).maybeSingle());
    if (!p) fail(`Produto ${a.produto_id} não encontrado.`);
    return { produto: p.name, tem_foto: !!p.image_url, link: `${SITE}/foto/?p=${p.id}`, como_usar: "Abra o link no celular, entre com o login de dono do VYNTRA (só na primeira vez), toque em Tirar foto ou Escolher da galeria e depois em Salvar foto." };
  },
  async estoque_baixo(sb) {
    const rows = await fetchAll(() => sb.from("products").select("id,name,status,track_stock,stock_qty,stock_min,auto_out,stock_parent_id").or("track_stock.eq.true,status.eq.em_falta"));
    return {
      repor: rows.filter((p) => p.track_stock && +p.stock_qty <= +p.stock_min).map((p) => ({ produto_id: p.id, nome: p.name, estoque: +p.stock_qty, minimo: +p.stock_min })),
      em_falta: rows.filter((p) => p.status === "em_falta").map((p) => ({ produto_id: p.id, nome: p.name, ...(p.track_stock ? { estoque: +p.stock_qty } : {}), automatico: !!p.auto_out })),
    };
  },
  async lancar_entrada_estoque(sb, c, a) {
    const items = (a.itens || []).map((i) => ({ product_id: i.produto_id, boxes: i.fardos, per_box: i.unidades_por_fardo, qty: i.quantidade, unit_cost: i.custo_unidade, box_cost: i.custo_fardo, sale_price: i.preco_venda, expires_on: i.validade }));
    const d = dbErr(await sb.rpc("register_stock_entry", { p: { supplier: a.fornecedor || "", doc: a.nota || "", notes: a.observacao || "Lançado pelo assistente de IA", items } }));
    return { ok: true, entrada: d.id, total_compra: d.total_cost, itens: (d.items || []).map((i) => ({ produto_id: i.product_id, produto: i.name, via: i.via || undefined, unidades: +i.units, custo_unidade: i.unit_cost, total: i.line_cost, estoque_agora: +i.stock_after, novo_preco: i.sale_price || undefined })) };
  },
  async lancar_saida_estoque(sb, c, a) {
    const items = (a.itens || []).map((i) => ({ product_id: i.produto_id, qty: i.quantidade, reason: i.motivo }));
    const d = dbErr(await sb.rpc("register_stock_exit", { p: { reason: a.motivo || "outro", notes: a.observacao || "", items } }));
    return { ok: true, prejuizo_pelo_custo: d.loss_value, itens: (d.items || []).map((i) => ({ produto_id: i.product_id, produto: i.name, unidades: +i.units, motivo: i.reason, estoque_agora: +i.stock_after })) };
  },
  async contar_estoque(sb, c, a) {
    const d = dbErr(await sb.rpc("apply_inventory", { p: { notes: a.observacao || "Contagem pelo assistente de IA", items: (a.itens || []).map((i) => ({ product_id: i.produto_id, counted: i.contado })) } }));
    return { ok: true, inventario: d.id, produtos: d.items, diferenca_em_reais_pelo_custo: d.diff_value };
  },
  async historico_estoque(sb, c, a) {
    const p = dbErr(await sb.from("products").select("id,name,stock_qty,track_stock,stock_parent_id").eq("id", a.produto_id).maybeSingle());
    if (!p) fail(`Produto ${a.produto_id} não encontrado.`);
    const pid = p.stock_parent_id || p.id;
    const mv = dbErr(await sb.from("stock_movements").select("kind,qty,description,reason,unit_cost,created_by_name,created_at").eq("product_id", pid).order("created_at", { ascending: false }).limit(a.limite || 30));
    return { produto: p.name, ...(p.stock_parent_id ? { obs: `Esse fardo usa o estoque do produto ${pid}` } : {}), movimentos: mv.map((m) => ({ quando: fmtDt(m.created_at, c.tz), tipo: m.kind, quantidade: +m.qty, motivo: m.reason || undefined, descricao: m.description || undefined, custo_unidade: m.unit_cost ?? undefined, por: m.created_by_name || undefined })) };
  },
  async listar_compras(sb, c, a) {
    const rows = dbErr(await sb.from("stock_entries").select("id,created_at,supplier,doc,total_cost,created_by_name,items").order("created_at", { ascending: false }).limit(a.limite || 10));
    return rows.map((e) => ({ entrada: e.id, quando: fmtDt(e.created_at, c.tz), fornecedor: e.supplier, nota: e.doc, total: e.total_cost, por: e.created_by_name, itens: (e.items || []).map((i) => `${i.name}: ${+i.units} un${i.unit_cost != null ? " a R$ " + i.unit_cost : ""}`) }));
  },
  async abrir_fechar_loja(sb, c, a) {
    dbErr(await sb.rpc("set_store_open", { p_open: !!a.aberta }));
    return { ok: true, loja: a.aberta ? "aberta" : "fechada" };
  },
  async listar_cupons(sb) {
    const rows = dbErr(await sb.from("coupons").select("code,kind,value,min_order,max_uses,uses,expires_at,active").order("code"));
    return rows.map((x) => ({ codigo: x.code, tipo: { percent: "percentual", fixed: "valor", free_delivery: "frete_gratis" }[x.kind] || x.kind, valor: r2(x.value), pedido_minimo: r2(x.min_order), usos: x.uses, limite_usos: x.max_uses, validade: x.expires_at, ativo: x.active }));
  },
  async criar_cupom(sb, c, a) {
    needOwner(c);
    const code = String(a.codigo || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!code) fail("Informe o código.");
    const kind = { percentual: "percent", valor: "fixed", frete_gratis: "free_delivery" }[a.tipo];
    if (!kind) fail("Tipo inválido.");
    const value = kind === "free_delivery" ? 0 : num(a.valor);
    if (kind !== "free_delivery" && !(value > 0)) fail("Informe o valor do desconto.");
    if (kind === "percent" && value > 100) fail("Percentual acima de 100%.");
    let exp = null; if (a.validade) { if (!isYmd(a.validade)) fail("Validade no formato AAAA-MM-DD."); exp = `${addDays(a.validade, 1)}T00:00:00${tzOffset(c.tz)}`; }
    const d = dbErr(await sb.from("coupons").insert({ code, kind, value, min_order: num(a.pedido_minimo) || 0, max_uses: a.limite_usos || null, expires_at: exp, active: true }).select("code,kind,value,min_order,max_uses,expires_at"));
    return { ok: true, cupom: d[0] };
  },
  async avaliacoes(sb, c, a) {
    const rows = dbErr(await sb.from("reviews").select("rating,comment,customer_name,created_at").order("created_at", { ascending: false }).limit(a.limite || 20));
    const avg = rows.length ? r2(rows.reduce((s, x) => s + x.rating, 0) / rows.length) : null;
    return { media_das_ultimas: avg, avaliacoes: rows.map((x) => ({ nota: x.rating, comentario: x.comment, cliente: x.customer_name, quando: fmtDt(x.created_at, c.tz) })) };
  },
};

// ---------- HTTP / MCP ----------
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version, accept", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id" };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });

export function makeHandler({ createClient, supabaseUrl, anonKey, publicUrl }) {
  const base = (publicUrl || `${supabaseUrl}/functions/v1/vyntra-mcp`).replace(/\/$/, "");
  const prmUrl = `${base}/.well-known/oauth-protected-resource`;
  const metadata = { resource: base, authorization_servers: [`${supabaseUrl}/auth/v1`], bearer_methods_supported: ["header"], scopes_supported: ["email"], resource_name: "VYNTRA", resource_documentation: "https://cardapiovyntra.com.br" };
  const unauthorized = (desc) => json({ error: "unauthorized", error_description: desc }, 401, { "WWW-Authenticate": `Bearer resource_metadata="${prmUrl}", scope="email"${desc ? `, error="invalid_token", error_description="${desc}"` : ""}` });

  return async function handle(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (/\/\.well-known\/oauth-protected-resource/.test(url.pathname)) return json(metadata);
    if (req.method === "GET") return json({ name: "VYNTRA MCP", version: SERVER_VERSION, info: "Conector de IA do VYNTRA. Adicione esta URL como conector personalizado no Claude." }, 405, { Allow: "POST" });
    if (req.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const auth = req.headers.get("authorization") || "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!token) return unauthorized();
    const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const u = await sb.auth.getUser(token);
    if (u.error || !u.data || !u.data.user) return unauthorized("Sessão expirada ou inválida. Conecte de novo.");
    const userId = u.data.user.id;

    let body; try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
    const msgs = Array.isArray(body) ? body : [body];
    let ctx = null; const getCtx = async () => ctx || (ctx = await ctxOf(sb, userId));
    const out = [];
    for (const m of msgs) {
      if (!m || typeof m !== "object" || m.id === undefined || m.id === null) continue; // notificações e respostas: nada a responder
      try { out.push({ jsonrpc: "2.0", id: m.id, result: await rpc(m, getCtx, sb) }); }
      catch (e) { out.push({ jsonrpc: "2.0", id: m.id, error: { code: e.code || -32603, message: e.message || "Erro interno" } }); }
    }
    if (!out.length) return new Response(null, { status: 202, headers: CORS });
    return json(Array.isArray(body) ? out : out[0]);
  };
}

async function rpc(m, getCtx, sb) {
  const p = m.params || {};
  switch (m.method) {
    case "initialize": {
      let name = "", store = "";
      try { const c = await getCtx(); name = c.name; store = c.settings.name || c.store_slug; } catch {}
      return { protocolVersion: PROTOCOLS.includes(p.protocolVersion) ? p.protocolVersion : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "vyntra", title: "VYNTRA", version: SERVER_VERSION },
        instructions: `Você está conectado ao VYNTRA (cardápio digital e gestão)${store ? ` da loja "${store}"` : ""}${name ? `, como ${name}` : ""}. Fale em português do Brasil, com valores em R$. Antes de qualquer alteração (cadastro, preço, foto, estoque, status de pedido, cupom, abrir/fechar), mostre ao usuário exatamente o que vai mudar e espere a confirmação. Para achar o produto_id use buscar_produtos. Datas seguem o fuso da loja.` };
    }
    case "ping": return {};
    case "tools/list": return { tools: TOOLS };
    case "tools/call": {
      const h = HANDLERS[p.name];
      if (!h) { const e = new Error(`Ferramenta desconhecida: ${p.name}`); e.code = -32602; throw e; }
      try {
        const c = await getCtx();
        const data = await h(sb, c, p.arguments || {});
        return { content: [{ type: "text", text: JSON.stringify(data, null, 1) }] };
      } catch (e) {
        if (e instanceof ToolError) return { content: [{ type: "text", text: e.message }], isError: true };
        return { content: [{ type: "text", text: "Erro: " + (e.message || e) }], isError: true };
      }
    }
    case "resources/list": return { resources: [] };
    case "prompts/list": return { prompts: [] };
    default: { const e = new Error(`Método não suportado: ${m.method}`); e.code = -32601; throw e; }
  }
}
