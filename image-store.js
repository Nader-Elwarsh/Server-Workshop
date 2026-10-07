/* =========================================================
   الورشة الفنية — مخزن الصور (image-store.js)
   =========================================================
   ليه الملف ده موجود:
   قبل كده كانت صورة الجهاز/القطعة بتتحفظ كـ base64 (نص طويل جدًا)
   جوه نفس سجل الجهاز/القطعة في WFStorage. المشكلة إن WFStorage
   محدود بحوالي 5-10MB لكل موقع، وbase64 بيكبّر حجم الصورة حوالي 33%،
   فمع زيادة عدد الأجهزة/القطع اللي ليها صور، النظام ممكن يوصل للحد
   الأقصى فجأة ويفشل الحفظ من غير تحذير واضح للمستخدم.

   الحل: الصور بقت بتتخزن في IndexedDB (زي notif-shared.js بالظبط بس
   بقاعدة بيانات منفصلة)، وسجل الجهاز/القطعة في WFStorage بقى بس
   بيحمل "مرجع" (id قصير) بدل الصورة نفسها.

   التوافق مع البيانات القديمة: أي سجل قديم لسه فيه الصورة كاملة كـ
   "data:image/..." بيفضل شغال زي ما هو من غير أي كسر — resolvePhotoSrc
   بترجعه زي ما هو لو لقته "data:"، أو تجيبه من IndexedDB لو كان مرجع.
   الترحيل الفعلي (نقل الصور القديمة لـ IndexedDB) بيحصل مرة واحدة في
   migrations.js.
   ========================================================= */
(function (window) {
  "use strict";

  const IMG_DB_NAME = "workshopImagesDB";
  const IMG_STORE = "images";

  function imgDbOpen() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("indexedDB غير متاح")); return; }
      let req = indexedDB.open(IMG_DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IMG_STORE)) req.result.createObjectStore(IMG_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function makeRefId() {
    return window.id ? window.id() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
  }

  // بيحفظ dataURL في IndexedDB ويرجّع الـ ref (id قصير) اللي يتحط في السجل بدل الصورة.
  // لو existingRef اتبعت، بيستخدمه (تحديث نفس الصورة) بدل إنشاء واحدة جديدة يتيمة.
  async function imageStoreSaveLocal(dataURL, existingRef) {
    if (!dataURL) return "";
    let key = (existingRef && !String(existingRef).startsWith("data:")) ? existingRef : makeRefId();
    let db = await imgDbOpen();
    await new Promise((resolve, reject) => {
      let tx = db.transaction(IMG_STORE, "readwrite");
      tx.objectStore(IMG_STORE).put(dataURL, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    return key;
  }


  // رفع أي ملف (صورة/صوت) على Cloudinary بنفس إعداد الموقع القديم. بترجع الرابط أو "" لو فشل.
  // الحد المحلي ليس بديلًا عن ضبط Cloudinary preset، لكنه يمنع تعليق الواجهة
  // ورفع ملفات ضخمة بالخطأ عند العمل من الهاتف.
  const MAX_REMOTE_UPLOAD_BYTES = 12 * 1024 * 1024;
  async function imageStoreUploadRemote(dataUrl) {
    if (!String(dataUrl || "").startsWith("data:") || navigator.onLine === false) return "";
    try {
      const blob = await (await fetch(dataUrl)).blob();
      if (blob.size > MAX_REMOTE_UPLOAD_BYTES) return "";
      const fd = new FormData(); fd.append("file", blob); fd.append("upload_preset", "workshop_unsigned");
      const kind = String(dataUrl).startsWith("data:image/") ? "image" : "auto";
      const r = await fetch("https://api.cloudinary.com/v1_1/ogmpqgu4/" + kind + "/upload", { method: "POST", body: fd });
      if (!r.ok) return "";
      const j = await r.json();
      return j.secure_url || "";
    } catch (e) { return ""; }
  }

  // لو فيه نت: ارفع فورًا. لو مفيش: خزّن محليًا، ومزامنة السحابة (firebase-sync.js) هترفعه أول ما النت يرجع.
  async function imageStoreSave(dataUrl, oldRef) {
    const url = await imageStoreUploadRemote(dataUrl);
    return url || imageStoreSaveLocal(dataUrl, oldRef);
  }

  // كل المراجع المحلية الموجودة في IndexedDB
  async function imageStoreKeys() {
    try {
      let db = await imgDbOpen();
      return await new Promise((resolve, reject) => {
        let rq = db.transaction(IMG_STORE, "readonly").objectStore(IMG_STORE).getAllKeys();
        rq.onsuccess = () => resolve(rq.result || []);
        rq.onerror = () => reject(rq.error);
      });
    } catch (e) { return []; }
  }

  async function imageStoreGet(refId) {
    if (!refId) return "";
    if (/^https?:/.test(String(refId))) return refId;
    try {
      let db = await imgDbOpen();
      return await new Promise((resolve, reject) => {
        let tx = db.transaction(IMG_STORE, "readonly");
        let rq = tx.objectStore(IMG_STORE).get(refId);
        rq.onsuccess = () => resolve(rq.result || "");
        rq.onerror = () => reject(rq.error);
      });
    } catch (e) { return ""; }
  }

  async function imageStoreDelete(refId) {
    if (!refId || /^(data:|https?:)/.test(String(refId))) return;
    try {
      let db = await imgDbOpen();
      await new Promise((resolve, reject) => {
        let tx = db.transaction(IMG_STORE, "readwrite");
        tx.objectStore(IMG_STORE).delete(refId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }

  // لأغراض النسخة الاحتياطية: كل الصور كـ {ref: dataURL}
  async function imageStoreExportAll() {
    try {
      let db = await imgDbOpen();
      return await new Promise((resolve, reject) => {
        let tx = db.transaction(IMG_STORE, "readonly");
        let store = tx.objectStore(IMG_STORE);
        let out = {};
        let cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          let cursor = e.target.result;
          if (cursor) { out[cursor.key] = cursor.value; cursor.continue(); }
          else resolve(out);
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });
    } catch (e) {
      console.error("[ImageStore] تعذر تصدير الصور من IndexedDB:", e);
      throw e;
    }
  }

  // لاسترجاع نسخة احتياطية: يحط كل الصور من ملف الباك أب في IndexedDB زي ما هي.
  async function imageStoreImportAll(map) {
    if (!map || typeof map !== "object") return;
    try {
      let db = await imgDbOpen();
      await new Promise((resolve, reject) => {
        let tx = db.transaction(IMG_STORE, "readwrite");
        let store = tx.objectStore(IMG_STORE);
        Object.entries(map).forEach(([k, v]) => store.put(v, k));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { return false; }
    return true;
  }

  async function imageStoreClearAll() {
    try {
      let db = await imgDbOpen();
      await new Promise((resolve, reject) => {
        let tx = db.transaction(IMG_STORE, "readwrite");
        tx.objectStore(IMG_STORE).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { return false; }
    return true;
  }

  // بيرجّع src صالح لـ <img> من قيمة الحقل "photo" أيًا كان شكلها:
  // - سجل قديم: نص "data:image/..." طويل → يترجع زي ما هو.
  // - سجل جديد: مرجع قصير → يترجع من IndexedDB (أو "" لو مش موجود).
  async function resolvePhotoSrc(refOrDataUrl) {
    if (!refOrDataUrl) return "";
    if (/^(data:|https?:)/.test(String(refOrDataUrl))) return refOrDataUrl;
    return await imageStoreGet(refOrDataUrl);
  }

  window.ImageStore = {
    save: imageStoreSave,
    uploadRemote: imageStoreUploadRemote,
    keys: imageStoreKeys,
    get: imageStoreGet,
    delete: imageStoreDelete,
    exportAll: imageStoreExportAll,
    importAll: imageStoreImportAll,
    clearAll: imageStoreClearAll,
    resolveSrc: resolvePhotoSrc
  };
})(window);
