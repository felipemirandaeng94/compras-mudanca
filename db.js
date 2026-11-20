// Camada de dados isolada. criarDb() devolve a mesma interface no modo real (Supabase) e no demo.
import { uuid } from "./util.js";

export const COMODOS_PADRAO = ["Sala", "Cozinha", "Quarto", "Banheiro", "Área de serviço", "Outros"];
const CAMPOS_ITEM = ["id", "nome", "link", "loja", "preco", "quantidade", "comodo", "prioridade", "status", "imagem_1", "imagem_2", "criado_em", "atualizado_em"];

function limpaItem(r) {
  const o = {};
  for (const k of CAMPOS_ITEM) if (r[k] !== undefined) o[k] = r[k];
  o.preco = Number(o.preco) || 0;
  o.quantidade = Number(o.quantidade) || 1;
  return o;
}
function limpaConfig(c) {
  return {
    teto: c && c.teto != null ? Number(c.teto) : null,
    alerta_pct: c && c.alerta_pct ? Number(c.alerta_pct) : 80,
    comodos: c && Array.isArray(c.comodos) ? c.comodos : [...COMODOS_PADRAO],
  };
}

/* ------------------------------------------------------------------ Supabase real */
async function dbReal(cfg) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: false } });
  const base = `${cfg.SUPABASE_URL}/storage/v1/object/public/fotos/`;
  const ok = (r) => { if (r.error) throw r.error; return r.data; };

  return {
    demo: false,
    async carregar() {
      const [it, co] = await Promise.all([
        sb.from("itens").select("*").order("criado_em", { ascending: false }).then(ok),
        sb.from("configuracoes").select("*").eq("id", 1).maybeSingle().then(ok),
      ]);
      return { itens: it.map(limpaItem), config: limpaConfig(co) };
    },
    async inserir(row) { return limpaItem(await sb.from("itens").insert(row).select().single().then(ok)); },
    async atualizar(id, patch) { return limpaItem(await sb.from("itens").update(patch).eq("id", id).select().single().then(ok)); },
    async excluir(id) { await sb.from("itens").delete().eq("id", id).then(ok); },
    async salvarConfig(patch) { return limpaConfig(await sb.from("configuracoes").update(patch).eq("id", 1).select().single().then(ok)); },
    async uploadFoto(blob) {
      const path = `itens/${uuid()}.jpg`;
      const r = await sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (r.error) throw r.error;
      return sb.storage.from("fotos").getPublicUrl(path).data.publicUrl;
    },
    async removerFotos(urls) {
      const paths = urls.filter((u) => typeof u === "string" && u.startsWith(base)).map((u) => decodeURIComponent(u.slice(base.length).split("?")[0]));
      if (!paths.length) return;
      try { await sb.storage.from("fotos").remove(paths); } catch {}
    },
    async lerLink(url) {
      const r = await fetch(`${cfg.SUPABASE_URL}/functions/v1/ler-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.SUPABASE_KEY, Authorization: `Bearer ${cfg.SUPABASE_KEY}` },
        body: JSON.stringify({ url }),
      });
      return await r.json();
    },
    assinar({ onItem, onConfig, onStatus }) {
      const ch = sb.channel("mudanca")
        .on("postgres_changes", { event: "*", schema: "public", table: "itens" }, (p) => {
          if (p.eventType === "DELETE") onItem("DELETE", { id: p.old && p.old.id });
          else onItem(p.eventType, limpaItem(p.new));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "configuracoes" }, (p) => { if (p.new) onConfig(limpaConfig(p.new)); })
        .subscribe((s) => onStatus && onStatus(s));
      return () => sb.removeChannel(ch);
    },
  };
}

/* ------------------------------------------------------------------ Demo em memória */
function foto(c1, c2, letra) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><text x="120" y="150" font-family="sans-serif" font-size="96" font-weight="700" fill="#ffffff" fill-opacity=".75" text-anchor="middle">${letra}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

async function dbDemo(params) {
  const vazio = params.get("vazio") === "1";
  const atraso = Number(params.get("atraso")) || 250;
  const agora = Date.now();
  const mk = (n, nome, loja, preco, q, comodo, pri, st, c1, c2, link = true) => ({
    id: uuid(), nome, loja, preco, quantidade: q, comodo, prioridade: pri, status: st,
    link: link ? `https://www.${loja.toLowerCase()}.com.br/produto/${n}` : null,
    imagem_1: foto(c1, c2, nome[0]), imagem_2: n % 3 === 0 ? foto(c2, c1, "2") : null,
    criado_em: new Date(agora - n * 3600e3).toISOString(), atualizado_em: new Date(agora - n * 3600e3).toISOString(),
  });
  let itens = vazio ? [] : [
    mk(1, "Geladeira Frost Free 450L", "Magalu", 3899, 1, "Cozinha", "alta", "pendente", "#dfe6ea", "#7e919c"),
    mk(2, "Sofá retrátil 3 lugares", "Mobly", 2199, 1, "Sala", "alta", "pendente", "#e8dccd", "#b8956b"),
    mk(3, "Jogo de panelas inox", "Amazon", 389, 1, "Cozinha", "media", "pendente", "#d5dde3", "#8e9ba5"),
    mk(4, "Cortina blackout", "Leroy", 120, 2, "Quarto", "media", "comprado", "#e3e7d8", "#aab58f"),
    mk(5, "Cabeceira estofada", "Mobly", 680, 1, "Quarto", "baixa", "pendente", "#efdede", "#c99f9f"),
    mk(6, "Lavadora 13kg Inverter", "Magalu", 2800, 1, "Área de serviço", "alta", "comprado", "#d9e4ee", "#6f8fae"),
    mk(7, "Tapete sala 2x3 m", "Amazon", 459.9, 1, "Sala", "baixa", "pendente", "#eadfd2", "#a98466"),
    mk(8, "Kit organizadores banheiro", "Shopee", 89.9, 3, "Banheiro", "media", "pendente", "#dcebe6", "#82b0a2"),
    mk(9, "Mesa de jantar 6 lugares", "Tok&Stok", 1590, 1, "Cozinha", "media", "pendente", "#efe3cf", "#c0a37a"),
    mk(10, "Luminária de piso", "Leroy", 215, 1, "Sala", "baixa", "comprado", "#e9e6f1", "#a59cc1", false),
  ];
  let config = vazio ? limpaConfig({ teto: 15000 }) : limpaConfig({ teto: 15000, alerta_pct: 80 });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    demo: true,
    async carregar() { await espera(atraso); return { itens: itens.map((i) => ({ ...i })), config: { ...config } }; },
    async inserir(row) { await espera(60); const n = limpaItem({ criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), id: uuid(), ...row }); itens = [n, ...itens]; return { ...n }; },
    async atualizar(id, patch) { await espera(60); itens = itens.map((i) => (i.id === id ? { ...i, ...patch, atualizado_em: new Date().toISOString() } : i)); return { ...itens.find((i) => i.id === id) }; },
    async excluir(id) { await espera(60); itens = itens.filter((i) => i.id !== id); },
    async salvarConfig(patch) { await espera(60); config = limpaConfig({ ...config, ...patch }); return { ...config }; },
    async uploadFoto(blob) {
      await espera(200);
      return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
    },
    async removerFotos() {},
    async lerLink(url) {
      await espera(900);
      let host = ""; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
      if (/bloqueio/.test(url)) return { ok: false, motivo: "bloqueado", loja: "Loja" };
      const loja = host.split(".")[0].replace(/^./, (c) => c.toUpperCase());
      return { ok: true, nome: "Lavadora 13kg Inverter", preco: 4800, loja, imagem: foto("#d5dde3", "#8e9ba5", "L"), imagem_salva: false, link: url };
    },
    assinar() { return () => {}; },
  };
}

export async function criarDb() {
  const params = new URLSearchParams(location.search);
  if (params.get("demo") === "1") return dbDemo(params);
  return dbReal(window.APP_CONFIG || {});
}
