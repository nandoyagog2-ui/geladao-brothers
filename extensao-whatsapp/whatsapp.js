// Roda dentro do WhatsApp Web: descobre a conversa aberta e escreve/envia mensagens nela
const VERSION = "1.2";

function headerTitle() {
  const header = document.querySelector("#main header");
  if (!header) return "";
  const tries = [
    "[data-testid='conversation-info-header-chat-title']",
    "span[dir='auto'][title]",
    "div[role='button'] span[dir='auto']",
    "span[dir='auto']"
  ];
  for (const s of tries) {
    for (const el of header.querySelectorAll(s)) {
      const t = (el.getAttribute("title") || el.textContent || "").trim();
      if (t && !/^(online|digitando|gravando|visto por último|clique aqui)/i.test(t)) return t;
    }
  }
  return "";
}
function chatPhone(title) {
  const main = document.querySelector("#main");
  if (main) {
    for (const el of main.querySelectorAll("[data-id]")) {
      const m = (el.getAttribute("data-id") || "").match(/(?:^|_)(\d{10,15})@c\.us/);
      if (m) return m[1];
    }
  }
  const d = (title || "").replace(/\D/g, "");
  if (d.length >= 10 && /^[\d\s()+\-]+$/.test(title || "")) return d;
  return "";
}
function chatInfo() {
  const title = headerTitle();
  return { title, phone: title ? chatPhone(title) : "", box: !!composeBox(), v: VERSION };
}

let last = "";
function check() {
  const c = chatInfo(), key = c.title + "|" + c.phone;
  if (key !== last) { last = key; try { chrome.runtime.sendMessage({ gb: "chat-changed", ...c }).catch(() => {}); } catch {} }
}
setInterval(check, 700);
document.addEventListener("click", () => setTimeout(check, 300), true);

function composeBox() {
  const list = [...document.querySelectorAll("#main footer [contenteditable='true']")];
  return list[list.length - 1] || null;
}
function sendButton() {
  const sel = ["footer button[aria-label='Enviar']", "footer button[aria-label='Send']",
    "footer [data-icon='send']", "footer [data-icon='wds-ic-send-filled']", "footer [data-icon*='send']",
    "footer [data-testid='send']", "footer [data-testid='compose-btn-send']"];
  for (const s of sel) { const el = document.querySelector(s); if (el) return el.closest("button,[role='button']") || el; }
  return null;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const filled = box => (box.textContent || "").replace(/​/g, "").trim() !== "";

async function write(box, text) {
  box.focus();
  // 1º jeito: colar (mantém as quebras de linha)
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  await wait(400);
  if (filled(box)) return true;
  // 2º jeito: digitar o texto
  box.focus();
  document.execCommand("insertText", false, text);
  await wait(300);
  if (filled(box)) return true;
  // 3º jeito: linha por linha
  box.focus();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) document.execCommand("insertText", false, lines[i]);
    if (i < lines.length - 1) {
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, shiftKey: true, bubbles: true, cancelable: true }));
      await wait(15);
    }
  }
  await wait(300);
  return filled(box);
}
async function send(text, auto, expect) {
  const now = chatInfo();
  if (expect && expect.title && now.title && now.title !== expect.title) return { ok: false, reason: "chat", now: now.title };
  const box = composeBox();
  if (!box) return { ok: false, reason: "box" };
  if (!(await write(box, text))) return { ok: false, reason: "write" };
  if (auto) {
    await wait(150);
    const b = sendButton();
    if (b) b.click();
    else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    await wait(500);
    if (filled(box)) return { ok: true, sent: false };   // escreveu mas não conseguiu clicar em enviar
  }
  return { ok: true, sent: !!auto };
}
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m && m.gb === "chat") { reply(chatInfo()); return false; }
  if (m && m.gb === "send") { send(m.text, m.auto, m.expect).then(reply); return true; }
  return false;
});
