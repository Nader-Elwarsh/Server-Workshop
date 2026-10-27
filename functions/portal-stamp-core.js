/* ختم المزامنة (_ts) لعملاء وأجهزة البوابة.
   عميل البوابة مابيقدرش يكتب _ts/_by (قواعد Firestore بتسمح بمفاتيح محددة بس)، فالمزامنة بالتغييرات
   (where _ts > آخر قراية) مابتشوفش اللي اتسجّل أو اتعدّل من البوابة. الدالة دي بتحدد هل الكتابة دي محتاجة ختم من السيرفر.
   - needsStamp(before, after): true بس لو السجل جاي من البوابة (portal === true) ومالوش ختم بعد الكتابة دي.
   - الختم نفسه بيغيّر _ts فبيرجع false (مفيش حلقة)، وتعديل الموظف بيختم _ts بنفسه فبيرجع false. */
"use strict";

function tsMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === "function") { try { return +v.toMillis() || 0; } catch (e) { return 0; } }
  return 0;
}

function stable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (typeof v.toMillis === "function") return "ts:" + tsMs(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
}

function sameContent(a, b) {
  const strip = (o) => { const c = Object.assign({}, o); delete c._ts; delete c._by; return c; };
  return stable(strip(a)) === stable(strip(b));
}

function needsStamp(before, after) {
  if (!after || typeof after !== "object") return false; // مسح
  if (after.portal !== true) return false;               // مش من البوابة
  if (!before) return !after._ts;                        // إنشاء: يتختم لو مافيهوش ختم
  if (tsMs(before._ts) !== tsMs(after._ts)) return false; // حد ختمه (السيرفر أو الموظف) في نفس الكتابة
  if (!after._ts) return true;                           // سجل بوابة عمره ما اتختم
  return !sameContent(before, after);                    // نفس الختم القديم + محتوى اتغيّر = تعديل عميل من غير ختم
}

module.exports = { needsStamp, tsMs };
