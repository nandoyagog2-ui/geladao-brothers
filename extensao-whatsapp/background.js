// Clicar no ícone da extensão abre o painel lateral
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Configurações do robô (vêm do painel, leitura pública da loja)
const SB_URL = "https://qjhhewvwptjnswaxofkn.supabase.co";
const SB_KEY = "sb_publishable_npKDicouH-8XqVC_SebOSQ_3VmlF3lb";
let cache = null, at = 0;
async function cfg(force) {
  if (cache && !force && Date.now() - at < 60000) return cache;
  try {
    const r = await fetch(SB_URL + "/rest/v1/store_settings?id=eq.1&select=*", { headers: { apikey: SB_KEY } });
    const j = await r.json();
    if (Array.isArray(j) && j[0]) { cache = j[0]; at = Date.now(); }
  } catch {}
  return cache;
}
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m && m.gb === "cfg") { cfg(m.force).then(reply); return true; }
  return false;
});
