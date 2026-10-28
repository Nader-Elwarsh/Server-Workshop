/* فواتير المخزن: صورة فاتورة واحدة ممكن تتربط بأكتر من صنف، وتظهر بعدين في صفحة كل صنف مرتبط بيها. */
let _editingInvoiceId = null;

function toggleInvoicesBox() {
  const box = document.getElementById("invoicesBox");
  if (!box) return;
  box.classList.toggle("hidden");
  if (!box.classList.contains("hidden")) { invoiceFormReset(); renderInvoices(); }
}

function invoicePartOptionsHtml(filter) {
  filter = (filter || "").trim();
  const parts = arr(K.p).filter(p => !p.archived);
  const list = filter ? parts.filter(p => typeof partMatchesQuery === "function" ? partMatchesQuery(p, filter) : ((p.name || "").includes(filter) || (p.code || "").includes(filter))) : parts;
  let html = list.length ? list.slice(0, 80).map(p => `<label class="inv-part-check"><input type="checkbox" value="${p.id}" class="inv-part-cb"> ${esc(p.name)}${p.code ? ` <small>(${esc(p.code)})</small>` : ""}</label>`).join("") : `<div class="hint">لا توجد أصناف مطابقة.</div>`;
  // لو الاسم المكتوب في البحث مش موجود بالظبط في المخزن، نسيب خيار
  // إضافته كصنف جديد مباشرة (بنفس نافذة "إضافة قطعة جديدة" المشتركة
  // المستخدمة في التوريد)، عشان تقدري تسجّليه وتكتبي تفاصيله من الفاتورة
  // نفسها من غير ما تخرجي من هنا وتدخلي لشاشة تانية.
  if (filter && !(typeof findDuplicatePartName === "function" ? findDuplicatePartName(filter) : parts.some(p => (p.name || "").trim().toLowerCase() === filter.toLowerCase()))) {
    html += `<button type="button" class="secondary small-btn inv-add-new-part" data-newpart="${esc(filter)}">➕ "${esc(filter)}" صنف جديد — إضافته للمخزن</button>`;
  }
  return html;
}
function filterInvoicePartOptions() {
  const host = document.getElementById("invPartOptions"); if (!host) return;
  const q = document.getElementById("invPartFilter")?.value || "";
  const checked = new Set(Array.from(host.querySelectorAll(".inv-part-cb:checked")).map(x => x.value));
  host.innerHTML = invoicePartOptionsHtml(q);
  host.querySelectorAll(".inv-part-cb").forEach(cb => { if (checked.has(cb.value)) cb.checked = true; });
  host.querySelectorAll(".inv-add-new-part").forEach(btn => {
    btn.addEventListener("click", () => {
      const typedName = btn.dataset.newpart;
      if (typeof openQuickAddPart !== "function") { alert("إضافة صنف جديد متاحة من صفحة المخزن."); return; }
      openQuickAddPart(typedName, {
        anchor: "invPartOptions",
        onCreated: (p) => {
          const filterEl = document.getElementById("invPartFilter"); if (filterEl) filterEl.value = "";
          filterInvoicePartOptions();
          const cb = document.querySelector(`#invPartOptions .inv-part-cb[value="${p.id}"]`);
          if (cb) { cb.checked = true; cb.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
        }
      });
    });
  });
}
function invoiceFormReset() {
  _editingInvoiceId = null;
  const photo = document.getElementById("invPhoto"); if (photo) photo.value = ""; refreshDualPhotoName("invPhoto");
  const preview = document.getElementById("invPhotoPreview"); if (preview) preview.innerHTML = "";
  const note = document.getElementById("invNote"); if (note) note.value = "";
  const btn = document.getElementById("invSaveBtn"); if (btn) btn.textContent = "💾 حفظ واختيار الأصناف";
  const filterEl = document.getElementById("invPartFilter"); if (filterEl) filterEl.value = "";
  filterInvoicePartOptions();
}
// معاينة صورة الفاتورة فورًا بعد اختيارها (كاميرا أو من الصور)، عشان تبقى
// ظاهرة وواضحة على الصفحة نفسها جنب قائمة اختيار الأصناف المرتبطة بيها —
// بدل ما تحتاجي تحفظي وتضغطي "عرض" الأول عشان تشوفيها.
async function showInvoicePhotoPreview(dataURL) {
  renderLivePhotoPreview("invPhotoPreview", dataURL);
}
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("invPhoto")?.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) { showInvoicePhotoPreview(""); return; }
    const dataURL = await imageToDataURL(f, 1400, 0.8);
    showInvoicePhotoPreview(dataURL);
  });
});
async function editInvoiceLinks(invId) {
  const inv = arr(K.inv).find(x => x.id === invId); if (!inv) return;
  const box = document.getElementById("invoicesBox");
  if (box && box.classList.contains("hidden")) box.classList.remove("hidden");
  _editingInvoiceId = invId;
  const note = document.getElementById("invNote"); if (note) note.value = inv.note || "";
  const filterEl = document.getElementById("invPartFilter"); if (filterEl) filterEl.value = "";
  filterInvoicePartOptions();
  (inv.partIds || []).forEach(pid => {
    const cb = document.querySelector(`#invPartOptions .inv-part-cb[value="${pid}"]`);
    if (cb) cb.checked = true;
  });
  const btn = document.getElementById("invSaveBtn"); if (btn) btn.textContent = "💾 حفظ الصورة/الملاحظة";
  document.getElementById("invoiceForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const src = window.ImageStore ? await window.ImageStore.resolveSrc(inv.photo) : inv.photo;
  if (src) showInvoicePhotoPreview(src);
}
let _invoiceBusy = false;
async function saveInvoice() {
  // ضغطتين ورا بعض أثناء تجهيز الصورة كانوا بيسجّلوا الفاتورة مرتين
  if (_invoiceBusy) return;
  _invoiceBusy = true;
  try { return await saveInvoiceInner(); } finally { _invoiceBusy = false; }
}
async function saveInvoiceInner() {
  const file = document.getElementById("invPhoto")?.files?.[0] || null;
  const note = (document.getElementById("invNote")?.value || "").trim();
  const list = arr(K.inv);
  if (_editingInvoiceId) {
    const inv = list.find(x => x.id === _editingInvoiceId);
    if (!inv) { invoiceFormReset(); renderInvoices(); return; }
    if (file) {
      const dataURL = await imageToDataURL(file, 1400, 0.72);
      inv.photo = window.ImageStore ? await window.ImageStore.save(dataURL, inv.photo) : dataURL;
    }
    inv.note = note; /* الأصناف بتتربط من «🔗 الأصناف» وبتتحفظ لحظتها */
    if (!saveJSONSafe(K.inv, list)) return;
    invoiceFormReset(); renderInvoices();
    if (typeof partProfile === "function") partProfile();
    return;
  }
  if (!file) return alert("اختر صورة الفاتورة الأول.");
  const dataURL = await imageToDataURL(file, 1400, 0.72);
  const photo = window.ImageStore ? await window.ImageStore.save(dataURL) : dataURL;
  const newId = id();
  list.push({ id: newId, photo, note, partIds: [], at: new Date().toISOString() });
  if (!saveJSONSafe(K.inv, list)) return;
  invoiceFormReset(); renderInvoices();
  openInvoiceLinker(newId); // على طول: اختار أصنافها (كل صنف بيتسجل أول ما تدوس عليه)
}
function deleteInvoiceRecord(invId) {
  const list = arr(K.inv), inv = list.find(x => x.id === invId); if (!inv) return;
  if (!confirm("حذف هذه الفاتورة نهائيًا؟ (مش هيأثر على الأصناف أو كمياتها، مجرد صورة الفاتورة وربطها هيتشال)")) return;
  if (!saveJSONSafe(K.inv, list.filter(x => x.id !== invId))) return;
  // صورة فاتورة التوريد مستخدمة كمان في سجل حركات الصنف: مانمسحهاش طول ما فيه حركة شايلاها
  if (window.ImageStore?.delete && inv.photo && !arr(K.m).some(m => m && m.invoice === inv.photo)) window.ImageStore.delete(inv.photo);
  if (_editingInvoiceId === invId) invoiceFormReset();
  renderInvoices();
  if (typeof partProfile === "function") partProfile();
}
function invoicePartNames(inv) {
  const partsById = byIdCached(K.p);
  return (inv.partIds || []).map(pid => partsById.get(pid)?.name).filter(Boolean);
}
// بيملا صور الفواتير (اللي اتحطت كـplaceholder فاضي وقت الرندر) بعد ما
// نجيبها من مخزن الصور بشكل غير متزامن — نفس الأسلوب المستخدم لصورة
// الصنف/الجهاز في partProfile، عشان الصورة تظهر واضحة على الصفحة نفسها
// من غير ما تحتاجي تضغطي "عرض" الأول.
async function resolveInvoiceThumbs(root) {
  const imgs = Array.from((root || document).querySelectorAll(".invoice-thumb[data-photo-ref]")).filter(img => !img.getAttribute("src"));
  await Promise.all(imgs.map(async img => {
    const ref = img.dataset.photoRef;
    const src = window.ImageStore ? await window.ImageStore.resolveSrc(ref) : ref;
    if (src) img.src = src;
  }));
}
// «عرض المزيد» بيضيف فواتير جديدة في القائمة: نحمّل صورها المصغّرة.
document.addEventListener("wf-pager-more", e => { if (e.detail && e.detail.key === "invoices") resolveInvoiceThumbs(e.detail.host); });
function renderInvoices() {
  const host = document.getElementById("invoicesList"); if (!host) return;
  const list = arr(K.inv).slice().reverse();
  if (!list.length) { host.innerHTML = `<div class="hint">لا توجد فواتير مسجّلة بعد.</div>`; return; }
  host.innerHTML = WFPager.render("invoices", list, inv => {
    const names = invoicePartNames(inv);
    return `<div class="item invoice-row">
      <img class="invoice-thumb" loading="lazy" decoding="async" alt="🧾" data-photo-ref="${esc(inv.photo)}" data-wf-event="click" data-wf-code="showImagePreview('${esc(inv.photo)}','🧾 فاتورة مخزن')">
      <div class="invoice-meta">
        <small>${new Date(inv.at).toLocaleDateString("ar-EG")}${inv.note ? " • " + esc(inv.note) : ""}</small>
        <small>${names.length ? `🔗 ${names.map(esc).join("، ")}` : "بدون ربط بصنف"}</small>
      </div>
      <div class="compact-actions"><button type="button" class="primary mini-action" data-wf-event="click" data-wf-code="openInvoiceLinker('${inv.id}')">🔗 الأصناف (${(inv.partIds || []).length})</button><button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="editInvoiceLinks('${inv.id}')">✏️ الصورة/الملاحظة</button><button type="button" class="danger-btn mini-action" data-wf-event="click" data-wf-code="deleteInvoiceRecord('${inv.id}')">🗑️ حذف</button></div>
    </div>`;
  }, "invoices", { step: 20 }).html;
  resolveInvoiceThumbs(host);
}
/* يستخدم من صفحة الصنف نفسه: بيعرض الفواتير المرتبطة بيه فعلًا (مع زرار
   إلغاء ربط لكل واحدة، بتأكيد قبل التنفيذ)، وتحته قسم قابل للفتح لربط
   الصنف بفاتورة تانية موجودة (تقدري تربطيه بأكتر من فاتورة من غير حدود). */
function partLinkedInvoicesHtml(partId) {
  const linked = arr(K.inv).filter(inv => (inv.partIds || []).includes(partId)).slice().reverse();
  const linkedRows = linked.length ? linked.map(inv => `
    <div class="item invoice-row">
      <img class="invoice-thumb" loading="lazy" decoding="async" alt="🧾" data-photo-ref="${esc(inv.photo)}" data-wf-event="click" data-wf-code="showImagePreview('${esc(inv.photo)}','🧾 فاتورة مخزن')">
      <div class="invoice-meta"><small>${new Date(inv.at).toLocaleDateString("ar-EG")}${inv.note ? " • " + esc(inv.note) : ""}</small></div>
      <button type="button" class="danger-btn mini-action" data-wf-event="click" data-wf-code="unlinkPartInvoice('${partId}','${inv.id}')">🗑️ إلغاء الربط</button>
    </div>`).join("") : `<div class="hint">لا توجد فواتير مرتبطة بهذا الصنف حتى الآن.</div>`;
  return `<h2>🧾 فواتير مرتبطة بهذا الصنف</h2>
    <div class="invoice-list">${linkedRows}</div>
    <button type="button" class="secondary small-btn" data-wf-event="click" data-wf-code="togglePartInvoiceLinker('${partId}')">➕ ربط بفاتورة موجودة</button>
    <div id="partInvoiceLinker_${partId}" class="hidden" style="margin-top:8px">
      <input type="text" placeholder="🔍 دوّر بالتاريخ أو الملاحظة..." data-wf-event="input" data-wf-code="renderPartInvoiceLinkOptions('${partId}', this.value)">
      <div id="partInvoiceLinkOptions_${partId}" class="inv-part-options" style="margin-top:6px"></div>
    </div>`;
}
function togglePartInvoiceLinker(partId) {
  const box = document.getElementById(`partInvoiceLinker_${partId}`); if (!box) return;
  box.classList.toggle("hidden");
  if (!box.classList.contains("hidden")) renderPartInvoiceLinkOptions(partId, "");
}
function renderPartInvoiceLinkOptions(partId, filter) {
  const host = document.getElementById(`partInvoiceLinkOptions_${partId}`); if (!host) return;
  filter = (filter || "").trim();
  const candidates = arr(K.inv).filter(inv => !(inv.partIds || []).includes(partId)).slice().reverse();
  const filtered = filter ? candidates.filter(inv => (inv.note || "").includes(filter) || new Date(inv.at).toLocaleDateString("ar-EG").includes(filter)) : candidates;
  host.innerHTML = filtered.length ? filtered.slice(0, 60).map(inv => `
    <div class="item invoice-row">
      <img class="invoice-thumb" loading="lazy" decoding="async" alt="🧾" data-photo-ref="${esc(inv.photo)}" data-wf-event="click" data-wf-code="showImagePreview('${esc(inv.photo)}','🧾 فاتورة مخزن')">
      <div class="invoice-meta"><small>${new Date(inv.at).toLocaleDateString("ar-EG")}${inv.note ? " • " + esc(inv.note) : ""}</small></div>
      <button type="button" class="secondary mini-action" data-wf-event="click" data-wf-code="linkPartInvoice('${partId}','${inv.id}')">🔗 ربط</button>
    </div>`).join("") : `<div class="hint">${filter ? "لا توجد فواتير مطابقة." : "كل الفواتير المسجّلة مرتبطة بالصنف ده فعلًا."}</div>`;
  resolveInvoiceThumbs(host);
}
function linkPartInvoice(partId, invId) {
  const list = arr(K.inv), inv = list.find(x => x.id === invId); if (!inv) return;
  if (!(inv.partIds || []).includes(partId)) {
    inv.partIds = [...(inv.partIds || []), partId];
    if (!saveJSONSafe(K.inv, list)) return;
  }
  if (typeof partProfile === "function") partProfile();
}
function unlinkPartInvoice(partId, invId) {
  const list = arr(K.inv), inv = list.find(x => x.id === invId); if (!inv) return;
  const when = `${new Date(inv.at).toLocaleDateString("ar-EG")}${inv.note ? " — " + inv.note : ""}`;
  if (!confirm(`هل تريد إلغاء ربط هذه الفاتورة (${when}) بهذا الصنف؟`)) return;
  inv.partIds = (inv.partIds || []).filter(pid => pid !== partId);
  if (!saveJSONSafe(K.inv, list)) return;
  if (typeof partProfile === "function") partProfile();
}
document.addEventListener("DOMContentLoaded", () => { if (document.getElementById("invoicesList")) renderInvoices(); });

/* ===== ربط الفاتورة بأصنافها: نافذة واحدة — دوس على الصنف يتربط فورًا، ودوس ✖ يتشال فورًا (من غير زرار حفظ) ===== */
function invoiceLinkSet(invId, partId, on) {
  const list = arr(K.inv), inv = list.find(x => x.id === invId); if (!inv) return false;
  const ids = new Set(inv.partIds || []);
  if (on) ids.add(partId); else ids.delete(partId);
  inv.partIds = Array.from(ids);
  if (!saveJSONSafe(K.inv, list)) return false;
  return true;
}
function openInvoiceLinker(invId) {
  const inv0 = arr(K.inv).find(x => x.id === invId); if (!inv0) return;
  document.getElementById("invLinkerDialog")?.remove();
  const D = document, m = D.createElement("div"); m.className = "txd-modal"; m.id = "invLinkerDialog";
  m.innerHTML = `<div class="txd-sheet rd-sheet inv-linker" role="dialog" aria-label="أصناف الفاتورة">
    <div class="inv-lk-head"><img class="invoice-thumb" alt="🧾" data-photo-ref="${esc(inv0.photo)}"><div><div class="txd-title">🔗 أصناف الفاتورة</div><small class="hint">${new Date(inv0.at).toLocaleDateString("ar-EG")}${inv0.note ? " • " + esc(inv0.note) : ""}</small></div></div>
    <div class="hint">دوس على أي صنف يتربط على طول — ودوس ✖ عشان تشيله. مفيش زرار حفظ.</div>
    <div id="invLkChips" class="inv-lk-chips"></div>
    <input type="search" id="invLkQ" placeholder="🔍 اكتب اسم الصنف أو الكود…" autocomplete="off">
    <div id="invLkRes" class="inv-lk-res"></div>
    <div class="txd-actions"><button type="button" class="primary" id="invLkDone">✅ تم</button></div></div>`;
  D.body.appendChild(m);
  resolveInvoiceThumbs(m);
  const q = s => m.querySelector(s), close = () => { m.remove(); renderInvoices(); if (typeof partProfile === "function") partProfile(); };
  let flashT = null;
  const flash = (el) => { if (!el) return; el.classList.add("inv-lk-flash"); clearTimeout(flashT); flashT = setTimeout(() => el.classList.remove("inv-lk-flash"), 700); };
  function chips() {
    const inv = arr(K.inv).find(x => x.id === invId) || { partIds: [] }, pm = byIdCached(K.p);
    const ids = inv.partIds || [];
    q("#invLkChips").innerHTML = ids.length ? ids.map(pid => `<span class="inv-lk-chip" data-pid="${esc(pid)}">${esc(pm.get(pid)?.name || "صنف محذوف")}<button type="button" aria-label="شيل" data-rm="${esc(pid)}">✖</button></span>`).join("") : `<span class="hint">لسه مفيش أصناف مربوطة.</span>`;
    q("#invLkChips").querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { if (invoiceLinkSet(invId, b.dataset.rm, false)) { chips(); results(); } });
    return ids;
  }
  function results() {
    const ids = new Set((arr(K.inv).find(x => x.id === invId) || {}).partIds || []), f = q("#invLkQ").value.trim();
    const parts = arr(K.p).filter(p => p && !p.archived && !ids.has(p.id));
    const list = f ? parts.filter(p => typeof partMatchesQuery === "function" ? partMatchesQuery(p, f) : ((p.name || "").includes(f) || (p.code || "").includes(f))) : parts;
    let h = list.slice(0, 40).map(p => `<button type="button" class="inv-lk-item" data-pid="${esc(p.id)}">➕ ${esc(p.name)}${p.code ? ` <small>(${esc(p.code)})</small>` : ""}<small class="hint"> • متاح ${+p.qty || 0}</small></button>`).join("");
    if (!list.length) h = `<div class="hint">${f ? "مفيش صنف بالاسم ده." : "كل الأصناف مربوطة بالفاتورة دي."}</div>`;
    if (f && !(typeof findDuplicatePartName === "function" ? findDuplicatePartName(f) : arr(K.p).some(p => (p.name || "").trim().toLowerCase() === f.toLowerCase())))
      h += `<button type="button" class="secondary small-btn inv-lk-new">➕ «${esc(f)}» صنف جديد — يتضاف للمخزن ويتربط</button>`;
    q("#invLkRes").innerHTML = h;
    q("#invLkRes").querySelectorAll(".inv-lk-item").forEach(b => b.onclick = () => {
      if (!invoiceLinkSet(invId, b.dataset.pid, true)) return;
      chips(); flash(q(`#invLkChips [data-pid="${CSS.escape(b.dataset.pid)}"]`)); results(); q("#invLkQ").focus();
    });
    const nb = q(".inv-lk-new");
    if (nb) nb.onclick = () => {
      if (typeof openQuickAddPart !== "function") { alert("إضافة صنف جديد متاحة من صفحة المخزن."); return; }
      openQuickAddPart(f, { anchor: "invLkRes", onCreated: p => { if (invoiceLinkSet(invId, p.id, true)) { q("#invLkQ").value = ""; chips(); results(); } } });
    };
  }
  q("#invLkQ").addEventListener("input", results);
  q("#invLkDone").onclick = close; m.addEventListener("click", ev => { if (ev.target === m) close(); });
  chips(); results();
  setTimeout(() => { try { q("#invLkQ").focus(); } catch (_) {} }, 50);
}
(function () {
  try {
    if (document.getElementById("invLkCss")) return;
    const st = document.createElement("style"); st.id = "invLkCss";
    st.textContent = ".inv-linker{max-height:88vh;display:flex;flex-direction:column;gap:8px}.inv-lk-head{display:flex;gap:10px;align-items:center}.inv-lk-head .invoice-thumb{width:54px;height:54px;object-fit:cover;border-radius:10px}" +
      ".inv-lk-chips{display:flex;flex-wrap:wrap;gap:6px;min-height:30px}.inv-lk-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 10px;border-radius:999px;background:var(--bg-sunken);border:1px solid var(--border);font-size:14px;transition:background .3s}" +
      ".inv-lk-chip button{border:0;background:transparent;color:var(--danger-text);font-size:13px;min-height:0;width:auto;padding:2px 6px;cursor:pointer}.inv-lk-flash{background:var(--success-bg,#dcfce7)}" +
      ".inv-lk-res{overflow:auto;max-height:42vh;display:grid;gap:4px}.inv-lk-item{display:block;width:100%;text-align:start;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-elevated);color:var(--text);font:inherit;cursor:pointer}.inv-lk-item:active{opacity:.6}";
    document.head.appendChild(st);
  } catch (e) {}
})();
