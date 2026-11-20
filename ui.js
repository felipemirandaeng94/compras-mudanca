// Toast com "Desfazer" e diálogo de confirmação.
import { h, icon } from "./util.js";

let tState = null;
export function toast(msg, acao, onAcao, { onExpire, ms = 5000 } = {}) {
  const wrap = document.getElementById("toast");
  fecharToast(true);
  const el = h("div", { class: "toast", role: "status" }, h("span", { text: msg }));
  const st = { el, onExpire, feito: false, timer: null };
  if (acao) el.append(h("button", { type: "button", text: acao, onclick: () => { st.feito = true; fecharToast(false); onAcao && onAcao(); } }));
  wrap.replaceChildren(el);
  st.timer = setTimeout(() => fecharToast(true), ms);
  tState = st;
}
export function fecharToast(expirou) {
  const st = tState;
  if (!st) return;
  tState = null;
  clearTimeout(st.timer);
  st.el.remove();
  if (expirou && !st.feito && st.onExpire) st.onExpire();
}

export function confirmar({ titulo, texto, ok = "Excluir" }) {
  return new Promise((resolve) => {
    const layer = document.getElementById("layer");
    const prev = document.activeElement;
    const fim = (v) => { box.remove(); scrim.remove(); document.removeEventListener("keydown", esc, true); prev && prev.focus && prev.focus(); resolve(v); };
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); fim(false); } };
    const scrim = h("div", { class: "scrim", style: { zIndex: 1 }, onclick: () => fim(false) });
    const cancel = h("button", { type: "button", class: "cancel", text: "Cancelar", onclick: () => fim(false) });
    const box = h("div", { class: "dialog", role: "alertdialog", "aria-modal": "true", "aria-label": titulo, style: { zIndex: 2 } },
      h("h4", { text: titulo }), h("p", { text: texto }),
      h("div", { class: "acts2" }, cancel, h("button", { type: "button", class: "del", text: ok, onclick: () => fim(true) })));
    layer.append(scrim, box);
    document.addEventListener("keydown", esc, true);
    cancel.focus();
  });
}
export { icon };
