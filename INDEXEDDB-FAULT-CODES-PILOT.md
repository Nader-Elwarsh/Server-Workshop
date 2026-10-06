# تجربة IndexedDB — أكواد الأعطال

هذه التجربة تنقل **أكواد الأعطال فقط** إلى IndexedDB كمصدر التخزين المحلي الأساسي.

## الملفات المطلوبة

ارفع الملفات الموجودة في ZIP إلى نفس مجلد المشروع، مع استبدال الملفات التي تحمل نفس الاسم:

- `fault-codes-idb.js`
- `app-fault-codes.js`
- `app-quick-add.js`
- `faultcodes.html`
- `faultcode.html`
- `service-worker.js`

ملف `fault-codes-idb-tests.js` للاختبار فقط ولا يحتاج رفعه للاستضافة.

## السلوك الآمن

- أول فتح: يتم نسخ أكواد الأعطال القديمة من `localStorage` إلى IndexedDB.
- بعد ذلك: تُقرأ أكواد الأعطال من IndexedDB، مع إبقاء نسخة توافق في `localStorage` حتى تستمر مزامنة Firebase الحالية.
- كل إضافة أو تعديل أو حذف يُحفظ محليًا أولًا في `localStorage`، ثم يُنسخ إلى IndexedDB بدون تعطيل الواجهة.
- إذا كان IndexedDB غير متاح أو فشل، يستمر النظام من `localStorage` بدون حذف البيانات.
- لا يتم لمس العملاء أو الأجهزة أو أوامر الشغل أو المخزون أو الحسابات.

## التحقق

تم اجتياز:

- `fault-codes-idb-tests: PASS`
- `syntax-check: PASS (155 JavaScript files)`
- `migration-single-flight-test: PASS`
- `core-date-backup-tests: PASS`
- فتح صفحات `faultcodes.html` و`faultcode.html` في اختبار المتصفح.
