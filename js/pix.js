// Pix "copia e cola" (BR Code) com valor, no padrão do Banco Central
(function () {
  const tlv = (id, v) => id + String(v.length).padStart(2, "0") + v;
  const clean = (s, max) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().toUpperCase().slice(0, max);
  function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }
  function normKey(key, type) {
    const k = String(key || "").trim(), d = k.replace(/\D/g, "");
    if (type === "telefone") return "+" + (/^55\d{10,11}$/.test(d) ? d : "55" + d);
    if (type === "cpf" || type === "cnpj") return d;
    if (type === "email") return k.toLowerCase();
    return k;
  }
  function payload({ key, type, name, city, amount, txid, info }) {
    if (!key) return "";
    const acc = tlv("00", "br.gov.bcb.pix") + tlv("01", normKey(key, type)) + (info ? tlv("02", clean(info, 40)) : "");
    let p = tlv("00", "01") + tlv("26", acc) + tlv("52", "0000") + tlv("53", "986");
    if (amount && +amount > 0) p += tlv("54", (+amount).toFixed(2));
    p += tlv("58", "BR") + tlv("59", clean(name, 25) || "LOJA") + tlv("60", clean(city, 15) || "BRASIL");
    p += tlv("62", tlv("05", String(txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***"));
    p += "6304";
    return p + crc16(p);
  }
  function qrSvg(text, size) {
    if (!window.qrcode || !text) return "";
    const qr = qrcode(0, "M"); qr.addData(text); qr.make();
    const cell = Math.max(2, Math.floor((size || 220) / (qr.getModuleCount() + 8)));
    return qr.createSvgTag({ cellSize: cell, margin: cell * 4, scalable: true });
  }
  window.GBPix = { payload, qrSvg, crc16 };
})();
