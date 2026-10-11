"use strict";
/* يجهّز حساب موظف على مشروع Firebase التجريبي فقط (من Cloud Shell):
     cd functions && node staging-setup.js <project-id> <email> <password>
   - بيرفض يشتغل على مشروع الإنتاج (elwarsha-elfanya) أو أي مشروع اسمه مش فيه "staging"/"stg"/"test".
   - بينشئ (أو يحدّث) مستخدم Authentication + مستند staff/{uid}. مفيش بيانات حقيقية بتتلمس. */

const PROD_PROJECTS = ["elwarsha-elfanya"];

function validateArgs(argv) {
  const [projectId, email, password] = argv;
  if (!projectId || !email || !password) throw new Error("usage: node staging-setup.js <project-id> <email> <password>");
  if (PROD_PROJECTS.includes(projectId)) throw new Error("refusing to run on the production project");
  if (!/staging|stg|test/i.test(projectId)) throw new Error('project id must contain "staging", "stg" or "test"');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("invalid email");
  if (String(password).length < 6) throw new Error("password must be at least 6 characters");
  return { projectId, email, password };
}

async function main() {
  const { projectId, email, password } = validateArgs(process.argv.slice(2));
  const { initializeApp } = require("firebase-admin/app");
  const { getAuth } = require("firebase-admin/auth");
  const { getFirestore, FieldValue } = require("firebase-admin/firestore");
  initializeApp({ projectId });
  let user;
  try { user = await getAuth().getUserByEmail(email); await getAuth().updateUser(user.uid, { password }); }
  catch (e) { if (e.code !== "auth/user-not-found") throw e; user = await getAuth().createUser({ email, password, emailVerified: true }); }
  await getFirestore().collection("staff").doc(user.uid).set({ email, name: "Staging admin", createdAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log(`OK: staff account ready on ${projectId}: ${email} (uid ${user.uid})`);
}

if (require.main === module) main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
module.exports = { validateArgs, PROD_PROJECTS };
