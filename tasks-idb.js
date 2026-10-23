/* =========================================================
   المهام — طبقة IndexedDB تجريبية آمنة
   IndexedDB مصدر محلي للمهام، وWFStorage نسخة توافق مؤقتة
   حتى تستمر مزامنة Firebase الحالية بلا تغيير.
   ========================================================= */
(function (window) {
  "use strict";
  const DB_NAME = "workshopRecordsDB";
  const DB_VERSION = 1;
  const STORE = "tasks";
  const META = "meta";
  const READY_KEY = "tasksSeeded";
  const LOCAL_KEY = "wf_tasks";

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
      const value = JSON.parse(window.WFStorage.getItem(LOCAL_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }
  function tx(mode, work) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction([STORE, META], mode);
      let result;
      try { result = work(t.objectStore(STORE), t.objectStore(META)); }
      catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error || new Error("فشلت معاملة IndexedDB"));
      t.onabort = () => reject(t.error || new Error("أُلغيت معاملة IndexedDB"));
    }));
  }
  function all() {
    return tx("readonly", store => new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    }));
  }
  function replace(records) {
    const safe = Array.isArray(records) ? records.filter(x => x && x.id) : [];
    return tx("readwrite", (store, meta) => {
      store.clear();
      safe.forEach(record => store.put(record));
      meta.put({ at: Date.now(), count: safe.length }, READY_KEY);
    }).then(() => true).catch(error => {
      console.warn("[TasksIDB] تعذر حفظ النسخة المحلية الجديدة:", error);
      return false;
    });
  }
  /* WFStorage هو المصدر (المزامنة وكل الحفظ بيكتبوا فيه). قبل كده كل فتح صفحة كان بينسخ نسخة IndexedDB دي فوقه —
     فأي تعديل جه من جهاز تاني بالمزامنة (أو اتحفظ من غير المسار ده) كان بيرجع لقديمه، وكمان كتابة كبيرة مع كل صفحة.
     دلوقتي: لو WFStorage فيه القسم → هو الصح، والنسخة هنا بتتحدّث في الخلفية. لو مش فيه (اتمسح؟) → نرجّعه من هنا. */
  async function hydrate() {
    try {
      const raw = window.WFStorage && window.WFStorage.getItem(LOCAL_KEY);
      if (raw !== null && raw !== undefined) {
        const S = window.WFStorage, sig = S.stamp ? String(S.stamp(LOCAL_KEY)) : "", SIGK = LOCAL_KEY + "_idb_sig";
        if (!sig || sig === "0" || S.getItem(SIGK) !== sig) setTimeout(() => { replace(localRecords()).then(ok => { if (ok && sig && sig !== "0") S.setItem(SIGK, sig); }).catch(() => {}); }, 3000);
        return null;
      }
      const records = await all();
      if (records.length) { window.WFStorage.setItem(LOCAL_KEY, JSON.stringify(records)); return records; }
      return [];
    } catch (error) {
      console.warn("[TasksIDB] fallback إلى WFStorage:", error);
      return localRecords();
    }
  }
  window.TasksIDB = { hydrate, replace, all, isAvailable: () => !!window.indexedDB };
})(window);
