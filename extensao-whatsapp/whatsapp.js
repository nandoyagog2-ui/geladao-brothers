// Roda dentro do WhatsApp Web: lê a conversa aberta e cola o texto na caixa de mensagem (sem enviar)
function chatInfo() {
  const header = document.querySelector("#main header");
  if (!header) return {};
  const span = header.querySelector("span[dir='auto']") || header.querySelector("span[title]");
  const title = (span && (span.getAttribute("title") || span.textContent) || "").trim();
  const digits = title.replace(/\D/g, "");
  const phone = digits.length >= 10 && /^[\d\s()+\-]+$/.test(title) ? title : "";
  return { title, phone };
}
function composeBox() {
  return document.querySelector("#main footer div[contenteditable='true']")
      || document.querySelector("footer div[contenteditable='true']");
}
function insertText(text, done) {
  const box = composeBox();
  if (!box) return done(false);
  box.focus();
  // cola como se fosse Ctrl+V, assim as quebras de linha ficam certas e nada é enviado sozinho
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  setTimeout(() => {
    if ((box.textContent || "").trim() === "") { box.focus(); document.execCommand("insertText", false, text); }
    done((box.textContent || "").trim() !== "");
  }, 350);
}
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m && m.gb === "chat") { reply(chatInfo()); return false; }
  if (m && m.gb === "insert") { insertText(m.text, ok => reply({ ok })); return true; }
  return false;
});
