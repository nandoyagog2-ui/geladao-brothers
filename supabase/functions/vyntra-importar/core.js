// =========================================================
//  VYNTRA · Importar cardápio do Cardápio Web
//  O dono cola o link do cardápio dele (ex.: app.cardapioweb.com/minha_loja)
//  e o VYNTRA puxa categorias, produtos, preços, promoções e fotos (dados públicos).
//  Age COMO o dono logado: as regras do banco garantem que só mexe na loja dele.
//  Ações (POST JSON): previa | importar | fotos
// =========================================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const API = "https://integracao.cardapioweb.com";
const IMG_OK = /^https:\/\/storage\.googleapis\.com\/prod-cardapio-web\//;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };

class Fail extends Error {}
const fail = (m) => { throw new Fail(m); };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
export const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;

// "minha_loja", "app.cardapioweb.com/minha_loja", "https://cardapioweb.com/minha_loja", "minhaloja.com.br"
export function parseLink(raw) {
  let s = String(raw || "").trim();
  if (!s) fail("Cole o link do seu cardápio do Cardápio Web.");
  if (/^[a-z0-9_.-]+$/i.test(s) && !s.includes(".")) return { page: `https://app.cardapioweb.com/${s}`, slug: s };
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u; try { u = new URL(s); } catch { fail("Link inválido. Copie o link do seu cardápio, ex.: app.cardapioweb.com/minha_loja"); }
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || /^(localhost|127\.|10\.|192\.168\.)/.test(host)) fail("Link inválido.");
  if (host.endsWith("cardapioweb.com")) {
    const slug = u.pathname.split("/").filter(Boolean)[0];
    if (!slug) fail("Faltou o nome da loja no link. Ex.: app.cardapioweb.com/minha_loja");
    return { page: `https://app.cardapioweb.com/${slug.replace(/[^a-z0-9_.-]/gi, "")}`, slug };
  }
  return { page: `https://${host}/`, slug: host }; // domínio próprio da loja
}

async function get(fetcher, url, headers = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try { return await fetcher(url, { headers: { "User-Agent": UA, ...headers }, redirect: "follow", signal: ctl.signal }); }
  catch { fail("Não consegui acessar o Cardápio Web agora. Tente de novo em alguns minutos."); }
  finally { clearTimeout(t); }
}

// lê o cardápio público e devolve no formato do VYNTRA
export async function readMenu(link, fetcher = fetch) {
  const { page, slug } = parseLink(link);
  const h = await get(fetcher, page);
  if (!h.ok) fail("Não achei esse cardápio. Confira o link (abra ele no navegador pra ver se aparece a loja).");
  const html = await h.text();
  const cid = (html.match(/["']companyId["']\s*,\s*\{\s*value\s*:\s*(\d+)/) || html.match(/companyId["']?\s*[:=]\s*(\d+)/) || [])[1];
  if (!cid) fail("Esse link não parece ser de um cardápio do Cardápio Web.");
  const r = await get(fetcher, `${API}/api/menu/company/categories?origin=catalogo&only_available_for=delivery`, { "Company-ID": cid, Accept: "application/json" });
  if (!r.ok) fail(`O Cardápio Web não liberou o cardápio (erro ${r.status}). Tente de novo mais tarde.`);
  const cats = await r.json();
  if (!Array.isArray(cats)) fail("O Cardápio Web respondeu num formato diferente. Avise o suporte do VYNTRA.");
  let name = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || slug;
  try { const p = await get(fetcher, `${API}/api/menu/company/profile`, { "Company-ID": cid, Accept: "application/json" }); if (p.ok) { const j = await p.json(); name = j.name || (j.company && j.company.name) || name; } } catch { /* nome é só enfeite */ }
  const categorias = cats.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((c) => ({
    nome: String(c.name || "Sem categoria").trim(),
    ativa: c.status === "ACTIVE",
    itens: (c.items || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((i) => {
      const price = r2(i.price);
      const promo = i.promotional_price_active && i.promotional_price != null && +i.promotional_price > 0 && +i.promotional_price < price ? r2(i.promotional_price) : null;
      return { nome: String(i.name || "").trim(), descricao: String(i.description || "").trim(), preco: price, promocao: promo,
        ativo: i.status === "ACTIVE", combo: i.kind && i.kind !== "regular_item", destaque: !!i.highlighted,
        foto: IMG_OK.test(i.image_url || "") ? i.image_url : null, complementos: (i.add_ons || []).length };
    }).filter((i) => i.nome && i.preco > 0),
  })).filter((c) => c.itens.length);
  return { loja: String(name).replace(/\s*[|·-]\s*Card[aá]pio Web.*$/i, "").trim() || slug, company_id: cid, categorias };
}

function imgType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ["image/jpeg", "jpg"];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ["image/png", "png"];
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return ["image/webp", "webp"];
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return ["image/gif", "gif"];
  return null;
}

export function makeHandler({ createClient, supabaseUrl, anonKey, fetcher = fetch }) {
  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);
    try {
      const auth = req.headers.get("authorization") || "";
      const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
      if (!token) fail("Faça login no painel.");
      const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
      const u = await sb.auth.getUser(token);
      if (u.error || !u.data || !u.data.user) fail("Sua sessão expirou. Entre de novo no painel.");
      const acc = (await sb.rpc("my_access")).data || {};
      if (!acc.ok || acc.role !== "dono") fail("Só o dono da loja pode importar o cardápio.");
      let body = {}; try { body = await req.json(); } catch { /* */ }

      if (body.acao === "previa") {
        const menu = await readMenu(body.link, fetcher);
        const ex = await sb.from("products").select("name").limit(5000);
        const have = new Set((ex.data || []).map((p) => norm(p.name)));
        let total = 0, fotos = 0, iguais = 0, compl = 0;
        const cats = menu.categorias.map((c) => { const novos = c.itens.filter((i) => !have.has(norm(i.nome))); total += c.itens.length; iguais += c.itens.length - novos.length; fotos += novos.filter((i) => i.foto).length; compl += c.itens.filter((i) => i.complementos).length; return { nome: c.nome, itens: c.itens.length, novos: novos.length, exemplos: c.itens.slice(0, 3).map((i) => `${i.nome} · R$ ${i.preco.toFixed(2).replace(".", ",")}`) }; });
        return json({ ok: true, loja: menu.loja, categorias: cats, total, ja_existem: iguais, novos: total - iguais, com_foto: fotos, com_complementos: compl });
      }

      if (body.acao === "importar") {
        const menu = await readMenu(body.link, fetcher);
        const soAtivos = !!body.so_ativos;
        const cr = await sb.from("categories").select("id,name,sort_order").order("sort_order", { ascending: false }).limit(1000);
        if (cr.error) fail(cr.error.message);
        const catBy = new Map(cr.data.map((c) => [norm(c.name), c]));
        let nextCat = (cr.data[0] ? cr.data[0].sort_order || 0 : 0) + 1;
        const ex = await sb.from("products").select("name").limit(5000);
        const have = new Set((ex.data || []).map((p) => norm(p.name)));
        const out = { categorias_novas: 0, produtos_novos: 0, pulados_iguais: 0, pulados_inativos: 0, fotos: [] };
        for (const c of menu.categorias) {
          const itens = c.itens.filter((i) => { if (have.has(norm(i.nome))) { out.pulados_iguais++; return false; } if (soAtivos && !i.ativo) { out.pulados_inativos++; return false; } return true; });
          if (!itens.length) continue;
          let cat = catBy.get(norm(c.nome));
          if (!cat) {
            const ins = await sb.from("categories").insert({ name: c.nome, sort_order: nextCat++, active: c.ativa }).select("id,name,sort_order").single();
            if (ins.error) fail("Erro ao criar a categoria " + c.nome + ": " + ins.error.message);
            cat = ins.data; catBy.set(norm(c.nome), cat); out.categorias_novas++;
          }
          const rows = itens.map((i, k) => ({ category_id: cat.id, name: i.nome, description: i.descricao || null, price: i.preco, promo_price: i.promocao,
            status: i.ativo ? "ativo" : "em_falta", featured: i.destaque, is_combo: !!i.combo, sort_order: k + 1 }));
          const pr = await sb.from("products").insert(rows).select("id,name");
          if (pr.error) fail("Erro ao criar os produtos de " + c.nome + ": " + pr.error.message);
          const idBy = new Map(pr.data.map((p) => [norm(p.name), p.id]));
          for (const i of itens) { have.add(norm(i.nome)); const id = idBy.get(norm(i.nome)); if (id && i.foto && body.fotos !== false) out.fotos.push({ produto_id: id, src: i.foto }); }
          out.produtos_novos += pr.data.length;
        }
        return json({ ok: true, loja: menu.loja, ...out });
      }

      if (body.acao === "fotos") {
        const lista = (Array.isArray(body.itens) ? body.itens : []).slice(0, 12);
        const res = await Promise.all(lista.map(async (it) => {
          try {
            if (!IMG_OK.test(it.src || "")) fail("link de foto inválido");
            const p = await sb.from("products").select("id,image_url").eq("id", it.produto_id).maybeSingle();
            if (!p.data) fail("produto não encontrado");
            if (p.data.image_url) return { produto_id: it.produto_id, ok: true, obs: "já tinha foto" };
            const r = await get(fetcher, it.src);
            if (!r.ok) fail("download " + r.status);
            const buf = new Uint8Array(await r.arrayBuffer());
            const t = imgType(buf); if (!t) fail("não é imagem");
            if (buf.length > 6 * 1024 * 1024) fail("imagem grande demais");
            const path = `cw-${it.produto_id}-${Date.now()}.${t[1]}`;
            const up = await sb.storage.from("fotos").upload(path, buf, { contentType: t[0], cacheControl: "31536000", upsert: false });
            if (up.error) fail(up.error.message);
            const url = sb.storage.from("fotos").getPublicUrl(path).data.publicUrl;
            const u2 = await sb.from("products").update({ image_url: url }).eq("id", it.produto_id).select("id");
            if (u2.error || !u2.data.length) fail("não consegui ligar a foto");
            return { produto_id: it.produto_id, ok: true };
          } catch (e) { return { produto_id: it.produto_id, ok: false, erro: e.message }; }
        }));
        return json({ ok: true, resultado: res });
      }
      fail("Ação desconhecida.");
    } catch (e) {
      if (e instanceof Fail) return json({ ok: false, erro: e.message }, 200);
      console.error(e);
      return json({ ok: false, erro: "Erro inesperado: " + (e.message || e) }, 200);
    }
  };
}
