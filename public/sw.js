const CACHE = "escala-v15";
const SHELL = [
  "/", "/index.html", "/admin.html", "/versiculos.js", "/shared.js", "/mobile.css",
  "/vendor/jspdf.umd.min.js",
  "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"
];

// Páginas e código do app sempre vêm da rede (evita HTML novo com JS antigo).
const sempreRede = (p) => /\.(html|js|css|webmanifest)$/.test(p);

async function redePrimeiro(request) {
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  } catch (e) {
    const cached = await caches.match(request);
    return cached || caches.match("/index.html");
  }
}

self.addEventListener("install", (e) => {
  // Baixa cada arquivo individualmente: uma falha isolada não impede a instalação.
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

// Recarrega as páginas abertas para que saiam da versão antiga imediatamente.
async function recarregarClientes() {
  const paginas = await self.clients.matchAll({ type: "window" });
  paginas.forEach((c) => {
    try { c.navigate(c.url); } catch (e) { /* ignora */ }
  });
}

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(recarregarClientes)
      .catch(() => {})
  );
});

// Permite que a página peça a troca imediata para a versão nova.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // CDN (bible-api): deixa o navegador cuidar
  if (url.pathname.startsWith("/api/")) return;      // API: sempre rede

  // Navegação e código do app: rede primeiro, cache apenas se estiver offline
  if (request.mode === "navigate" || sempreRede(url.pathname)) {
    e.respondWith(redePrimeiro(request));
    return;
  }

  // Demais estáticos (fontes, imagens, vendor): cache primeiro, atualizando em segundo plano
  e.respondWith(
    caches.match(request).then((cached) => {
      const rede = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || rede;
    })
  );
});
