/* Service worker مستقل لبوابة العملاء (مش بيلمس تطبيق الموظفين) */
const CACHE = "portal-v35-batch74";
const SHELL = ["./portal.html", "./portal-ticker.js", "./pw-eye.js", "./wf-session.js", "./firebase-config.js", "./app-check.js", "./portal-manifest.json", "./icon-192-v13.png", "./icon-512-v13.png", "./app-icon.svg", "./wf-shell.css", "./branding.js", "./white-label.js", "./white-label-config.js", "./workshop-logo.svg", "./workshop-idb.js", "./image-store.js", "./notif-center.js", "./wf-media.js", "./vendor/firebase-app-compat.js", "./vendor/firebase-auth-compat.js", "./vendor/firebase-firestore-compat.js"];
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
  // هوية النظام: ملف التثبيت والأيقونات المتولّدة (نفس كاش wf-brand-v1 اللي بيستخدمه تطبيق الموظفين)
  const bm = u.origin === location.origin && !u.searchParams.has("wl-src") && /\/(portal-manifest\.json|icon-192-v13\.png|icon-512-v13\.png|icon-maskable-512-v13\.png|apple-touch-icon-v13\.png)$/.exec(u.pathname);
  if (bm) {
    e.respondWith(caches.open("wf-brand-v1").then(c => c.match(new URL(bm[1], self.registration.scope).href)).then(hit => hit || caches.open(CACHE).then(c => c.match("./" + bm[1])).then(h => fetch(r).then(x => x, () => h || Response.error()))));
    return;
  }
  // صفحة البوابة: الشبكة أولًا ثم الكاش
  const helper = u.origin === location.origin && /\/(portal-ticker\.js|pw-eye\.js|wf-session\.js|wf-shell\.css|app-icon\.svg|workshop-idb\.js|image-store\.js|wf-media\.js)$/.exec(u.pathname);
  if (helper) { // ملفات مساعدة: الشبكة أولًا ثم الكاش (عشان التحديثات توصل)
    const key = "./" + helper[1];
    e.respondWith(netFirst(r, key, 4000));
    return;
  }
  if (u.origin === location.origin && u.pathname.endsWith("/portal.html")) {
    e.respondWith(netFirst(r, "./portal.html", 4000));
  }
});

/* إشعارات بوابة العملاء (Web Push من السيرفر) — بتوصل حتى والبوابة مقفولة. */
self.addEventListener("push", e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (x) { p = { title: "🔔 إشعار من الورشة", body: e.data ? e.data.text() : "" }; }
  p = p.data || p.notification || p;
  let url = "./portal.html";
  try { if (p.link) url = new URL(p.link, self.registration.scope).href; } catch (x) {}
  e.waitUntil(self.registration.showNotification(p.title || "🔔 إشعار من الورشة", { body: p.body || "", icon: "./icon-192-v13.png", badge: "./icon-192-v13.png", tag: p.tag || undefined, renotify: !!p.tag, dir: "rtl", lang: "ar", data: { url } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./portal.html";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.indexOf("portal.html") > -1 && "focus" in c) { c.postMessage({ type: "GO_TO", url }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
