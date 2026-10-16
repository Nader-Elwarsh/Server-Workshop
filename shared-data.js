var WFStorage = window.WFStorage;
/* =========================================================
   الورشة الفنية — طبقة البيانات المشتركة (shared-data.js)
   =========================================================
   ليه الملف ده موجود:
   قبل كده كانت نفس الدوال (قراءة/كتابة WFStorage، esc، id،
   أسماء العملاء/الأجهزة، تجميع العنوان...) معرّفة بنفس المنطق
   بالظبط في أكتر من ملف (app.js، workshop-mini-enhancements.js،
   workshop-mini-simple-ui.js). ده كان معناه إن أي تعديل بسيط في
   شكل البيانات لازم يتعمل في 3 أماكن، وسهل جدًا تتنسى واحد منهم.

   من دلوقتي: الملف ده هو المصدر الوحيد لكل ده. أي ملف تاني
   بيستخدم K / get / put / arr / esc / id / settings / customerName /
   deviceName / addressText / addresses / duplicateCustomerByPhone
   بيستخدم النسخة هنا بس. لازم يتحمّل في كل صفحة HTML قبل app.js
   وقبل أي ملف تاني بيستخدم الدوال دي.

   ملحوظة: بنية WFStorage والمفاتيح (wf_c, wf_d, ...) لم تتغيّر
   خالص — نفس البيانات الحالية للمستخدم هتفضل شغالة زي ما هي.
   ========================================================= */
(function (window) {
  "use strict";

  const K = { c: "wf_c", d: "wf_d", r: "wf_r", p: "wf_p", s: "wf_s", m: "wf_m", e: "wf_e", tr: "wf_tr", tasks: "wf_tasks", wtx: "wf_wallet_tx", fc: "wf_fault_codes", pc: "wf_pending_calls", inv: "wf_inv", trash: "wf_trash", followupLog: "wf_followup_log" };
  const OPERATIONAL_KEYS = new Set([K.c, K.d, K.r, K.p, K.m, K.wtx]);

  const def = {
    centers: ["مطاي", "بني مزار"],
    villages: {
      مطاي: ["مطاي البلد", "أبو عزيز", "بردنوها", "منبال", "أبوان", "إبوان", "حلوة", "سيلة الشرقية", "سيلة الغربية", "عزبة بطرس", "عزبة أبو شحاته"],
      "بني مزار": []
    },
    types: {
      غسالات: ["هاف أوتوماتيك", "فوق أوتوماتيك", "أمامي أوتوماتيك"],
      ثلاجات: ["عادية", "نوفروست", "ديب فريزر"],
      تكييفات: ["سبليت", "شباك"],
      سخانات: ["كهرباء", "غاز"],
      كولديرات: ["كولدير"],
      أجهزة_أخرى: ["عام"]
    },
    brands: ["فريش", "يونيون اير", "تورنيدو", "بيكو", "إل جي", "سامسونج", "شارب", "أريستون", "زانوسي", "ويرلبول", "إنديزيت", "وايت بوينت", "كريازي", "ايديال", "فاجور", "دايو", "هيتاشي", "باناسونيك", "كاريير", "ميديا", "هاير", "جري", "تي سي إل", "توشيبا العربي"],
    partCats: ["ثلاجات وفريزرات", "غسالات", "تكييف", "سخانات", "كهرباء وإلكترونيات", "مواتير", "كمبروسرات", "أخرى"],
    // المحافظ: الأماكن اللي بتتحرك منها الفلوس فعليًا (محفظة شخصية، محافظ موبايل، إنستاباي...).
    // قابلة للإضافة والحذف والتعديل بالكامل من الإعدادات (زي أي قائمة تانية في النظام).
    // (المحافظ الافتراضية دي بتتفرض على أول تشغيل بس؛ للمستخدمين الحاليين
    // اللي عندهم بيانات محفوظة بالفعل، migrate3to4 في migrations.js هي اللي
    // بتضيف فودافون كاش وأورنج كاش بدون ما تمسح أي محفظة موجودة.)
    wallets: ["محفظتي الشخصية", "محفظة فودافون كاش", "محفظة أورنج كاش", "إنستاباي"],
    // تصنيف حركة المحفظة (شخصي / تشغيل / تحصيل عميل...). "تحصيل عميل" مستخدم
    // تلقائيًا لما تُنشأ الحركة من عربون أو تحصيل نهائي لأمر شغل، فيُفضّل عدم
    // حذفه، لكنه قابل لإعادة التسمية زي أي عنصر تاني.
    walletCategories: ["تحصيل عميل", "مصروف شخصي", "مصروف تشغيل", "مشتريات قطع غيار", "سلفة / تحويل", "أخرى"]
  };

  let storageErrorSeq = 0;
  // كاش القراءات المتكررة: للمجموعات الأساسية يتبع إصدار snapshot المحمّل من
  // IndexedDB؛ وباقي المفاتيح تحتفظ بكاش raw WFStorage المعتاد.
  const readCache = new Map();
  let writingThroughDataApi = false;
  function invalidateReadCache(keys) {
    if (!keys) { readCache.clear(); return; }
    for (const k of (Array.isArray(keys) ? keys : [keys])) readCache.delete(k);
  }
  // واجهات القراءة المتزامنة القديمة تستخدم snapshot الذاكرة المحمّل من IDB.
  // WFStorage نسخة توافق لـFirebase والاسترداد، والكتابات القديمة تحدّث
  // الـsnapshot فورًا ثم تحفظه إلى IndexedDB في الخلفية.
  function persistOperational(values) {
    if (!window.WorkshopDB || typeof window.WorkshopDB.replaceMany !== "function") return;
    Object.entries(values || {}).forEach(([key, value]) => {
      if (OPERATIONAL_KEYS.has(key) && typeof window.WorkshopDB.setSnapshot === "function") window.WorkshopDB.setSnapshot(key, value);
    });
    window.WorkshopDB.replaceMany(values).catch(function (error) {
      console.error("[WorkshopData] تعذر تحديث نسخة IndexedDB؛ بيانات التوافق المحلية ما زالت موجودة:", error);
    });
  }
  function hookDirectOperationalStorage() {
    if (!window.WFStorage || typeof window.WFStorage.subscribe !== "function") return;
    window.WFStorage.subscribe(function (key, value, removed, remote) {
      if (writingThroughDataApi || !OPERATIONAL_KEYS.has(String(key))) return;
      try {
        const records = removed ? [] : JSON.parse(String(value));
        if (remote) {
          window.WorkshopDB?.setSnapshot?.(key, records);
          invalidateReadCache(key);
          return;
        }
        persistOperational({ [key]: records });
      } catch (e) { console.warn("[WorkshopData] تجاهل كتابة تخزين غير صالحة في جسر IndexedDB", key, e); }
    });
  }
  hookDirectOperationalStorage();
  function readCached(k, f = []) {
    const snapshot = window.WorkshopDB && window.WorkshopDB.getSnapshot && window.WorkshopDB.getSnapshot(k);
    if (snapshot) {
      const hit = readCache.get(k);
      if (hit && hit.version === snapshot.version) return hit.value;
      readCache.set(k, { version: snapshot.version, value: snapshot.records });
      return snapshot.records;
    }
    let raw = null;
    try { raw = WFStorage.getItem(k); } catch { return f; }
    const hit = readCache.get(k);
    if (hit && hit.raw === raw) return hit.value;
    try {
      const value = raw === null ? f : (JSON.parse(raw) ?? f);
      readCache.set(k, { raw, value });
      return value;
    } catch { return f; }
  }
  function get(k, f = []) {
    const snapshot = window.WorkshopDB && window.WorkshopDB.getSnapshot && window.WorkshopDB.getSnapshot(k);
    if (snapshot) {
      try { return JSON.parse(JSON.stringify(snapshot.records)); } catch (_) { return snapshot.records.map(x => ({ ...x })); }
    }
    try { let x = JSON.parse(WFStorage.getItem(k)); return x ?? f; }
    catch { return f; }
  }
  function put(k, v) {
    try {
      writingThroughDataApi = true;
      try { WFStorage.setItem(k, JSON.stringify(v)); } finally { writingThroughDataApi = false; }
      invalidateReadCache(k);
      persistOperational({ [k]: v });
      if(k===K.tasks){try{window.TasksIDB?.replace(v)}catch(_){/* WFStorage هو fallback */}}
      return true;
    } catch (e) {
      // مساحة التخزين المخصصة للمتصفح امتلأت (أو خاصية التخزين متعطّلة، زي
      // وضع التصفح الخاص في بعض المتصفحات) — من غير هذا الفحص كانت العملية
      // بتفشل بصمت والمستخدم يفتكر إن البيانات اتحفظت وهي فعليًا لأ.
      console.error(`[WorkshopData] فشل حفظ "${k}" في WFStorage:`, e);
      storageErrorSeq++;
      alert("⚠️ لم يتم الحفظ! مساحة التخزين في المتصفح ممتلئة على ما يبدو.\n\nخد نسخة احتياطية فورًا من بيانات موجودة (لو قدرت)، وامسح بيانات قديمة مش محتاجها من ⚙️ الإعدادات، أو فرّغ مساحة على الجهاز.");
      return false;
    }
  }
  function commitStorage(values) {
    const entries = Object.entries(values || {}), previous = {};
    try {
      for (const [k, v] of entries) JSON.stringify(v);
      for (const [k] of entries) previous[k] = WFStorage.getItem(k);
      writingThroughDataApi = true;
      try { for (const [k, v] of entries) WFStorage.setItem(k, JSON.stringify(v)); }
      finally { writingThroughDataApi = false; }
      invalidateReadCache(entries.map(([k]) => k));
      persistOperational(Object.fromEntries(entries));
      const taskEntry=entries.find(([k])=>k===K.tasks);
      if(taskEntry){try{window.TasksIDB?.replace(taskEntry[1])}catch(_){/* WFStorage هو fallback */}}
      return true;
    } catch (e) {
      for (const [k, raw] of Object.entries(previous)) {
        try { if (raw === null) WFStorage.removeItem(k); else WFStorage.setItem(k, raw); } catch (_) {}
      }
      console.error("[WorkshopData] فشل حفظ عملية متعددة المفاتيح:", e);
      storageErrorSeq++;
      alert("⚠️ لم يتم حفظ العملية بالكامل. لم يتم تغيير البيانات، وفرّغ مساحة التخزين ثم حاول مرة أخرى.");
      return false;
    }
  }
  function restoreStorageValues(values) {
    writingThroughDataApi = true;
    for (const [k, v] of Object.entries(values || {})) {
      try { WFStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
    }
    writingThroughDataApi = false;
    invalidateReadCache(Object.keys(values || {}));
    persistOperational(values || {});
  }
  async function commitStorageAsync(values) {
    const entries = Object.entries(values || {});
    const operational = Object.fromEntries(entries.filter(([key]) => OPERATIONAL_KEYS.has(key)));
    if (!Object.keys(operational).length || !window.WorkshopDB || typeof window.WorkshopDB.replaceMany !== "function") return commitStorage(values);
    if (window.WorkshopDBReady) {
      const ready = await window.WorkshopDBReady;
      if (!ready) return commitStorage(values);
    }
    const previous = {};
    try {
      entries.forEach(([key, value]) => JSON.stringify(value));
      entries.forEach(([key]) => { previous[key] = WFStorage.getItem(key); });
      for (const [key, value] of entries) {
        writingThroughDataApi = true;
        try { WFStorage.setItem(key, JSON.stringify(value)); }
        finally { writingThroughDataApi = false; }
      }
      // نفس اللي put بيعمله: نسخة القراءة الفورية بتتحدث دلوقتي (ورقم نسختها بيزيد). من غيرها، لو كتابة سابقة لنفس
      // المجموعة لسه بتخلص في IndexedDB، كانت بتلاقي رقم النسخة زي ما هو فتكتب بياناتها القديمة فوق الحفظ ده،
      // والحفظ ده نفسه بيتخطّى تحديث النسخة → السجل الجديد بيختفي (مثلًا put ثم حفظ أمر في نفس اللحظة).
      if (typeof window.WorkshopDB.setSnapshot === "function") Object.entries(operational).forEach(([key, value]) => window.WorkshopDB.setSnapshot(key, value));
      invalidateReadCache(entries.map(([key]) => key));
      await window.WorkshopDB.replaceMany(operational);
      const taskEntry = entries.find(([key]) => key === K.tasks);
      if (taskEntry) { try { await window.TasksIDB?.replace(taskEntry[1]); } catch (_) {} }
      await window.WFStorage.flush();
      return true;
    } catch (error) {
      writingThroughDataApi = true;
      try {
        for (const [key, raw] of Object.entries(previous)) {
          try { if (raw === null) WFStorage.removeItem(key); else WFStorage.setItem(key, raw); } catch (_) {}
          try { if (OPERATIONAL_KEYS.has(key) && typeof window.WorkshopDB.setSnapshot === "function") window.WorkshopDB.setSnapshot(key, raw === null ? [] : JSON.parse(raw)); } catch (_) {}
        }
      } finally { writingThroughDataApi = false; }
      invalidateReadCache(entries.map(([key]) => key));
      storageErrorSeq++;
      console.error("[WorkshopData] فشل الحفظ غير المتزامن:", error);
      alert("⚠️ لم يتم تأكيد الحفظ في قاعدة البيانات. تم إرجاع نسخة التوافق المحلية قدر الإمكان؛ أعد المحاولة بعد التحقق من مساحة التخزين.");
      return false;
    }
  }
  function putAsync(key, value) { return commitStorageAsync({ [key]: value }); }
  function arr(k) { return get(k, []); }
  function arrCached(k) { return readCached(k, []); }
  function debounce(fn, wait = 120) {
    let timer = null;
    function wrapped(...args) {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn.apply(this, args); }, wait);
    }
    wrapped.cancel = () => { if (timer !== null) clearTimeout(timer); timer = null; };
    return wrapped;
  }
  if (window && typeof window.addEventListener === "function") {
    window.addEventListener("storage", function (event) {
      if (!event || !event.key) return;
      invalidateReadCache(event.key);
    });
  }
  if (window.WFStorage && typeof window.WFStorage.subscribe === "function") {
    window.WFStorage.subscribe(function (key) { invalidateReadCache(key); });
  }
  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  }
  /* escAttr(v) — للاستخدام حصريًا لما نحط نص جوه ('${...}') داخل data-wf-event="click" data-wf-code="" (سترنج
     جافاسكريبت بمزدوجتين خارجيًا وفاصلة واحدة داخليًا). esc() العادية بتحوّل ' لـ
     &#039; وهو ترميز HTML صحيح، لكن المتصفح بيفك ترميز الـ HTML entities في قيمة
     الـ attribute *قبل* ما ينفّذها كجافاسكريبت — يعني &#039; ترجع ' عادية تاني
     قدام الـ JS parser وتقفل السترنج بدري (لو مثلاً اسم مركز أو صنف أو تصنيف فيه
     علامة اقتباس إنجليزي). escAttr() بتعمل الهروب الصح للسياقين مع بعض: تهرّب \\
     و' بطريقة جافاسكريبت (\\\\ و\\') عشان يفضلوا زي ما هما لحد ما الـ JS يشتغل،
     وتهرّب " بطريقة HTML (&quot;) عشان الـ attribute المزدوجة برّه متتقفلش قبل
     وقتها. لازم تتستخدم بدل esc() في أي '${...}' جوه onclick بس، مش في عرض نص
     عادي. */
  function escAttr(v) {
    return String(v ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, "&quot;")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "");
  }
  function id() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }

  /* ---------------------------------------------------------------------
     رقم إصدار شكل البيانات (schema version)، منفصل عن رقم إصدار التطبيق
     (اللي هو حاليًا مجرد رقم في ملف الباك أب). ليه محتاجينه: أي تعديل
     مستقبلي في شكل سجل مخزّن (زي نقل الصور لـ IndexedDB) لازم يتعرف إمتى
     البيانات المحفوظة عند المستخدم "قديمة الشكل" عشان يشغّل خطوة ترحيل
     مرة واحدة بس، بدل ما يخمّن أو يكرر الترحيل كل مرة.
     wf_schema_version مش موجود خالص = بيانات قديمة من قبل ما النظام ده
     يتضاف (نعتبرها إصدار 1 ضمنيًا).
     --------------------------------------------------------------------- */
  const SCHEMA_KEY = "wf_schema_version";
  const CURRENT_SCHEMA_VERSION = 6;
  function getSchemaVersion() {
    let v = parseInt(WFStorage.getItem(SCHEMA_KEY), 10);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }
  function setSchemaVersion(v) { WFStorage.setItem(SCHEMA_KEY, String(v)); }

  /* ---------------------------------------------------------------------
     withRollback: طبقة "شبه Transaction" لعمليات بتلمس أكتر من مفتاح
     WFStorage مع بعض (زي تعديل مخزون القطع + حركاته وقت حفظ أمر شغل).
     قبل كده كل عملية كانت بتعمل backup يدوي بـ JSON.stringify وترجعه لو
     فشلت — نفس الفكرة بالظبط لكن معمّمة في مكان واحد بدل ما تتكرر.
     بتاخد قايمة مفاتيح (من K.*) وفنكشن fn:
       - لو fn رجّعت { ok:false, ... } → كل المفاتيح ترجع لحالتها الأصلية.
       - لو fn رمت استثناء → نفس الشيء، وبعدين الاستثناء يتنقل زي ما هو.
       - غير كده → التعديلات تتثبّت زي ما هي (مفيش أي إرجاع).
     ملحوظة: ده مش transaction حقيقي (مفيش قفل/isolation)، لكنه بيمنع
     نسيان إرجاع أحد المفاتيح المتأثرة لو الكود بعدين اتوسّع وبقى بيلمس
     مفاتيح أكتر من واحد.
     --------------------------------------------------------------------- */
  function withRollback(keys, fn) {
    let snapshot = {};
    keys.forEach(k => { snapshot[k] = get(k, null); });
    const errorBefore = storageErrorSeq;
    try {
      let result = fn();
      if (storageErrorSeq !== errorBefore) result = { ok: false, error: "storage-failed" };
      if (result && result.ok === false) {
        restoreStorageValues(snapshot);
      }
      return result;
    } catch (e) {
      restoreStorageValues(snapshot);
      throw e;
    }
  }
  async function withRollbackAsync(keys, fn) {
    const snapshot = {};
    keys.forEach(key => { snapshot[key] = get(key, null); });
    const errorBefore = storageErrorSeq;
    try {
      let result = await fn();
      if (storageErrorSeq !== errorBefore) result = { ok: false, error: "storage-failed" };
      if (result && result.ok === false) await commitStorageAsync(snapshot);
      return result;
    } catch (error) {
      await commitStorageAsync(snapshot);
      throw error;
    }
  }

  /* الإعدادات بتتقرا آلاف المرات في القوايم (لون عمر كل أمر مثلًا). كانت كل قراءة بتعمل تحليل + تطبيع + تحويل لنص.
     دلوقتي لو النص المحفوظ ماتغيّرش بنرجّع نسخة جديدة من النتيجة المحفوظة (نسخة عشان أي تعديل عليها مايبوّظش الكاش). */
  let settingsMemo = null;
  function settings() {
    let stored0 = null;
    try { stored0 = WFStorage.getItem(K.s); } catch (_) {}
    if (settingsMemo && settingsMemo.raw === stored0) return JSON.parse(settingsMemo.norm);
    const out = settingsCompute();
    try { const now = WFStorage.getItem(K.s); settingsMemo = { raw: now, norm: JSON.stringify(out), ro: null }; } catch (_) { settingsMemo = null; }
    return out;
  }
  // للقراءة بس (من غير نسخ): للحسابات اللي بتتكرر لكل سجل. ممنوع التعديل على الناتج.
  function settingsRO() {
    let raw = null; try { raw = WFStorage.getItem(K.s); } catch (_) {}
    if (!settingsMemo || settingsMemo.raw !== raw) settings();
    if (!settingsMemo) return settings();
    if (!settingsMemo.ro) settingsMemo.ro = JSON.parse(settingsMemo.norm);
    return settingsMemo.ro;
  }
  function settingsCompute() {
    let stored = null;
    try { stored = WFStorage.getItem(K.s); } catch (_) {}
    let s = get(K.s, null); if (!s) s = {};
    let base = JSON.parse(JSON.stringify(def));
    for (const k of Object.keys(base)) {
      if (Array.isArray(base[k])) s[k] = Array.isArray(s[k]) ? s[k] : base[k];
      else if (base[k] && typeof base[k] === "object") s[k] = s[k] && typeof s[k] === "object" ? s[k] : base[k];
    }
    // حالات أمر الشغل وحالات الورشة أصبحت دورة معتمدة وثابتة (راجع
    // WORK_ORDER_LIFECYCLE_APPROVED.md) — مش قوايم قابلة للتعديل من
    // الإعدادات زي قبل، فبتتفرض هنا دايمًا بغض النظر عمّا هو مخزّن.
    s.orderStatuses = ["جديد", "جاري التنفيذ", "مكتمل", "ملغي"];
    s.executionPlaces = s.executionPlaces || ["عند العميل", "الورشة"];
    s.workshopStatuses = ["غير مطلوب", "تم السحب", "تم التسليم"];
    delete s.priorities;
    s.paymentStatuses = s.paymentStatuses || ["غير مكتمل", "تم الدفع بالكامل"];
    s.units = s.units || ["قطعة", "متر", "كيلو", "لتر", "مجموعة"];
    s.addressTypes = s.addressTypes || ["العنوان الأساسي", "العنوان الإضافي"];
    s.orderTags = s.orderTags || [];
    s.orderTagsDisabled = Array.isArray(s.orderTagsDisabled) ? s.orderTagsDisabled : [];
    s.villageGroups = s.villageGroups || {};
    s.expenseCategories = s.expenseCategories || ["وقود ومواصلات", "صيانة عدة وأدوات", "إيجار وفواتير", "أخرى"];
    // تصنيفات فرعية للمصاريف الشخصية (زي تصنيفات مصاريف التشغيل الفرعية بالظبط)،
    // عشان "مصروف شخصي" يبقى قابل للتفصيل هو كمان في إحصائيات الصرف، مش بس "تشغيل".
    s.personalExpenseCategories = s.personalExpenseCategories || ["مواصلات", "أكل وشرب", "متفرقات"];
    // حد أقصى اختياري لبعض الحسابات (زي إنستاباي): بدل ما تتضاف المحفظة دي بكامل
    // رصيدها الحقيقي (اللي ممكن يكون جزء من حساب بنكي شخصي مش عايز يتسجل هنا
    // بالكامل)، الرصيد المعروض والمحسوب في الإجمالي بيتقف عند الرقم ده كحد أقصى.
    // {} = بدون حد أقصى لأي محفظة. قابل للتعديل بالكامل من ⚙️ الإعدادات ← الحسابات.
    s.walletCaps = s.walletCaps && typeof s.walletCaps === "object" && !Array.isArray(s.walletCaps) ? s.walletCaps : {};
    s.routeOrder = Array.isArray(s.routeOrder) ? s.routeOrder : [];
    s.defaultWallet = typeof s.defaultWallet === "string" ? s.defaultWallet : "";
    s.returnWindowDays = Number.isFinite(+s.returnWindowDays) && +s.returnWindowDays > 0 ? +s.returnWindowDays : 7;
    // V11.54: عدد الأيام اللي لو أمر شغل مفتوح (جديد/جاري التنفيذ) قعد من غير
    // ما يتقفل أكتر منه، يتلوّن أحمر في القايمة ويدخل عداد "🔥 يحتاج انتباه"
    // في الداشبورد. المستخدم بيتحكم فيه بنفسه من ⚙️ الإعدادات.
    s.overdueAlertDays = Number.isFinite(+s.overdueAlertDays) && +s.overdueAlertDays > 0 ? +s.overdueAlertDays : 7;
    // ضمان الإصلاح: مدة افتراضية (بالأيام) بتتسجل تلقائيًا على أي أمر بيتقفل،
    // وشروط ضمان (نص حر) قابلة للاستخدام في الإيصال ورسائل واتساب. قابلين
    // للتحكم بالكامل من ⚙️ الإعدادات ← الضمان.
    s.warranty = s.warranty && typeof s.warranty === "object" && !Array.isArray(s.warranty) ? s.warranty : {};
    s.warranty.enabled = s.warranty.enabled !== false;
    s.warranty.days = Number.isFinite(+s.warranty.days) && +s.warranty.days > 0 ? +s.warranty.days : 90;
    s.warranty.terms = typeof s.warranty.terms === "string" ? s.warranty.terms : "";
    // قراءة الإعدادات يجب ألا تتحول إلى كتابة في كل شاشة؛ هذا يقلل استهلاك
    // WFStorage ويمنع ظهور أخطاء امتلاء التخزين أثناء عمليات القراءة فقط.
    const normalized = JSON.stringify(s);
    if (stored !== normalized) put(K.s, s);
    return s;
  }

  // مفتاح موحّد للرقم: أرقام عربية/هندية → لاتينية، شيل أي رموز، +20 / 0020 / 20 → 0
  function phoneKey(v) {
    let d = String(v || "").replace(/[\u0660-\u0669]/g, c => c.charCodeAt(0) - 1632).replace(/[\u06F0-\u06F9]/g, c => c.charCodeAt(0) - 1776).replace(/\D/g, "");
    if (d.startsWith("0020")) d = d.slice(4);
    if (d.length === 12 && d.startsWith("20")) d = "0" + d.slice(2);
    if (d.length === 10 && d[0] === "1") d = "0" + d;
    return d.length >= 7 ? d : "";
  }
  function duplicateCustomerByPhone(phone, excludeId) {
    let normalized = phoneKey(phone);
    if (!normalized) return null;
    return arr(K.c).find(c => String(c.id) !== String(excludeId || "") && phoneKey(c.phone) === normalized) || null;
  }
  // مجموعات العملاء اللي ليهم نفس الرقم (أكتر من سجل)
  function customerDupGroups() {
    const g = {};
    arr(K.c).forEach(c => { const k = c && phoneKey(c.phone); if (k) (g[k] = g[k] || []).push(c); });
    return Object.keys(g).filter(k => g[k].length > 1).map(k => ({ phone: k, list: g[k] }));
  }

  // customerName/deviceName بيتناديلهم من جوه map() لقوايم طويلة (عملاء،
  // أجهزة، أوامر شغل) في أكتر من صفحة — كل نداء كان بيعمل arr() (JSON.parse
  // كامل للمصفوفة) من جديد. بنستخدم arrCached هنا عشان الاستدعاءات
  // المتكررة على نفس البيانات (من غير أي تغيير في WFStorage) ترجع من
  // كاش القراءة بدل إعادة التحليل، وده بيفرق بشكل ملموس في السرعة لما
  // يكون عدد العملاء/الأجهزة كبير.
  // فهرس id → سجل لنسخة القراءة المخزّنة. قبل كده customerName/deviceName (وكل بحث «find» جوه حلقة) كانوا بيعدّوا على كل السجلات
  // لكل صف، يعني O(الصفوف × السجلات). الفهرس بيتبني مرة لكل نسخة بيانات ويتجدد لو الطول اتغير. للقراءة بس: ماتعدّلش السجل اللي بيرجع.
  const idIndexCache = new WeakMap();
  function byIdCached(k) {
    const list = arrCached(k);
    if (!Array.isArray(list)) return new Map();
    let hit = idIndexCache.get(list);
    if (!hit || hit.len !== list.length) {
      const map = new Map();
      for (const x of list) if (x && !map.has(x.id)) map.set(x.id, x);
      hit = { len: list.length, map };
      idIndexCache.set(list, hit);
    }
    return hit.map;
  }
  function customerName(i) { return byIdCached(K.c).get(i)?.name || "—"; }
  function deviceName(i) { let d = byIdCached(K.d).get(i); return d ? `${d.type} - ${d.brand}` : "—"; }
  function addresses(c) {
    let e = c.extraAddress || {};
    let hasExtra = !!(e.center || e.village || e.street || e.address);
    return [{ key: "main", label: "العنوان الأساسي", ...c.mainAddress }, ...(hasExtra ? [{ key: "extra", label: "العنوان الإضافي", ...e }] : [])];
  }
  function addressText(a) {
    return `${a.center || ""}${a.village ? " - " + a.village : ""}${a.address ? " - " + a.address : ""}${a.street ? " - " + a.street : ""}`;
  }

  /* ---------------------------------------------------------------------
     سجل صريح لاستبدال دوال العرض (render*) بين الملفات.
     قبل كده كان كل ملف بيعمل ببساطة window.renderCustomers = function(){...}
     من غير أي أثر إن ده استبدال لنسخة موجودة فعلاً من ملف تاني، فكان
     صعب تعرف "مين آخر نسخة شغالة فعليًا" من غير قراءة كل الملفات وترتيب
     الـ <script> tags يدويًا. defineOverride بتعمل نفس التبديل (نفس
     السلوك بالظبط، الدالة العامة بنفس الاسم زي ما هي) لكن بتسجّله في
     window.__workshopOverrides وتطبعه في الكونسول عشان يبقى واضح.
     --------------------------------------------------------------------- */
  window.__workshopOverrides = window.__workshopOverrides || {};
  function defineOverride(name, sourceFile, fn) {
    const existed = typeof window[name] === "function";
    const prevSources = window.__workshopOverrides[name] || [];
    window[name] = fn;
    window.__workshopOverrides[name] = prevSources.concat(sourceFile);
    if (existed && prevSources.length) {
      console.debug(`[WorkshopUI] "${name}" defined in ${prevSources.join(" ← ")} تم استبدالها بنسخة من ${sourceFile}`);
    }
  }

  /* ---------------------------------------------------------------------
     نقطة واحدة لتحديث كل شاشات الملخص بعد أي عملية بتغيّر بيانات (حذف
     عميل/جهاز، إضافة أمر شغل...). قبل كده كانت نفس الخمس دوال دي بتتنادى
     يدويًا بنفس الترتيب في أكتر من مكان — أي شاشة جديدة تتضاف لازم تتضاف
     هنا مرة واحدة بس بدل ما تتنسى في مكان وتتفتكر في مكان تاني.
     كل دالة بتتنادى بـ ?. عشان لو الصفحة الحالية مش محمّل فيها الملف
     اللي بيعرّفها (زي reports.js) الاستدعاء يتجاهل بهدوء زي ما كان بالظبط.
     --------------------------------------------------------------------- */
  function refreshAllScreens() {
    window.renderCustomers?.();
    window.renderDevices?.();
    window.renderRequests?.();
    window.renderDash?.();
    window.monthReport?.();
  }

  window.WorkshopData = {
    K, get, put, commitStorage, putAsync, commitStorageAsync, arr, arrCached, byIdCached, debounce, esc, escAttr, id, settings, duplicateCustomerByPhone,
    customerName, deviceName, addresses, addressText, defineOverride, refreshAllScreens,
    getSchemaVersion, setSchemaVersion, CURRENT_SCHEMA_VERSION, withRollback, withRollbackAsync
  };

  // نفس الأسماء متاحة كمتغيرات عامة زي ما كانت بالظبط (K, get, put, arr, esc, id, settings, ...)
  // عشان باقي الملفات والصفحات تفضل شغالة من غير أي تعديل في طريقة الاستخدام.
  window.K = K;
  window.get = get;
  window.put = put;
  window.commitStorage = commitStorage;
  window.putAsync = putAsync;
  window.commitStorageAsync = commitStorageAsync;
  window.arr = arr;
  window.wfPhoneKey = phoneKey;
  window.wfCustomerDupGroups = customerDupGroups;
  window.arrCached = arrCached;
  window.byIdCached = byIdCached;
  window.debounce = debounce;
  // بعض الشاشات (استرجاع/حذف كل البيانات في app-data-management.js) بتكتب
  // في WFStorage مباشرة برا put/commitStorage (عشان بترجع القيم الخام
  // الأصلية بالظبط وقت الفشل)، فلازم تقدر تُبطل الكاش يدويًا بعدها عشان أي
  // قراءة عبر arrCached بعد كده تجيب القيمة الصح مش نسخة قديمة من الكاش.
  window.invalidateReadCache = invalidateReadCache;
  window.esc = esc;
  window.escAttr = escAttr;
  window.id = id;

  /* ---------------------------------------------------------------
     توحيد المراكز والقرى في كل النظام
     - مصدر الحقيقة: settings().centers و settings().villages[المركز].
     - أي عنوان عميل (أساسي/إضافي) بيتطابق مع القايمة بصرف النظر عن اختلاف
       الهمزة/التاء المربوطة/المسافات (إبوان = أبوان)، وبياخد كتابة القايمة.
     - أي مركز/قرية جديدة مكتوبة في عنوان عميل بتتضاف للقايمة تلقائيًا (الإضافة لسه موجودة).
     --------------------------------------------------------------- */
  function wfAddrKey(x) { return String(x == null ? "" : x).replace(/[\u064B-\u0652\u0640]/g, "").replace(/[\s.\-_\/،,]+/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي"); }
  function wfAddrClean(x) { return String(x == null ? "" : x).replace(/\s+/g, " ").trim(); }
  function wfAddrCore(customers, s, rep) {
    s.centers = Array.isArray(s.centers) ? s.centers : [];
    s.villages = s.villages && typeof s.villages === "object" && !Array.isArray(s.villages) ? s.villages : {};
    rep.dupRemoved = rep.dupRemoved || 0;
    const dedupe = list => { const seen = new Set(); return (list || []).filter(x => { const k = wfAddrKey(x); if (!k || seen.has(k)) { rep.dupRemoved++; return false; } seen.add(k); return true; }); };
    s.centers = dedupe(s.centers);
    Object.keys(s.villages).forEach(c => { if (Array.isArray(s.villages[c])) s.villages[c] = dedupe(s.villages[c]); });
    const cKey = new Map(); s.centers.forEach(c => { if (!cKey.has(wfAddrKey(c))) cKey.set(wfAddrKey(c), c); });
    const vKeys = new Map();
    const vmap = c => { if (!vKeys.has(c)) { const m = new Map(); (s.villages[c] || []).forEach(v => { if (!m.has(wfAddrKey(v))) m.set(wfAddrKey(v), v); }); vKeys.set(c, m); } return vKeys.get(c); };
    const canon = a => {
      if (!a || typeof a !== "object") return;
      let ce = wfAddrClean(a.center), vi = wfAddrClean(a.village);
      if (ce) {
        const k = wfAddrKey(ce);
        if (cKey.has(k)) ce = cKey.get(k);
        else { cKey.set(k, ce); s.centers.push(ce); s.villages[ce] = s.villages[ce] || []; rep.addedCenters.push(ce); }
      }
      if (ce && vi) {
        const m = vmap(ce), k = wfAddrKey(vi);
        if (m.has(k)) vi = m.get(k);
        else { m.set(k, vi); (s.villages[ce] = s.villages[ce] || []).push(vi); rep.addedVillages.push(ce + " — " + vi); }
      }
      if (a.center !== ce || a.village !== vi) { if (a.center !== undefined || ce) a.center = ce; if (a.village !== undefined || vi) a.village = vi; rep.unified++; }
    };
    (customers || []).forEach(c => {
      if (!c) return;
      canon(c.mainAddress); canon(c.extraAddress);
      if (Array.isArray(c.extraAddresses)) c.extraAddresses.forEach(canon);
    });
    return rep;
  }
  let wfAddrBusy = false;
  function wfSyncAddressLists(opts) {
    opts = opts || {};
    const rep = { addedCenters: [], addedVillages: [], unified: 0, dupRemoved: 0 };
    if (wfAddrBusy) return rep;
    wfAddrBusy = true;
    try {
      let s = window.settings(), cs = arr(K.c);
      if (opts.dry) { s = JSON.parse(JSON.stringify(s)); cs = JSON.parse(JSON.stringify(cs)); }
      wfAddrCore(cs, s, rep);
      if (!opts.dry) {
        if (rep.addedCenters.length || rep.addedVillages.length || rep.dupRemoved) _wfPut(K.s, s);
        if (rep.unified) _wfPut(K.c, cs);
      }
    } finally { wfAddrBusy = false; }
    return rep;
  }
  const _wfPut = put;
  window.put = function (k, v) {
    if (k === K.c && Array.isArray(v) && !wfAddrBusy) {
      wfAddrBusy = true;
      try {
        const s = window.settings(), rep = { addedCenters: [], addedVillages: [], unified: 0 };
        wfAddrCore(v, s, rep);
        if (rep.addedCenters.length || rep.addedVillages.length) _wfPut(K.s, s);
      } catch (e) { console.warn("[address-unify]", e); } finally { wfAddrBusy = false; }
    }
    return _wfPut(k, v);
  };
  window.wfSyncAddressLists = wfSyncAddressLists;
  window.wfAddrKey = wfAddrKey;
  // مرة واحدة في كل جلسة بعد ما التخزين يجهز: يضيف أي مركز/قرية ناقصة من العملاء الحاليين ويوحّد الكتابة.
  try {
    if (/\/(index|customers|devices|requests|settings|share-target)\.html$|\/$/.test(location.pathname) && !sessionStorage.getItem("wf_addr_sync")) {
      const run = () => { try { sessionStorage.setItem("wf_addr_sync", "1"); const r = wfSyncAddressLists(); if (r.addedVillages.length || r.addedCenters.length || r.unified) console.info("[address-unify]", r); } catch (e) { console.warn("[address-unify]", e); } };
      const ready = window.WFStorageReady && window.WFStorageReady.then ? window.WFStorageReady : Promise.resolve();
      ready.then(() => setTimeout(run, 2500));
    }
  } catch (_) {}
  window.settings = settings;
  window.settingsRO = settingsRO;
  window.duplicateCustomerByPhone = duplicateCustomerByPhone;
  window.customerName = customerName;
  window.deviceName = deviceName;
  window.addresses = addresses;
  window.addressText = addressText;
  window.defineOverride = defineOverride;
  window.refreshAllScreens = refreshAllScreens;
  window.getSchemaVersion = getSchemaVersion;
  window.setSchemaVersion = setSchemaVersion;
  window.CURRENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
  // استنى تأكيد كتابة IndexedDB قبل أي تنقل/reload (الكتابة بتتم في الخلفية).
  function wfFlushWrites(ms) {
    const jobs = [];
    try { if (window.WorkshopDB && window.WorkshopDB.flush) jobs.push(window.WorkshopDB.flush()); else if (window.WFStorage && window.WFStorage.flush) jobs.push(window.WFStorage.flush()); } catch (_) {}
    return Promise.race([Promise.all(jobs).then(() => true, () => false), new Promise(r => setTimeout(() => r(false), ms || 4000))]);
  }
  window.wfFlushWrites = wfFlushWrites;
  window.wfNavigate = async function (url) { try { window.WFNavState && window.WFNavState.save(); } catch (_) {} await wfFlushWrites(); window.location.href = url; };
  /* wfLeaveTo(url, exact): بعد حفظ تعديل أو حذف سجل. لو الصفحة اللي قبلها في التاريخ هي نفس
     الوجهة (رجعنا لصفحة الأمر بعد تعديله / للقايمة بعد الحذف) نرجع لها بـ history.back() — فالقايمة
     ترجع بنفس الفلتر والسكرول، وزر الرجوع مايرجّعكش لفورم التعديل أو لسجل اتحذف. غير كده
     بنستبدل الصفحة الحالية (location.replace) بدل ما نزود خطوة في التاريخ.
     exact=true: لازم الرابط كله يتطابق (نفس السجل)، false: نفس الصفحة بأي فلتر. */
  window.wfLeaveTo = async function (url, exact) {
    try { window.WFNavState && window.WFNavState.save(); } catch (_) {}
    await wfFlushWrites();
    try {
      const t = new URL(url, location.href), ref = document.referrer ? new URL(document.referrer) : null;
      if (ref && ref.origin === location.origin && ref.pathname === t.pathname && (!exact || ref.search === t.search) && history.length > 1) { history.back(); return; }
      location.replace(t.href);
    } catch (_) { location.href = url; }
  };
  window.wfReload = async function () { await wfFlushWrites(); window.location.reload(); };
  window.withRollback = withRollback;
  window.withRollbackAsync = withRollbackAsync;
})(window);

/* WFPAGER:BEGIN */
/* ---------------------------------------------------------------------
   تقسيم القوائم الطويلة لصفحات («عرض المزيد») بدل رسم كل السجلات مرة واحدة.
   - WFPager.render(key, items, rowFn, sig, opts) بيرسم أول دفعة بس ويرجّع
     { html, rows, more, attr }: html = الحاوية + زر العرض، rows = صفوف أول دفعة بس.
   - «عرض المزيد» بيضيف الصفوف الجديدة في آخر القائمة (من غير إعادة رسم الصفحة،
     فالحقول المكتوبة والسكرول مايتأثروش).
   - sig = توقيع الفلاتر (بحث/ترتيب/تصنيف): لو اتغير بترجع القائمة لأول دفعة، ولو
     ثبت (مثلًا بعد تعديل/حذف سجل) بيفضل نفس عدد الصفوف المعروضة.
   - opts.hashPrefix: لو الرابط فيه #tx-<id> بنوسّع الدفعة لحد ما السجل ده يظهر.
   --------------------------------------------------------------------- */
(function (w) {
  "use strict";
  var DEFAULT_STEP = 30, CONFIRM_ALL_OVER = 300, S = {}, PRIMED = {}, PRIMED_UNTIL = 0;
  function num(n) { try { return Number(n).toLocaleString("ar-EG"); } catch (_) { return String(n); } }
  function safeKey(k) { return String(k == null ? "" : k).replace(/[^\w-]/g, ""); }
  function rowHtml(st, i) {
    try { var h = st.rowFn(st.items[i], i); return h == null ? "" : String(h); }
    catch (e) { try { console.error("[WFPager] تعذر عرض سجل في القائمة", st.key, e); } catch (_) {} return ""; }
  }
  function rowsHtml(st, from, to) { var out = ""; for (var i = from; i < to; i++) out += rowHtml(st, i); return out; }
  function hashIndex(items, opts) {
    if (!opts || !opts.hashPrefix || typeof location === "undefined") return -1;
    var h = String(location.hash || "").slice(1);
    if (h.indexOf(opts.hashPrefix) !== 0) return -1;
    var id = h.slice(opts.hashPrefix.length);
    try { id = decodeURIComponent(id); } catch (_) {}
    for (var i = 0; i < items.length; i++) if (items[i] && String(items[i].id) === id) return i;
    return -1;
  }
  function moreBox(key) {
    var st = S[key], rem = st ? st.items.length - st.shown : 0, inner = "";
    if (rem > 0) {
      inner = '<button type="button" class="secondary" data-wf-event="click" data-wf-code="wfPagerMore(\'' + key + '\')">⬇️ عرض المزيد (' + num(st.shown) + " من " + num(st.items.length) + ')</button>' +
        (rem > st.step ? ' <button type="button" class="secondary" data-wf-event="click" data-wf-code="wfPagerAll(\'' + key + '\')">عرض الكل</button>' : "");
    } else if (st && st.items.length > st.step) {
      inner = '<small class="hint">تم عرض كل السجلات (' + num(st.items.length) + ')</small>';
    }
    return '<div class="actions wf-pg-more" data-wf-pg-more="' + key + '" style="margin:10px 0">' + inner + "</div>";
  }
  function render(key, items, rowFn, sig, opts) {
    key = safeKey(key); opts = opts || {};
    items = Array.isArray(items) ? items : [];
    var step = opts.step > 0 ? opts.step : DEFAULT_STEP, prev = S[key];
    var shown = prev && prev.sig === sig ? Math.max(prev.shown, step) : step;
    // رجوع للصفحة بزر الرجوع: نرجّع نفس عدد الصفوف اللي كانت معروضة (عشان السكرول يرجع لنفس السجل).
    var pr = PRIMED[key];
    if (pr && String(pr.sig) === String(sig) && pr.shown > shown && Date.now() < PRIMED_UNTIL) shown = pr.shown;
    var hi = hashIndex(items, opts);
    if (hi >= shown) shown = Math.ceil((hi + 1) / step) * step;
    shown = Math.min(shown, items.length);
    var st = S[key] = { key: key, items: items, rowFn: rowFn, sig: sig, shown: shown, step: step };
    var rows = rowsHtml(st, 0, shown), attr = 'data-wf-pg-rows="' + key + '"', more = moreBox(key);
    return { rows: rows, more: more, attr: attr, shown: shown, total: items.length, html: "<div " + attr + ">" + rows + "</div>" + more };
  }
  function more(key, all) {
    key = safeKey(key);
    var st = S[key]; if (!st || typeof document === "undefined") return false;
    var rem = st.items.length - st.shown; if (rem <= 0) return false;
    if (all && rem > CONFIRM_ALL_OVER && typeof confirm === "function" &&
        !confirm("هيتم عرض " + num(rem) + " سجل إضافي، وده ممكن يبطّئ الصفحة. تكمل؟")) return false;
    var host = document.querySelector('[data-wf-pg-rows="' + key + '"]');
    if (!host) return false;
    var to = all ? st.items.length : Math.min(st.items.length, st.shown + st.step);
    host.insertAdjacentHTML("beforeend", rowsHtml(st, st.shown, to));
    st.shown = to;
    var box = document.querySelector('[data-wf-pg-more="' + key + '"]');
    if (box) box.outerHTML = moreBox(key);
    try { document.dispatchEvent(new CustomEvent("wf-pager-more", { detail: { key: key, host: host } })); } catch (_) {}
    return true;
  }
  /* الطباعة والمشاركة لازم يشوفوا كل السجلات مش الدفعة المعروضة بس (مثلًا كشف المحفظة).
     root: نوسّع القوائم اللي جوه العنصر ده بس. opts.maxRows: حد أقصى للصفوف الإضافية لكل قائمة. */
  function expandAll(root, opts) {
    if (typeof document === "undefined") return 0;
    var max = opts && opts.maxRows > 0 ? opts.maxRows : Infinity, added = 0;
    Object.keys(S).forEach(function (key) {
      var st = S[key], rem = st.items.length - st.shown;
      if (rem <= 0) return;
      var host = document.querySelector('[data-wf-pg-rows="' + key + '"]');
      if (!host || (root && root.contains && !root.contains(host))) return;
      var to = Math.min(st.items.length, st.shown + max);
      host.insertAdjacentHTML("beforeend", rowsHtml(st, st.shown, to));
      added += to - st.shown; st.shown = to;
      var box = document.querySelector('[data-wf-pg-more="' + key + '"]');
      if (box) box.outerHTML = moreBox(key);
      try { document.dispatchEvent(new CustomEvent("wf-pager-more", { detail: { key: key, host: host } })); } catch (_) {}
    });
    return added;
  }
  function reset(key) { if (key === undefined) S = {}; else delete S[safeKey(key)]; }
  function snapshot() {
    var out = {};
    Object.keys(S).forEach(function (k) { var st = S[k]; if (st && st.shown > st.step) out[k] = { shown: st.shown, sig: String(st.sig) }; });
    return out;
  }
  function prime(map, ms) { PRIMED = map && typeof map === "object" ? map : {}; PRIMED_UNTIL = Date.now() + (ms || 15000); }
  w.WFPager = { render: render, more: more, expandAll: expandAll, reset: reset, snapshot: snapshot, prime: prime, DEFAULT_STEP: DEFAULT_STEP };
  // طباعة الصفحة بالكامل (Ctrl+P أو printWorkshopPage): نعرض كل السجلات. طباعة عنصر واحد بتوسّعه print-share.js بنفسه.
  try {
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("beforeprint", function () {
        if (typeof document !== "undefined" && document.body && document.body.classList && document.body.classList.contains("ps-printing")) return;
        expandAll();
      });
    }
  } catch (_) {}
  if (typeof window !== "undefined") {
    window.wfPagerMore = function (key) { return more(key, false); };
    window.wfPagerAll = function (key) { return more(key, true); };
  }
})(typeof window !== "undefined" ? window : globalThis);
/* WFPAGER:END */

/* WFNAVSTATE:BEGIN */
/* ---------------------------------------------------------------------
   زر الرجوع يرجّعك لنفس المكان: لما تفتح سجل من قائمة وترجع بزر الرجوع
   (في الموبايل أو المتصفح) الصفحة بتترسم من الأول، فكانت بترجع لأولها
   وبالقائمة الافتراضية. هنا بنحفظ في history.state (خاص بالخطوة دي من
   التاريخ بس) مكان السكرول وعدد الصفوف المعروضة في كل قائمة، ولما نرجع
   بالرجوع/إعادة التحميل بنرجّعهم بعد ما الصفحة تترسم.
   وكل صفحة فيها فلاتر/تبويبات بتكتب اختيارها في الرابط بـ WFNavState.setParams
   (replaceState من غير خطوة جديدة في التاريخ)، فالرجوع بيفتحها بنفس الاختيار.
   --------------------------------------------------------------------- */
(function (w) {
  "use strict";
  if (typeof window === "undefined" || !w.history || typeof w.history.replaceState !== "function") {
    w.WFNavState = { setParams: function () {}, getParam: function () { return null; }, keep: function () {}, save: function () {}, isReturn: false };
    return;
  }
  var H = w.history, saveTimer = 0, lastSaveAt = 0;
  function cur() { var s = H.state; return s && typeof s === "object" ? s : {}; }
  function replace(state, url) { try { H.replaceState(state, "", url || location.href); return true; } catch (_) { return false; } }
  function navType() {
    try { var e = performance.getEntriesByType("navigation")[0]; if (e && e.type) return e.type; } catch (_) {}
    try { var t = performance.navigation && performance.navigation.type; return t === 2 ? "back_forward" : t === 1 ? "reload" : "navigate"; } catch (_) {}
    return "navigate";
  }
  var nt = navType();
  var isReturn = nt === "back_forward" || nt === "reload";
  function save() {
    clearTimeout(saveTimer); saveTimer = 0; lastSaveAt = Date.now();
    var s = Object.assign({}, cur());
    s.wfY = Math.max(0, Math.round(w.scrollY || w.pageYOffset || 0));
    try { if (w.WFPager && w.WFPager.snapshot) s.wfPg = w.WFPager.snapshot(); } catch (_) {}
    replace(s);
  }
  function scheduleSave() {
    if (restoring) return;
    clearTimeout(saveTimer);
    // Safari بيحدد عدد مرات replaceState، فبنحفظ بعد ما السكرول يهدى بس.
    saveTimer = setTimeout(save, Date.now() - lastSaveAt > 1000 ? 250 : 700);
  }
  function setParams(obj) {
    try {
      var u = new URL(location.href);
      Object.keys(obj || {}).forEach(function (k) {
        var v = obj[k];
        if (v === null || v === undefined || v === "" || v === false) u.searchParams.delete(k);
        else u.searchParams.set(k, String(v));
      });
      var next = u.pathname + (u.searchParams.toString() ? "?" + u.searchParams.toString() : "") + u.hash;
      if (next !== location.pathname + location.search + location.hash) replace(cur(), next);
    } catch (_) {}
  }
  /* زي setParams بس كخطوة جديدة في السجل (زر الرجوع بيرجّع للي قبلها): الدخول من الملخص لقايمة، أو تبويب جديد */
  function pushParams(obj) {
    try {
      save();
      var u = new URL(location.href);
      Object.keys(obj || {}).forEach(function (k) {
        var v = obj[k];
        if (v === null || v === undefined || v === "" || v === false) u.searchParams.delete(k);
        else u.searchParams.set(k, String(v));
      });
      var next = u.pathname + (u.searchParams.toString() ? "?" + u.searchParams.toString() : "") + u.hash;
      if (next !== location.pathname + location.search + location.hash) H.pushState({ wfY: 0 }, "", next);
    } catch (_) {}
  }
  function getParam(k) { try { return new URLSearchParams(location.search).get(k); } catch (_) { return null; } }
  /* keep({q:"routeSearch", c:"routeCenterFilter"}): بيرجّع قيمة كل خانة من الرابط (لو موجودة)
     وبيكتب أي تغيير فيها في الرابط. تتنادى بعد ملء اختيارات الـselect وقبل أول رسم. */
  function keep(map) {
    Object.keys(map || {}).forEach(function (k) {
      var el = document.getElementById(map[k]); if (!el || el.__wfKeep) return;
      el.__wfKeep = 1;
      var v = getParam(k);
      if (v !== null) { try { el.value = v; } catch (_) {} }
      var h = function () { var o = {}; o[k] = el.value || null; setParams(o); };
      el.addEventListener("input", h); el.addEventListener("change", h);
    });
  }

  /* ---- الاسترجاع ---- */
  var restoring = false;
  try { if ("scrollRestoration" in H) H.scrollRestoration = "manual"; } catch (_) {}
  var st0 = cur();
  if (isReturn && st0.wfPg && w.WFPager && w.WFPager.prime) w.WFPager.prime(st0.wfPg);
  function restoreScroll(y) {
    if (!(y > 0) || location.hash) return;
    restoring = true;
    var start = Date.now(), reachedAt = 0, stop = false;
    function cancel() { stop = true; }
    ["touchstart", "wheel", "keydown", "mousedown"].forEach(function (ev) { w.addEventListener(ev, cancel, { passive: true, once: true }); });
    (function tick() {
      if (stop) { restoring = false; return; }
      var max = Math.max(0, (document.documentElement.scrollHeight || 0) - (w.innerHeight || 0));
      var target = Math.min(y, max);
      if (Math.abs((w.scrollY || 0) - target) > 2) w.scrollTo(0, target);
      if (target >= y - 2) { if (!reachedAt) reachedAt = Date.now(); }
      // بنستنى الرندر المتأخر (مزامنة/بيانات) ونفضل ثابتين شوية بعد ما نوصل.
      if ((reachedAt && Date.now() - reachedAt > 700) || Date.now() - start > 4000) { restoring = false; return; }
      setTimeout(tick, 60);
    })();
  }
  if (isReturn && st0.wfY > 0) {
    var go = function () { setTimeout(function () { restoreScroll(st0.wfY); }, 0); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  }

  w.addEventListener("scroll", scheduleSave, { passive: true });
  w.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") save(); });
  // قبل ما نسيب الصفحة بلينك نحفظ فورًا (pagehide ممكن يبقى متأخر على بعض الموبايلات).
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (a && !a.target && !/^(tel:|mailto:|#|javascript:)/i.test(a.getAttribute("href") || "")) save();
  }, true);
  document.addEventListener("wf-pager-more", scheduleSave);
  /* bfcache: الموبايل ساعات بيرجّع الصفحة من الذاكرة زي ما هي من غير ما يشغّلها تاني. لو البيانات
     اتغيرت وإنت في صفحة تانية (قفلت الأمر/غيرت حالته)، القايمة هتبان قديمة — فنعيد تحميلها
     (الرابط والسكرول وعدد الصفوف بيرجعوا زي ما هما). */
  var REV = "wf_data_rev", hideRev = null;
  function rev() { try { return sessionStorage.getItem(REV) || ""; } catch (_) { return ""; } }
  var bumpAt = 0;
  function bump() { var n = Date.now(); if (n - bumpAt < 50) return; bumpAt = n; try { sessionStorage.setItem(REV, String(n)); } catch (_) {} }
  w.wfBumpDataRev = bump;
  try { if (w.WFStorage && typeof w.WFStorage.subscribe === "function") w.WFStorage.subscribe(function (key) { if (key !== REV) bump(); }); } catch (_) {}
  w.addEventListener("pagehide", function () { hideRev = rev(); });
  w.addEventListener("pageshow", function (e) {
    if (e && e.persisted && hideRev !== null && rev() !== hideRev) { try { location.reload(); } catch (_) {} }
  });
  w.WFNavState = { setParams: setParams, pushParams: pushParams, getParam: getParam, keep: keep, save: save, isReturn: isReturn };
})(typeof window !== "undefined" ? window : globalThis);
/* WFNAVSTATE:END */

/* WFSTATSENTRY:BEGIN */
/* ---------------------------------------------------------------------
   سطر «📊 إحصائيات القسم» تحت عنوان كل صفحة رئيسية: بيفتح صفحة التقارير على أقسام الصفحة دي بس
   (reports.html?only=...). بيختفي لوحده عن اللي مالوش صلاحية «التقارير» (data-perm).
   --------------------------------------------------------------------- */
(function (w) {
  "use strict";
  if (typeof document === "undefined" || !document.addEventListener) return;
  var MAP = {
    "requests.html": ["orders,response,returns,collect", "أوامر الشغل"],
    "customers.html": ["customers,areas", "العملاء"],
    "devices.html": ["devices", "الأجهزة والأعطال"],
    "inventory.html": ["inventory", "المخزن"],
    "wallets.html": ["finance,collect", "الحسابات"],
    "treasury.html": ["treasury", "الخزنة"],
    "route.html": ["response,areas", "خط السير والمواعيد"],
    "tasks.html": ["tasks", "المهام"],
    "warranty.html": ["warranty,returns", "الضمان والمرتجعات"],
    "dispatch.html": ["techs,response", "الفنيين"],
    "custody.html": ["techs", "الفنيين"],
    "followup.html": ["customers", "العملاء"]
  };
  function add() {
    if (typeof location === "undefined" || !document.querySelector || !document.createElement) return;
    var page = (String(location.pathname || "").split("/").pop() || "index.html").toLowerCase(), m = MAP[page];
    if (!m || document.querySelector(".wf-stats-entry")) return;
    var h1 = document.querySelector("main h1"); if (!h1) return;
    var after = (h1.closest && h1.closest(".page-head")) || h1;
    if (!document.getElementById("wf-stats-entry-css")) {
      var st = document.createElement("style"); st.id = "wf-stats-entry-css";
      st.textContent = ".wf-stats-entry{display:flex;align-items:center;gap:10px;margin:6px 0 12px;padding:11px 14px;border:1px solid var(--border);border-radius:14px;background:var(--bg-elevated);color:var(--text);text-decoration:none;font-weight:700}" +
        ".wf-stats-entry:active{opacity:.75}.wf-stats-entry i{font-style:normal;font-size:20px}.wf-stats-entry span{flex:1}.wf-stats-entry small{display:block;font-weight:400;font-size:12px;color:var(--text-muted)}.wf-stats-entry em{font-style:normal;font-size:20px;color:var(--text-muted)}@media print{.wf-stats-entry{display:none}}";
      document.head.appendChild(st);
    }
    var a = document.createElement("a");
    a.className = "wf-stats-entry no-print"; a.setAttribute("data-perm", "reports.view");
    a.href = "reports.html?only=" + encodeURIComponent(m[0]) + "&t=" + encodeURIComponent(m[1]);
    a.innerHTML = '<i aria-hidden="true">📊</i><span>إحصائيات ' + m[1].replace(/[<>&]/g, "") + "<small>أرقام وتحليلات القسم ده — اضغط للتفاصيل</small></span><em aria-hidden=\"true\">›</em>";
    after.insertAdjacentElement("afterend", a);
  }
  function safeAdd() { try { add(); } catch (e) {} }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", safeAdd); else safeAdd();
})(typeof window !== "undefined" ? window : globalThis);
/* WFSTATSENTRY:END */

/* ---------------------------------------------------------------------
   دعم الروابط اللي بتوجّه لسجل معيّن جوه صفحة (زي فحص سلامة البيانات في
   الإعدادات، اللي بقى بيودّي لسجل الحركة/الحساب نفسه مش لقسمه العام بس):
   أي رابط بينتهي بـ #tx-<id> أو #move-<id> بيعمل سكرول للسجل ده ويضيّئه
   لحظيًا. مؤجَّل ومعاد المحاولة عدة مرات عشان نمهّل رندر الصفحة (اللي ممكن
   يحصل بعد await migrations، أو في صفحة "حركات الصنف" اللي فيها تحميل
   تدريجي) قبل ما نبحث عن العنصر.
   --------------------------------------------------------------------- */
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  (function () {
    function highlightHashTarget(attempt) {
      attempt = attempt || 0;
      var hash = ((typeof location !== "undefined" && location.hash) || "").slice(1);
      if (!hash || !/^(tx|move|exp|tech)-/.test(hash)) return;
      var el = document.getElementById(hash);
      if (!el) {
        if (attempt < 40) setTimeout(function () { highlightHashTarget(attempt + 1); }, 200); // الصفحات اللي بتحمّل من السيرفر (حساب الفني/العهدة) بتاخد ثواني
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("integrity-highlight");
      setTimeout(function () { el.classList.remove("integrity-highlight"); }, 3000);
    }
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(function () { highlightHashTarget(0); }, 200);
    });
    // فتح إشعار بيودّي لعملية في نفس الصفحة (تغيير #tx-… من غير تحميل)
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("hashchange", function () { highlightHashTarget(0); });
  })();
}

/* WFSEARCH:BEGIN — بحث موحّد لكل النظام + سجل آخر عمليات البحث.
   1) wfSearchNorm/wfMatch: نفس قواعد المطابقة في كل الأقسام — بيتجاهل الهمزات (أ/إ/آ = ا)، التاء المربوطة (ة = ه)،
      الياء (ى = ي)، التشكيل، الأرقام الهندي (٠١٢ = 012)، والمسافات/الشرط جوه الكلمة (0101 234 = 0101234).
      كل كلمة في البحث لازم تكون موجودة (بأي ترتيب).
   2) سجل البحث: أي خانة بحث في النظام بتفتكر آخر 5 عمليات بحث فيها (لكل خانة لوحدها، على الجهاز ده).
      لما تدوس على الخانة وهي فاضية بيظهرلك آخر 5 — تدوس على واحدة يرجع يدوّر بيها، و✕ يشيلها. */
(function (w) {
  "use strict";
  function wfSearchNorm(v) {
    return String(v == null ? "" : v).toLowerCase().normalize("NFKC")
      .replace(/[ً-ٰٟ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ـ/g, "")
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
  }
  function compact(v) { return wfSearchNorm(v).replace(/[\s\-_./\\()+:،,]+/g, ""); }
  /* hay: نص أو Array من النصوص اللي بندوّر فيها. q: اللي المستخدم كتبه. */
  function wfMatch(hay, q) {
    var words = String(q == null ? "" : q).trim().split(/\s+/).map(compact).filter(Boolean);
    if (!words.length) return true;
    var h = compact(Array.isArray(hay) ? hay.filter(function (x) { return x != null && x !== ""; }).join(" ") : hay);
    for (var i = 0; i < words.length; i++) if (h.indexOf(words[i]) === -1) return false;
    return true;
  }
  w.wfSearchNorm = wfSearchNorm; w.wfMatch = wfMatch;

  /* ---------- سجل البحث ---------- */
  var KEY = "wf_search_history", MAX = 5;
  function store() { try { return w.WFStorage || null; } catch (e) { return null; } }
  function loadAll() { try { var s = store(); var v = s ? JSON.parse(s.getItem(KEY) || "{}") : {}; return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  function saveAll(v) { try { var s = store(); if (s) s.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function pageName() { try { return (w.location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index"; } catch (e) { return "page"; } }
  function keyOf(el) { if (el.id === "gsInput") return "global"; return pageName() + ":" + (el.id || el.name || el.getAttribute("placeholder") || "search"); }
  function list(k) { var a = loadAll()[k]; return Array.isArray(a) ? a.slice(0, MAX) : []; }
  function remember(k, q) {
    q = String(q || "").trim(); if (q.length < 2 || q.length > 80) return;
    var all = loadAll(), a = Array.isArray(all[k]) ? all[k] : [], nq = wfSearchNorm(q);
    // لو كملت كتابة نفس البحث («قط» ← «قطعة») نستبدله بدل ما نسجّل الاتنين
    a = a.filter(function (x) { var nx = wfSearchNorm(x); return nx !== nq && !(nq.indexOf(nx) === 0 && a.indexOf(x) === 0); });
    a.unshift(q); all[k] = a.slice(0, MAX); saveAll(all);
  }
  function forget(k, q) { var all = loadAll(); all[k] = (all[k] || []).filter(function (x) { return x !== q; }); if (!all[k].length) delete all[k]; saveAll(all); }
  function clear(k) { var all = loadAll(); delete all[k]; saveAll(all); }
  w.WFSearchHistory = { list: list, remember: remember, forget: forget, clear: clear, keyOf: keyOf };

  if (!w.document || typeof w.document.addEventListener !== "function") return;
  var d = w.document;
  function isSearch(el) {
    if (!el || el.tagName !== "INPUT" || el.disabled || el.readOnly) return false;
    if (el.hasAttribute("data-no-history") || (el.classList && el.classList.contains("part-autocomplete-input"))) return false;
    if (el.closest && el.closest(".wf-sale,.wf-po,[data-no-history]")) return false;
    var t = (el.getAttribute("type") || "text").toLowerCase();
    if (t !== "search" && t !== "text") return false;
    return t === "search" || el.id === "gsInput" || (el.classList && el.classList.contains("search")) || /Search$/.test(el.id || "");
  }
  var box = null, owner = null, timer = null;
  function css() {
    if (d.getElementById("wfShCss")) return;
    var s = d.createElement("style"); s.id = "wfShCss";
    s.textContent = ".wf-sh{position:fixed;z-index:100001;background:var(--bg-elevated,#fff);color:var(--text,#111);border:1px solid var(--border,#ddd);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);overflow:hidden;font-size:14px}" +
      ".wf-sh-h{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;font-size:12px;color:var(--text-muted,#666);border-bottom:1px solid var(--border,#eee)}" +
      ".wf-sh-h button{background:none;border:0;color:var(--text-muted,#666);font:inherit;font-size:12px;cursor:pointer;padding:2px 4px;text-decoration:underline}" +
      ".wf-sh-i{display:flex;align-items:center}.wf-sh-i+.wf-sh-i{border-top:1px solid var(--border,#f0f0f0)}" +
      ".wf-sh-q{flex:1;text-align:start;background:none;border:0;padding:10px 12px;font:inherit;color:inherit;cursor:pointer;min-height:42px}" +
      ".wf-sh-q:hover,.wf-sh-q:focus{background:var(--surface-2,rgba(127,127,127,.1))}" +
      ".wf-sh-x{background:none;border:0;color:var(--text-muted,#888);font-size:15px;padding:8px 12px;cursor:pointer;min-height:42px}";
    (d.head || d.documentElement).appendChild(s);
  }
  function hide() { if (box) { box.remove(); box = null; } owner = null; }
  function place() {
    if (!box || !owner) return;
    var r = owner.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > (w.innerHeight || 0)) { hide(); return; }
    box.style.left = Math.max(8, r.left) + "px"; box.style.width = Math.max(220, r.width) + "px"; box.style.top = (r.bottom + 4) + "px";
  }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function show(el) {
    var k = keyOf(el), items = list(k);
    if (!items.length || String(el.value || "").trim()) { hide(); return; }
    css(); if (!box) { box = d.createElement("div"); box.className = "wf-sh"; box.setAttribute("role", "listbox"); d.body.appendChild(box); }
    owner = el;
    box.innerHTML = '<div class="wf-sh-h"><span>🕘 آخر عمليات البحث</span><button type="button" data-sh-clear="1">مسح</button></div>' +
      items.map(function (q, i) { return '<div class="wf-sh-i"><button type="button" class="wf-sh-q" data-sh-q="' + i + '">🕘 ' + esc(q) + '</button><button type="button" class="wf-sh-x" data-sh-x="' + i + '" aria-label="شيل">✕</button></div>'; }).join("");
    place();
    if (!box) return; // الخانة اختفت من الصفحة (اتعملها render من جديد) فـ place() قفلت القايمة
    // mousedown بدل click عشان الخانة ماتفقدش التركيز وتقفل القايمة قبل ما الضغطة توصل
    box.onmousedown = function (e) { e.preventDefault(); };
    box.onclick = function (e) {
      var b = e.target.closest("button"); if (!b || !owner) return;
      var cur = owner, arr2 = list(k);
      if (b.hasAttribute("data-sh-clear")) { clear(k); hide(); return; }
      if (b.hasAttribute("data-sh-x")) { forget(k, arr2[+b.getAttribute("data-sh-x")]); show(cur); return; }
      var q = arr2[+b.getAttribute("data-sh-q")]; if (q == null) return;
      hide(); cur.value = q; remember(k, q);
      cur.dispatchEvent(new Event("input", { bubbles: true })); cur.dispatchEvent(new Event("change", { bubbles: true }));
      try { cur.focus(); } catch (x) {}
    };
  }
  d.addEventListener("focusin", function (e) { if (isSearch(e.target)) show(e.target); });
  d.addEventListener("click", function (e) { if (isSearch(e.target) && !box) show(e.target); else if (box && !box.contains(e.target) && e.target !== owner) hide(); }, true);
  d.addEventListener("input", function (e) {
    var el = e.target; if (!isSearch(el)) return;
    if (String(el.value || "").trim()) { if (owner === el) hide(); } else show(el);
    clearTimeout(timer);
    // بنسجّل البحث لما تقف عن الكتابة ثانية ونص (مش كل حرف)
    timer = setTimeout(function () { if (String(el.value || "").trim().length >= 2) remember(keyOf(el), el.value); }, 1500);
  });
  d.addEventListener("keydown", function (e) {
    var el = e.target; if (!isSearch(el)) return;
    if (e.key === "Enter" && String(el.value || "").trim()) { clearTimeout(timer); remember(keyOf(el), el.value); hide(); }
    else if (e.key === "Escape") hide();
  });
  d.addEventListener("focusout", function (e) {
    var el = e.target; if (!isSearch(el)) return;
    if (String(el.value || "").trim().length >= 2) { clearTimeout(timer); remember(keyOf(el), el.value); }
    setTimeout(function () { if (owner === el && d.activeElement !== el) hide(); }, 150);
  });
  w.addEventListener && w.addEventListener("resize", place);
  w.addEventListener && w.addEventListener("scroll", place, true);
})(window);
/* WFSEARCH:END */

/* WFPICKIMAGE — نفس طريقة رفع الصور في كل النظام لأي مكان بيختار صورة من زرار واحد (زي أيقونة التطبيق واللوجو):
   بيسألك «📷 كاميرا» ولا «🖼️ من الصور» وبعدين بيفتح المناسب. بيرجّع Promise بـ File (أو null لو اتلغى). */
(function (w) {
  "use strict";
  if (!w.document) return;
  w.wfPickImage = function (opts) {
    opts = opts || {};
    var d = w.document;
    return new Promise(function (resolve) {
      var ov = d.createElement("div");
      ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
      ov.style.cssText = "position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center";
      ov.innerHTML = '<div style="background:var(--bg-elevated,#fff);color:var(--text,#111);border-radius:18px 18px 0 0;padding:16px;width:100%;max-width:420px;box-shadow:0 -6px 24px rgba(0,0,0,.25)">' +
        '<b style="display:block;margin-bottom:10px">' + (opts.title || "اختار الصورة منين؟") + '</b>' +
        '<div style="display:flex;gap:8px"><button type="button" class="secondary" data-src="camera" style="flex:1;min-height:52px">📷 كاميرا</button><button type="button" class="secondary" data-src="gallery" style="flex:1;min-height:52px">🖼️ من الصور</button></div>' +
        '<button type="button" class="secondary" data-src="" style="width:100%;margin-top:8px;min-height:44px">إلغاء</button></div>';
      var done = false;
      function finish(f) { if (done) return; done = true; resolve(f || null); }
      function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
      ov.addEventListener("click", function (e) {
        if (e.target === ov) { close(); finish(null); return; }
        var b = e.target.closest && e.target.closest("button[data-src]"); if (!b) return;
        var src = b.getAttribute("data-src"); close();
        if (!src) { finish(null); return; }
        var i = d.createElement("input"); i.type = "file"; i.accept = src === "camera" ? "image/*" : (opts.accept || "image/*"); i.hidden = true;
        if (src === "camera") { i.setAttribute("capture", "environment"); i.capture = "environment"; }
        d.body.appendChild(i);
        i.addEventListener("change", function () { var f = i.files && i.files[0]; if (i.parentNode) i.parentNode.removeChild(i); finish(f || null); });
        i.click();
      });
      d.body.appendChild(ov);
    });
  };
})(window);
