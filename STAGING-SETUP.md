# البيئة التجريبية (Staging) — خطوات التجهيز

**الفكرة:** نفس الكود، لكن على دومين تاني وبيتصل بمشروع Firebase تاني (بيانات وهمية). الإنتاج مايتأثرش.
اختيار المشروع تلقائي حسب الدومين من `firebase-config.js`: أي دومين فيه كلمة `staging` = تجريبي، وغير كده = إنتاج.

## 1) أنشئ مشروع Firebase تجريبي
1. Firebase Console ← Add project ← الاسم مثلًا `elwarsha-staging` (لازم الـID فيه staging).
2. Build ← **Authentication** ← Get started ← فعّل **Email/Password**.
3. Build ← **Firestore Database** ← Create database (Production mode، نفس المنطقة me-central1 لو متاحة).
4. Project settings ← Your apps ← أضف تطبيق **Web** (</>) وانسخ الـfirebaseConfig.
5. ارفع خطة المشروع لـBlaze (مطلوبة لنشر الدوال؛ الاستخدام القليل غالبًا مجاني).

## 2) انسخ الإعدادات للكود
افتح `firebase-config.js` وعبّي المتغير `STAGING` بالقيم اللي نسختها (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)، وارفعه على GitHub.

## 3) انشر الدوال والقواعد على التجريبي (من Cloud Shell)
```
cd ~/phase2
firebase deploy --only functions --project elwarsha-staging
```
- القيم اللي هيسأل عنها: `CLOUDINARY_CLOUD_NAME` و`CLOUDINARY_API_KEY` (استخدم حساب Cloudinary تجريبي أو نفس الحساب)، و`UPLOAD_ALLOWED_ORIGINS` = دومين التجريبي، و`ENFORCE_APP_CHECK` = false.
- لو طلب سر Cloudinary: `firebase functions:secrets:set CLOUDINARY_API_SECRET --project elwarsha-staging`
- القواعد: Console (المشروع التجريبي) ← Firestore ← Rules ← الصق `firestore.rules` ← Publish.
- TTL: نفس أوامر الإنتاج مع `--project=elwarsha-staging` (لـ`rateLimits` و`clientErrors`).

## 4) أنشئ حساب موظف تجريبي
```
cd ~/phase2/functions && npm install
node staging-setup.js elwarsha-staging you@example.com YourPassword123
```
السكربت بيرفض يشتغل على مشروع الإنتاج.

## 5) انشر نسخة الموقع التجريبية على Cloudflare
- أنشئ فرع في GitHub اسمه `staging` وارفع عليه نفس الملفات.
- Cloudflare ← Workers & Pages ← مشروعك ← Settings ← Builds ← فعّل **Preview builds** (non-production branches).
- هيطلعلك رابط للفرع فيه كلمة staging (زي `staging-اسم-المشروع.xxx.workers.dev`). افتحه: لازم يظهر شريط برتقالي «🧪 بيئة تجريبية».
- لو الرابط اللي طلع مافيهوش staging، حط اسمه في `STAGING_HOSTS` في `firebase-config.js`.
- **أمان:** لو الدومين تجريبي والإعدادات فاضية، التطبيق بيقفل ومابيتصلش بأي مشروع. مفيش طريقة يكتب على بيانات الإنتاج بالغلط.

## 6) الاستخدام
أي تعديل كبير (أدوار، قواعد، مزامنة): ارفعه على فرع `staging` الأول وجرّبه، وبعدين انقله للفرع الرئيسي.
لا تنسخ بيانات عملاء حقيقيين للتجريبي (أضف بيانات وهمية من التطبيق نفسه).
