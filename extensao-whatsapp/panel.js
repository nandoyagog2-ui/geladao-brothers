// Ponte entre a tela do Geladão (iframe) e a conversa aberta no WhatsApp Web
const SITE = "https://geladao-brothers.vercel.app";
const app = document.getElementById("app");
const msg = document.getElementById("msg");
const show = t => { msg.textContent = t; msg.style.display = "block"; clearTimeout(show.t); show.t = setTimeout(() => msg.style.display = "none", 4000); };
const toApp = m => app.contentWindow && app.contentWindow.postMessage(m, SITE);

async function whatsTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  return tabs.find(t => t.active) || tabs[0];
}
async function toWhats(payload) {
  const tab = await whatsTab();
  if (!tab) { show("Abra o WhatsApp Web (web.whatsapp.com) pra usar."); return null; }
  try { return await chrome.tabs.sendMessage(tab.id, payload); }
  catch { show("Recarregue a aba do WhatsApp Web (F5)."); return null; }
}
async function pushChat() {
  const r = await toWhats({ gb: "chat" });
  if (r) toApp({ gb: "chat-info", title: r.title || "", phone: r.phone || "", box: r.box, v: r.v });
  else toApp({ gb: "chat-info", title: "", phone: "", err: "nowa" });
}

// a conversa mudou no WhatsApp -> avisa a tela
chrome.runtime.onMessage.addListener(m => {
  if (m && m.gb === "chat-changed") toApp({ gb: "chat-info", title: m.title || "", phone: m.phone || "", box: m.box, v: m.v });
});

window.addEventListener("message", async e => {
  if (e.origin !== SITE) return;
  const d = e.data || {};
  if (d.gb === "ready" || d.gb === "chat") pushChat();
  if (d.gb === "ping") { const r = await toWhats({ gb: "chat" }); toApp({ gb: "pong", ok: !!r, ...(r || {}) }); }
  if (d.gb === "send") {
    const r = await toWhats({ gb: "send", text: d.text, auto: d.auto !== false, expect: d.expect || {} });
    toApp({ gb: "sent", id: d.id, ok: !!(r && r.ok), sent: !!(r && r.sent), reason: r ? r.reason : "nowa" });
  }
});
