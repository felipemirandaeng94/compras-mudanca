// Edge Function "ler-link" - Compras da Mudança
// Recebe POST { "url": "<link do produto>" }
// Devolve { ok, nome, preco, loja, imagem, imagem_salva, link } ou { ok:false, motivo, loja }
// Deploy com "Verify JWT" DESLIGADO (o app não tem login).

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, key: string): string | null {
  const k = key.replace(/[:.]/g, (c) => "\\" + c);
  const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*?content=["']([^"']*)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name|itemprop)=["']${k}["']`, "i");
  const m = html.match(a) || html.match(b);
  return m && m[1] ? decode(m[1]) : null;
}

function parsePreco(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  let s = String(v).replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > ld) s = s.replace(/\./g, "").replace(",", ".");     // 4.800,00
  else if (lc === -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // 4.800
  else s = s.replace(/,/g, "");                                  // 4800.00 / 4,800.00
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// deno-lint-ignore no-explicit-any
function produtoJsonLd(html: string): any {
  const blocos = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocos) {
    try {
      const pilha = [JSON.parse(b[1].trim())];
      while (pilha.length) {
        const n = pilha.pop();
        if (!n || typeof n !== "object") continue;
        if (Array.isArray(n)) { pilha.push(...n); continue; }
        const t = n["@type"];
        if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) return n;
        if (n["@graph"]) pilha.push(n["@graph"]);
        if (n.mainEntity) pilha.push(n.mainEntity);
      }
    } catch { /* bloco inválido, ignora */ }
  }
  return null;
}

// deno-lint-ignore no-explicit-any
function precoDeOffers(o: any): number | null {
  if (!o) return null;
  for (const x of Array.isArray(o) ? o : [o]) {
    const p = parsePreco(x?.price ?? x?.lowPrice ?? x?.priceSpecification?.price);
    if (p) return p;
  }
  return null;
}

// deno-lint-ignore no-explicit-any
function imagemDe(img: any): string | null {
  if (!img) return null;
  if (typeof img === "string") return img;
  if (Array.isArray(img)) return imagemDe(img[0]);
  return img.url || img.contentUrl || null;
}

function nomeLoja(host: string): string {
  const h = host.replace(/^www\./, "");
  const mapa: Record<string, string> = {
    "amazon.com.br": "Amazon", "amzn.to": "Amazon", "mercadolivre.com.br": "Mercado Livre",
    "mercadolivre.com": "Mercado Livre", "magazineluiza.com.br": "Magalu", "magalu.com": "Magalu",
    "casasbahia.com.br": "Casas Bahia", "pontofrio.com.br": "Ponto", "mobly.com.br": "Mobly",
    "shopee.com.br": "Shopee", "americanas.com.br": "Americanas", "leroymerlin.com.br": "Leroy Merlin",
    "tokstok.com.br": "Tok&Stok", "madeiramadeira.com.br": "MadeiraMadeira", "kabum.com.br": "KaBuM!",
    "carrefour.com.br": "Carrefour", "camicado.com.br": "Camicado", "etna.com.br": "Etna",
  };
  for (const k in mapa) if (h === k || h.endsWith("." + k)) return mapa[k];
  const base = h.split(".")[0] || h;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function limparNome(nome: string): string {
  return nome
    .replace(/\s+-\s+R\$\s*[\d.,]+\s*$/i, "")                 // "Produto - R$ 598" (Mercado Livre)
    .replace(/\s*:\s*Amazon\.com\.br\b.*$/i, "")               // "Produto : Amazon.com.br: Categoria"
    .replace(/\s*[|–-]\s*(Amazon|Mercado Livre|MercadoLivre|Magalu|Magazine Luiza|Casas Bahia|Mobly|Shopee|Americanas|Leroy Merlin|Tok&Stok|MadeiraMadeira|KaBuM!?)[^|]*$/i, "")
    .replace(/^Amazon\.com\.br\s*:\s*/i, "")
    .trim()
    .slice(0, 200);
}

function precoNoTitulo(nome: string | null): number | null {
  if (!nome) return null;
  const m = nome.match(/R\$\s*([\d.]+(?:,\d{1,2})?)\s*$/i);
  return m ? parsePreco(m[1]) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, motivo: "metodo" }, 405);

  let url: string;
  try {
    const corpo = await req.json();
    const u = new URL(String(corpo.url).trim());
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    url = u.toString();
  } catch {
    return json({ ok: false, motivo: "url_invalida" }, 400);
  }

  let html = "", urlFinal = url;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    urlFinal = r.url || url;
    html = (await r.text()).slice(0, 3_000_000);
    if (!r.ok) return json({ ok: false, motivo: "bloqueado", status: r.status, loja: nomeLoja(new URL(urlFinal).hostname) });
  } catch {
    return json({ ok: false, motivo: "falha_acesso", loja: nomeLoja(new URL(url).hostname) });
  }

  const loja = nomeLoja(new URL(urlFinal).hostname);
  const prod = produtoJsonLd(html);

  const titulo = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  let nome: string | null = (prod?.name ? decode(String(prod.name)) : null) ||
    meta(html, "og:title") || meta(html, "twitter:title") || (titulo ? decode(titulo[1]) : null);
  const precoTitulo = precoNoTitulo(nome);
  if (nome) nome = limparNome(nome);
  if (nome && /captcha|robot|rob[oô]|verifica|access denied|acesso negado/i.test(nome)) nome = null;

  let imagem = imagemDe(prod?.image) || meta(html, "og:image") || meta(html, "og:image:secure_url") || meta(html, "twitter:image");
  if (imagem) { try { imagem = new URL(imagem, urlFinal).toString(); } catch { imagem = null; } }

  const preco = precoDeOffers(prod?.offers) ||
    parsePreco(meta(html, "product:price:amount")) || parsePreco(meta(html, "og:price:amount")) ||
    parsePreco(meta(html, "price")) || precoTitulo;

  if (!nome && !imagem) return json({ ok: false, motivo: "sem_dados", loja });

  // Copia a foto para o bucket "fotos" para não depender da loja
  let imagemSalva: string | null = null;
  if (imagem) {
    try {
      const ir = await fetch(imagem, { headers: { "User-Agent": UA, "Referer": urlFinal }, signal: AbortSignal.timeout(10000) });
      const tipo = (ir.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (ir.ok && /^image\/(jpeg|jpg|png|webp)$/.test(tipo)) {
        const bytes = new Uint8Array(await ir.arrayBuffer());
        if (bytes.byteLength > 0 && bytes.byteLength <= 5 * 1024 * 1024) {
          const sb = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
          );
          const ct = tipo === "image/jpg" ? "image/jpeg" : tipo;
          const ext = ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg";
          const caminho = `link/${crypto.randomUUID()}.${ext}`;
          const { error } = await sb.storage.from("fotos").upload(caminho, bytes, { contentType: ct });
          if (!error) imagemSalva = sb.storage.from("fotos").getPublicUrl(caminho).data.publicUrl;
        }
      }
    } catch { /* fica com a URL externa */ }
  }

  return json({
    ok: true,
    nome,
    preco,
    loja,
    imagem: imagemSalva || imagem,
    imagem_salva: !!imagemSalva,
    link: url,
  });
});
