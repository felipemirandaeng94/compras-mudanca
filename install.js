// Convite para instalar o app assim que o site abre.
// Android/Chrome: usa o prompt nativo (beforeinstallprompt).
// iPhone/iPad: mostra como adicionar à Tela de Início (o Safari não tem prompt nativo).
// Não aparece quando o app já está aberto instalado. "Agora não" adia por 3 dias.

const CHAVE = "instalar-adiado-ate";
const ADIAR_MS = 3 * 24 * 60 * 60 * 1000;
const ATRASO_MS = 1800; // deixa a abertura do app terminar antes

const instalado = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  navigator.standalone === true;

const ehIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function adiado() {
  try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch { return false; }
}
function adiar() {
  try { localStorage.setItem(CHAVE, String(Date.now() + ADIAR_MS)); } catch { /* sem storage */ }
}
function limpar() {
  try { localStorage.removeItem(CHAVE); } catch { /* sem storage */ }
}

const CSS = `
.inst{position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:60;
  max-width:456px;margin:0 auto;background:var(--card);color:var(--text);border:1px solid var(--ln);
  border-radius:18px;box-shadow:var(--shadow);padding:14px;display:flex;gap:12px;align-items:flex-start;
  transform:translateY(16px);opacity:0;transition:transform .25s ease,opacity .25s ease}
.inst.on{transform:none;opacity:1}
.inst img{width:52px;height:52px;border-radius:13px;flex-shrink:0}
.inst .tx{flex:1;min-width:0}
.inst b{display:block;font-size:15px;margin-bottom:2px}
.inst p{margin:0;font-size:12.5px;line-height:1.45;color:var(--mut)}
.inst p strong{color:var(--text);font-weight:600}
.inst .bt{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
.inst button{font:inherit;font-size:13px;font-weight:700;border-radius:10px;padding:9px 14px;min-height:40px;border:0;cursor:pointer}
.inst .no{background:transparent;color:var(--mut)}
.inst .ok{background:var(--br);color:var(--on-br)}
.inst .ios{display:inline-block;vertical-align:-3px;width:16px;height:16px}
`;

const ICONE_COMPARTILHAR =
  '<svg class="ios" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

let cartao = null;

function montar({ titulo, texto, textoHtml, botaoOk, aoOk }) {
  if (cartao) return;
  if (!document.getElementById("inst-css")) {
    const st = document.createElement("style");
    st.id = "inst-css";
    st.textContent = CSS;
    document.head.append(st);
  }
  cartao = document.createElement("div");
  cartao.className = "inst";
  cartao.setAttribute("role", "dialog");
  cartao.setAttribute("aria-label", titulo);

  const img = document.createElement("img");
  img.src = "icons/icon-192.png";
  img.alt = "";

  const tx = document.createElement("div");
  tx.className = "tx";
  const b = document.createElement("b");
  b.textContent = titulo;
  const p = document.createElement("p");
  if (textoHtml) p.innerHTML = textoHtml; // conteúdo fixo deste arquivo, sem dado do usuário
  else p.textContent = texto;

  const bt = document.createElement("div");
  bt.className = "bt";
  const no = document.createElement("button");
  no.type = "button";
  no.className = "no";
  no.textContent = "Agora não";
  no.onclick = () => { adiar(); fechar(); };
  bt.append(no);
  if (botaoOk) {
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "ok";
    ok.textContent = botaoOk;
    ok.onclick = aoOk;
    bt.append(ok);
  }

  tx.append(b, p, bt);
  cartao.append(img, tx);
  document.body.append(cartao);
  requestAnimationFrame(() => requestAnimationFrame(() => cartao && cartao.classList.add("on")));
}

function fechar() {
  if (!cartao) return;
  const c = cartao;
  cartao = null;
  c.classList.remove("on");
  setTimeout(() => c.remove(), 260);
}

function iniciar() {
  if (instalado()) return;

  // Android / Chrome / Edge: prompt nativo
  let evento = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    evento = e;
    if (adiado()) return;
    setTimeout(() => {
      if (!evento || instalado()) return;
      montar({
        titulo: "Instalar o app",
        texto: "Abra direto da tela inicial, em tela cheia, e compartilhe produtos das lojas para cá.",
        botaoOk: "Instalar",
        aoOk: async () => {
          const ev = evento;
          evento = null;
          fechar();
          if (!ev) return;
          ev.prompt();
          try {
            const r = await ev.userChoice;
            if (r && r.outcome === "dismissed") adiar();
          } catch { /* ignorado */ }
        },
      });
    }, ATRASO_MS);
  });

  window.addEventListener("appinstalled", () => { evento = null; limpar(); fechar(); });

  // iPhone / iPad: instruções
  if (ehIOS() && !adiado()) {
    setTimeout(() => {
      if (instalado()) return;
      montar({
        titulo: "Instale o app no iPhone",
        textoHtml: `Toque em <strong>Compartilhar</strong> ${ICONE_COMPARTILHAR} e depois em <strong>Adicionar à Tela de Início</strong>.`,
        botaoOk: "Entendi",
        aoOk: () => { adiar(); fechar(); },
      });
    }, ATRASO_MS);
  }
}

iniciar();
