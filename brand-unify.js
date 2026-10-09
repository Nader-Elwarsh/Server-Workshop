/* brand-unify.js — توحيد أسماء الماركات في كل النظام.
   المشكلة: نفس الماركة كانت بتتكتب بأكتر من شكل (Fresh / فريش، Zanussi / زانوسي، كريازى / Kiriazi...)
   فكانت بتظهر مكررة ومختلفة من مكان لمكان (الأجهزة، أكواد الأعطال، الإعدادات، البحث).
   الحل: اسم موحّد واحد (عربي) لكل ماركة، وكل الأشكال التانية (إنجليزي/إملائي) بتتحول له، وتفضل
   تشتغل في البحث (تكتب Zanussi تلاقي «زانوسي»). أي ماركة مش في الجدول بتفضل زي ما هي،
   بس من غير تكرار (بغض النظر عن حالة الحروف/الهمزات/المسافات).

   - wfBrandKey / wfCanonicalBrand / wfBrandSearchText: دوال مساعدة بتستخدمها القوايم والإعدادات.
   - wfUnifyBrands(): بتوحّد قايمة الماركات + ماركة كل جهاز + ماركة أكواد الأعطال، وبترجّع ملخص.
     بتشتغل تلقائيًا مرة واحدة، وفي زر «توحيد الماركات» في الإعدادات تقدر تعيدها (آمنة لو اتكررت). */
(function (window) {
  "use strict";

  // [الاسم الموحّد, ...أشكال تانية]
  var TABLE = [
    ["فريش", "Fresh"],
    ["يونيون اير", "Unionaire", "Union Air", "Unionair", "يونيون إير", "يونيونير"],
    ["تورنيدو", "Tornado"],
    ["بيكو", "Beko"],
    ["إل جي", "LG", "ال جي"],
    ["سامسونج", "Samsung", "سامسونغ"],
    ["شارب", "Sharp"],
    ["أريستون", "Ariston", "اريستون"],
    ["زانوسي", "Zanussi", "Zanusi"],
    ["ويرلبول", "Whirlpool", "ويرلبول"],
    ["إنديزيت", "Indesit", "انديزيت"],
    ["وايت بوينت", "White Point", "Whitepoint", "وايت بوانت"],
    ["كريازي", "Kiriazi", "Kiriazy", "Kiryazi", "كيريازي"],
    ["ايديال", "Ideal", "ايدييل"],
    ["فاجور", "Fagor", "فاغور"],
    ["دايو", "Daewoo", "ديو"],
    ["هيتاشي", "Hitachi", "هيتاتشي"],
    ["باناسونيك", "Panasonic"],
    ["كاريير", "Carrier", "كاريار", "كارير"],
    ["ميديا", "Midea"],
    ["هاير", "Haier"],
    ["جري", "Gree", "جرى"],
    ["تي سي إل", "TCL", "تى سى ال"],
    ["توشيبا العربي", "Toshiba El Araby", "Toshiba Elaraby", "Toshiba ElAraby", "Toshiba Al Araby", "توشيبا العربى"],
    ["توشيبا", "Toshiba"],
    ["بوش", "Bosch"],
    ["سيمنز", "Siemens"],
    ["إلكتروليكس", "Electrolux", "الكتروليكس"],
    ["فيليبس", "Philips"],
    ["هايسنس", "Hisense"],
    ["سانيو", "Sanyo"]
  ];

  // تطبيع: حروف صغيرة، من غير تشكيل/تطويل، توحيد الهمزات والياء والتاء المربوطة، وحذف أي مسافات/رموز.
  function wfBrandKey(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[ً-ٰٟـ]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ئ/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[^a-z0-9ء-ي]/g, "");
  }

  var KEY2CANON = null, CANON2ALIASES = null;
  function build() {
    if (KEY2CANON) return;
    KEY2CANON = Object.create(null); CANON2ALIASES = Object.create(null);
    TABLE.forEach(function (row) {
      var canon = row[0];
      CANON2ALIASES[canon] = row.slice(1);
      row.forEach(function (n) { var k = wfBrandKey(n); if (k && !KEY2CANON[k]) KEY2CANON[k] = canon; });
    });
  }

  // الاسم الموحّد لأي كتابة (لو معروفة)، وإلا نفس الاسم بعد تنضيف المسافات.
  function wfCanonicalBrand(name) {
    build();
    var t = String(name == null ? "" : name).replace(/\s+/g, " ").trim();
    if (!t) return "";
    return KEY2CANON[wfBrandKey(t)] || t;
  }

  // نص البحث للماركة: الاسم + أشكاله التانية (عشان البحث بالإنجليزي يوصل للعربي والعكس).
  function wfBrandSearchText(name) {
    build();
    var c = wfCanonicalBrand(name);
    return [name, c].concat(CANON2ALIASES[c] || []).join(" ");
  }

  function sameList(a, b) {
    return a.length === b.length && a.every(function (x, i) { return x === b[i]; });
  }

  // بتوحّد قايمة الماركات في الإعدادات + ماركة الأجهزة + ماركة أكواد الأعطال.
  function wfUnifyBrands(opts) {
    var auto = !!(opts && opts.auto);
    var K = window.K, res = { brandsBefore: 0, brandsAfter: 0, devices: 0, faultCodes: 0, ok: true };
    if (!K || typeof window.settings !== "function" || typeof window.put !== "function") { res.ok = false; return res; }

    var s = window.settings();
    var old = Array.isArray(s.brands) ? s.brands : [];
    var seen = Object.create(null), out = [];
    old.forEach(function (b) {
      var c = wfCanonicalBrand(b), k = wfBrandKey(c);
      if (!k || seen[k]) return;
      seen[k] = 1; out.push(c);
    });

    var devs = window.arr(K.d), devChanged = 0;
    devs.forEach(function (d) {
      if (!d || !d.brand) return;
      var c = wfCanonicalBrand(d.brand);
      if (c !== d.brand) { d.brand = c; devChanged++; }
      var k = wfBrandKey(c);
      // ماركة جهاز مش في القايمة: بنضمها في الزر اليدوي بس. التشغيل التلقائي بيكتفي بتحويل/حذف
      // التكرار من القايمة الموجودة (نتيجة ثابتة على كل الأجهزة، فمفيش تعارض مزامنة بين جهازين).
      if (!auto && k && !seen[k]) { seen[k] = 1; out.push(c); }
    });

    var fcs = window.arr(K.fc), fcChanged = 0;
    fcs.forEach(function (f) {
      if (!f || !f.brand) return;
      var c = wfCanonicalBrand(f.brand);
      if (c !== f.brand) { f.brand = c; fcChanged++; }
      var k = wfBrandKey(c);
      if (!auto && k && !seen[k]) { seen[k] = 1; out.push(c); }
    });

    res.brandsBefore = old.length; res.brandsAfter = out.length; res.devices = devChanged; res.faultCodes = fcChanged;

    var sChanged = !sameList(old, out);
    if (devChanged && !window.put(K.d, devs)) { res.ok = false; return res; }
    if (fcChanged) {
      if (!window.put(K.fc, fcs)) { res.ok = false; return res; }
      try { if (window.FaultCodesIDB && window.FaultCodesIDB.replace) window.FaultCodesIDB.replace(fcs); } catch (e) { /* WFStorage fallback */ }
    }
    // التشغيل التلقائي مابيكتبش الإعدادات أبدًا: الكتابة في الإعدادات وقت فتح الصفحة (قبل ما المزامنة تجهز)
    // كانت بتسبّب نافذة «تعارضات المزامنة» حتى على جهاز واحد. القوايم بتتنضف وقت العرض (wfBrandList)،
    // وتنضيف الإعدادات نفسها بتتم بزر «توحيد الماركات» أو أول ما تعدّل الماركات من الإعدادات.
    if (sChanged && !auto) {
      s.brands = out;
      if (!window.put(K.s, s)) { res.ok = false; return res; }
    }
    return res;
  }

  // قايمة ماركات للعرض: أسماء موحّدة ومن غير تكرار (من غير ما نكتب أي حاجة).
  function wfBrandList(list) {
    var seen = Object.create(null), out = [];
    (Array.isArray(list) ? list : []).forEach(function (b) {
      var c = wfCanonicalBrand(b), k = wfBrandKey(c);
      if (!k || seen[k]) return; seen[k] = 1; out.push(c);
    });
    return out;
  }

  window.wfBrandList = wfBrandList;
  window.wfBrandKey = wfBrandKey;
  window.wfCanonicalBrand = wfCanonicalBrand;
  window.wfBrandSearchText = wfBrandSearchText;
  window.wfUnifyBrands = wfUnifyBrands;

  // تشغيل تلقائي مرة واحدة (بعد الترحيلات) في أي صفحة فيها بيانات النظام.
  document.addEventListener("DOMContentLoaded", function () {
    Promise.resolve(window.workshopReady).then(function () {
      try {
        if (typeof window.settings !== "function" || !window.K) return;
        wfUnifyBrands({ auto: true });
      } catch (e) { console.warn("[brand-unify] تعذر التوحيد التلقائي", e); }
    });
  });
})(window);
