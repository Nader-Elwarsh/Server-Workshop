/* طبقة قاعدة البيانات التشغيلية — IndexedDB مصدر التخزين المحلي الأساسي.
   تُستورد مفاتيح localStorage القديمة مرة واحدة إلى keyValues، ثم تزال النسخة
   القديمة فقط بعد تأكيد المعاملة. WFStorage يحافظ على واجهة متزامنة للقراءة
   القديمة عبر كاش ذاكرة، وتُحفظ الكتابات على IndexedDB في الخلفية. */
(function (window) {
  "use strict";
  if (window.WorkshopDB && window.WFStorage) return;

  // امنع رسم المحتوى قبل معرفة الثيم المحفوظ من IndexedDB، لتجنب وميض
  // ثيم النظام على الصفحات التي لديها تفضيل يدوي محفوظ.
  try {
    const root = window.document.documentElement;
    root.setAttribute("data-wf-storage-pending", "1");
    const gate = window.document.createElement("style");
    gate.id = "wf-storage-theme-gate";
    gate.textContent = 'html[data-wf-storage-pending="1"] body{visibility:hidden!important}';
    (window.document.head || root).appendChild(gate);
  } catch (_) {}

  const DB_NAME = "wfOperationalDB";
  const DB_VERSION = 3;
  const KV_STORE = "keyValues";
  const KV_MIGRATION_KEY = "localStorageImportedV1";
  const STORES = {
    wf_c: { name: "customers", indexes: [["phone", "phone"], ["portalUid", "portalUid"]] },
    wf_d: { name: "devices", indexes: [["customerId", "customerId"], ["type", "type"]] },
    wf_r: { name: "requests", indexes: [["customerId", "customerId"], ["deviceId", "deviceId"], ["status", "status"], ["createdAt", "createdAt"]] },
    wf_p: { name: "parts", indexes: [["category", "category"], ["name", "name"], ["code", "code"], ["archived", "archived"]] },
    wf_m: { name: "partMoves", indexes: [["partId", "partId"], ["requestId", "requestId"], ["type", "type"], ["at", "at"]] },
    wf_wallet_tx: { name: "walletTx", indexes: [["refKey", "refKey"], ["wallet", "wallet"], ["orderId", "orderId"], ["deleted", "deleted"]] }
  };
  const META = "meta";
  let dbPromise = null, initializePromise = null, writeTail = Promise.resolve();
  let storageReady = null, storageTail = Promise.resolve(), storageChannel = null;
  const snapshots = new Map(), snapshotVersions = new Map();
  const storageCache = new Map(), storageListeners = new Set();
  /* ختم لكل مفتاح بيتغيّر مع كل كتابة (ومحفوظ مع القيمة): المزامنة بتعرف منه إن قسم ما اتغيّرش من آخر مرة
     من غير ما تحسب بصمة النص كله (ملايين الحروف) مع كل فتح صفحة. */
  const storageAt = new Map(); let lastStamp = 0; const BIG_MSG = 200000;
  function nextStamp() { const t = Date.now(); lastStamp = t > lastStamp ? t : lastStamp + 1; return lastStamp; }

  /* سجل كتابة احتياطي (write-ahead journal) في localStorage.
     IndexedDB بيتكتب فيه بشكل غير متزامن؛ لو الصفحة اتنقلت أو اتعملها reload أو اتقفلت
     بعد الحفظ مباشرة (إنشاء أمر، إقفال أمر...) الكتابة كانت بتضيع. دلوقتي كل كتابة بتتسجل هنا
     متزامنًا، وتتشال بعد ما IndexedDB يأكد، ولو ضاعت بتتعاد تلقائيًا عند فتح التطبيق. */
  const WAL_PREFIX = "wf_wal_v1:";
  const walBoot = new Map(), walSeq = new Map();
  try {
    const ls = window.localStorage;
    for (let i = 0; ls && i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.indexOf(WAL_PREFIX) === 0) {
        try { const e = JSON.parse(ls.getItem(k)); if (e && typeof e === "object") walBoot.set(k.slice(WAL_PREFIX.length), e); } catch (_) {}
      }
    }
  } catch (_) {}
  function walPut(key, value, remove) {
    // القيم الضخمة (آلاف الأوامر) ما بتتسجلش في سجل الأمان المتزامن: الكتابة دي بتبطّأ كل حفظ،
    // وأصلًا بتفشل لأن مساحة التخزين القديم حوالي 5 ميجا.
    if (!remove && value && String(value).length > 1500000) return 0;
    try {
      const seq = (walSeq.get(key) || 0) + 1; walSeq.set(key, seq);
      window.localStorage.setItem(WAL_PREFIX + key, JSON.stringify({ t: Date.now(), s: seq, r: remove ? 1 : 0, v: remove ? null : String(value) }));
      return seq;
    } catch (_) { return 0; }
  }
  function walDone(key, seq) {
    if (!seq || walSeq.get(key) !== seq) return;
    try { window.localStorage.removeItem(WAL_PREFIX + key); } catch (_) {}
  }

  // سجل بدون id مش بيتخزن في مخازن IndexedDB: قبل كده كان بيتشال بصمت (فقد بيانات غير ملحوظ).
  // دلوقتي بنسجّل تحذير وبنحفظ العدد في WFStorageStatus.droppedRecords عشان يتشخّص.
  function validRecords(value) {
    if (!Array.isArray(value)) return [];
    const ok = value.filter(x => x && typeof x === "object" && !Array.isArray(x) && x.id !== undefined && x.id !== null && String(x.id) !== "");
    if (ok.length !== value.length) {
      console.warn("[WorkshopDB] تم استبعاد " + (value.length - ok.length) + " سجل بدون id من الحفظ");
      window.WFStorageStatus = Object.assign({}, window.WFStorageStatus, { droppedRecords: value.length - ok.length });
    }
    return ok;
  }
  // فشل الحفظ في IndexedDB (مساحة ممتلئة، تبويب قديم، خطأ متصفح) كان بيتسجل في الـconsole بس،
  // والمستخدم يفتكر إن البيانات اتحفظت. دلوقتي بيظهر شريط تحذير واضح لحد ما الحفظ ينجح تاني.
  // انتظار كتابات keyValues بس (من جوه طابور الكتابة؛ WFStorage.flush بيستنى الطابور نفسه)
  function kvFlush() { return Promise.all([storageReady, storageTail]).then(r => { if (r[0] === false || (window.WFStorageStatus && window.WFStorageStatus.writeError)) throw new Error("تعذر تأكيد الحفظ في IndexedDB"); return true; }); }
  function storageFailure(error) {
    window.WFStorageStatus = Object.assign({}, window.WFStorageStatus, { writeError: error || true });
    try {
      const doc = window.document;
      if (!doc || !doc.body || doc.getElementById("wf-storage-alert")) return;
      const bar = doc.createElement("div");
      bar.id = "wf-storage-alert"; bar.setAttribute("role", "alert"); bar.dir = "rtl";
      bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#b00020;color:#fff;padding:10px 14px;font:600 14px/1.5 sans-serif;text-align:center";
      bar.textContent = "⚠️ تعذر حفظ آخر تغييرات في قاعدة البيانات (ممكن المساحة امتلت). خد نسخة احتياطية فورًا من الإعدادات، وفرّغ مساحة على الجهاز.";
      doc.body.appendChild(bar);
    } catch (_) {}
  }
  function storageRecovered() {
    const st = window.WFStorageStatus;
    if (!st || !st.writeError) return;
    window.WFStorageStatus = Object.assign({}, st, { writeError: null });
    try { const el = window.document && window.document.getElementById("wf-storage-alert"); if (el && el.remove) el.remove(); } catch (_) {}
  }
  function setSnapshot(key, records) {
    if (!STORES[key]) return;
    snapshots.set(key, validRecords(records));
    snapshotVersions.set(key, (snapshotVersions.get(key) || 0) + 1);
  }
  /* نسخة القراءة (snapshot) بتتبني عند أول طلب بس، من النص اللي في الذاكرة (تحليل JSON واحد).
     قبل كده كل صفحة كانت بتقرا كل الأقسام من مخازن IndexedDB وتحسب بصمتها حتى لو الصفحة مش محتاجاها. */
  function getSnapshot(key) {
    if (!snapshots.has(key)) {
      if (!STORES[key] || !(window.WFStorageStatus && window.WFStorageStatus.ready)) return null;
      const raw = storageCache.get(key);
      if (raw == null) return null;
      let records; try { records = JSON.parse(raw); } catch (_) { return null; }
      snapshots.set(key, validRecords(records));
      snapshotVersions.set(key, (snapshotVersions.get(key) || 0) + 1);
    }
    return { records: snapshots.get(key), version: snapshotVersions.get(key) || 0 };
  }
  function dropSnapshot(key) { if (snapshots.has(key)) { snapshots.delete(key); snapshotVersions.set(key, (snapshotVersions.get(key) || 0) + 1); } }
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB غير متاح")); return; }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        Object.keys(STORES).forEach(key => {
          const spec = STORES[key];
          const store = db.objectStoreNames.contains(spec.name) ? request.transaction.objectStore(spec.name) : db.createObjectStore(spec.name, { keyPath: "id" });
          spec.indexes.forEach(([name, field]) => { if (!store.indexNames.contains(name)) store.createIndex(name, field, { unique: false }); });
        });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
        if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE, { keyPath: "key" });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("تعذر فتح قاعدة البيانات"));
      request.onblocked = () => console.warn("[WorkshopDB] تحديث قاعدة البيانات متوقف بسبب تبويب قديم مفتوح");
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }
  function legacyEntries() {
    const entries = [];
    try {
      const source = window.localStorage;
      for (let i = 0; source && i < source.length; i++) {
        const key = source.key(i);
        if (key != null && String(key).indexOf(WAL_PREFIX) !== 0) entries.push([String(key), source.getItem(key)]);
      }
    } catch (error) { console.warn("[WFStorage] تعذرت قراءة التخزين القديم", error); }
    return entries;
  }
  function notifyStorage(key, value, removed, remote, silentLocal) {
    if (!silentLocal) storageListeners.forEach(fn => { try { fn(key, value, !!removed, !!remote); } catch (error) { console.warn("[WFStorage] storage listener failed", error); } });
    // القيم الكبيرة مابتتبعتش للتابات التانية هنا (نسخ ملايين الحروف مع كل حفظ): بيتبعت إشعار بعد ما الحفظ يتأكد، والتاب التاني بيقراها من التخزين
    if (!remote && !(value && String(value).length > BIG_MSG)) { try { storageChannel && storageChannel.postMessage({ key, value, removed: !!removed, at: storageAt.get(key) || 0 }); } catch (_) {} }
  }
  try {
    if (window.BroadcastChannel) {
      storageChannel = new window.BroadcastChannel("wf-indexeddb-kv");
      storageChannel.onmessage = event => {
        const d = event && event.data;
        if (!d || typeof d.key !== "string") return;
        if (d.big) { // تاب تاني حفظ قيمة كبيرة: نقراها من التخزين (بعد ما اتأكدت)
          if ((storageAt.get(d.key) || 0) >= (+d.at || 0)) return;
          open().then(db => new Promise(ok => { const q = db.transaction([KV_STORE], "readonly").objectStore(KV_STORE).get(d.key); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); })).then(row => {
            if (!row || (storageAt.get(d.key) || 0) >= (+row.at || 0)) return;
            storageCache.set(d.key, String(row.value)); storageAt.set(d.key, +row.at); if (+row.at > lastStamp) lastStamp = +row.at;
            if (STORES[d.key]) dropSnapshot(d.key);
            notifyStorage(d.key, String(row.value), false, true);
          }).catch(() => {});
          return;
        }
        if (d.removed) storageCache.delete(d.key); else storageCache.set(d.key, String(d.value));
        storageAt.set(d.key, d.at || nextStamp()); if (+d.at > lastStamp) lastStamp = +d.at;
        if (STORES[d.key]) dropSnapshot(d.key);
        notifyStorage(d.key, d.value, d.removed, true);
      };
    }
  } catch (_) {}
  function persistStorageMutation(key, value, remove, stamp) {
    const current = storageTail.then(() => storageReady).then(ok => {
      if (!ok) {
        if (remove) window.localStorage.removeItem(key); else window.localStorage.setItem(key, String(value));
        return true;
      }
      return open().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction([KV_STORE], "readwrite"), store = tx.objectStore(KV_STORE);
        if (remove) store.delete(key); else store.put({ key, value: String(value), at: stamp || Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error("تعذر حفظ قيمة التخزين"));
        tx.onabort = () => reject(tx.error || new Error("أُلغيت كتابة التخزين"));
      }));
    }).then(v => { storageRecovered(); return v; });
    storageTail = current.catch(error => {
      console.error("[WFStorage] تعذر حفظ القيمة في IndexedDB", key, error);
      storageFailure(error);
      try { if (remove) window.localStorage.removeItem(key); else window.localStorage.setItem(key, String(value)); } catch (_) {}
      return false;
    });
    return current;
  }
  function initializeStorage() {
    const legacy = legacyEntries();
    legacy.forEach(([key, value]) => { if (!storageCache.has(key)) storageCache.set(key, value); });
    storageReady = open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction([KV_STORE, META], "readwrite"), store = tx.objectStore(KV_STORE), meta = tx.objectStore(META);
      const markReq = meta.get(KV_MIGRATION_KEY);
      let imported = false, migrationMarker = null;
      markReq.onsuccess = () => {
        migrationMarker = markReq.result || null;
        imported = !migrationMarker;
        if (!imported) return; // الاستيراد القديم اتعمل قبل كده: مفيش داعي نقرا كل القيم مرتين
        const keysReq = store.getAllKeys();
        keysReq.onsuccess = () => {
          const known = new Set(Array.isArray(keysReq.result) ? keysReq.result : []);
          legacy.forEach(([key, value]) => { if (!known.has(key)) store.put({ key, value: String(value) }); });
          meta.put({ key: KV_MIGRATION_KEY, at: Date.now(), count: legacy.length, legacySourceCleared: false });
        };
      };
      markReq.onerror = () => { try { tx.abort(); } catch (_) {} };
      tx.oncomplete = () => {
        const readTx = db.transaction([KV_STORE], "readonly"), req = readTx.objectStore(KV_STORE).getAll();
        req.onsuccess = () => resolve({ rows: Array.isArray(req.result) ? req.result : [], imported, migrationMarker });
        req.onerror = () => reject(req.error || new Error("تعذر تحميل القيم المحلية"));
      };
      tx.onerror = () => reject(tx.error || new Error("تعذرت تهيئة مخزن القيم"));
      tx.onabort = () => reject(tx.error || new Error("أُلغيت تهيئة مخزن القيم"));
    })).then(async ({ rows, imported, migrationMarker }) => {
      storageCache.clear();
      rows.forEach(row => { if (row && typeof row.key === "string") { storageCache.set(row.key, String(row.value)); if (row.at) { storageAt.set(row.key, +row.at); if (+row.at > lastStamp) lastStamp = +row.at; } } });
      // استرجاع الكتابات اللي ضاعت قبل ما IndexedDB يأكدها (راجع سجل الكتابة الاحتياطي فوق).
      if (walBoot.size) {
        const replay = [];
        walBoot.forEach((e, key) => {
          const row = rows.find(r => r && r.key === key);
          if ((Number(e.t) || 0) > (row && Number(row.at) || 0)) replay.push([key, e]);
        });
        try {
          if (replay.length) {
            const rdb = await open();
            await new Promise((resolve, reject) => {
              const tx = rdb.transaction([KV_STORE], "readwrite"), st = tx.objectStore(KV_STORE);
              replay.forEach(([key, e]) => {
                if (e.r) { st.delete(key); storageCache.delete(key); }
                else { st.put({ key, value: String(e.v), at: Number(e.t) || Date.now() }); storageCache.set(key, String(e.v)); storageAt.set(key, Number(e.t) || nextStamp()); }
              });
              tx.oncomplete = () => resolve(true);
              tx.onerror = () => reject(tx.error || new Error("تعذر استرجاع الكتابات المعلقة"));
              tx.onabort = () => reject(tx.error || new Error("أُلغي استرجاع الكتابات المعلقة"));
            });
            console.warn("[WFStorage] اتسترجعت كتابات ضاعت قبل التأكيد:", replay.map(x => x[0]).join(", "));
          }
          walBoot.forEach((e, key) => {
            try {
              const cur = JSON.parse(window.localStorage.getItem(WAL_PREFIX + key) || "null");
              if (cur && cur.t === e.t) window.localStorage.removeItem(WAL_PREFIX + key);
            } catch (_) {}
          });
        } catch (error) { console.warn("[WFStorage] تعذر استرجاع سجل الكتابة الاحتياطي؛ تم الإبقاء عليه", error); }
      }
      let legacySourceCleared = !!(migrationMarker && migrationMarker.legacySourceCleared === true);
      if (!legacySourceCleared) {
        try {
          window.localStorage.clear();
          legacySourceCleared = true;
          const db = await open();
          await new Promise((resolve, reject) => {
            const tx = db.transaction([META], "readwrite"), meta = tx.objectStore(META), req = meta.get(KV_MIGRATION_KEY);
            req.onsuccess = () => { const marker = req.result || { key: KV_MIGRATION_KEY, at: Date.now(), count: 0 }; marker.legacySourceCleared = true; meta.put(marker); };
            req.onerror = () => reject(req.error || new Error("تعذر تحديث حالة الترحيل"));
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error || new Error("تعذر حفظ حالة الترحيل"));
          });
        } catch (error) {
          legacySourceCleared = false;
          console.warn("[WFStorage] اكتمل الاستيراد لكن تعذر تأكيد مسح التخزين القديم", error);
        }
      }
      window.WFStorageStatus = { ready: true, migrationComplete: true, importedLegacy: imported, legacySourceCleared, keys: storageCache.size };
      return true;
    }).catch(error => {
      // لا نمسح المصدر القديم عند الفشل؛ يحتفظ الكاش بقيمه ويمكن قراءة القديم.
      legacy.forEach(([key, value]) => { if (!storageCache.has(key)) storageCache.set(key, value); });
      window.WFStorageStatus = { ready: false, fallback: "legacy-read-only", error };
      console.warn("[WFStorage] تهيئة IndexedDB لم تنجح؛ أبقينا البيانات القديمة دون مسح", error);
      return false;
    });
    return storageReady;
  }
  const WFStorage = {
    get length() { return storageCache.size; },
    key(index) { return Array.from(storageCache.keys())[Number(index)] ?? null; },
    getItem(key) { key = String(key); return storageCache.has(key) ? storageCache.get(key) : null; },
    setItem(key, value) {
      key = String(key); value = String(value);
      const stamp = nextStamp(); storageAt.set(key, stamp);
      storageCache.set(key, value); if (STORES[key]) dropSnapshot(key); notifyStorage(key, value, false);
      if (key === "wf_theme") syncThemeCookie(value);
      const seq = walPut(key, value, false);
      persistStorageMutation(key, value, false, stamp).then(() => { walDone(key, seq); if (value.length > BIG_MSG) { try { storageChannel && storageChannel.postMessage({ key, big: 1, at: stamp }); } catch (_) {} } }).catch(() => {});
    },
    removeItem(key) {
      key = String(key); storageCache.delete(key); storageAt.set(key, nextStamp()); if (STORES[key]) dropSnapshot(key); notifyStorage(key, null, true);
      if (key === "wf_theme") syncThemeCookie(null);
      const seq = walPut(key, null, true);
      persistStorageMutation(key, null, true).then(() => walDone(key, seq)).catch(() => {});
    },
    clear() {
      const keys = Array.from(storageCache.keys()); storageCache.clear();
      keys.forEach(key => notifyStorage(key, null, true));
      storageTail = storageTail.then(() => storageReady).then(ok => {
        if (!ok) { window.localStorage.clear(); return true; }
        return open().then(db => new Promise((resolve, reject) => {
          const tx = db.transaction([KV_STORE], "readwrite"); tx.objectStore(KV_STORE).clear();
          tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error || new Error("تعذر مسح مخزن القيم"));
        }));
      }).catch(error => { console.error("[WFStorage] clear failed", error); try { window.localStorage.clear(); } catch (_) {} return false; });
    },
    stamp(key) { return storageAt.get(String(key)) || 0; },
    subscribe(fn) { if (typeof fn !== "function") return () => {}; storageListeners.add(fn); return () => storageListeners.delete(fn); },
    flush() { return Promise.all([storageReady, storageTail, writeTail]).then(results => { if (results[0] === false || (window.WFStorageStatus && window.WFStorageStatus.writeError)) throw new Error("تعذر تأكيد الحفظ في IndexedDB"); return true; }); },
    exportAll() { return Object.fromEntries(storageCache); },
    isReady() { return !!(window.WFStorageStatus && window.WFStorageStatus.ready); }
  };
  window.WFStorage = WFStorage;
  window.WFStorageReady = initializeStorage();
  // كوكي صغير (wf_theme) نسخة متزامنة من اختيار المظهر: السكريبت اللي في <head>
  // بيقراه قبل أول رسم للصفحة فمفيش وميض للوضع الليلي لما اختيارك "فاتح" (أو العكس).
  function syncThemeCookie(value) {
    try {
      const secure = window.location && window.location.protocol === "https:" ? ";Secure" : "";
      if (value === "dark" || value === "light") window.document.cookie = "wf_theme=" + value + ";path=/;max-age=31536000;SameSite=Lax" + secure;
      else window.document.cookie = "wf_theme=;path=/;max-age=0;SameSite=Lax" + secure;
    } catch (_) {}
  }
  window.WFStorageReady.then(() => {
    try {
      const savedTheme = WFStorage.getItem("wf_theme");
      const systemDark = !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const dark = savedTheme === "dark" || (savedTheme !== "light" && systemDark);
      if (dark) window.document.documentElement.setAttribute("data-theme", "dark");
      else window.document.documentElement.removeAttribute("data-theme");
      window.document.documentElement.style.colorScheme = dark ? "dark" : "light";
      syncThemeCookie(savedTheme);
    } catch (_) {}
    try { window.document.documentElement.removeAttribute("data-wf-storage-pending"); } catch (_) {}
    // المتصفح ممكن يمسح IndexedDB لو المساحة قلّت إلا لو التخزين "دائم": بنطلبه هنا (مرة لكل تحميل)
    // ونسجّل النتيجة في WFStorageStatus.persistent للتشخيص.
    try {
      const sm = window.navigator && window.navigator.storage;
      if (sm && sm.persisted) sm.persisted().then(p => p || (sm.persist ? sm.persist() : false))
        .then(p => { window.WFStorageStatus = Object.assign({}, window.WFStorageStatus, { persistent: !!p }); }).catch(() => {});
    } catch (_) {}
  });
  // صفّ تشغيل واجهات DOMContentLoaded إلى ما بعد تحميل كاش IndexedDB؛
  // واجهات التطبيق المتزامنة لا ترى مجموعة فارغة أثناء ترطيب قاعدة قائمة.
  try {
    const nativeDocumentAdd = window.document.addEventListener.bind(window.document);
    window.document.addEventListener = function (type, listener, options) {
      if (type === "DOMContentLoaded" && typeof listener === "function" && window.document.readyState !== "complete") {
        return nativeDocumentAdd(type, function (event) {
          window.WFStorageReady.then(() => listener.call(window.document, event));
        }, options);
      }
      return nativeDocumentAdd(type, listener, options);
    };
  } catch (_) {}

  function enqueueWrite(work) {
    const current = writeTail.then(work).then(v => { storageRecovered(); return v; });
    writeTail = current.catch(error => { console.error("[WorkshopDB] فشل حفظ IndexedDB:", error); storageFailure(error); });
    return current;
  }
  /* الحفظ: النص الكامل للقسم بيتكتب مرة واحدة في keyValues (من WFStorage.setItem اللي كل المسارات بتناديه قبل هنا).
     هنا بنحدّث نسخة القراءة بس ونستنى تأكيد الكتابة. (قبل كده كل حفظ كان بيحوّل كل سجل لنص ويحسب بصمة ويكتب نسخة تانية
     كاملة في مخازن السجلات + نسخة تالتة من النص — ثواني مع آلاف الأوامر.) */
  function writeCollections(values) {
    const entries = Object.entries(values || {}).filter(([key]) => STORES[key]);
    if (!entries.length) return Promise.resolve(true);
    const expectedVersions = new Map(entries.map(([key]) => [key, snapshotVersions.get(key) || 0]));
    entries.forEach(([key, value]) => {
      if ((snapshotVersions.get(key) || 0) !== expectedVersions.get(key)) return;
      if (!storageCache.has(key)) { const text = JSON.stringify(validRecords(value)), st = nextStamp(); storageAt.set(key, st); storageCache.set(key, text); persistStorageMutation(key, text, false, st); }
      setSnapshot(key, value);
    });
    return enqueueWrite(async () => {
      if (!await window.WFStorageReady) throw new Error("WFStorage غير جاهز");
      await kvFlush();
      return true;
    });
  }
  function readCollection(key) {
    if (!STORES[key]) return Promise.reject(new Error("مجموعة غير مدعومة: " + key));
    return window.WFStorageReady.then(() => { const snap = getSnapshot(key); return snap ? snap.records.map(r => ({ ...r })) : []; });
  }
  function mirrorLegacy(values, expectedVersions) {
    Object.entries(values || {}).forEach(([key, records]) => {
      if (!STORES[key]) return;
      if (expectedVersions && (snapshotVersions.get(key) || 0) !== expectedVersions.get(key) + 1) return;
      const serialized = JSON.stringify(validRecords(records)); storageCache.set(key, serialized); notifyStorage(key, serialized, false, false, true);
    });
  }
  function getById(key, id) {
    return readCollection(key).then(rows => rows.find(r => String(r.id) === String(id)) || null);
  }
  function queryIndex(key, indexName, value) {
    if (!STORES[key] || !STORES[key].indexes.some(x => x[0] === indexName)) return Promise.reject(new Error("فهرس غير مدعوم"));
    const field = STORES[key].indexes.find(x => x[0] === indexName)[1];
    return readCollection(key).then(rows => rows.filter(r => r[field] === value));
  }
  function initialize(keys) {
    if (initializePromise) return initializePromise;
    initializePromise = window.WFStorageReady.then(ok => {
      if (!ok) throw new Error("WFStorage غير جاهز");
      // تنظيف مرة واحدة: مخازن السجلات القديمة (نسخة مكررة محدش بيقراها) بتتفضّى عشان توفّر مساحة الجهاز
      setTimeout(retireRecordStores, 4000);
      return true;
    });
    return initializePromise;
  }
  const RETIRED_KEY = "recordStoresRetiredV1";
  function retireRecordStores() {
    open().then(db => new Promise(resolve => {
      const names = Object.keys(STORES).map(k => STORES[k].name).filter(n => db.objectStoreNames.contains(n));
      const tx = db.transaction(names.concat([META]), "readwrite"), meta = tx.objectStore(META), mark = meta.get(RETIRED_KEY);
      mark.onsuccess = () => {
        if (mark.result) return;
        names.forEach(n => tx.objectStore(n).clear());
        Object.keys(STORES).forEach(k => meta.delete(k));
        meta.put({ key: RETIRED_KEY, at: Date.now() });
      };
      tx.oncomplete = () => resolve(true); tx.onerror = () => resolve(false); tx.onabort = () => resolve(false);
    })).catch(() => {});
  }
  function replace(key, records) {
    if (!STORES[key]) return Promise.reject(new Error("مجموعة غير مدعومة: " + key));
    const recs = validRecords(records);
    WFStorage.setItem(key, JSON.stringify(recs));
    return writeCollections({ [key]: recs }).then(() => WFStorage.flush());
  }
  /* معاملة على أكتر من قسم: نسخة عمل من البيانات الحالية ← callback متزامن ← حفظ كل الأقسام مرة واحدة */
  function transaction(keys, callback) {
    const unique = Array.from(new Set((keys || []).filter(key => STORES[key])));
    if (!unique.length || typeof callback !== "function") return Promise.reject(new Error("معاملة غير صالحة"));
    return enqueueWrite(async () => {
      if (!await window.WFStorageReady) throw new Error("WFStorage غير جاهز");
      const draft = {};
      unique.forEach(k => { const snap = getSnapshot(k); draft[k] = snap ? snap.records.map(r => ({ ...r })) : []; });
      const result = callback(draft);
      if (result && typeof result.then === "function") throw new Error("WorkshopDB.transaction callback must be synchronous");
      unique.forEach(k => { const recs = validRecords(draft[k]); WFStorage.setItem(k, JSON.stringify(recs)); setSnapshot(k, recs); });
      await kvFlush();
      return result;
    });
  }
  function flush() { return Promise.all([writeTail, WFStorage.flush()]).then(() => true); }

  window.WorkshopDB = {
    name: DB_NAME, version: DB_VERSION, stores: STORES,
    open, initialize, readCollection, getById, queryIndex, replace, replaceMany: writeCollections, transaction, flush, getSnapshot, setSnapshot,
    isAvailable: () => !!window.indexedDB
  };
  window.WorkshopDBReady = initialize().then(() => true).catch(error => {
    window.WorkshopDBStatus = { ready: false, fallback: "legacy-read-only", error };
    console.warn("[WorkshopDB] تعذرت تهيئة IndexedDB؛ لم يتم حذف نسخة البيانات القديمة", error);
    return false;
  });
})(window);
// تسمح للسكربتات التقليدية باستخدام الاسم كمتغير عام، من دون الرجوع إلى localStorage.
var WFStorage = window.WFStorage;
