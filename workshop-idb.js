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

  function fingerprint(value) {
    const text = JSON.stringify(value);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + ":" + text.length;
  }
  function validRecords(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(x => x && typeof x === "object" && !Array.isArray(x) && x.id !== undefined && x.id !== null && String(x.id) !== "");
  }
  function setSnapshot(key, records) {
    if (!STORES[key]) return;
    snapshots.set(key, validRecords(records));
    snapshotVersions.set(key, (snapshotVersions.get(key) || 0) + 1);
  }
  function getSnapshot(key) {
    return snapshots.has(key) ? { records: snapshots.get(key), version: snapshotVersions.get(key) || 0 } : null;
  }
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
        if (key != null) entries.push([String(key), source.getItem(key)]);
      }
    } catch (error) { console.warn("[WFStorage] تعذرت قراءة التخزين القديم", error); }
    return entries;
  }
  function notifyStorage(key, value, removed, remote, silentLocal) {
    if (!silentLocal) storageListeners.forEach(fn => { try { fn(key, value, !!removed, !!remote); } catch (error) { console.warn("[WFStorage] storage listener failed", error); } });
    if (!remote) { try { storageChannel && storageChannel.postMessage({ key, value, removed: !!removed }); } catch (_) {} }
  }
  try {
    if (window.BroadcastChannel) {
      storageChannel = new window.BroadcastChannel("wf-indexeddb-kv");
      storageChannel.onmessage = event => {
        const d = event && event.data;
        if (!d || typeof d.key !== "string") return;
        if (d.removed) storageCache.delete(d.key); else storageCache.set(d.key, String(d.value));
        notifyStorage(d.key, d.value, d.removed, true);
      };
    }
  } catch (_) {}
  function persistStorageMutation(key, value, remove) {
    const current = storageTail.then(() => storageReady).then(ok => {
      if (!ok) {
        if (remove) window.localStorage.removeItem(key); else window.localStorage.setItem(key, String(value));
        return true;
      }
      return open().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction([KV_STORE], "readwrite"), store = tx.objectStore(KV_STORE);
        if (remove) store.delete(key); else store.put({ key, value: String(value) });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error("تعذر حفظ قيمة التخزين"));
        tx.onabort = () => reject(tx.error || new Error("أُلغيت كتابة التخزين"));
      }));
    });
    storageTail = current.catch(error => {
      console.error("[WFStorage] تعذر حفظ القيمة في IndexedDB", key, error);
      window.WFStorageStatus = Object.assign({}, window.WFStorageStatus, { writeError: error });
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
      const allReq = store.getAll(), markReq = meta.get(KV_MIGRATION_KEY);
      let rows = [], imported = false, migrationMarker = null;
      allReq.onsuccess = () => { rows = Array.isArray(allReq.result) ? allReq.result : []; };
      markReq.onsuccess = () => {
        migrationMarker = markReq.result || null;
        imported = !migrationMarker;
        if (!imported) return;
        const known = new Set(rows.map(row => row && row.key));
        legacy.forEach(([key, value]) => { if (!known.has(key)) store.put({ key, value: String(value) }); });
        meta.put({ key: KV_MIGRATION_KEY, at: Date.now(), count: legacy.length, legacySourceCleared: false });
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
      rows.forEach(row => { if (row && typeof row.key === "string") storageCache.set(row.key, String(row.value)); });
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
      storageCache.set(key, value); notifyStorage(key, value, false);
      if (key === "wf_theme") syncThemeCookie(value);
      persistStorageMutation(key, value, false).catch(() => {});
    },
    removeItem(key) {
      key = String(key); storageCache.delete(key); notifyStorage(key, null, true);
      if (key === "wf_theme") syncThemeCookie(null);
      persistStorageMutation(key, null, true).catch(() => {});
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
    const current = writeTail.then(work);
    writeTail = current.catch(error => { console.error("[WorkshopDB] فشل حفظ IndexedDB:", error); });
    return current;
  }
  function writeCollections(values) {
    const entries = Object.entries(values || {}).filter(([key]) => STORES[key]);
    if (!entries.length) return Promise.resolve(true);
    const expectedVersions = new Map(entries.map(([key]) => [key, snapshotVersions.get(key) || 0]));
    return enqueueWrite(async () => {
      if (!await window.WFStorageReady) throw new Error("WFStorage غير جاهز");
      const db = await open();
      return new Promise((resolve, reject) => {
        const names = entries.map(([key]) => STORES[key].name).concat([META, KV_STORE]);
        const tx = db.transaction(names, "readwrite"), meta = tx.objectStore(META), kv = tx.objectStore(KV_STORE);
        entries.forEach(([key, value]) => {
          const records = validRecords(value), store = tx.objectStore(STORES[key].name);
          store.clear(); records.forEach(record => store.put(record));
          meta.put({ key, version: 1, count: records.length, fingerprint: fingerprint(records), updatedAt: Date.now() });
          kv.put({ key, value: JSON.stringify(records) });
        });
        tx.oncomplete = () => {
          entries.forEach(([key, value]) => {
            if ((snapshotVersions.get(key) || 0) !== expectedVersions.get(key)) return;
            setSnapshot(key, value);
            const serialized = JSON.stringify(validRecords(value)); storageCache.set(key, serialized); notifyStorage(key, serialized, false, false, true);
          });
          resolve(true);
        };
        tx.onerror = () => reject(tx.error || new Error("فشلت معاملة حفظ البيانات"));
        tx.onabort = () => reject(tx.error || new Error("أُلغيت معاملة حفظ البيانات"));
      });
    });
  }
  function readCollection(key) {
    if (!STORES[key]) return Promise.reject(new Error("مجموعة غير مدعومة: " + key));
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORES[key].name, "readonly"), request = tx.objectStore(STORES[key].name).getAll();
      request.onsuccess = () => resolve(validRecords(request.result));
      request.onerror = () => reject(request.error || new Error("تعذرت قراءة البيانات"));
    }));
  }
  function mirrorLegacy(values, expectedVersions) {
    Object.entries(values || {}).forEach(([key, records]) => {
      if (!STORES[key]) return;
      if (expectedVersions && (snapshotVersions.get(key) || 0) !== expectedVersions.get(key) + 1) return;
      const serialized = JSON.stringify(validRecords(records)); storageCache.set(key, serialized); notifyStorage(key, serialized, false, false, true);
    });
  }
  function getById(key, id) {
    if (!STORES[key]) return Promise.reject(new Error("مجموعة غير مدعومة: " + key));
    return open().then(db => new Promise((resolve, reject) => {
      const request = db.transaction(STORES[key].name, "readonly").objectStore(STORES[key].name).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("تعذرت قراءة السجل"));
    }));
  }
  function queryIndex(key, indexName, value) {
    if (!STORES[key] || !STORES[key].indexes.some(x => x[0] === indexName)) return Promise.reject(new Error("فهرس غير مدعوم"));
    return open().then(db => new Promise((resolve, reject) => {
      const store = db.transaction(STORES[key].name, "readonly").objectStore(STORES[key].name);
      const request = store.index(indexName).getAll(value);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("تعذر البحث في الفهرس"));
    }));
  }
  function initialize(keys) {
    if (initializePromise) return initializePromise;
    const selected = (keys || Object.keys(STORES)).filter(key => STORES[key]);
    if (!selected.length) return Promise.resolve(true);
    initializePromise = window.WFStorageReady.then(ok => {
      if (!ok) throw new Error("WFStorage غير جاهز");
      return open();
    }).then(db => new Promise((resolve, reject) => {
      const names = selected.map(key => STORES[key].name).concat(META);
      const tx = db.transaction(names, "readwrite"), meta = tx.objectStore(META);
      selected.forEach(key => {
        let records = [];
        try { records = validRecords(JSON.parse(WFStorage.getItem(key) || "[]")); } catch (_) {}
        const store = tx.objectStore(STORES[key].name), getMeta = meta.get(key);
        getMeta.onsuccess = () => {
          const prior = getMeta.result;
          if (!prior || prior.fingerprint !== fingerprint(records)) {
            store.clear(); records.forEach(record => store.put(record));
            meta.put({ key, version: 1, count: records.length, fingerprint: fingerprint(records), updatedAt: Date.now(), migratedFrom: "keyValues" });
          }
        };
        getMeta.onerror = () => { try { tx.abort(); } catch (_) {} };
      });
      tx.oncomplete = () => Promise.all(selected.map(key => readCollection(key).then(records => setSnapshot(key, records))))
        .then(() => resolve(true), reject);
      tx.onerror = () => reject(tx.error || new Error("فشل تهيئة قاعدة البيانات"));
      tx.onabort = () => reject(tx.error || new Error("أُلغيت تهيئة قاعدة البيانات"));
    }));
    return initializePromise;
  }
  function replace(key, records) {
    if (!STORES[key]) return Promise.reject(new Error("مجموعة غير مدعومة: " + key));
    const values = { [key]: validRecords(records) }, expectedVersions = new Map([[key, snapshotVersions.get(key) || 0]]);
    return writeCollections(values).then(() => { mirrorLegacy(values, expectedVersions); return WFStorage.flush(); });
  }
  function transaction(keys, callback) {
    const unique = Array.from(new Set((keys || []).filter(key => STORES[key])));
    if (!unique.length || typeof callback !== "function") return Promise.reject(new Error("معاملة غير صالحة"));
    const expectedVersions = new Map(unique.map(key => [key, snapshotVersions.get(key) || 0]));
    return enqueueWrite(async () => {
      if (!await window.WFStorageReady) throw new Error("WFStorage غير جاهز");
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(unique.map(key => STORES[key].name).concat([META, KV_STORE]), "readwrite");
        const meta = tx.objectStore(META), kv = tx.objectStore(KV_STORE), draft = {}, pending = new Set(unique);
        let result, callbackError = null;
        unique.forEach(key => {
          const request = tx.objectStore(STORES[key].name).getAll();
          request.onsuccess = () => {
            draft[key] = validRecords(request.result).map(row => ({ ...row })); pending.delete(key);
            if (pending.size) return;
            try {
              result = callback(draft);
              if (result && typeof result.then === "function") throw new Error("WorkshopDB.transaction callback must be synchronous");
              unique.forEach(k => {
                const records = validRecords(draft[k]), store = tx.objectStore(STORES[k].name);
                store.clear(); records.forEach(record => store.put(record));
                meta.put({ key: k, version: 1, count: records.length, fingerprint: fingerprint(records), updatedAt: Date.now() });
                kv.put({ key: k, value: JSON.stringify(records) });
              });
            } catch (error) { callbackError = error; try { tx.abort(); } catch (_) {} }
          };
          request.onerror = () => { callbackError = request.error || new Error("تعذرت قراءة مجموعة المعاملة"); try { tx.abort(); } catch (_) {} };
        });
        tx.oncomplete = () => {
          const mirror = {};
          unique.forEach(key => {
            if ((snapshotVersions.get(key) || 0) === expectedVersions.get(key)) { setSnapshot(key, draft[key]); mirror[key] = draft[key]; }
          });
          mirrorLegacy(mirror, expectedVersions);
          // القيم التشغيلية ونسختها في keyValues حُفظتا ذريًا داخل هذه المعاملة.
          // لا ننتظر writeTail هنا لأن هذا المسار نفسه موجود داخله.
          resolve(result);
        };
        tx.onerror = () => reject(callbackError || tx.error || new Error("فشلت معاملة البيانات"));
        tx.onabort = () => reject(callbackError || tx.error || new Error("أُلغيت معاملة البيانات"));
      });
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
