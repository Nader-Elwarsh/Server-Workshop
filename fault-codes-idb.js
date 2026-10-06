/* =========================================================
   أكواد الأعطال — طبقة IndexedDB تجريبية آمنة
   ---------------------------------------------------------
   IndexedDB هو المصدر المحلي الأساسي لهذه المجموعة فقط.
   localStorage يظل نسخة توافق ومصدر مزامنة Firebase مؤقتًا.
   إذا تعذر IndexedDB يستمر النظام بالعمل من localStorage بدون فقد بيانات.
   ========================================================= */
(function (window) {
  "use strict";
  const DB_NAME = "workshopRecordsDB";
  const DB_VERSION = 1;
  const STORE = "faultCodes";
  const META = "meta";
  const READY_KEY = "faultCodesSeeded";
  const LOCAL_KEY = "wf_fault_codes";

  function open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("indexedDB غير متاح"));
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("تعذر فتح IndexedDB"));
    });
  }

  function localRecords() {
    try {
      const value = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function transaction(mode, work) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, META], mode);
      let result;
      try { result = work(tx.objectStore(STORE), tx.objectStore(META)); }
      catch (e) { reject(e); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("فشلت معاملة IndexedDB"));
      tx.onabort = () => reject(tx.error || new Error("أُلغيت معاملة IndexedDB"));
    }));
  }

  function all() {
    return transaction("readonly", store => new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    }));
  }

  function replace(records) {
    const safe = Array.isArray(records) ? records.filter(x => x && x.id) : [];
    return transaction("readwrite", (store, meta) => {
      store.clear();
      safe.forEach(record => store.put(record));
      meta.put({ at: Date.now(), count: safe.length }, READY_KEY);
    }).then(() => true).catch(error => {
      console.warn("[FaultCodesIDB] تعذر حفظ النسخة المحلية الجديدة:", error);
      return false;
    });
  }

  async function hydrate() {
    try {
      const records = await all();
      const local = localRecords();
      // أول تشغيل: ننسخ البيانات القديمة إلى IndexedDB بدون حذف نسخة localStorage.
      if (!records.length && local.length) {
        await replace(local);
        return local;
      }
      // بعد التهيئة: IndexedDB هي المصدر المحلي لهذه المجموعة، وlocalStorage ظل توافق.
      if (records.length) {
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify(records));
        return records;
      }
      // لا توجد بيانات في أي مكان؛ نعلّم المخزن أنه مهيأ.
      await replace([]);
      return [];
    } catch (error) {
      console.warn("[FaultCodesIDB] fallback إلى localStorage:", error);
      return localRecords();
    }
  }

  window.FaultCodesIDB = {
    hydrate,
    replace,
    all,
    isAvailable: () => !!window.indexedDB
  };
})(window);
