// فحص ما قبل نشر الدوال (functions/check-deploy-config.js): منطقة المشغّلات لازم تتحدد صراحة وتطابق القاعدة
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
const C = require("./functions/check-deploy-config");
assert.deepStrictEqual(C.parseEnv("# x\nNOTIFY_REGION=me-central1\nA = 'b'\nB=\"c d\"\n"), { NOTIFY_REGION: "me-central1", A: "b", B: "c d" });
assert.strictEqual(C.check({}, "p").ok, false, "من غير NOTIFY_REGION = النشر يقف");
assert.ok(/NOTIFY_REGION=me-central1/.test(C.check({}, "p").errors[0]), "الرسالة فيها السطر المطلوب");
assert.strictEqual(C.check({ NOTIFY_REGION: "me central" }).ok, false, "شكل منطقة غلط");
assert.strictEqual(C.check({ NOTIFY_REGION: "me-central1" }).ok, true);
assert.strictEqual(C.check({ NOTIFY_REGION: "us-central1", FIRESTORE_LOCATION: "me-central1" }).ok, false, "مخالف لمنطقة القاعدة");
assert.strictEqual(C.check({ NOTIFY_REGION: "us-central1", FIRESTORE_LOCATION: "nam5" }).ok, true, "nam5 → us-central1");
// ملف المشروع (.env.<id>) بيتقدّم على .env العام
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wfdeploy-"));
fs.writeFileSync(path.join(dir, ".env"), "NOTIFY_REGION=us-central1\n");
fs.writeFileSync(path.join(dir, ".env.elwarsha-staging"), "NOTIFY_REGION=me-central1\n");
assert.strictEqual(C.loadEnv(dir, "elwarsha-staging").NOTIFY_REGION, "me-central1");
assert.strictEqual(C.loadEnv(dir, "other").NOTIFY_REGION, "us-central1");
// التشغيل الفعلي كـ predeploy: بيخرج بكود 1 من غير الإعداد (والـ repo مافيهوش functions/.env)
let code = 0; try { execFileSync(process.execPath, ["functions/check-deploy-config.js", "demo-x"], { stdio: "pipe", env: Object.assign({}, process.env, { GCLOUD_PROJECT: "demo-x" }) }); } catch (e) { code = e.status; }
assert.strictEqual(code, fs.existsSync("functions/.env") ? code : 1, "predeploy بيوقف النشر");
const fj = JSON.parse(fs.readFileSync("firebase.json", "utf8"));
assert.ok(fj.functions.predeploy.some((x) => /check-deploy-config\.js/.test(x)), "متركّب في firebase.json");
assert.ok(/^\.env$/m.test(fs.readFileSync(".assetsignore", "utf8")), ".env مايتنشرش على Cloudflare");
console.log("deploy-config-tests: PASS (المنطقة لازم تتحدد، المطابقة مع القاعدة، ملف لكل مشروع، predeploy بيوقف النشر)");
