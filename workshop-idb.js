/* طبقة قاعدة البيانات التشغيلية — IndexedDB للعملاء والأجهزة وأوامر الشغل.
   المرحلة الانتقالية: المستودع غير المتزامن هو واجهة القراءة/الكتابة الجديدة،
   وتظل localStorage نسخة توافق مؤقتة للشاشات القديمة وFirebase.
   لا تُحذف البيانات القديمة؛ ويُعاد تشغيل التهيئة بأمان عند كل فتح. */
(function (window) {
  "use strict";

  const DB_NAME = "wfOperationalDB";
  const DB_VERSION = 1;
  const STORES = {
    wf_c: { name: "customers", indexes: [["phone", "phone"], ["portalUid", "portalUid"]] },
    wf_d: { name: "devices", indexes: [["customerId", "customerId"], ["type", "type"]] },
    wf_r: { name: "requests", indexes: [["customerId", "customerId"], ["deviceId", "deviceId"], ["status", "status"], ["createdAt", "createdAt"]] }
  };
  const META = "meta";
  let dbPromise = null;
  let initializePromise = null;
  let writeTail = Promise.resolve();

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
  function localRecords(key) {
    try { return validRecords(JSON.parse(window.localStorage.getItem(key) || "[]")); }
    catch (e) { console.warn("[WorkshopDB] تعذرت قراءة البيانات المحلية", key, e); return []; }
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
  function enqueueWrite(work) {
    const current = writeTail.then(work);
    writeTail = current.catch(error => { console.error("[WorkshopDB] فشل حفظ نسخة IndexedDB:", error); });
    return current;
  }
  function writeCollections(values) {
    const entries = Object.entries(values || {}).filter(([key]) => STORES[key]);
    if (!entries.length) return Promise.resolve(true);
    return enqueueWrite(async () => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const names = entries.map(([key]) => STORES[key].name).concat(META);
        const tx = db.transaction(names, "readwrite");
        const meta = tx.objectStore(META);
        entries.forEach(([key, value]) => {
          const records = validRecords(value), storeName = STORES[key].name, store = tx.objectStore(storeName);
          store.clear();
          records.forEach(record => store.put(record));
          meta.put({ key, version: 1, count: records.length, fingerprint: fingerprint(records), updatedAt: Date.now() });
        });
        tx.oncomplete = () => resolve(true);
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
  function mirrorLegacy(values) {
    Object.entries(values || {}).forEach(([key, records]) => {
      if (!STORES[key]) return;
      try { window.localStorage.setItem(key, JSON.stringify(validRecords(records))); }
      catch (error) { console.warn("[WorkshopDB] تعذر تحديث نسخة localStorage التوافقية؛ IndexedDB محفوظة", key, error); }
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
    initializePromise = open().then(db => new Promise((resolve, reject) => {
      const names = selected.map(key => STORES[key].name).concat(META);
      const tx = db.transaction(names, "readwrite"), meta = tx.objectStore(META);
      selected.forEach(key => {
        const records = localRecords(key), store = tx.objectStore(STORES[key].name);
        const getMeta = meta.get(key);
        getMeta.onsuccess = () => {
          const prior = getMeta.result;
          // المصدر المحلي القديم يظل مرجع التهيئة أو أي تعديل أحدث وصل من
          // واجهة توافق قديمة؛ كل كتابة مكتملة تسجل بصمتها في meta.
          if (!prior || prior.fingerprint !== fingerprint(records)) {
            store.clear(); records.forEach(record => store.put(record));
            meta.put({ key, version: 1, count: records.length, fingerprint: fingerprint(records), updatedAt: Date.now(), migratedFrom: "localStorage" });
          }
        };
        getMeta.onerror = () => { try { tx.abort(); } catch (_) {} };
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("فشل تهيئة قاعدة البيانات"));
      tx.onabort = () => reject(tx.error || new Error("أُلغيت تهيئة قاعدة البيانات"));
    }));
    return initializePromise;
  }
  function replace(key, records) {
    if (!STORES[key]) return Promise.reject(new Error("مجموعة غير مدعومة: " + key));
    const values = { [key]: validRecords(records) };
    return writeCollections(values).then(() => { mirrorLegacy(values); return true; });
  }
  function transaction(keys, callback) {
    // معاملة ذرية متعددة المجموعات: القراءة والتعديل والكتابة داخل IDB tx واحدة.
    const unique = Array.from(new Set((keys || []).filter(key => STORES[key])));
    if (!unique.length || typeof callback !== "function") return Promise.reject(new Error("معاملة غير صالحة"));
    return enqueueWrite(async () => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(unique.map(key => STORES[key].name).concat(META), "readwrite");
        const meta = tx.objectStore(META), draft = {}, pending = new Set(unique);
        let result, callbackError = null;
        unique.forEach(key => {
          const request = tx.objectStore(STORES[key].name).getAll();
          request.onsuccess = () => {
            draft[key] = validRecords(request.result).map(row => ({ ...row }));
            pending.delete(key);
            if (pending.size) return;
            try {
              result = callback(draft);
              if (result && typeof result.then === "function") throw new Error("WorkshopDB.transaction callback must be synchronous");
              unique.forEach(k => {
                const records = validRecords(draft[k]), store = tx.objectStore(STORES[k].name);
                store.clear(); records.forEach(record => store.put(record));
                meta.put({ key: k, version: 1, count: records.length, fingerprint: fingerprint(records), updatedAt: Date.now() });
              });
            } catch (error) { callbackError = error; try { tx.abort(); } catch (_) {} }
          };
          request.onerror = () => { callbackError = request.error || new Error("تعذرت قراءة مجموعة المعاملة"); try { tx.abort(); } catch (_) {} };
        });
        tx.oncomplete = () => { mirrorLegacy(draft); resolve(result); };
        tx.onerror = () => reject(callbackError || tx.error || new Error("فشلت معاملة البيانات"));
        tx.onabort = () => reject(callbackError || tx.error || new Error("أُلغيت معاملة البيانات"));
      });
    });
  }
  function flush() { return writeTail; }

  window.WorkshopDB = {
    name: DB_NAME, version: DB_VERSION, stores: STORES,
    open, initialize, readCollection, getById, queryIndex, replace, replaceMany: writeCollections, transaction, flush,
    isAvailable: () => !!window.indexedDB
  };
  // يسبق هذا التحضير تهيئة Firebase والصفحات التي لا تحمل migrations.js.
  window.WorkshopDBReady = initialize().then(() => true).catch(error => {
    window.WorkshopDBStatus = { ready: false, fallback: "localStorage", error };
    console.warn("[WorkshopDB] تهيئة IndexedDB لم تنجح؛ سيُستخدم مخزن التوافق المحلي", error);
    return false;
  });
})(window);
