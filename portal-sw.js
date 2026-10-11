/* Service worker مستقل لبوابة العملاء (مش بيلمس تطبيق الموظفين) */
const CACHE = "portal-v18-firebase-config";
const SHELL = ["./portal.html", "./portal-ticker.js", "./pw-eye.js", "./wf-session.js", "./firebase-config.js", "./app-check.js", "./portal-manifest.json", "./icon-192-v13.png", "./icon-512-v13.png", "./app-icon.svg", "./wf-shell.css", "./branding.js", "./white-label.js", "./white-label-config.js", "./workshop-logo.svg", "./workshop-idb.js", "./image-store.js", "./vendor/firebase-app-compat.js", "./vendor/firebase-auth-compat.js", "./vendor/firebase-firestore-compat.js"];
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(SHELL);
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("portal-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// الشبكة أولًا لكن بمهلة: على النت الضعيف الصفحة كانت بتفضل معلّقة لحد ما الطلب يفشل. بعد المهلة بنفتح النسخة المحفوظة
// والطلب يكمّل في الخلفية ويحدّث الكاش للمرة الجاية.
function netFirst(r, key, ms) {
  return new Promise(resolve => {
    let settled = false;
    const done = v => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => { caches.open(CACHE).then(c => c.match(key)).then(h => { if (h) done(h); }); }, ms);
    fetch(r).then(x => {
      clearTimeout(timer);
      if (x && x.ok) { const copy = x.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      done(x);
    }).catch(() => { clearTimeout(timer); caches.open(CACHE).then(c => c.match(key)).then(h => done(h || Response.error())); });
  });
}
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  // مكتبات Firebase: من الكاش لو مفيش نت
  if (u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.open(CACHE).then(c => c.match(r).then(hit => { const net = fetch(r).then(x => { if (x && x.ok) c.put(r, x.clone()); return x; }).catch(() => null); return hit || net.then(x => x || Response.error()); })));
    return;
  }
  // صفحة البوابة: الشبكة أولًا ثم الكاش
  const helper = u.origin === location.origin && /\/(portal-ticker\.js|pw-eye\.js|wf-session\.js|wf-shell\.css|app-icon\.svg|workshop-idb\.js|image-store\.js)$/.exec(u.pathname);
  if (helper) { // ملفات مساعدة: الشبكة أولًا ثم الكاش (عشان التحديثات توصل)
    const key = "./" + helper[1];
    e.respondWith(netFirst(r, key, 4000));
    return;
  }
  if (u.origin === location.origin && u.pathname.endsWith("/portal.html")) {
    e.respondWith(netFirst(r, "./portal.html", 4000));
  }
});
