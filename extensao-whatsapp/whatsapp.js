// Roda dentro do WhatsApp Web: descobre a conversa aberta e escreve/envia mensagens nela
function chatInfo() {
  const main = document.querySelector("#main");
  if (!main) return { title: "", phone: "" };
  const header = main.querySelector("header");
  const span = header && (header.querySelector("span[dir='auto']") || header.querySelector("span[title]"));
  const title = (span && (span.getAttribute("title") || span.textContent) || "").trim();
  // o número aparece no código das mensagens (ex.: false_5585987148139@c.us_...)
  let phone = "";
  const el = main.querySelector("[data-id*='@c.us']");
  if (el) { const m = (el.getAttribute("data-id") || "").match(/_(\d{10,15})@c\.us/); if (m) phone = m[1]; }
  if (!phone) { const d = title.replace(/\D/g, ""); if (d.length >= 10 && /^[\d\s()+\-]+$/.test(title)) phone = d; }
  return { title, phone };
}

let last = "";
setInterval(() => {
  const c = chatInfo(), key = c.title + "|" + c.phone;
  if (key !== last) { last = key; try { chrome.runtime.sendMessage({ gb: "chat-changed", ...c }).catch(() => {}); } catch {} }
}, 800);

function composeBox() {
  return document.querySelector("#main footer div[contenteditable='true']")
      || document.querySelector("footer div[contenteditable='true']");
}
function sendButton() {
  const sel = ["footer button[aria-label='Enviar']", "footer button[aria-label='Send']",
    "footer span[data-icon='send']", "footer span[data-icon='wds-ic-send-filled']", "footer [data-icon*='send']"];
  for (const s of sel) { const el = document.querySelector(s); if (el) return el.closest("button") || el; }
  return null;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function send(text, auto, expect) {
  const now = chatInfo();
  if (expect && expect.title && now.title !== expect.title) return { ok: false, reason: "chat" };
  const box = composeBox();
  if (!box) return { ok: false, reason: "box" };
  box.focus();
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  await wait(350);
  if ((box.textContent || "").trim() === "") { box.focus(); document.execCommand("insertText", false, text); await wait(250); }
  if ((box.textContent || "").trim() === "") return { ok: false, reason: "box" };
  if (auto) {
    const b = sendButton();
    if (b) b.click();
    else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    await wait(400);
  }
  return { ok: true };
}
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m && m.gb === "chat") { reply(chatInfo()); return false; }
  if (m && m.gb === "send") { send(m.text, m.auto, m.expect).then(reply); return true; }
  return false;
});
