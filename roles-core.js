/* roles-core.js — المصدر الوحيد لتعريف الصلاحيات (المرحلة 1 من الأدوار والصلاحيات).

   مهم: النسخة دي لازم تتطابق حرفيًا مع functions/roles-core.js (فيه اختبار بيتأكد). تتحمّل في المتصفح (window.WFRoles)
   وفي دوال السيرفر (require).

   اللي بيتعدّل من داخل النظام (من غير كود): الأدوار، اسمها، مصفوفة صلاحياتها، دور كل مستخدم والاستثناءات الفردية.
   اللي بيتعدّل في الكود: «كتالوج» الصلاحيات نفسه — أي صلاحية جديدة مرتبطة بميزة جديدة في البرنامج.
   ترتيب الكتالوج للإضافة فقط (append-only): الـmask اللي في توكن المستخدم بيعتمد على رقم كل صلاحية. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WFRoles = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ---------- الكتالوج: [المفتاح, الوصف] مجمّعة ---------- */
  var GROUPS = [
    { id: "customers", label: "العملاء", perms: [["customers.view", "عرض العملاء"], ["customers.add", "إضافة عميل"], ["customers.edit", "تعديل عميل"], ["customers.delete", "حذف عميل"], ["customers.merge", "دمج العملاء المكررين"]] },
    { id: "devices", label: "الأجهزة", perms: [["devices.view", "عرض الأجهزة"], ["devices.add", "إضافة جهاز"], ["devices.edit", "تعديل جهاز"], ["devices.delete", "حذف جهاز"]] },
    { id: "requests", label: "أوامر الشغل", perms: [["requests.view", "عرض أوامر الشغل"], ["requests.add", "إنشاء أمر شغل"], ["requests.edit", "تعديل أمر شغل"], ["requests.close", "إغلاق أمر / تغيير حالته"], ["requests.delete", "حذف أمر شغل"]] },
    { id: "inventory", label: "المخزن والفواتير", perms: [["inventory.view", "عرض المخزن"], ["inventory.add", "إضافة صنف / توريد"], ["inventory.edit", "تعديل صنف / أسعار"], ["inventory.delete", "حذف صنف"], ["invoices.add", "إضافة فاتورة"], ["invoices.edit", "تعديل فاتورة"], ["invoices.delete", "حذف فاتورة"]] },
    { id: "tasks", label: "المهام", perms: [["tasks.view", "عرض المهام"], ["tasks.add", "إضافة مهمة"], ["tasks.edit", "تعديل مهمة"], ["tasks.delete", "حذف مهمة"]] },
    { id: "faultcodes", label: "أكواد الأعطال", perms: [["faultcodes.view", "عرض أكواد الأعطال"], ["faultcodes.add", "إضافة كود عطل"], ["faultcodes.edit", "تعديل كود عطل"], ["faultcodes.delete", "حذف كود عطل"]] },
    { id: "followup", label: "المتابعة", perms: [["route.view", "خط سير اليوم"], ["followup.view", "متابعة العملاء"], ["warranty.view", "الضمان"]] },
    { id: "wallets", label: "المحافظ (مالية)", perms: [["wallets.view", "عرض المحافظ"], ["wallets.add", "إضافة حركة محفظة"], ["wallets.edit", "تعديل حركة محفظة"], ["wallets.delete", "حذف حركة محفظة / مصروف"]] },
    { id: "treasury", label: "الخزنة (مالية)", perms: [["treasury.view", "عرض الخزنة"], ["treasury.add", "إضافة حركة خزنة"], ["treasury.edit", "تعديل حركة خزنة / رصيد افتتاحي"], ["treasury.delete", "حذف حركة خزنة"]] },
    { id: "reports", label: "التقارير", perms: [["reports.view", "عرض التقارير"], ["reports.export", "تصدير التقارير"]] },
    { id: "portal", label: "بوابة العملاء", perms: [["portal.manage", "إدارة بوابة العملاء (طلبات، شكاوى، مقالات)"]] },
    { id: "settings", label: "الإعدادات", perms: [["settings.view", "عرض الإعدادات"], ["settings.edit", "تعديل الإعدادات والقوائم"], ["branding.manage", "هوية النظام (الاسم والشعار والألوان)"]] },
    { id: "data", label: "بيانات حساسة", perms: [["data.backup", "أخذ نسخة احتياطية"], ["data.restore", "استرجاع نسخة احتياطية"], ["trash.restore", "الاسترجاع من سلة المحذوفات"], ["data.wipe", "الحذف الشامل (كل العملاء / الأجهزة / الأوامر / التهيئة)"]] },
    { id: "techs", label: "الفنيين والعهدة", perms: [["requests.assign", "تعيين فني على أمر الشغل"], ["custody.approve", "اعتماد مصروفات عهدة الفني"], ["custody.settle", "تسوية عهدة الفني (استلام الرصيد)"], ["techpay.manage", "أجور الفنيين: نوع الشغل والأجرة وصرف المستحقات"]] }
  ];

  var KEYS = [], LABELS = {}, GROUP_OF = {};
  GROUPS.forEach(function (g) { g.perms.forEach(function (p) { KEYS.push(p[0]); LABELS[p[0]] = p[1]; GROUP_OF[p[0]] = g.id; }); });
  var KEY_INDEX = {};
  KEYS.forEach(function (k, i) { KEY_INDEX[k] = i; });

  /* ---------- الصفحات: كل ملف يحتاج صلاحية عرض ---------- */
  var PAGES = {
    "customers.html": "customers.view", "customer.html": "customers.view",
    "merge-customers.html": "customers.merge",
    "devices.html": "devices.view", "device.html": "devices.view",
    "requests.html": "requests.view", "request.html": "requests.view", "pending-calls.html": "requests.view", "share-target.html": "requests.add", "dispatch.html": "requests.assign", "custody.html": "custody.approve",
    "inventory.html": "inventory.view", "part.html": "inventory.view", "part-moves.html": "inventory.view",
    "tasks.html": "tasks.view",
    "faultcodes.html": "faultcodes.view", "faultcode.html": "faultcodes.view", "compcodes.html": "faultcodes.view",
    "route.html": "route.view", "followup.html": "followup.view", "warranty.html": "warranty.view",
    "wallets.html": "wallets.view", "wallet.html": "wallets.view",
    "treasury.html": "treasury.view",
    "reports.html": "reports.view",
    "portal-admin.html": "portal.manage",
    "settings.html": "settings.view",
    "white-label.html": "branding.manage"
  };

  /* ---------- صفحات النماذج: add= / edit= في الرابط، وأزرار الحفظ ---------- */
  var FORMS = {
    customerForm: { page: "customers.html", add: "customers.add", edit: "customers.edit" },
    deviceForm: { page: "devices.html", add: "devices.add", edit: "devices.edit" },
    requestForm: { page: "requests.html", add: "requests.add", edit: "requests.edit" },
    partForm: { page: "inventory.html", add: "inventory.add", edit: "inventory.edit" },
    faultForm: { page: "faultcodes.html", add: "faultcodes.add", edit: "faultcodes.edit" }
  };

  /* ---------- الدوال الحساسة: اسم الدالة العامة ← الصلاحية المطلوبة ----------
     any: أي واحدة من القائمة تكفي. all: لازم كلها. saveEdit: [مفتاح الإضافة, مفتاح التعديل] والتمييز بالمعامل التاني (existing). */
  var ACTIONS = {
    deleteCustomerRecord: { all: ["customers.delete"] }, deleteDeviceRecord: { all: ["devices.delete"] }, deleteRequestRecord: { all: ["requests.delete"] },
    deleteFaultCodeRecord: { all: ["faultcodes.delete"] }, deleteFilteredFaultCodes: { all: ["faultcodes.delete"] }, deleteAllFaultCodes: { all: ["data.wipe"] },
    deleteAllCustomers: { all: ["data.wipe"] }, deleteAllDevices: { all: ["data.wipe"] }, deleteAllRequests: { all: ["data.wipe"] }, deleteAllOperationalData: { all: ["data.wipe"] },
    deletePartRecord: { all: ["inventory.delete"] }, restorePartRecord: { all: ["inventory.edit"] }, applyBulkPriceChange: { all: ["inventory.edit"] },
    saveRestock: { all: ["inventory.add"] }, saveQuickAddPart: { all: ["inventory.add"] },
    saveInvoice: { any: ["invoices.add", "invoices.edit"] }, editInvoiceLinks: { all: ["invoices.edit"] }, deleteInvoiceRecord: { all: ["invoices.delete"] },
    saveQuickCustomer: { all: ["customers.add"] }, saveQuickCustomerHome: { all: ["customers.add"] }, saveQuickDevice: { all: ["devices.add"] }, saveQuickDeviceHome: { all: ["devices.add"] },
    quickCreateRequest: { all: ["requests.add"] }, createRequestFromCallShare: { all: ["requests.add"] },
    closeOrder: { all: ["requests.close"] }, markPaidAndClose: { all: ["requests.close"] }, addPartToOrder: { all: ["requests.edit"] }, addExternalPartToOrder: { all: ["requests.edit"] }, removeOrderPart: { all: ["requests.edit"] }, updateOrderPartQty: { all: ["requests.edit"] },
    saveTask: { any: ["tasks.add", "tasks.edit"] }, deleteTask: { all: ["tasks.delete"] },
    addWalletManual: { all: ["wallets.add"] }, quickAddWalletTx: { all: ["wallets.add"] }, editWalletTx: { all: ["wallets.edit"] }, deleteWalletTx: { all: ["wallets.delete"] }, deleteExpense: { all: ["wallets.delete"] },
    transferBetweenWalletAndTreasury: { all: ["wallets.add", "treasury.add"] },
    addTreasuryManual: { all: ["treasury.add"] }, saveOpeningBalance: { all: ["treasury.edit"] }, editTreasuryEntry: { all: ["treasury.edit"] }, deleteTreasuryEntry: { all: ["treasury.delete"] },
    exportOrdersCSV: { all: ["reports.export"] }, exportInventoryCSV: { all: ["reports.export"] }, exportTreasuryCSV: { all: ["reports.export"] },
    backupAllData: { all: ["data.backup"] }, restoreBackupFile: { all: ["data.restore"] }, restoreFromTrash: { all: ["trash.restore"] },
    addCenter: { all: ["settings.edit"] }, deleteCenter: { all: ["settings.edit"] }, addVillage: { all: ["settings.edit"] }, addType: { all: ["settings.edit"] }, deleteType: { all: ["settings.edit"] }, editTypeOptions: { all: ["settings.edit"] },
    addBrand: { all: ["settings.edit"] }, deleteBrand: { all: ["settings.edit"] }, addPartCategory: { all: ["settings.edit"] }, deletePartCategory: { all: ["settings.edit"] },
    addSettingItem: { all: ["settings.edit"] }, deleteSettingItem: { all: ["settings.edit"] }, addInlineListItem: { all: ["settings.edit"] }, deleteInlineListItem: { all: ["settings.edit"] },
    addWaTemplate: { all: ["settings.edit"] }, deleteWaTemplate: { all: ["settings.edit"] }, addFollowupWaTemplate: { all: ["settings.edit"] }, deleteFollowupWaTemplate: { all: ["settings.edit"] },
    deleteReceiptField: { all: ["settings.edit"] }, addReceiptCustomField: { all: ["settings.edit"] }, addOrderTag: { all: ["settings.edit"] }, deleteOrderTag: { all: ["settings.edit"] }
  };
  /* دوال الحفظ اللي بتفرّق إضافة/تعديل حسب المعامل التاني (existing): [إضافة, تعديل] */
  var SAVE_EDIT = {
    saveDevice: ["devices.add", "devices.edit"], saveRequest: ["requests.add", "requests.edit"],
    savePart: ["inventory.add", "inventory.edit"], saveFaultCode: ["faultcodes.add", "faultcodes.edit"]
  };

  /* ---------- الأدوار الافتراضية (قابلة للتعديل بالكامل ما عدا المالك) ---------- */
  function without(list, drop) { return list.filter(function (k) { return drop.indexOf(k) < 0; }); }
  var OPERATIONAL = without(KEYS, ["wallets.view", "wallets.add", "wallets.edit", "wallets.delete", "treasury.view", "treasury.add", "treasury.edit", "treasury.delete",
    "settings.view", "settings.edit", "branding.manage", "data.backup", "data.restore", "trash.restore", "data.wipe", "reports.view", "reports.export", "portal.manage", "customers.merge", "custody.approve", "custody.settle", "techpay.manage"]);
  var DEFAULT_ROLES = {
    owner: { name: "المالك", perms: KEYS.slice(), locked: true },
    manager: { name: "مدير فرع", perms: OPERATIONAL.concat(["wallets.view", "treasury.view", "reports.view", "portal.manage", "settings.view", "data.backup"]) },
    tech: { name: "فني", perms: ["requests.view", "requests.edit", "requests.close", "devices.view", "devices.add", "devices.edit", "faultcodes.view", "tasks.view", "tasks.add", "tasks.edit", "route.view"] }
  };
  var DEFAULT_ORDER = ["owner", "manager", "tech"];

  function defaultConfig() {
    var roles = {};
    DEFAULT_ORDER.forEach(function (id) { var r = DEFAULT_ROLES[id]; roles[id] = { name: r.name, perms: r.perms.slice(), scope: "all" }; if (r.locked) roles[id].locked = true; });
    return { version: 1, order: DEFAULT_ORDER.slice(), roles: roles };
  }

  function cleanKeys(list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (k) { if (typeof k === "string" && KEY_INDEX[k] !== undefined && !seen[k]) { seen[k] = 1; out.push(k); } });
    out.sort(function (a, b) { return KEY_INDEX[a] - KEY_INDEX[b]; });
    return out;
  }
  /* نطاق البيانات: all = كل بيانات الورشة، assigned = الأوامر المعيّنة له فقط (وعملاؤها وأجهزتها). */
  function cleanScope(v) { return v === "all" || v === "assigned" ? v : ""; }
  function validRoleId(id) { return typeof id === "string" && /^[a-z][a-z0-9_]{1,23}$/.test(id); }

  /* تنظيف أي إعداد جاي من المستخدم/السحابة: المالك ثابت وبكل الصلاحيات، وأسماء الأدوار محدودة الطول. */
  function normalizeConfig(cfg) {
    var base = defaultConfig();
    if (!cfg || typeof cfg !== "object" || !cfg.roles || typeof cfg.roles !== "object") return base;
    var roles = {}, order = [];
    var ids = Array.isArray(cfg.order) ? cfg.order.slice() : [];
    Object.keys(cfg.roles).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    ids.forEach(function (id) {
      if (!validRoleId(id) || roles[id] || !cfg.roles[id] || typeof cfg.roles[id] !== "object") return;
      var name = String(cfg.roles[id].name == null ? "" : cfg.roles[id].name).replace(/\s+/g, " ").trim().slice(0, 40);
      if (!name) name = id;
      roles[id] = { name: name, perms: cleanKeys(cfg.roles[id].perms), scope: cleanScope(cfg.roles[id].scope) || "all" };
      order.push(id);
    });
    roles.owner = { name: roles.owner && roles.owner.name ? roles.owner.name : base.roles.owner.name, perms: KEYS.slice(), scope: "all", locked: true };
    if (order.indexOf("owner") < 0) order.unshift("owner");
    var v = Number(cfg.version);
    return { version: isFinite(v) && v > 0 ? Math.floor(v) : 1, order: order, roles: roles };
  }

  /* مستند «مُدار» = اتكتب من نظام الأدوار (علامة acl=1 أو createdBy). أي مستند تاني (اتكتب يدويًا من الـConsole
     حتى لو فيه حقل role بقيمة غريبة زي "admin") = موظف قديم = مالك، عشان محدش يتقفل عليه النظام. */
  function managed(staff) { return !!staff && typeof staff === "object" && (staff.acl === 1 || (typeof staff.createdBy === "string" && staff.createdBy !== "")); }
  function roleIdOf(staff) { return !managed(staff) || staff.role == null || staff.role === "" ? "owner" : String(staff.role); }

  /* الصلاحيات الفعلية للمستخدم. */
  function effectivePerms(config, staff) {
    if (!staff || typeof staff !== "object" || staff.disabled === true) return [];
    var cfg = normalizeConfig(config);
    var roleId = roleIdOf(staff);
    var role = cfg.roles[roleId];
    if (!role) return [];
    if (roleId === "owner") return KEYS.slice();
    var set = {};
    role.perms.forEach(function (k) { set[k] = 1; });
    cleanKeys(staff.allow).forEach(function (k) { set[k] = 1; });
    cleanKeys(staff.deny).forEach(function (k) { delete set[k]; });
    return KEYS.filter(function (k) { return set[k]; });
  }
  /* نطاق المستخدم الفعلي: المالك دايمًا all. استثناء فردي (staff.scope) يتغلّب على نطاق الدور. */
  function scopeOf(config, staff) {
    if (!staff || typeof staff !== "object" || staff.disabled === true) return "all";
    var roleId = roleIdOf(staff);
    if (roleId === "owner") return "all";
    var own = cleanScope(staff.scope);
    if (own) return own;
    var role = normalizeConfig(config).roles[roleId];
    return (role && role.scope) || "all";
  }
  function isOwner(config, staff) { return !!staff && staff.disabled !== true && roleIdOf(staff) === "owner" && !!normalizeConfig(config).roles.owner; }

  /* mask سداسي عشري: بت لكل صلاحية بترتيب الكتالوج (للتوكن وقواعد المرحلة 2). */
  function toMask(perms) {
    var bits = new Array(KEYS.length).fill(0), set = {};
    (perms || []).forEach(function (k) { set[k] = 1; });
    KEYS.forEach(function (k, i) { if (set[k]) bits[i] = 1; });
    var hex = "";
    for (var i = 0; i < bits.length; i += 4) hex += ((bits[i] || 0) * 8 + (bits[i + 1] || 0) * 4 + (bits[i + 2] || 0) * 2 + (bits[i + 3] || 0)).toString(16);
    return hex;
  }
  function fromMask(hex) {
    var out = [], s = String(hex || "");
    for (var i = 0; i < KEYS.length; i++) {
      var d = parseInt(s.charAt(Math.floor(i / 4)) || "0", 16);
      if (isNaN(d)) d = 0;
      if (d & (8 >> (i % 4))) out.push(KEYS[i]);
    }
    return out;
  }

  /* هل مجموعة الصلاحيات تسمح بالقاعدة دي؟ rule: {all:[...]} أو {any:[...]} أو مفتاح نصي */
  function satisfies(permSet, rule) {
    if (typeof rule === "string") return !!permSet[rule];
    if (rule && rule.all) return rule.all.every(function (k) { return !!permSet[k]; });
    if (rule && rule.any) return rule.any.some(function (k) { return !!permSet[k]; });
    return true;
  }

  return {
    GROUPS: GROUPS, KEYS: KEYS, LABELS: LABELS, GROUP_OF: GROUP_OF, PAGES: PAGES, FORMS: FORMS, ACTIONS: ACTIONS, SAVE_EDIT: SAVE_EDIT,
    defaultConfig: defaultConfig, normalizeConfig: normalizeConfig, effectivePerms: effectivePerms, roleIdOf: roleIdOf, managed: managed, isOwner: isOwner,
    cleanKeys: cleanKeys, cleanScope: cleanScope, scopeOf: scopeOf, validRoleId: validRoleId, toMask: toMask, fromMask: fromMask, satisfies: satisfies
  };
});
