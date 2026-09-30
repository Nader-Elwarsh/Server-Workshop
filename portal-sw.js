/* Service worker مستقل لبوابة العملاء (مش بيلمس تطبيق الموظفين) */
const CACHE = "portal-v4";
const SHELL = ["./portal.html", "./portal-ticker.js", "./pw-eye.js", "./wf-session.js", "./portal-manifest.json", "./icon-192-v12.png", "./icon-512-v12.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  // مكتبات Firebase: من الكاش لو مفيش نت
  if (u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.open(CACHE).then(c => c.match(r).then(hit => { const net = fetch(r).then(x => { if (x && x.ok) c.put(r, x.clone()); return x; }).catch(() => null); return hit || net.then(x => x || Response.error()); })));
    return;
  }
  // صفحة البوابة: الشبكة أولًا ثم الكاش
  const helper = u.origin === location.origin && /\/(portal-ticker|pw-eye|wf-session)\.js$/.exec(u.pathname);
  if (helper) { // ملفات مساعدة: الشبكة أولًا ثم الكاش (عشان التحديثات توصل)
    const key = "./" + helper[1] + ".js";
    e.respondWith(fetch(r).then(x => { if (x && x.ok) caches.open(CACHE).then(c => c.put(key, x.clone())); return x; }).catch(() => caches.match(key)));
    return;
  }
  if (u.origin === location.origin && u.pathname.endsWith("/portal.html")) {
    e.respondWith(fetch(r).then(x => { if (x && x.ok) caches.open(CACHE).then(c => c.put("./portal.html", x.clone())); return x; }).catch(() => caches.match("./portal.html")));
  }
});
