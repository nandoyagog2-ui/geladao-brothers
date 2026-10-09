// Ponte entre a tela do Geladão (iframe) e o WhatsApp Web
const SITE = "https://geladao-brothers.vercel.app";
const app = document.getElementById("app");
const msg = document.getElementById("msg");
const show = t => { msg.textContent = t; msg.style.display = "block"; clearTimeout(show.t); show.t = setTimeout(() => msg.style.display = "none", 4000); };
const toApp = m => app.contentWindow && app.contentWindow.postMessage(m, SITE);

async function whatsTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  return tabs.find(t => t.active) || tabs[0];
}
async function toWhats(payload, quiet) {
  const tab = await whatsTab();
  if (!tab) { if (!quiet) show("Abra o WhatsApp Web (web.whatsapp.com) pra usar."); return null; }
  try { return await chrome.tabs.sendMessage(tab.id, payload); }
  catch { if (!quiet) show("Recarregue a aba do WhatsApp Web (F5)."); return null; }
}
async function pushChat() {
  const r = await toWhats({ gb: "chat" });
  if (r) toApp({ gb: "chat-info", title: r.title || "", phone: r.phone || "", box: r.box, v: r.v });
  else toApp({ gb: "chat-info", title: "", phone: "", err: "nowa" });
}
async function pushBot() {
  const v = await chrome.storage.local.get(["gb_bot_on", "gb_bot_state"]);
  const st = v.gb_bot_state || {};
  const waiting = Object.entries(st).filter(([, s]) => s.mode === "wait").map(([n]) => n);
  toApp({ gb: "bot-local", on: !!v.gb_bot_on, waiting });
}

// mensagens que vêm do WhatsApp
chrome.runtime.onMessage.addListener(m => {
  if (!m) return;
  if (m.gb === "chat-changed") toApp({ gb: "chat-info", title: m.title || "", phone: m.phone || "", box: m.box, v: m.v });
  if (m.gb === "bot-help") { show("🙋 " + m.name + " pediu pra falar com um atendente"); toApp({ gb: "bot-help", name: m.name }); pushBot(); }
  if (m.gb === "bot-contact") toApp({ gb: "bot-contact", name: m.name, phone: m.phone });
  if (m.gb === "job-done") toApp({ gb: "sent-to", id: m.id, ok: m.ok, reason: m.reason });
});
chrome.storage.onChanged.addListener(ch => { if (ch.gb_bot_on || ch.gb_bot_state) pushBot(); });

// mensagens que vêm da tela do Geladão
window.addEventListener("message", async e => {
  if (e.origin !== SITE) return;
  const d = e.data || {};
  if (d.gb === "ready" || d.gb === "chat") { pushChat(); pushBot(); }
  if (d.gb === "ping") { const r = await toWhats({ gb: "chat" }); toApp({ gb: "pong", ok: !!r, ...(r || {}) }); }
  if (d.gb === "send") {
    const r = await toWhats({ gb: "send", text: d.text, auto: d.auto !== false, expect: d.expect || {} });
    toApp({ gb: "sent", id: d.id, ok: !!(r && r.ok), sent: !!(r && r.sent), reason: r ? r.reason : "nowa" });
  }
  if (d.gb === "sendto") {
    const r = await toWhats({ gb: "sendto", id: d.id, phone: d.phone, text: d.text }, true);
    if (!r) toApp({ gb: "sent-to", id: d.id, ok: false, reason: "nowa" });
  }
  if (d.gb === "bot-set") { await chrome.storage.local.set({ gb_bot_on: !!d.on }); pushBot(); }
  if (d.gb === "bot-reload") toWhats({ gb: "bot-reload" }, true);
});
