# تأمين phoneIndex + App Check — خطوات الإطلاق (بالترتيب)

**الفكرة:** بدل ما أي حد يقدر يقرا `phoneIndex/{رقم}` (فيه الإيميل والـuid)، الدخول بالتليفون بيمر على دالة سيرفر
محدودة العدد (لكل IP ولكل رقم) ومحمية بـ App Check. التطبيق بيرجع تلقائيًا للمسار القديم لو الدالة مش منشورة،
فمفيش مرحلة بتكسر الدخول لو اتنفذت بالترتيب ده.

## 1) انشر الدوال + قواعد المرحلة 1
```
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules
```
- لازم `UPLOAD_ALLOWED_ORIGINS` (نفس اللي بيستخدمه رفع الصور) يحتوي على دومين البوابة، لأن الدالتين بترفضا أي Origin تاني.
- `ENFORCE_APP_CHECK` افتراضيه `false` (وضع المراقبة). ماتغيّرهوش دلوقتي.
- المرحلة 1 من القواعد بتقيّد إنشاء `phoneIndex` (رقم موبايل مصري صحيح + إيميل الحساب نفسه + uid صاحب الجلسة) والقراءة لسه مفتوحة.

## 2) فعّل TTL لجدول العدّادات
Firebase Console ← Firestore ← TTL ← أضف سياسة: المجموعة `rateLimits` والحقل `expireAt`. (بيمسح العدّادات القديمة تلقائيًا.)

## 3) ارفع ملفات الواجهة (الـzip) واختبر
- ادخل البوابة برقم تليفون وكلمة السر، جرّب «نسيت كلمة المرور»، وجرّب تسجيل عميل جديد.
- Firebase Console ← Functions ← Logs: لازم تشوف نداءات `portalLoginLookup` و`portalPhoneAvailable` بتنجح.

## 4) المرحلة 2: اقفل القراءة
بعد ما تتأكد من 3:
```
cp firestore.rules.proposed firestore.rules
firebase deploy --only firestore:rules
```
اختبار: من متصفح غير مسجّل دخول، `phoneIndex/01xxxxxxxxx` لازم يرجع permission-denied، والدخول بالتليفون من البوابة يفضل شغال.
(لو حصلت مشكلة: ارجع للملف القديم وانشره.)

## 5) App Check (اختياري لكن موصى به)
1. Firebase Console ← App Check ← سجّل تطبيق الويب بـ reCAPTCHA v3 (أو Enterprise) وأضف دومينات الموقع.
2. انسخ مفتاح الموقع في `app-check.js` (المتغير `SITE_KEY`، وغيّر `PROVIDER` لو Enterprise).
3. نزّل الملف ده في مجلد `vendor/` (نفس إصدار باقي الملفات 12.18.0):
   `https://www.gstatic.com/firebasejs/12.18.0/firebase-app-check-compat.js`
4. ارفع النسخة، وسيب App Check في وضع **المراقبة** أيام: Console ← App Check ← APIs ← Cloud Firestore / Functions، وراقب نسبة الطلبات المعتمدة.
5. لما تقرب من 100% معتمد: اضغط **Enforce** على Firestore (وAuthentication لو الخيار متاح لمشروعك)، وفعّل في الدوال:
   `functions/.env` ← `ENFORCE_APP_CHECK=true` ثم `firebase deploy --only functions`.
- للتجربة المحلية فقط: ولّد Debug token من الـConsole وحطه في `DEBUG_TOKEN` (وامسحه قبل النشر).
- أي نسخة قديمة من التطبيق متخزنة على جهاز موظف هتتوقف بعد الإلزام لحد ما تتحدّث (افتح التطبيق مرتين).

## حدود لازم تعرفها
- ده بيمنع القراءة العامة والتخمين الجماعي، لكن **مش بيثبت إن اللي بيسجّل الرقم هو صاحبه** (مفيش تحقق برسالة SMS).
  لو حد حجز رقم عميل قبل صاحبه، الموظف يقدر يحذف/يعدّل `phoneIndex` من الـConsole أو من شاشة البوابة ويفعّل حساب العميل الصح.
- الدالة بتكشف إيميل الحساب لمن يعرف الرقم وعدّى حد الطلبات وApp Check؛ ده المطلوب لتسجيل الدخول بالرقم بدون تغيير طريقة الحسابات الحالية.
- موصى كمان بتفعيل Email enumeration protection من Console ← Authentication ← Settings.
