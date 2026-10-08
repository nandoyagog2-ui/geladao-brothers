// Ponte entre o painel (dentro do iframe) e a conversa aberta no WhatsApp Web
const SITE = "https://geladao-brothers.vercel.app";
const app = document.getElementById("app");
const msg = document.getElementById("msg");
const show = t => { msg.textContent = t; msg.style.display = "block"; clearTimeout(show.t); show.t = setTimeout(() => msg.style.display = "none", 3500); };

document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
  app.src = `${SITE}/painel/?modo=whats&t=${Date.now()}#${b.dataset.go}`;
});

async function whatsTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*", currentWindow: true });
  return tabs.find(t => t.active) || tabs[0];
}
async function toWhats(payload) {
  const tab = await whatsTab();
  if (!tab) { show("Abra o WhatsApp Web (web.whatsapp.com) nesta janela."); return null; }
  try { return await chrome.tabs.sendMessage(tab.id, payload); }
  catch { show("Recarregue a aba do WhatsApp Web (F5) e tente de novo."); return null; }
}

window.addEventListener("message", async e => {
  if (e.origin !== SITE) return;
  const d = e.data || {};
  if (d.gb === "chat") {
    const r = await toWhats({ gb: "chat" });
    if (r && (r.title || r.phone)) app.contentWindow.postMessage({ gb: "chat-info", title: r.title, phone: r.phone }, SITE);
    else if (r) app.contentWindow.postMessage({ gb: "no-chat" }, SITE);
  }
  if (d.gb === "insert" && d.text) {
    const r = await toWhats({ gb: "insert", text: d.text });
    if (r && r.ok) show("Resumo colado na conversa. Confira e aperte enviar ✅");
    else if (r) show("Abra a conversa do cliente no WhatsApp e clique em 'Colar de novo'.");
  }
});
