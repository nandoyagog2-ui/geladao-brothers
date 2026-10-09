// Roda DENTRO da página do WhatsApp Web (mundo da página).
// Usa as funções internas do próprio WhatsApp pra mandar mensagem pra um número
// sem abrir conversa, sem recarregar a página e sem mexer no que a pessoa está vendo.
// (Mesma técnica da biblioteca aberta wa-js / WPPConnect, Apache-2.0.)
(() => {
  if (window.__gbBridge) return;
  window.__gbBridge = true;
  const W = window;

  const imp = id => {
    try {
      if (W.ErrorGuard && W.ErrorGuard.skipGuardGlobal) W.ErrorGuard.skipGuardGlobal(true);
      return W.importNamespace ? W.importNamespace(id) : W.require(id);
    } catch (e) { return null; }
  };
  const allIds = () => {
    try {
      return Object.keys(W.require("__debug").modulesMap)
        .filter(id => /^(?:use)?WA/.test(id) && !/^WAWebMoment-/.test(id) && !/\.react$/.test(id) && id !== "WAWebEmojiPanelContentEmojiSearchEmpty.react");
    } catch (e) { return []; }
  };
  const cache = {};
  function find(key, hints, hint, test) {
    if (cache[key]) return cache[key];
    const ok = m => { try { return m && test(m); } catch (e) { return false; } };
    for (const h of hints) { const m = imp(h); if (ok(m)) return (cache[key] = m); }
    const ids = allIds();
    for (const id of ids.filter(i => hint.test(i))) { const m = imp(id); if (ok(m)) return (cache[key] = m); }
    return null;
  }
  const M = {
    wid:    () => find("wid", ["WAWebWidFactory"], /Wid/, m => typeof m.createWid === "function"),
    exists: () => find("exists", ["WAWebQueryExistsJob"], /Exist/, m => m.queryWidExists && m.queryPhoneExists),
    latest: () => find("latest", ["WAWebFindChatAction"], /FindChat|Chat.*Action/, m => typeof m.findOrCreateLatestChat === "function"),
    chats:  () => find("chats", ["WAWebChatCollection"], /ChatCollection/, m => m.ChatCollection && typeof m.ChatCollection.get === "function"),
    send:   () => find("send", ["WAWebSendTextMsgChatAction"], /SendTextMsg|SendMsgChat/, m => typeof m.sendTextMsgToChat === "function"),
    cmd:    () => find("cmd", ["WAWebCmd"], /Cmd/, m => m.Cmd && m.CmdImpl)
  };
  const ready = () => !!(W.require && (W.importNamespace || W.require));

  async function chatFor(phone) {
    let d = String(phone || "").replace(/\D/g, "");
    if (d.length === 10 || d.length === 11) d = "55" + d;
    const wf = M.wid(), lt = M.latest(), cc = M.chats();
    if (!wf || !lt) throw new Error("modulos");
    let wid = wf.createWid(d + "@c.us");
    const ex = M.exists();
    if (ex) {
      try {
        const r = await ex.queryWidExists(wid);
        if (!r || !r.wid) throw new Error("sem_whatsapp");
        wid = r.wid;                       // já corrige o 9º dígito
      } catch (e) { if (e.message === "sem_whatsapp") throw e; }
    }
    const res = await lt.findOrCreateLatestChat(wid, "newChatFlow");
    const raw = res && (res.chat || res);
    const chat = (cc && raw && raw.id && cc.ChatCollection.get(raw.id)) || raw;
    if (!chat) throw new Error("chat");
    return chat;
  }
  async function sendText(phone, text) {
    const chat = await chatFor(phone);
    const s = M.send();
    if (!s) throw new Error("modulos");
    await s.sendTextMsgToChat(chat, text, {});
    return true;
  }
  async function openChat(phone) {
    const chat = await chatFor(phone);
    const c = M.cmd();
    if (!c) throw new Error("modulos");
    try { await c.Cmd.openChatBottom({ chat }); } catch (e) { await c.Cmd.openChatBottom(chat); }
    return true;
  }

  W.addEventListener("message", async e => {
    if (e.source !== W) return;
    const d = e.data || {};
    if (d.gbwa !== "req") return;
    const reply = (ok, err) => W.postMessage({ gbwa: "res", id: d.id, ok, err: err || null }, "*");
    try {
      if (!ready()) return reply(false, "carregando");
      if (d.cmd === "ping") return reply(!!(M.wid() && M.latest() && M.send()), "parcial");
      if (d.cmd === "send") { await sendText(d.phone, d.text); return reply(true); }
      if (d.cmd === "open") { await openChat(d.phone); return reply(true); }
      reply(false, "comando");
    } catch (err) { reply(false, (err && err.message) || "erro"); }
  });
})();
