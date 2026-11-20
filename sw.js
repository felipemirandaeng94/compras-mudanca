// Service worker: app shell em cache, stale-while-revalidate para arquivos do próprio site.
const VERSAO = "v5";
const CACHE = `mudanca-${VERSAO}`;
const SHELL = ["./", "index.html", "styles.css", "app.js", "db.js", "ui.js", "util.js", "install.js", "config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: "reload" }))))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("mudanca-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;               // supabase.co, fontes etc.: direto na rede
  const chave = req.mode === "navigate" ? "index.html" : req;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const cacheado = await c.match(chave, { ignoreSearch: true });
    const rede = fetch(req.mode === "navigate" ? req : new Request(req, { cache: "no-cache" })).then((r) => { if (r && r.ok) c.put(chave, r.clone()); return r; }).catch(() => null);
    if (cacheado) { e.waitUntil(rede); return cacheado; }
    return (await rede) || (req.mode === "navigate" ? c.match("index.html", { ignoreSearch: true }) : Response.error());
  }));
});
