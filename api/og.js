// Prévia do link (WhatsApp, Instagram, Facebook...): esses robôs não rodam o JavaScript do cardápio,
// então aqui a gente devolve a página já com o nome, a descrição e a logo da loja certa.
const SB = "https://qjhhewvwptjnswaxofkn.supabase.co";
const KEY = "sb_publishable_npKDicouH-8XqVC_SebOSQ_3VmlF3lb";
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

module.exports = async (req, res) => {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  const origin = "https://" + host;
  const slug = String((req.query && req.query.loja) || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (["painel","admin","impressora","entregador","vyntra","termos","privacidade","ajuda","api","extensao","foto","oauth"].includes(slug)) {
    res.statusCode = 308; res.setHeader("Location", "/" + slug + "/"); return res.end();
  }
  const ownHost = /(^|\.)vercel\.app$|(^|\.)cardapiovyntra\.com\.br$/.test(host);
  const loja = slug || (ownHost ? "" : "@" + host);

  let s = null;
  try {
    const r = await fetch(SB + "/rest/v1/rpc/get_menu", {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify(loja ? { p_loja: loja } : {})
    });
    const j = r.ok ? await r.json() : null;
    s = j && j.s ? j.s : null;
  } catch (e) {}

  const name = (s && s.name) || "Cardápio digital";
  const title = name + " · Cardápio";
  const desc = (s && (s.description || s.about || s.slogan)) || (s && s.name ? "Faça seu pedido no cardápio digital de " + name + ". Rápido, sem baixar aplicativo." : "Faça seu pedido pelo cardápio digital. Rápido, sem baixar aplicativo.");
  let img = (s && (s.logo_url || s.banner_url)) || "/img/vyntra-512.png";
  if (!/^https?:\/\//.test(img)) img = origin + (img.startsWith("/") ? "" : "/") + img;
  const url = origin + (slug ? "/" + slug : "/");

  const tags =
    `<title>${esc(title)}</title>\n` +
    `<meta name="description" content="${esc(desc)}">\n` +
    `<meta property="og:type" content="website">\n` +
    `<meta property="og:site_name" content="${esc(name)}">\n` +
    `<meta property="og:title" content="${esc(title)}">\n` +
    `<meta property="og:description" content="${esc(desc)}">\n` +
    `<meta property="og:url" content="${esc(url)}">\n` +
    `<meta property="og:image" content="${esc(img)}">\n` +
    `<meta name="twitter:card" content="summary">\n`;

  let html = null;
  try {
    const r = await fetch(origin + "/index.html", { headers: { "user-agent": "vyntra-og" } });
    if (r.ok) html = await r.text();
  } catch (e) {}
  if (html && html.includes("<title>")) html = html.replace(/<title>[^<]*<\/title>/, tags);
  else html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">${tags}</head><body><a href="${esc(url)}">${esc(title)}</a></body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600");
  res.status(200).send(html);
};
