// Utilitários: formatação, DOM seguro, máscara de moeda, URLs.
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0, minimumFractionDigits: 0 });
const NUM2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const brl = (v) => BRL.format(Number(v) || 0);
export const brl0 = (v) => BRL0.format(Math.round(Number(v) || 0));
export const num2 = (v) => NUM2.format(Number(v) || 0);

export const totalItem = (i) => (Number(i.preco) || 0) * (Number(i.quantidade) || 1);

// Cria elementos sem innerHTML: texto sempre via textContent/nó de texto.
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k === "style" && typeof v === "object") { for (const [p, x] of Object.entries(v)) { if (p.startsWith("--")) e.style.setProperty(p, x); else e.style[p] = x; } }
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  add(e, kids);
  return e;
}
function add(e, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(e, k);
    else e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

const NS = "http://www.w3.org/2000/svg";
export function icon(name, cls = "") {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("class", "ico " + cls);
  s.setAttribute("aria-hidden", "true");
  const u = document.createElementNS(NS, "use");
  u.setAttribute("href", "#i-" + name);
  s.append(u);
  return s;
}

export function safeUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return x.protocol === "http:" || x.protocol === "https:" ? x.href : null;
  } catch { return null; }
}

export function firstUrl(...texts) {
  for (const t of texts) {
    if (!t) continue;
    const m = String(t).match(/https?:\/\/[^\s<>"']+/i);
    if (m) {
      const u = safeUrl(m[0].replace(/[).,;!?]+$/, ""));
      if (u) return u;
    }
  }
  return null;
}

export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));

// Máscara de moeda BR: digita só números, vira centavos.
export function attachMoney(input, onChange) {
  input.addEventListener("input", () => {
    const d = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 11);
    input.value = d ? BRL.format(parseInt(d, 10) / 100) : "";
    try { input.setSelectionRange(input.value.length, input.value.length); } catch {}
    onChange && onChange();
  });
}
export function getMoney(input) {
  const d = input.value.replace(/\D/g, "");
  return d ? parseInt(d, 10) / 100 : null;
}
export function setMoney(input, v) { input.value = v == null || v === "" ? "" : BRL.format(Number(v)); }

export function lojaDoLink(u) {
  try { return new URL(u).hostname.replace(/^www\./, "").split(".")[0].replace(/^./, (c) => c.toUpperCase()); } catch { return ""; }
}

export function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

// Comprime imagem no navegador: JPEG, lado maior 1200 px, qualidade 0,8.
export async function comprimir(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch {
    bmp = await new Promise((ok, no) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => ok(img); img.onerror = no; img.src = url;
    });
  }
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
  const k = Math.min(1, 1200 / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("canvas"))), "image/jpeg", 0.8));
}
