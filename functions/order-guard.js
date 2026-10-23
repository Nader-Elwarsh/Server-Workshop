"use strict";
/*
  حارس تعديلات الفني على أمر الشغل (بيشتغل على السيرفر بعد كل كتابة على requests/{id}).
  قواعد Firestore بتمنع الفني يلمس الهوية والفلوس (العربون/القفل/الأجور)، بس مش بتقدر تفحص جوه قايمة القطع.
  هنا بنصلّح أي تعديل مباشر من جهاز الفني (_by == techId):
   - قطع المخزن بتتضاف/تترجع من السيرفر بس (techUsePart/techReturnPart) — أي تغيير مباشر فيها (كمية/سعر/قطعة جديدة) بيترجع.
   - القطع اللي من بره بتفضل زي ما الفني كتبها (سعرها ومصروفها بيتراجع من الإدارة).
   - الإجماليات بتتحسب من جديد (مايتكتبش إجمالي غير مطابق للمصنعية + القطع).
   - لو الإعدادات قافلة المصنعية على الفني (techLaborLocked)، المصنعية بترجع للي كانت عليه.
  كتابات السيرفر نفسه بتتعلّم _by = "srv" فمابتتفحصش. ملف نقي (من غير Firebase) عشان يتختبر.
*/
const num = (v) => { const n = +v; return isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(num(n) * 100) / 100;
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

function stockOf(parts) { return (Array.isArray(parts) ? parts : []).filter((p) => p && !p.external && p.partId); }
function extOf(parts) { return (Array.isArray(parts) ? parts : []).filter((p) => p && p.external); }

function guardTechEdit(before, after, opts) {
  opts = opts || {};
  if (!before || !after) return null;
  const by = String(after._by || "");
  if (!by || by === "srv" || !after.techId || by !== String(after.techId)) return null; // مش كتابة من جهاز الفني المعيّن
  if (after.closed === true && before.closed !== true) return null; // القفل بيتم من السيرفر (techCloseOrder) وبيتفحص هناك
  const patch = {}, why = [];
  let parts = Array.isArray(after.parts) ? after.parts : [];
  if (!same(stockOf(before.parts), stockOf(after.parts))) {
    parts = stockOf(before.parts).concat(extOf(after.parts));
    patch.parts = parts; why.push("قطع المخزن");
  }
  let labor = num(after.labor);
  if (opts.laborLocked && !same(num(before.labor), labor)) { labor = num(before.labor); patch.labor = labor; why.push("المصنعية"); }
  if (after.warrantyDecision === "warranty" && labor !== 0) { labor = 0; patch.labor = 0; }
  const partsTotal = r2(parts.reduce((a, p) => a + num(p.qty) * num(p.sell), 0));
  const partsCost = r2(parts.reduce((a, p) => a + num(p.qty) * num(p.cost), 0));
  const total = r2(labor + partsTotal);
  const remain = Math.max(0, r2(total - (num(after.deposit) - num(after.depositRefunded))));
  if (r2(after.partsTotal) !== partsTotal) patch.partsTotal = partsTotal;
  if (r2(after.partsCost) !== partsCost) patch.partsCost = partsCost;
  if (r2(after.total) !== total) { patch.total = total; if (!why.length) why.push("الإجمالي"); }
  if (after.remain !== undefined && r2(after.remain) !== remain) patch.remain = remain;
  if (!Object.keys(patch).length) return null;
  return { patch, why };
}

module.exports = { guardTechEdit, stockOf, extOf };
