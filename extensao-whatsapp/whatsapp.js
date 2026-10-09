// Roda dentro do WhatsApp Web:
//  - descobre a conversa aberta e escreve/envia mensagens nela
//  - robô de respostas automáticas (chatbot) com cores e botão AJUDA
//  - envia avisos de pedido abrindo a conversa do cliente pelo número
const VERSION = "2.0";

/* ================= conversa aberta ================= */
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
      if (el.closest(".gb-ui")) continue;
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
  if (key !== last) { last = key; tell({ gb: "chat-changed", ...c }); }
}
setInterval(check, 700);
document.addEventListener("click", () => setTimeout(check, 300), true);
function tell(m) { try { chrome.runtime.sendMessage(m).catch(() => {}); } catch {} }

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
const digits = s => String(s || "").replace(/\D/g, "");
const same9 = (a, b) => { const x = digits(a), y = digits(b); return x.length >= 8 && y.length >= 8 && x.slice(-9) === y.slice(-9); };
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

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
  if (filled(box) && auto) return { ok: false, reason: "busy" };          // tem algo digitado pela pessoa: não mexe
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

/* ================= lista de conversas ================= */
function rows() {
  const all = [...document.querySelectorAll("#pane-side [role='listitem'], #pane-side [role='row']")];
  return all.filter(r => r.querySelector("span[title]") && !all.some(o => o !== r && o.contains(r)));
}
function rowInfo(r) {
  const ts = [...r.querySelectorAll("span[title]")].filter(e => !e.closest(".gb-ui"));
  const name = (ts[0] && ts[0].getAttribute("title") || "").trim();
  const preview = ts.length > 1 ? (ts[ts.length - 1].getAttribute("title") || "").trim() : "";
  const unread = [...r.querySelectorAll("[aria-label]")].some(e => /n[aã]o lida|unread/i.test(e.getAttribute("aria-label") || ""));
  return { r, name, preview, unread };
}
function clickEl(el) {
  const o = { bubbles: true, cancelable: true, view: window };
  ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(t =>
    el.dispatchEvent(t.startsWith("pointer") ? new PointerEvent(t, o) : new MouseEvent(t, o)));
}
async function openRow(name) {
  const x = rows().map(rowInfo).find(i => i.name === name);
  if (!x) return false;
  clickEl(x.r.querySelector("[tabindex]") || x.r);
  for (let i = 0; i < 25; i++) { await wait(150); if (headerTitle() === name && composeBox()) return true; }
  return headerTitle() === name;
}
const isGroup = () => !!document.querySelector("#main [data-id*='@g.us']");
function lastIncoming() {
  const all = [...document.querySelectorAll("#main .message-in, #main .message-out")];
  const m = all[all.length - 1];
  if (!m || !m.classList.contains("message-in")) return null;
  const t = m.querySelector("span.selectable-text") || m.querySelector("[data-pre-plain-text]") || m;
  return (t.innerText || "").trim();
}

/* ================= quem está usando o computador ================= */
let lastUser = 0, working = false, audio = null;
["keydown", "mousedown", "wheel"].forEach(ev => document.addEventListener(ev, e => {
  if (!e.isTrusted) return;
  lastUser = Date.now();
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  else if (audio.state === "suspended") audio.resume();
}, true));
const busy = () => Date.now() - lastUser < 6000 || (composeBox() && filled(composeBox()));
function beep() {
  if (!audio || audio.state !== "running") return;
  [[0, 988], [0.2, 1319], [0.4, 988], [0.6, 1319]].forEach(([t, f]) => {
    const o = audio.createOscillator(), g = audio.createGain(); o.type = "triangle"; o.frequency.value = f; o.connect(g); g.connect(audio.destination);
    const s = audio.currentTime + t; g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.4, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18); o.start(s); o.stop(s + 0.2);
  });
}

/* ================= configurações (vem do painel) ================= */
let CFG = null, BOT_ON = false, STATE = {};
async function loadCfg(force) {
  try { const c = await chrome.runtime.sendMessage({ gb: "cfg", force: !!force }); if (c) CFG = c; } catch {}
}
chrome.storage.local.get(["gb_bot_on", "gb_bot_state"], v => { BOT_ON = !!v.gb_bot_on; STATE = v.gb_bot_state || {}; });
chrome.storage.onChanged.addListener(ch => {
  if (ch.gb_bot_on) { BOT_ON = !!ch.gb_bot_on.newValue; paint(); }
});
let saveT = null;
const saveState = () => { clearTimeout(saveT); saveT = setTimeout(() => chrome.storage.local.set({ gb_bot_state: STATE }), 300); };
loadCfg(); setInterval(loadCfg, 60000);

const BOT_DEFAULT = {
  enabled: false,
  greet_open: "Olá, {nome}! 👋 Bem-vindo ao *{loja}* 🍻\nComo posso te ajudar?",
  greet_closed: "Olá, {nome}! 👋 No momento o *{loja}* está fechado. 😴\n{horario}\n\nMas você já pode olhar o cardápio:\n{link}",
  menu: [
    { key: "1", label: "Ver o cardápio e fazer pedido", reply: "É só tocar no link, escolher e finalizar por lá 👇\n{link}" },
    { key: "2", label: "Horário e endereço", reply: "🕐 {horario}\n📍 {endereco}" },
    { key: "3", label: "Falar com um atendente", reply: "Certo! Já vou chamar um atendente pra falar com você. 🙋 Só um instante.", human: true }
  ],
  menu_footer: "Responda com o *número* da opção.",
  keywords: [
    { words: "cardapio, cardápio, menu, preço, precos, preços", reply: "Nosso cardápio com todos os preços 👇\n{link}" },
    { words: "pix", reply: "Aceitamos Pix sim! 😉 O pagamento é feito na entrega ou na retirada." },
    { words: "atendente, humano, pessoa, falar com alguem, falar com alguém", reply: "Certo! Já vou chamar um atendente. 🙋", human: true }
  ],
  cooldown_hours: 6,
  pause_hours: 2,
  save_contacts: true
};
const bot = () => Object.assign({}, BOT_DEFAULT, (CFG && CFG.bot) || {});

const DAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"], DAYN = { dom: "Domingo", seg: "Segunda", ter: "Terça", qua: "Quarta", qui: "Quinta", sex: "Sexta", sab: "Sábado" };
function openInfo() {
  const S = CFG || {};
  if (S.is_open === false) return { open: false, text: "Estamos fechados no momento." };
  const h = S.opening_hours || {}, now = new Date(), mins = now.getHours() * 60 + now.getMinutes(), toM = t => { const [a, b] = (t || "0:0").split(":"); return +a * 60 + +b; };
  const today = h[DAYS[now.getDay()]], yest = h[DAYS[(now.getDay() + 6) % 7]];
  if (yest && !yest.closed && toM(yest.close) < toM(yest.open) && mins < toM(yest.close)) return { open: true, text: "Aberto até " + yest.close };
  if (today && !today.closed) {
    const o = toM(today.open), c = toM(today.close);
    if (c > o ? (mins >= o && mins < c) : (mins >= o)) return { open: true, text: "Hoje: aberto até " + (c < o ? "amanhã às " : "") + today.close };
    if (mins < o) return { open: false, text: "Hoje abrimos às " + today.open + "." };
  }
  if (!Object.keys(h).length) return { open: true, text: "" };
  return { open: false, text: "Estamos fechados no momento." };
}
function hoursText() {
  const h = (CFG && CFG.opening_hours) || {};
  const order = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
  const lines = order.filter(k => h[k]).map(k => `${DAYN[k]}: ${h[k].closed ? "fechado" : h[k].open + " às " + h[k].close}`);
  return lines.length ? lines.join("\n") : "";
}
function fill(tpl, name) {
  const S = CFG || {}, first = /^[\d\s()+\-]+$/.test(name || "") ? "" : String(name || "").trim().split(/\s+/)[0];
  const oi = openInfo();
  let s = String(tpl || "");
  if (!first) s = s.replace(/,?\s*\{nome\}/g, "");
  return s
    .replace(/\{nome\}/g, first)
    .replace(/\{loja\}/g, S.name || "nossa loja")
    .replace(/\{link\}/g, "https://geladao-brothers.vercel.app/")
    .replace(/\{endereco\}/g, S.address || "")
    .replace(/\{horario\}/g, [oi.text, hoursText()].filter(Boolean).join("\n"))
    .replace(/Olá, !/g, "Olá!").replace(/ +\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function menuText(b) {
  const items = (b.menu || []).filter(i => i.label);
  if (!items.length) return "";
  return items.map(i => `*${i.key}* - ${i.label}`).join("\n") + (b.menu_footer ? "\n\n" + b.menu_footer : "");
}

/* ================= o que responder ================= */
function decide(text, st, name) {
  const b = bot(), t = norm(text).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(), now = Date.now();
  if (!t) return null;
  const opt = (b.menu || []).find(i => i.key && (t === norm(i.key) || t.startsWith(norm(i.key) + " ") || t === norm(i.label).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()));
  if (opt) return { msgs: [fill(opt.reply, name)], human: !!opt.human };
  for (const k of b.keywords || []) {
    const ws = String(k.words || "").split(",").map(w => norm(w).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
    if (ws.some(w => (" " + t + " ").includes(" " + w + " ") || (w.length >= 5 && t.includes(w)))) return { msgs: [fill(k.reply, name)], human: !!k.human };
  }
  const cool = (+b.cooldown_hours || 6) * 3600e3;
  if (!st.greetedAt || now - st.greetedAt > cool) {
    const oi = openInfo();
    const greet = fill(oi.open ? b.greet_open : b.greet_closed, name);
    const menu = menuText(b);
    return { msgs: [greet + (menu ? "\n\n" + menu : "")], greet: true };
  }
  return null;     // já cumprimentou e a mensagem não é uma opção: deixa pra pessoa responder
}

/* ================= laço do robô ================= */
let recent = [], seenOpen = {};      // limite: no máximo 15 respostas a cada 10 minutos
const st = name => (STATE[name] = STATE[name] || { mode: "bot" });
function modeOf(name) {
  const s = STATE[name]; if (!s) return null;
  if (s.mode === "paused" && s.until && Date.now() > s.until) { s.mode = "bot"; delete s.until; saveState(); }
  return s.mode;
}
async function botTick() {
  paint();
  if (!BOT_ON || !bot().enabled || working || jobs.length || busy()) return;
  recent = recent.filter(t => Date.now() - t < 600e3);
  if (recent.length >= 15) return;
  // conversa que já está aberta (mensagem nova não fica "não lida")
  const cur = headerTitle();
  if (cur && composeBox()) {
    const s = st(cur), mode = modeOf(cur), txt = lastIncoming();
    if (isGroup()) { if (!s.group) { s.group = true; saveState(); } }
    else if (!(cur in seenOpen)) { seenOpen[cur] = txt; }                   // primeira vez que vejo: não responde mensagem antiga
    else if (txt && txt !== seenOpen[cur] && txt !== s.lastIn && mode === "bot") {
      seenOpen[cur] = txt;
      const d = decide(txt, s, cur);
      s.lastIn = txt; s.lastSeen = txt; s.lastSeenAt = Date.now(); saveState();
      if (d) { await reply(cur, d); return; }
    } else if (txt !== seenOpen[cur]) seenOpen[cur] = txt;
  }
  for (const x of rows().map(rowInfo)) {
    if (!x.unread || !x.name || x.name === cur) continue;
    const s = st(x.name), mode = modeOf(x.name);
    if (s.group) continue;
    if (mode === "paused") continue;
    if (mode === "wait") { if (!s.alertAt || Date.now() - s.alertAt > 60e3) { s.alertAt = Date.now(); saveState(); beep(); } continue; }
    if (s.lastSeen === x.preview && s.lastSeenAt && Date.now() - s.lastSeenAt < 3600e3) continue;
    const d = decide(x.preview, s, x.name);
    s.lastSeen = x.preview; s.lastSeenAt = Date.now(); saveState();
    if (!d) continue;
    await reply(x.name, d);
    return;      // uma conversa por vez
  }
}
async function reply(name, d) {
  working = true;
  const prev = headerTitle();
  try {
    if (!(await openRow(name))) return;
    await wait(500);
    if (isGroup()) { st(name).group = true; saveState(); return; }
    const txt = lastIncoming();
    if (txt === null) return;                       // a última mensagem já é nossa
    const s = st(name); s.lastIn = txt; seenOpen[name] = txt;
    if (txt && norm(txt) !== norm(s.lastSeen)) { const d2 = decide(txt, s, name); if (d2) d = d2; }
    await wait(1200 + Math.random() * 2300);        // espera um pouquinho, igual gente
    if (busy() && headerTitle() !== name) return;
    for (const m of d.msgs) { const r = await send(m, true, { title: name }); if (!r.ok) return; await wait(700); }
    recent.push(Date.now());
    if (d.greet) s.greetedAt = Date.now();
    if (d.human) { s.mode = "wait"; s.alertAt = Date.now(); beep(); tell({ gb: "bot-help", name }); }
    s.lastBotAt = Date.now(); saveState();
    if (bot().save_contacts) { const ph = chatPhone(name); if (ph) tell({ gb: "bot-contact", name, phone: ph }); }
  } finally {
    if (prev && prev !== name && !busy()) await openRow(prev);
    working = false; paint();
  }
}
setInterval(() => { botTick().catch(() => { working = false; }); }, 2500);

// a pessoa respondeu na mão → pausa o robô nessa conversa
function humanSent() {
  const name = headerTitle(); if (!name || working) return;
  const s = st(name); s.mode = "paused"; s.until = Date.now() + (+bot().pause_hours || 2) * 3600e3; saveState(); paint();
}
document.addEventListener("keydown", e => {
  if (!e.isTrusted || e.key !== "Enter" || e.shiftKey) return;
  if (e.target && e.target.closest && e.target.closest("#main footer")) humanSent();
}, true);
document.addEventListener("click", e => {
  if (!e.isTrusted) return;
  const b = sendButton(); if (b && (b === e.target || b.contains(e.target))) humanSent();
}, true);

/* ================= cores nas conversas + botão AJUDA ================= */
const css = document.createElement("style");
css.textContent = `.gb-ui{font:600 11px system-ui,sans-serif}
.gb-dot{position:absolute;right:6px;top:6px;z-index:5;display:flex;gap:4px;align-items:center;pointer-events:auto}
.gb-dot i{width:10px;height:10px;border-radius:50%;display:inline-block;box-shadow:0 0 0 2px rgba(0,0,0,.25)}
.gb-help{background:#FF8A00;color:#111;border:0;border-radius:6px;padding:2px 7px;cursor:pointer;font:800 11px system-ui,sans-serif}
.gb-hd{margin-left:8px;border:1px solid #FFC400;background:transparent;color:#FFC400;border-radius:14px;padding:4px 10px;cursor:pointer;font:700 12px system-ui,sans-serif;white-space:nowrap}
.gb-hd.on{background:#FFC400;color:#111}`;
document.documentElement.appendChild(css);
const COLOR = { bot: "#25D366", wait: "#FF8A00", paused: "#3B82F6" };
const LABEL = { bot: "Robô respondendo", wait: "Cliente pediu atendente", paused: "Robô pausado" };
function paint() {
  const on = BOT_ON && bot().enabled;
  for (const x of rows().map(rowInfo)) {
    let el = x.r.querySelector(":scope > .gb-dot");
    const mode = on && STATE[x.name] && !STATE[x.name].group ? modeOf(x.name) : null;
    if (!mode) { if (el) el.remove(); continue; }
    if (getComputedStyle(x.r).position === "static") x.r.style.position = "relative";
    if (!el) { el = document.createElement("div"); el.className = "gb-dot gb-ui"; x.r.appendChild(el); }
    const key = mode + "|" + x.name;
    if (el.dataset.k === key) continue;
    el.dataset.k = key;
    el.innerHTML = (mode === "wait" ? `<button class="gb-help">AJUDA</button>` : "") + `<i title="${LABEL[mode]}" style="background:${COLOR[mode]}"></i>`;
    const hb = el.querySelector(".gb-help");
    if (hb) hb.addEventListener("click", ev => { ev.stopPropagation(); ev.preventDefault(); const s = st(x.name); s.mode = "paused"; s.until = Date.now() + (+bot().pause_hours || 2) * 3600e3; saveState(); paint(); openRow(x.name); }, true);
  }
  // botão no topo da conversa aberta
  const header = document.querySelector("#main header");
  if (!header) return;
  let hb = header.querySelector(".gb-hd");
  const name = headerTitle();
  if (!on || !name || (STATE[name] && STATE[name].group)) { if (hb) hb.remove(); return; }
  if (!hb) { hb = document.createElement("button"); hb.className = "gb-hd gb-ui"; header.appendChild(hb); hb.addEventListener("click", ev => {
    ev.stopPropagation(); const n = headerTitle(), s = st(n), m = modeOf(n);
    if (m === "paused" || m === "wait") { s.mode = "bot"; delete s.until; } else { s.mode = "paused"; s.until = Date.now() + 24 * 3600e3; }
    saveState(); hb.dataset.k = ""; paint();
  }, true); }
  const m = modeOf(name) || "bot", key = m + "|" + name;
  if (hb.dataset.k !== key) { hb.dataset.k = key; hb.className = "gb-hd gb-ui" + (m === "bot" ? "" : " on"); hb.textContent = m === "bot" ? "🤖 Pausar robô" : "▶ Ligar robô aqui"; }
}

/* ================= abrir conversa pelo número (avisos de pedido) ================= */
const jobs = [];
async function openByPhone(phone) {
  const d = digits(phone), local = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
  if (same9(chatPhone(headerTitle()), d) || same9(headerTitle(), d)) return true;
  const box = document.querySelector("#side [contenteditable='true']");
  if (!box) return false;
  box.focus(); document.execCommand("selectAll", false); document.execCommand("insertText", false, local);
  let ok = false;
  for (let i = 0; i < 16 && !ok; i++) {
    await wait(250);
    const found = rows().map(rowInfo).filter(x => x.name);
    if (!found.length) continue;
    const exact = found.find(x => same9(x.name, d));
    const pick = exact || (found.length === 1 ? found[0] : null);
    if (!pick) continue;
    clickEl(pick.r.querySelector("[tabindex]") || pick.r);
    for (let k = 0; k < 20; k++) { await wait(150); if (composeBox() && headerTitle()) break; }
    ok = same9(chatPhone(headerTitle()), d) || same9(headerTitle(), d) || (!!exact || found.length === 1);
  }
  // limpa a busca
  box.focus(); document.execCommand("selectAll", false); document.execCommand("delete", false);
  return ok && !!composeBox();
}
async function runJob(j) {
  for (let i = 0; i < 40 && (working || busy()); i++) await wait(1500);     // espera a pessoa parar de digitar (até 1 min)
  working = true;
  const prev = headerTitle();
  try {
    if (!(await openByPhone(j.phone))) {
      // não achou pela busca: abre pelo link do WhatsApp (a página recarrega e o envio continua sozinho)
      await chrome.storage.local.set({ gb_job: { ...j, ts: Date.now() } });
      location.href = "https://web.whatsapp.com/send?phone=" + (digits(j.phone).length <= 11 ? "55" : "") + digits(j.phone);
      return { ok: true, pending: true };
    }
    await wait(600);
    const r = await send(j.text, true, {});
    const s = st(headerTitle()); s.mode = s.mode === "wait" ? "wait" : s.mode; saveState();
    return r;
  } finally {
    if (prev && headerTitle() !== prev) await openRow(prev);
    working = false;
  }
}
async function pumpJobs() {
  if (!jobs.length || pumpJobs.on) return;
  pumpJobs.on = true;
  while (jobs.length) { const j = jobs.shift(); let r; try { r = await runJob(j); } catch { r = { ok: false, reason: "erro" }; } if (r && !r.pending) tell({ gb: "job-done", id: j.id, ok: !!r.ok && r.sent !== false, reason: r.reason }); }
  pumpJobs.on = false;
}
// envio que ficou pendente depois de recarregar a página
(async () => {
  const { gb_job } = await chrome.storage.local.get("gb_job");
  if (!gb_job || Date.now() - gb_job.ts > 120e3) { if (gb_job) chrome.storage.local.remove("gb_job"); return; }
  await chrome.storage.local.remove("gb_job");
  for (let i = 0; i < 80 && !composeBox(); i++) await wait(500);
  await wait(1500);
  const r = composeBox() ? await send(gb_job.text, true, {}) : { ok: false, reason: "box" };
  tell({ gb: "job-done", id: gb_job.id, ok: !!r.ok && r.sent !== false, reason: r.reason });
})();

chrome.runtime.onMessage.addListener((m, _s, replyFn) => {
  if (m && m.gb === "chat") { replyFn(chatInfo()); return false; }
  if (m && m.gb === "send") { send(m.text, m.auto, m.expect).then(replyFn); return true; }
  if (m && m.gb === "sendto") { jobs.push({ id: m.id, phone: m.phone, text: m.text }); pumpJobs(); replyFn({ ok: true, queued: true }); return false; }
  if (m && m.gb === "bot-reload") { loadCfg(true); replyFn({ ok: true }); return false; }
  return false;
});
