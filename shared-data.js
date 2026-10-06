/* =========================================================
   الورشة الفنية — طبقة البيانات المشتركة (shared-data.js)
   =========================================================
   ليه الملف ده موجود:
   قبل كده كانت نفس الدوال (قراءة/كتابة localStorage، esc، id،
   أسماء العملاء/الأجهزة، تجميع العنوان...) معرّفة بنفس المنطق
   بالظبط في أكتر من ملف (app.js، workshop-mini-enhancements.js،
   workshop-mini-simple-ui.js). ده كان معناه إن أي تعديل بسيط في
   شكل البيانات لازم يتعمل في 3 أماكن، وسهل جدًا تتنسى واحد منهم.

   من دلوقتي: الملف ده هو المصدر الوحيد لكل ده. أي ملف تاني
   بيستخدم K / get / put / arr / esc / id / settings / customerName /
   deviceName / addressText / addresses / duplicateCustomerByPhone
   بيستخدم النسخة هنا بس. لازم يتحمّل في كل صفحة HTML قبل app.js
   وقبل أي ملف تاني بيستخدم الدوال دي.

   ملحوظة: بنية localStorage والمفاتيح (wf_c, wf_d, ...) لم تتغيّر
   خالص — نفس البيانات الحالية للمستخدم هتفضل شغالة زي ما هي.
   ========================================================= */
(function (window) {
  "use strict";

  const K = { c: "wf_c", d: "wf_d", r: "wf_r", p: "wf_p", s: "wf_s", m: "wf_m", e: "wf_e", tr: "wf_tr", tasks: "wf_tasks", wtx: "wf_wallet_tx", fc: "wf_fault_codes", pc: "wf_pending_calls", inv: "wf_inv", trash: "wf_trash", followupLog: "wf_followup_log" };

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
    brands: ["Fresh", "Unionaire", "Tornado", "Beko", "LG", "Samsung", "Sharp", "Ariston", "Zanussi", "Whirlpool", "Indesit", "White Point", "Kiriazi", "Ideal", "Fagor", "Daewoo", "Hitachi", "Panasonic", "Carrier", "Midea", "Haier", "Gree", "TCL", "فريش", "توشيبا العربى", "كريازى"],
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
    walletCategories: ["تحصيل عميل", "مصروف شخصي", "مصروف تشغيل", "سلفة / تحويل", "أخرى"]
  };

  let storageErrorSeq = 0;
  // كاش القراءات المتكررة: للمجموعات الأساسية يتبع إصدار snapshot المحمّل من
  // IndexedDB؛ وباقي المفاتيح تحتفظ بكاش raw localStorage المعتاد.
  const readCache = new Map();
  let writingThroughDataApi = false;
  function invalidateReadCache(keys) {
    if (!keys) { readCache.clear(); return; }
    for (const k of (Array.isArray(keys) ? keys : [keys])) readCache.delete(k);
  }
  // واجهات القراءة المتزامنة القديمة تستخدم snapshot الذاكرة المحمّل من IDB.
  // localStorage نسخة توافق لـFirebase والاسترداد، والكتابات القديمة تحدّث
  // الـsnapshot فورًا ثم تحفظه إلى IndexedDB في الخلفية.
  function persistOperational(values) {
    if (!window.WorkshopDB || typeof window.WorkshopDB.replaceMany !== "function") return;
    Object.entries(values || {}).forEach(([key, value]) => {
      if ([K.c, K.d, K.r].includes(key) && typeof window.WorkshopDB.setSnapshot === "function") window.WorkshopDB.setSnapshot(key, value);
    });
    window.WorkshopDB.replaceMany(values).catch(function (error) {
      console.error("[WorkshopData] تعذر تحديث نسخة IndexedDB؛ بيانات التوافق المحلية ما زالت موجودة:", error);
    });
  }
  function hookDirectOperationalStorage() {
    const proto = window.Storage && window.Storage.prototype;
    if (!proto || proto.__wfOperationalIDBBridge) return;
    const originalSet = proto.setItem, originalRemove = proto.removeItem;
    Object.defineProperty(proto, "__wfOperationalIDBBridge", { value: true });
    proto.setItem = function (key, value) {
      const result = originalSet.call(this, key, value);
      if (this === window.localStorage && !writingThroughDataApi && [K.c, K.d, K.r].includes(String(key))) {
        try { persistOperational({ [key]: JSON.parse(String(value)) }); }
        catch (e) { console.warn("[WorkshopData] تجاهل كتابة محلية غير صالحة في جسر IndexedDB", key, e); }
      }
      return result;
    };
    proto.removeItem = function (key) {
      const result = originalRemove.call(this, key);
      if (this === window.localStorage && !writingThroughDataApi && [K.c, K.d, K.r].includes(String(key))) persistOperational({ [key]: [] });
      return result;
    };
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
    try { raw = localStorage.getItem(k); } catch { return f; }
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
    try { let x = JSON.parse(localStorage.getItem(k)); return x ?? f; }
    catch { return f; }
  }
  function put(k, v) {
    try {
      writingThroughDataApi = true;
      try { localStorage.setItem(k, JSON.stringify(v)); } finally { writingThroughDataApi = false; }
      invalidateReadCache(k);
      persistOperational({ [k]: v });
      if(k===K.tasks){try{window.TasksIDB?.replace(v)}catch(_){/* localStorage هو fallback */}}
      return true;
    } catch (e) {
      // مساحة التخزين المخصصة للمتصفح امتلأت (أو خاصية التخزين متعطّلة، زي
      // وضع التصفح الخاص في بعض المتصفحات) — من غير هذا الفحص كانت العملية
      // بتفشل بصمت والمستخدم يفتكر إن البيانات اتحفظت وهي فعليًا لأ.
      console.error(`[WorkshopData] فشل حفظ "${k}" في localStorage:`, e);
      storageErrorSeq++;
      alert("⚠️ لم يتم الحفظ! مساحة التخزين في المتصفح ممتلئة على ما يبدو.\n\nخد نسخة احتياطية فورًا من بيانات موجودة (لو قدرت)، وامسح بيانات قديمة مش محتاجها من ⚙️ الإعدادات، أو فرّغ مساحة على الجهاز.");
      return false;
    }
  }
  function commitStorage(values) {
    const entries = Object.entries(values || {}), previous = {};
    try {
      for (const [k, v] of entries) JSON.stringify(v);
      for (const [k] of entries) previous[k] = localStorage.getItem(k);
      writingThroughDataApi = true;
      try { for (const [k, v] of entries) localStorage.setItem(k, JSON.stringify(v)); }
      finally { writingThroughDataApi = false; }
      invalidateReadCache(entries.map(([k]) => k));
      persistOperational(Object.fromEntries(entries));
      const taskEntry=entries.find(([k])=>k===K.tasks);
      if(taskEntry){try{window.TasksIDB?.replace(taskEntry[1])}catch(_){/* localStorage هو fallback */}}
      return true;
    } catch (e) {
      for (const [k, raw] of Object.entries(previous)) {
        try { if (raw === null) localStorage.removeItem(k); else localStorage.setItem(k, raw); } catch (_) {}
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
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
    }
    writingThroughDataApi = false;
    invalidateReadCache(Object.keys(values || {}));
    persistOperational(values || {});
  }
  async function commitStorageAsync(values) {
    const entries = Object.entries(values || {});
    const operational = Object.fromEntries(entries.filter(([key]) => [K.c, K.d, K.r].includes(key)));
    if (!Object.keys(operational).length || !window.WorkshopDB || typeof window.WorkshopDB.replaceMany !== "function") return commitStorage(values);
    if (window.WorkshopDBReady) {
      const ready = await window.WorkshopDBReady;
      if (!ready) return commitStorage(values);
    }
    const previous = {};
    try {
      entries.forEach(([key, value]) => JSON.stringify(value));
      entries.forEach(([key]) => { previous[key] = localStorage.getItem(key); });
      for (const [key, value] of entries) {
        writingThroughDataApi = true;
        try { localStorage.setItem(key, JSON.stringify(value)); }
        finally { writingThroughDataApi = false; }
      }
      invalidateReadCache(entries.map(([key]) => key));
      await window.WorkshopDB.replaceMany(operational);
      const taskEntry = entries.find(([key]) => key === K.tasks);
      if (taskEntry) { try { await window.TasksIDB?.replace(taskEntry[1]); } catch (_) {} }
      return true;
    } catch (error) {
      writingThroughDataApi = true;
      try {
        for (const [key, raw] of Object.entries(previous)) {
          try { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); } catch (_) {}
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
    let v = parseInt(localStorage.getItem(SCHEMA_KEY), 10);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }
  function setSchemaVersion(v) { localStorage.setItem(SCHEMA_KEY, String(v)); }

  /* ---------------------------------------------------------------------
     withRollback: طبقة "شبه Transaction" لعمليات بتلمس أكتر من مفتاح
     localStorage مع بعض (زي تعديل مخزون القطع + حركاته وقت حفظ أمر شغل).
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

  function settings() {
    let stored = null;
    try { stored = localStorage.getItem(K.s); } catch (_) {}
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
    // localStorage ويمنع ظهور أخطاء امتلاء التخزين أثناء عمليات القراءة فقط.
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
  // المتكررة على نفس البيانات (من غير أي تغيير في localStorage) ترجع من
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
  // في localStorage مباشرة برا put/commitStorage (عشان بترجع القيم الخام
  // الأصلية بالظبط وقت الفشل)، فلازم تقدر تُبطل الكاش يدويًا بعدها عشان أي
  // قراءة عبر arrCached بعد كده تجيب القيمة الصح مش نسخة قديمة من الكاش.
  window.invalidateReadCache = invalidateReadCache;
  window.esc = esc;
  window.escAttr = escAttr;
  window.id = id;
  window.settings = settings;
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
  window.withRollback = withRollback;
  window.withRollbackAsync = withRollbackAsync;
})(window);

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
      if (!hash || (hash.indexOf("tx-") !== 0 && hash.indexOf("move-") !== 0)) return;
      var el = document.getElementById(hash);
      if (!el) {
        if (attempt < 12) setTimeout(function () { highlightHashTarget(attempt + 1); }, 150);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("integrity-highlight");
      setTimeout(function () { el.classList.remove("integrity-highlight"); }, 3000);
    }
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(function () { highlightHashTarget(0); }, 200);
    });
  })();
}
