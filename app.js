// Compras da Mudança — app principal (sem build, ES modules).
import { criarDb, COMODOS_PADRAO } from "./db.js";
import { h, icon, brl, brl0, num2, totalItem, safeUrl, firstUrl, norm, cut, attachMoney, getMoney, setMoney, comprimir, lsGet, lsSet } from "./util.js";
import { toast, fecharToast, confirmar } from "./ui.js";

const VERSAO_APP = "1.0.0";
const REPO = "https://github.com/felipemirandaeng94/compras-mudanca";
const $ = (id) => document.getElementById(id);
const main = $("main");

const S = {
  items: [], config: { teto: null, alerta_pct: 80, comodos: [...COMODOS_PADRAO] },
  view: "lista", filter: "todos", query: "", searchOpen: false,
  editId: null, detailId: null, loading: true, erro: false, form: null, scroll: {},
};
let db = null;
const PRI = { alta: 0, media: 1, baixa: 2 };
const PRI_NOME = { alta: "Alta", media: "Média", baixa: "Baixa" };
const demo = new URLSearchParams(location.search).get("demo") === "1";

/* ------------------------------------------------------------------ tema */
function aplicarTema() {
  const t = lsGet("tema") || "auto";
  const r = document.documentElement;
  if (t === "claro") r.setAttribute("data-theme", "light");
  else if (t === "escuro") r.setAttribute("data-theme", "dark");
  else r.removeAttribute("data-theme");
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const dark = (m.getAttribute("media") || "").includes("dark");
    m.setAttribute("content", t === "claro" ? "#015968" : t === "escuro" ? "#0b1316" : dark ? "#0b1316" : "#015968");
  });
}

/* ------------------------------------------------------------------ dados derivados */
const totalGeral = () => S.items.reduce((s, i) => s + totalItem(i), 0);
const temTeto = () => S.config.teto != null && S.config.teto > 0;
function ordenados(lista) {
  return [...lista].sort((a, b) =>
    (a.status === "comprado") - (b.status === "comprado") ||
    (PRI[a.prioridade] ?? 1) - (PRI[b.prioridade] ?? 1) ||
    String(b.criado_em).localeCompare(String(a.criado_em)));
}
function comodosComItens() {
  const usados = new Set(S.items.map((i) => i.comodo).filter(Boolean));
  const lista = S.config.comodos.filter((c) => usados.has(c));
  for (const c of usados) if (!lista.includes(c)) lista.push(c);
  return lista;
}
function upsertLocal(row) {
  const i = S.items.findIndex((x) => x.id === row.id);
  if (i >= 0) S.items[i] = { ...S.items[i], ...row }; else S.items.unshift(row);
}
const removeLocal = (id) => { S.items = S.items.filter((x) => x.id !== id); };
const erroMsg = () => toast("Não deu certo. Confira a conexão e tente de novo.");

/* ------------------------------------------------------------------ navegação */
const ABAS = [["lista", "Lista", "list"], ["adicionar", "Adicionar", "plus"], ["resumo", "Resumo", "chart"], ["ajustes", "Ajustes", "sliders"]];
function montarNav() {
  $("nav").replaceChildren(...ABAS.map(([id, nome, ic]) =>
    h("button", { type: "button", dataset: { v: id }, onclick: () => { if (id === "adicionar") abrirForm(null); else ir(id); } },
      h("i", null, icon(ic)), nome)));
}
function marcarNav() {
  const ativa = S.view === "adicionar" && S.editId ? "lista" : S.view;
  $("nav").querySelectorAll("button").forEach((b) => {
    if (b.dataset.v === ativa) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
}
const views = {};
function ir(v) {
  fecharDetalhe(true);
  if (S.view === "lista") S.scroll.lista = main.scrollTop;
  if (S.view === "adicionar" && v !== "adicionar" && S.form) { S.form.dispose(false); S.form = null; }
  S.view = v; if (v !== "adicionar") S.editId = null;
  if (!views[v]) views[v] = { lista: construirLista, resumo: construirResumo, ajustes: construirAjustes }[v]();
  main.replaceChildren(views[v].root);
  main.scrollTop = v === "lista" ? S.scroll.lista || 0 : 0;
  marcarNav(); views[v].update();
}
function render() {
  const off = !navigator.onLine || S.erro;
  const b = $("offline");
  b.hidden = !off;
  if (off && !b.firstChild) b.replaceChildren(icon("wifioff", "sm"), h("span", { text: "Sem conexão. Os dados podem estar desatualizados." }));
  if (S.view === "adicionar") S.form && S.form.update(); else views[S.view] && views[S.view].update();
  if (S.detailId) atualizarDetalhe();
}

/* ------------------------------------------------------------------ cartão + deslizar */
function fotoOuIcone(src) {
  const ph = h("div", { class: "ph" });
  if (src) ph.append(h("img", { src, alt: "", loading: "lazy", decoding: "async", onerror: (e) => { e.target.replaceWith(icon("img")); } }));
  else ph.append(icon("img"));
  return ph;
}
function criarCard(it) {
  const comprado = it.status === "comprado";
  const link = safeUrl(it.link);
  const meta = [it.comodo, it.loja, it.quantidade > 1 ? `${it.quantidade} un.` : null].filter(Boolean).join(" · ");
  const nome = h("div", { class: "name" }, it.nome, comprado ? h("span", { class: "badge", text: "COMPRADO" }) : null);
  const card = h("div", { class: "card" + (comprado ? " bought" : ""), role: "button", tabindex: "0", "aria-label": `${it.nome}, ${brl(totalItem(it))}${comprado ? ", comprado" : ""}. Abrir detalhes` },
    fotoOuIcone(it.imagem_1),
    h("div", { class: "info" }, nome, h("div", { class: "meta", text: meta || "Sem cômodo" }), h("div", { class: "price", text: brl(totalItem(it)) })),
    link ? h("a", { class: "go", href: link, target: "_blank", rel: "noopener", "aria-label": `Abrir ${it.nome} na loja`, onclick: (e) => e.stopPropagation() }, icon("ext", "sm")) : null);
  // o nome é 1 linha com reticências: o selo vai dentro do mesmo bloco
  const wrap = h("div", { class: "swipe" },
    h("div", { class: "under l" }, icon("check", "sm"), comprado ? "Pendente" : "Comprado"),
    h("div", { class: "under r" }, "Excluir", icon("trash", "sm")),
    card);
  let sx = 0, sy = 0, dx = 0, drag = false, pid = null, bloqueia = false;
  const reset = () => { card.style.transform = ""; wrap.removeAttribute("data-dir"); };
  card.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || e.target.closest("a")) return;
    sx = e.clientX; sy = e.clientY; dx = 0; drag = false; pid = e.pointerId;
  });
  card.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!drag) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.2) { drag = true; try { card.setPointerCapture(pid); } catch {} card.style.transition = "none"; }
      else return;
    }
    dx = mx; card.style.transform = `translateX(${dx}px)`; wrap.dataset.dir = dx < 0 ? "left" : "right";
  });
  const fim = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (!drag) return;
    drag = false; bloqueia = true; setTimeout(() => (bloqueia = false), 50);
    card.style.transition = "";
    if (e.type === "pointerup" && Math.abs(dx) >= 80) {
      const esq = dx < 0;
      card.style.transform = `translateX(${esq ? "-" : ""}110%)`;
      setTimeout(() => { if (esq) { reset(); alternarStatus(it); } else excluirItem(it); }, 180);
    } else reset();
  };
  card.addEventListener("pointerup", fim);
  card.addEventListener("pointercancel", fim);
  const abrir = () => { if (!bloqueia) abrirDetalhe(it.id); };
  card.addEventListener("click", abrir);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } });
  return wrap;
}

/* ------------------------------------------------------------------ lista */
function construirLista() {
  const top = h("div", { class: "top" });
  const busca = h("input", { type: "search", placeholder: "Buscar por nome ou loja", "aria-label": "Buscar por nome ou loja", autocomplete: "off",
    oninput: (e) => { S.query = e.target.value; update(); } });
  const limpar = h("button", { type: "button", class: "iconbtn", "aria-label": "Limpar busca", style: { width: "36px", height: "36px" },
    onclick: () => { S.query = ""; busca.value = ""; S.searchOpen = false; update(); } }, icon("x", "sm"));
  const linhaBusca = h("div", { class: "searchrow", hidden: true }, h("div", { class: "input" }, icon("search", "sm"), busca, limpar));
  const seg = h("div", { class: "seg", role: "group", "aria-label": "Filtros" });
  const lista = h("div", { class: "list" });
  const root = h("div", null, top, linhaBusca, seg, lista);

  function pill(key, texto, n) {
    return h("button", { type: "button", class: "pill" + (S.filter === key ? " on" : ""), "aria-pressed": String(S.filter === key), onclick: () => { S.filter = key; update(); } },
      texto, n != null ? h("i", { text: String(n) }) : null);
  }
  function update() {
    linhaBusca.hidden = !S.searchOpen && !S.query;
    if (S.loading) {
      top.replaceChildren(h("div", { class: "sk", style: { width: "120px", height: "12px", marginTop: "12px" } }), h("div", { class: "sk", style: { width: "190px", height: "32px", marginTop: "14px" } }), h("div", { class: "sk", style: { height: "6px", marginTop: "14px" } }));
      seg.replaceChildren(); seg.style.visibility = "hidden";
      lista.replaceChildren(...[80, 70, 85, 75].map((w) => h("div", { class: "card" }, h("div", { class: "ph sk" }), h("div", { class: "info" }, h("div", { class: "sk sk-line", style: { width: w + "%" } }), h("div", { class: "sk sk-line", style: { width: "50%", marginTop: "8px", height: "10px" } }), h("div", { class: "sk sk-line", style: { width: "35%", marginTop: "8px" } })))));
      return;
    }
    seg.style.visibility = "";
    if (!S.items.length) {
      top.replaceChildren(); seg.replaceChildren(); linhaBusca.hidden = true;
      lista.replaceChildren(h("div", { class: "empty" },
        h("div", { class: "circ" }, icon("box", "lg")),
        h("h4", { text: "Nenhum item ainda" }),
        h("p", { text: "Cole o link de um produto ou compartilhe direto da loja, e o app preenche nome, foto e preço." }),
        h("button", { type: "button", class: "primary", style: { marginTop: "22px" }, text: "Adicionar primeiro item", onclick: () => abrirForm(null) })));
      return;
    }
    // topo
    const total = totalGeral();
    const partes = brl(total).replace(/^R\$\s?/, "");
    const info = h("div", { class: "tinfo" });
    const barra = h("div", { class: "tbar", role: "presentation" });
    if (temTeto()) {
      const pct = (total / S.config.teto) * 100;
      const est = pct > 100;
      barra.className = "tbar" + (est ? " estourou" : pct >= S.config.alerta_pct ? " alerta" : "");
      barra.append(h("span", { style: { width: Math.min(100, pct) + "%" } }));
      info.className = "tinfo" + (est ? " estourou" : "");
      info.append(h("span", { text: `${Math.round(pct)}% do teto de ${brl0(S.config.teto)}` }),
        est ? h("span", null, "passou ", h("b", { text: brl0(total - S.config.teto) }), " do teto") : h("span", null, "restam ", h("b", { text: brl0(S.config.teto - total) })));
    } else info.append(h("span", { text: "Sem teto definido" }));
    top.replaceChildren(
      h("div", { class: "topline" }, h("span", { text: "Compras da mudança" }),
        h("button", { type: "button", class: "iconbtn", "aria-label": "Buscar", onclick: () => { S.searchOpen = true; update(); busca.focus(); } }, h("span", { class: "in" }, icon("search", "sm")))),
      h("div", { class: "lbl", text: "Total geral" }),
      h("div", { class: "big" }, h("small", { text: "R$" }), " " + partes),
      S.config.teto && temTeto() ? barra : null, info);
    // filtros
    const pend = S.items.filter((i) => i.status !== "comprado").length;
    const cs = comodosComItens();
    if (S.filter.startsWith("c:") && !cs.includes(S.filter.slice(2))) S.filter = "todos";
    seg.replaceChildren(pill("todos", "Todos", S.items.length), pill("pendente", "Pendentes", pend), pill("comprado", "Comprados", S.items.length - pend), ...cs.map((c) => pill("c:" + c, c)));
    // itens
    const q = norm(S.query.trim());
    let vis = S.items.filter((i) => {
      if (S.filter === "pendente" && i.status === "comprado") return false;
      if (S.filter === "comprado" && i.status !== "comprado") return false;
      if (S.filter.startsWith("c:") && i.comodo !== S.filter.slice(2)) return false;
      if (q && !norm(i.nome).includes(q) && !norm(i.loja).includes(q)) return false;
      return true;
    });
    vis = ordenados(vis);
    lista.replaceChildren(...(vis.length ? vis.map(criarCard) : [h("div", { class: "nada", text: q ? "Nenhum item encontrado para essa busca." : "Nenhum item neste filtro." })]));
  }
  return { root, update };
}

/* ------------------------------------------------------------------ detalhe */
let detalheFoco = null;
function abrirDetalhe(id) { S.detailId = id; detalheFoco = document.activeElement; montarDetalhe(true); }
function fecharDetalhe(imediato) {
  const layer = $("layer");
  const sheet = layer.querySelector(".sheet"), scrim = layer.querySelector(".scrim.d");
  S.detailId = null;
  document.removeEventListener("keydown", escDetalhe);
  if (!sheet) return;
  const remover = () => { sheet.remove(); scrim && scrim.remove(); detalheFoco && detalheFoco.focus && detalheFoco.focus(); };
  if (imediato) remover(); else { sheet.classList.add("out"); setTimeout(remover, 200); }
}
const escDetalhe = (e) => { if (e.key === "Escape" && !document.querySelector(".dialog")) fecharDetalhe(); };
function atualizarDetalhe() { if (!S.items.find((i) => i.id === S.detailId)) fecharDetalhe(); else montarDetalhe(false); }
function montarDetalhe(anima) {
  const it = S.items.find((i) => i.id === S.detailId);
  if (!it) return;
  const layer = $("layer");
  const velho = layer.querySelector(".sheet");
  const scrimExiste = layer.querySelector(".scrim.d");
  const comprado = it.status === "comprado";
  const link = safeUrl(it.link);
  const fotos = [it.imagem_1, it.imagem_2].filter(Boolean);
  const galeria = h("div", { class: "gal", tabindex: "0", "aria-label": "Fotos do item" },
    ...(fotos.length ? fotos.map((f) => h("div", null, h("img", { src: f, alt: it.nome, loading: "lazy" }))) : [h("div", null, icon("img", "lg"))]));
  const sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": it.nome },
    h("div", { class: "grab" }),
    h("button", { type: "button", class: "x", "aria-label": "Fechar", onclick: () => fecharDetalhe() }, icon("x")),
    galeria,
    h("h3", { class: "dname", text: it.nome }),
    h("div", { class: "dprice" }, `${brl(it.preco)} × ${it.quantidade} = `, h("b", { text: brl(totalItem(it)) })),
    h("div", { class: "chips" },
      comprado ? h("span", { class: "chip" }, h("b", { text: "Comprado" })) : h("span", { class: "chip" }, "Pendente"),
      it.comodo ? h("span", { class: "chip" }, "Cômodo: ", h("b", { text: it.comodo })) : null,
      h("span", { class: "chip" }, "Prioridade: ", h("b", { text: PRI_NOME[it.prioridade] || "Média" })),
      it.loja ? h("span", { class: "chip" }, "Loja: ", h("b", { text: it.loja })) : null),
    h("div", { class: "actions" },
      link ? h("a", { class: "primary", href: link, target: "_blank", rel: "noopener" }, icon("ext", "sm"), "Abrir na loja") : null,
      h("button", { type: "button", class: "secondary", onclick: () => { fecharDetalhe(true); alternarStatus(it); } }, icon(comprado ? "undo" : "check", "sm"), comprado ? "Marcar como pendente" : "Marcar como comprado"),
      h("div", { class: "acts2" },
        h("button", { type: "button", class: "secondary", onclick: () => { fecharDetalhe(true); abrirForm(it.id); } }, icon("pencil", "sm"), "Editar"),
        h("button", { type: "button", class: "secondary danger", onclick: async () => { if (await confirmar({ titulo: "Excluir este item?", texto: `"${cut(it.nome, 60)}" sai da lista. Você pode desfazer por alguns segundos.` })) { fecharDetalhe(true); excluirItem(it); } } }, icon("trash", "sm"), "Excluir"))));
  if (!anima) sheet.style.animation = "none";
  const y = velho ? velho.scrollTop : 0;
  if (velho) velho.replaceWith(sheet); else layer.append(sheet);
  sheet.scrollTop = y;
  if (!scrimExiste) layer.insertBefore(h("div", { class: "scrim d", onclick: () => fecharDetalhe() }), sheet);
  if (anima) { document.addEventListener("keydown", escDetalhe); sheet.querySelector(".x").focus(); }
}

/* ------------------------------------------------------------------ ações */
const nomeCurto = (it) => cut(it.nome, 28);
async function alternarStatus(it) {
  const antigo = it.status, novo = antigo === "comprado" ? "pendente" : "comprado";
  const aplicar = async (st) => {
    upsertLocal({ ...S.items.find((x) => x.id === it.id), status: st }); render();
    try { await db.atualizar(it.id, { status: st }); } catch { upsertLocal({ id: it.id, status: antigo }); render(); erroMsg(); }
  };
  await aplicar(novo);
  toast(`${nomeCurto(it)} marcado como ${novo === "comprado" ? "comprado" : "pendente"}`, "Desfazer", () => aplicar(antigo));
}
async function excluirItem(it) {
  const copia = { ...S.items.find((x) => x.id === it.id) || it };
  removeLocal(it.id); render();
  const p = db.excluir(it.id).catch(() => { upsertLocal(copia); render(); erroMsg(); return "erro"; });
  toast("Item excluído", "Desfazer", async () => {
    if ((await p) === "erro") return;
    upsertLocal(copia); render();
    try { await db.inserir(copia); } catch { removeLocal(copia.id); render(); erroMsg(); }
  }, { onExpire: async () => { if ((await p) !== "erro") db.removerFotos([copia.imagem_1, copia.imagem_2].filter(Boolean)); } });
}
async function salvarConfig(patch, msg) {
  const antes = { ...S.config };
  S.config = { ...S.config, ...patch }; render();
  try { S.config = { ...S.config, ...(await db.salvarConfig(patch)) }; render(); if (msg) toast(msg); }
  catch { S.config = antes; render(); erroMsg(); }
}

/* ------------------------------------------------------------------ formulário */
const AVISO = {
  url_invalida: "Esse link não parece válido. Confira e tente de novo.",
  bloqueado: "Essa loja não deixou ler a página. Preencha à mão.",
  falha_acesso: "Não consegui abrir essa página agora. Preencha à mão ou cole o link de novo.",
  sem_dados: "Não encontrei nome nem preço nessa página. Preencha à mão.",
  rede: "Não foi possível ler o link agora. Preencha à mão.",
};
function normalizaLink(txt) {
  const t = String(txt || "").trim();
  if (!t) return null;
  const u = firstUrl(t);
  if (u) return u;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?$/.test(t)) return safeUrl("https://" + t);
  return null;
}
const linkLegivel = (u) => { try { const x = new URL(u); return /\.[a-z]{2,}$/i.test(x.hostname); } catch { return false; } };

function abrirForm(id, pre) {
  if (S.form) S.form.dispose(false);
  fecharDetalhe(true);
  if (S.view === "lista") S.scroll.lista = main.scrollTop;
  S.view = "adicionar"; S.editId = id || null;
  S.form = construirForm(id ? S.items.find((i) => i.id === id) : null, pre);
  main.replaceChildren(S.form.root); main.scrollTop = 0;
  marcarNav(); S.form.update();
  if (pre && pre.link) S.form.setLink(pre.link);
}

function construirForm(item, pre) {
  const editando = !!item;
  const auto = {};
  const novas = new Set();      // fotos enviadas nesta sessão (para limpar se descartar)
  let imgs = [item ? item.imagem_1 : null, item ? item.imagem_2 : null];
  let enviando = [false, false];
  let seq = 0, deb = null, ultimo = item && item.link ? item.link : null;
  let qtd = item ? item.quantidade : 1, pri = item ? item.prioridade : "media", salvando = false;

  const iLink = h("input", { type: "text", inputmode: "url", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: "Cole o link do produto", id: "f-link", value: item && item.link || "" });
  const stLink = h("span", { style: { display: "flex" } });
  const avisoLink = h("div");
  const iNome = h("input", { type: "text", id: "f-nome", maxlength: "200", autocomplete: "off", placeholder: "Ex.: Geladeira Frost Free", value: item ? item.nome : (pre && pre.nome) || "" });
  const iLoja = h("input", { type: "text", id: "f-loja", maxlength: "80", autocomplete: "off", placeholder: "Ex.: Magalu", value: item && item.loja || "" });
  const iPreco = h("input", { type: "text", id: "f-preco", inputmode: "numeric", autocomplete: "off", placeholder: "R$ 0,00" });
  if (item) setMoney(iPreco, item.preco);
  const outQtd = h("output", { "aria-live": "polite", text: String(qtd) });
  const sel = h("select", { id: "f-comodo" });
  const opcoes = [...S.config.comodos]; if (item && item.comodo && !opcoes.includes(item.comodo)) opcoes.push(item.comodo);
  sel.append(h("option", { value: "", text: opcoes.length ? "Escolha o cômodo" : "Sem cômodo" }), ...opcoes.map((c) => h("option", { value: c, text: c })));
  if (item && item.comodo) sel.value = item.comodo;
  const aviso = h("div"), erroGeral = h("div");
  const wN = h("div", { class: "field" }, h("label", { for: "f-nome", text: "Nome" }), h("div", { class: "input" }, iNome), h("div"));
  const wL = h("div", { class: "field" }, h("label", { for: "f-loja", text: "Loja" }), h("div", { class: "input" }, iLoja));
  const wP = h("div", { class: "field" }, h("label", { for: "f-preco", text: "Preço (cada)" }), h("div", { class: "input" }, iPreco), h("div"));

  const setErr = (w, msg) => { w.classList.toggle("err", !!msg); const e = w.lastElementChild; if (e) { e.className = msg ? "errmsg" : ""; e.textContent = msg || ""; } };
  const marcarAuto = (k) => () => { auto[k] = false; };
  iNome.addEventListener("input", () => { marcarAuto("nome")(); setErr(wN, ""); });
  iLoja.addEventListener("input", marcarAuto("loja"));
  attachMoney(iPreco, () => { auto.preco = false; atualizaAviso(); });

  /* stepper */
  const mudaQtd = (d) => { qtd = Math.min(999, Math.max(1, qtd + d)); outQtd.textContent = String(qtd); atualizaAviso(); };

  /* prioridade */
  const priBtns = ["alta", "media", "baixa"].map((p) => h("button", { type: "button", "aria-pressed": String(pri === p), text: PRI_NOME[p], onclick: () => { pri = p; priBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(["alta", "media", "baixa"][i] === p))); } }));

  /* fotos */
  const fotosBox = h("div", { class: "photos" });
  function pintaFotos() {
    fotosBox.replaceChildren(...[0, 1].map((n) => {
      const slot = h("div", { class: "slot" });
      const inp = h("input", { type: "file", accept: "image/*", hidden: true, onchange: (e) => escolhe(n, e.target.files[0], e.target) });
      if (imgs[n]) {
        slot.append(h("img", { src: imgs[n], alt: `Foto ${n + 1}` }),
          h("button", { type: "button", class: "rm", "aria-label": `Remover foto ${n + 1}`, onclick: () => remove(n) }, h("span", null, icon("x"))));
      } else slot.append(h("button", { type: "button", class: "add", "aria-label": `Adicionar foto ${n + 1}`, onclick: () => inp.click() }, icon(n === 0 ? "camera" : "img")));
      slot.append(inp);
      if (enviando[n] || (carregandoFoto && n === 0 && !imgs[0])) slot.append(h("div", { class: "ld" }, h("span", { class: "spin" })));
      return slot;
    }));
  }
  let carregandoFoto = false;
  async function escolhe(n, file, inp) {
    if (!file) return;
    enviando[n] = true; auto.img = n === 0 ? false : auto.img; erroGeral.replaceChildren(); pintaFotos();
    try {
      const blob = await comprimir(file);
      const url = await db.uploadFoto(blob);
      novas.add(url); imgs[n] = url;
    } catch { erroGeral.replaceChildren(h("div", { class: "note" }, icon("alert", "sm"), "Não foi possível enviar a foto. Tente de novo.")); }
    enviando[n] = false; pintaFotos();
  }
  function remove(n) {
    const u = imgs[n]; imgs[n] = null; if (n === 0) auto.img = false;
    if (u && novas.has(u)) { novas.delete(u); db.removerFotos([u]); }
    pintaFotos();
  }

  /* leitura do link */
  function statusLink(tipo) {
    stLink.replaceChildren(tipo === "carregando" ? h("span", { class: "spin" }) : tipo === "ok" ? icon("check", "sm") : tipo === "erro" ? icon("alert", "sm") : "");
    stLink.style.color = tipo === "ok" ? "var(--green)" : tipo === "erro" ? "var(--accent)" : "";
  }
  function carregando(on) {
    [[wN, iNome, "nome"], [wL, iLoja, "loja"], [wP, iPreco, "preco"]].forEach(([w, el, k]) => w.classList.toggle("loading", on && (!el.value || auto[k])));
    carregandoFoto = on && (!imgs[0] || auto.img); pintaFotos();
  }
  function onLink() {
    clearTimeout(deb);
    const u = normalizaLink(iLink.value);
    if (!u || !linkLegivel(u)) { statusLink(""); avisoLink.replaceChildren(); return; }
    if (u === ultimo) return;
    deb = setTimeout(() => preencher(u), 600);
  }
  async function preencher(u) {
    ultimo = u; const meu = ++seq;
    statusLink("carregando"); avisoLink.replaceChildren(); carregando(true);
    let r;
    try { r = await db.lerLink(u); } catch { r = { ok: false, motivo: "rede" }; }
    if (meu !== seq) return;
    carregando(false);
    const poe = (k, el, v) => { if (v != null && v !== "" && (!el.value || auto[k])) { el.value = v; auto[k] = true; } };
    if (r && r.ok) {
      poe("nome", iNome, r.nome ? cut(String(r.nome), 200) : null); setErr(wN, "");
      poe("loja", iLoja, r.loja);
      if (r.preco != null && (!iPreco.value || auto.preco)) { setMoney(iPreco, r.preco); auto.preco = true; }
      if (r.imagem && (!imgs[0] || auto.img)) { imgs[0] = r.imagem; auto.img = true; }
      pintaFotos(); atualizaAviso(); statusLink("ok");
      avisoLink.replaceChildren(h("div", { class: "auto" }, icon("wand", "sm"), "Preenchido automaticamente ao colar o link. Confira antes de salvar."));
    } else {
      if (r && r.loja) poe("loja", iLoja, r.loja);
      statusLink("erro");
      avisoLink.replaceChildren(h("div", { class: "note" }, icon("alert", "sm"), AVISO[r && r.motivo] || AVISO.rede));
    }
  }
  iLink.addEventListener("input", onLink);
  iLink.addEventListener("paste", () => setTimeout(onLink, 0));

  /* aviso de teto */
  function atualizaAviso() {
    if (!temTeto()) { aviso.replaceChildren(); return; }
    const novo = (getMoney(iPreco) || 0) * qtd;
    if (novo <= 0) { aviso.replaceChildren(); return; }
    const velho = item ? totalItem(S.items.find((i) => i.id === item.id) || item) : 0;
    const t = totalGeral() - velho + novo;
    if (t > S.config.teto) aviso.replaceChildren(h("div", { class: "note", role: "status" }, icon("alert", "sm"), `Com este item o total vai a ${brl(t)} e passa do teto em ${brl(t - S.config.teto)}.`));
    else aviso.replaceChildren();
  }

  /* salvar */
  const btn = h("button", { type: "button", class: "primary", onclick: salvar }, "Salvar item");
  async function salvar() {
    if (salvando) return;
    erroGeral.replaceChildren();
    const nome = iNome.value.trim();
    let ok = true;
    if (!nome) { setErr(wN, "Digite o nome do item."); iNome.focus(); ok = false; }
    let link = null;
    if (iLink.value.trim()) {
      link = normalizaLink(iLink.value);
      if (!link) { avisoLink.replaceChildren(h("div", { class: "note" }, icon("alert", "sm"), "Esse link não é válido. Use um endereço que comece com http:// ou https://.")); if (ok) iLink.focus(); ok = false; }
    }
    if (enviando.some(Boolean)) { erroGeral.replaceChildren(h("div", { class: "note" }, icon("alert", "sm"), "Aguarde o envio da foto terminar.")); ok = false; }
    if (!ok) return;
    const row = { nome, link, loja: iLoja.value.trim() || null, preco: getMoney(iPreco) || 0, quantidade: qtd, comodo: sel.value || null, prioridade: pri, imagem_1: imgs[0] || null, imagem_2: imgs[1] || null };
    salvando = true; btn.disabled = true; btn.replaceChildren(h("span", { class: "spin" }), "Salvando…");
    try {
      if (editando) {
        const novo = await db.atualizar(item.id, row);
        upsertLocal(novo);
        const sobras = [item.imagem_1, item.imagem_2].filter((u) => u && !imgs.includes(u));
        if (sobras.length) db.removerFotos(sobras);
      } else upsertLocal(await db.inserir(row));
      novas.clear(); S.form = null; toast("Item salvo"); ir("lista");
    } catch {
      salvando = false; btn.disabled = false; btn.replaceChildren("Salvar item");
      erroGeral.replaceChildren(h("div", { class: "note" }, icon("alert", "sm"), "Não foi possível salvar. Confira a conexão e tente de novo."));
    }
  }

  const root = h("div", null,
    h("div", { class: "ftitle", text: editando ? "Editar item" : "Novo item" }),
    h("div", { class: "form" },
      h("div", { class: "field" }, h("label", { for: "f-link", text: "Link do produto" }), h("div", { class: "input" }, icon("link", "sm"), iLink, stLink)),
      avisoLink, wN, wL,
      h("div", { class: "row2" }, wP,
        h("div", { class: "field" }, h("div", { class: "fl", text: "Quantidade" }), h("div", { class: "stepper" },
          h("button", { type: "button", "aria-label": "Diminuir quantidade", onclick: () => mudaQtd(-1) }, icon("minus", "sm")), outQtd,
          h("button", { type: "button", "aria-label": "Aumentar quantidade", onclick: () => mudaQtd(1) }, icon("plus2", "sm"))))),
      h("div", { class: "field" }, h("label", { for: "f-comodo", text: "Cômodo" }), h("div", { class: "input" }, sel, icon("chevd", "sm"))),
      h("div", { class: "field" }, h("div", { class: "fl", text: "Prioridade" }), h("div", { class: "segctl", role: "group", "aria-label": "Prioridade" }, priBtns)),
      h("div", { class: "field" }, h("div", { class: "fl", text: "Fotos" }), fotosBox),
      aviso, erroGeral, btn));
  pintaFotos();
  if (!item) setTimeout(() => { if (S.view === "adicionar" && !pre) iLink.focus({ preventScroll: true }); }, 50);

  return {
    root, update: atualizaAviso,
    setLink(u) { iLink.value = u; ultimo = null; clearTimeout(deb); preencher(u); },
    dispose(salvo) { clearTimeout(deb); seq++; if (!salvo && novas.size) db.removerFotos([...novas]); },
  };
}

/* ------------------------------------------------------------------ resumo */
function construirResumo() {
  const root = h("div");
  function update() {
    const total = totalGeral();
    const comprado = S.items.filter((i) => i.status === "comprado").reduce((s, i) => s + totalItem(i), 0);
    const pct = temTeto() ? (total / S.config.teto) * 100 : 0;
    const est = pct > 100;
    const ring = h("div", { class: "ring" + (est ? " estourou" : temTeto() && pct >= S.config.alerta_pct ? " alerta" : ""), style: { "--p": Math.min(100, pct) + "%" }, role: "img",
      "aria-label": temTeto() ? `${Math.round(pct)}% do teto usado` : `Total geral ${brl(total)}` },
      h("div", null, temTeto() ? [h("b", { text: Math.round(pct) + "%" }), h("span", { text: "do teto usado" })] : [h("b", { text: brl0(total), style: { fontSize: "22px" } }), h("span", { text: "total geral" })]));
    if (!temTeto()) ring.style.background = "var(--soft)";
    const porComodo = new Map();
    for (const i of S.items) { const c = i.comodo || "Sem cômodo"; porComodo.set(c, (porComodo.get(c) || 0) + totalItem(i)); }
    const linhas = [...porComodo.entries()].sort((a, b) => b[1] - a[1]);
    const tile = (l, v, cor) => h("div", { class: "tile" }, h("span", { text: l }), h("b", { text: v, style: cor ? { color: cor } : null }));
    root.replaceChildren(
      h("div", { class: "ftitle", text: "Resumo" }), ring,
      h("div", { class: "tiles" }, tile("Total geral", brl(total)), tile("Teto", temTeto() ? brl(S.config.teto) : "Sem teto"), tile("Já comprado", brl(comprado), "var(--green)"), tile("Falta comprar", brl(total - comprado))),
      h("div", { class: "sect", text: "Por cômodo" }),
      ...(linhas.length ? linhas.map(([c, v]) => h("div", { class: "bar-row" }, h("div", { class: "l" }, h("span", { text: c }), h("b", { text: brl(v) })), h("div", { class: "t" }, h("span", { style: { width: (total ? (v / total) * 100 : 0) + "%" } }))))
        : [h("div", { class: "nada", text: "Adicione itens para ver o total por cômodo." })]));
  }
  return { root, update };
}

/* ------------------------------------------------------------------ ajustes */
function construirAjustes() {
  const root = h("div");
  function update() {
    if (root.contains(document.activeElement) && document.activeElement.matches("input")) return;
    const iTeto = h("input", { class: "v", type: "text", inputmode: "numeric", placeholder: "Sem teto", "aria-label": "Teto máximo", autocomplete: "off",
      onchange: () => { const v = getMoney(iTeto); salvarConfig({ teto: v && v > 0 ? v : null }, v ? "Teto atualizado" : "Teto removido"); },
      onkeydown: (e) => { if (e.key === "Enter") e.target.blur(); } });
    attachMoney(iTeto); setMoney(iTeto, S.config.teto);
    const rotulo = h("b", { text: S.config.alerta_pct + "%" });
    const range = h("input", { type: "range", min: "60", max: "95", step: "5", value: String(Math.min(95, Math.max(60, S.config.alerta_pct))), "aria-label": "Avisar a partir de (percentual do teto)",
      oninput: () => { rotulo.textContent = range.value + "%"; }, onchange: () => salvarConfig({ alerta_pct: Number(range.value) }, "Aviso atualizado") });
    const tags = h("div", { class: "tags" }, ...S.config.comodos.map((c) =>
      h("span", { class: "tag" }, c, h("button", { type: "button", "aria-label": `Remover ${c}`, onclick: () => removerComodo(c) }, icon("x")))));
    const novo = h("button", { type: "button", class: "tag add", text: "+ Novo", onclick: () => {
      const inp = h("input", { class: "tagin", maxlength: "30", placeholder: "Nome do cômodo", "aria-label": "Nome do novo cômodo" });
      const fim = (grava) => { const v = inp.value.trim(); if (grava && v) addComodo(v); else update(); };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fim(true); } if (e.key === "Escape") fim(false); });
      inp.addEventListener("blur", () => fim(true));
      novo.replaceWith(inp); inp.focus();
    } });
    tags.append(novo);
    const tema = lsGet("tema") || "auto";
    const tbtn = [["auto", "Automático"], ["claro", "Claro"], ["escuro", "Escuro"]].map(([v, n]) => h("button", { type: "button", "aria-pressed": String(tema === v), text: n, onclick: () => { lsSet("tema", v); aplicarTema(); root.replaceChildren(); update(); } }));
    root.replaceChildren(
      h("div", { class: "ftitle", text: "Ajustes" }),
      h("div", { class: "sect", text: "Orçamento" }),
      h("div", { class: "group" }, h("label", { class: "set" }, h("span", { text: "Teto máximo" }), iTeto), h("div", { class: "set" }, h("span", { text: "Avisar a partir de" }), h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, range, rotulo))),
      h("p", { class: "hint", text: "Os ajustes de teto, aviso e cômodos valem para todos os celulares." }),
      h("div", { class: "sect", text: "Cômodos" }), h("div", { class: "group" }, tags),
      h("div", { class: "sect", text: "Aparência" }), h("div", { class: "group" }, h("div", { class: "segctl", role: "group", "aria-label": "Tema" }, tbtn)),
      h("p", { class: "hint", text: "O tema fica guardado só neste aparelho." }),
      h("div", { class: "sect", text: "Sobre" }),
      h("div", { class: "group" }, h("div", { class: "set" }, h("span", { text: "Versão do app" }), h("b", { text: VERSAO_APP + (demo ? " (demo)" : "") })),
        h("div", { class: "set" }, h("span", { text: "Código no GitHub" }), h("a", { class: "link", href: REPO, target: "_blank", rel: "noopener", text: "compras-mudanca" }))));
  }
  return { root, update };
}
function addComodo(nome) {
  if (S.config.comodos.some((c) => norm(c) === norm(nome))) { toast("Esse cômodo já existe."); views.ajustes.update(); return; }
  salvarConfig({ comodos: [...S.config.comodos, nome] }, "Cômodo adicionado");
}
async function removerComodo(nome) {
  const n = S.items.filter((i) => i.comodo === nome).length;
  if (n && !(await confirmar({ titulo: `Remover "${nome}"?`, texto: `${n} ${n === 1 ? "item usa" : "itens usam"} este cômodo e continuam na lista.`, ok: "Remover" }))) return;
  salvarConfig({ comodos: S.config.comodos.filter((c) => c !== nome) });
}

/* ------------------------------------------------------------------ dados e inicialização */
const CACHE = "mudanca-cache";
function guardaCache() { if (!demo) lsSet(CACHE, JSON.stringify({ itens: S.items, config: S.config })); }
function lerCache() { try { return JSON.parse(lsGet(CACHE)); } catch { return null; } }
let assinou = false;
async function carregar() {
  try {
    const r = await db.carregar();
    S.items = r.itens; S.config = r.config; S.erro = false; guardaCache();
    if (!assinou) {
      assinou = true;
      db.assinar({
        onItem: (ev, row) => { if (ev === "DELETE") removeLocal(row.id); else upsertLocal(row); guardaCache(); render(); },
        onConfig: (c) => { S.config = c; guardaCache(); render(); },
        onStatus: (s) => { if (s === "SUBSCRIBED") { if (S.erro) carregar(); } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") { S.erro = true; render(); } },
      });
    }
  } catch {
    S.erro = true;
    const c = lerCache(); if (c && !S.items.length) { S.items = c.itens || []; S.config = c.config || S.config; }
  }
  S.loading = false; render();
}
let splashFora = false;
function esconderSplash(t0, ms = 600) {
  if (splashFora) return;
  const sp = $("splash");
  const quando = Math.max(0, ms - (Date.now() - t0));
  setTimeout(() => { if (splashFora) return; splashFora = true; sp.classList.add("fora"); setTimeout(() => sp.remove(), 500); }, quando);
}

async function iniciar() {
  const t0 = Date.now();
  esconderSplash(t0, 1200);   // se os dados demorarem, o esqueleto aparece sob a abertura
  aplicarTema(); montarNav();
  // compartilhamento: ?url=&text=&title=
  const p = new URLSearchParams(location.search);
  const partilha = ["url", "text", "title"].some((k) => p.has(k));
  const linkPartilhado = partilha ? firstUrl(p.get("url"), p.get("text"), p.get("title")) : null;
  const tituloPartilhado = partilha && !linkPartilhado ? (p.get("title") || "").slice(0, 200) : "";
  if (partilha || p.has("share")) {
    ["url", "text", "title", "share"].forEach((k) => p.delete(k));
    const qs = p.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch {}
  }
  S.view = "lista"; views.lista = construirLista(); main.replaceChildren(views.lista.root); marcarNav(); views.lista.update();
  try { db = await criarDb(); } catch { db = null; }
  if (!db) { const off = () => Promise.reject(new Error("offline")); db = { carregar: off, inserir: off, atualizar: off, excluir: off, salvarConfig: off, uploadFoto: off, lerLink: off, removerFotos: async () => {}, assinar() {} }; }
  if (linkPartilhado || tituloPartilhado) abrirForm(null, { link: linkPartilhado, nome: tituloPartilhado });
  await carregar();
  esconderSplash(t0);
}
window.addEventListener("online", () => { render(); carregar(); });
window.addEventListener("offline", render);
document.addEventListener("visibilitychange", () => { if (!document.hidden && db && !S.loading && !demo) carregar(); });
iniciar();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
