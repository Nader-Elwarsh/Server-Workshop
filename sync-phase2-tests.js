const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

const sync = read("firebase-sync.js");
assert(/db\.runTransaction\(async function \(tx\)/.test(sync), "collection updates must compare and write inside Firestore transactions");
assert(/remoteHash === job\.baseHash/.test(sync), "the remote version must match the last synced hash before overwrite/delete");
assert(/CONFLICT_KEY/.test(sync) && /showSyncConflicts/.test(sync), "conflicts must be persisted and reviewable");
assert(/اعتماد نسخة هذا الجهاز/.test(sync) && /اعتماد نسخة السحابة/.test(sync), "the user must choose which version to keep");
assert(/function isHomePage\(\) \{ return !!document\.getElementById\("dashboard"\); \}/.test(sync), "the sync strip must identify the home screen only");
assert(/if \(!isHomePage\(\)\) \{ if \(panel\) panel\.remove\(\); return; \}/.test(sync), "the sync strip must be removed from non-home pages");
assert(/<details id='wfSyncDetails'/.test(sync) && /wfSyncSummary/.test(sync), "the home-screen sync strip must stay compact and expose details on demand");
assert(/localOnlyAllowed && localDashboard/.test(sync), "the offline-only status row must be limited to the home screen");
assert(!/position:fixed;bottom:8px;left:8px/.test(sync), "the global floating sync badge must not appear on every page");

const fn = read("functions/index.js");
assert(/verifyIdToken/.test(fn), "upload endpoint must verify Firebase ID tokens");
assert(/staff\/\$\{decoded\.uid\}/.test(fn) && /portalLinks\/\$\{decoded\.uid\}/.test(fn), "upload endpoint must authorize staff or active linked portal users");
assert(/UPLOAD_ALLOWED_ORIGINS/.test(fn) && /MAX_BYTES/.test(fn) && /validMagic/.test(fn), "server-side origin, size and file signature checks must be present");
assert(/CLOUDINARY_API_SECRET/.test(fn) && /createHash\("sha1"\)/.test(fn), "Cloudinary secret/signature must remain server-side");

for (const page of ["portal.html", "portal-admin.html"]) {
  assert(read(page).includes("image-store.js"), `${page} must load the shared upload module`);
  assert(read(page).includes("ImageStore.uploadBlob"), `${page} must route uploads through ImageStore`);
}
for (const name of ["image-store.js", "portal.html", "portal-admin.html"]) {
  const source = read(name);
  assert(!source.includes("workshop_unsigned"), `${name} must not use the unsigned Cloudinary preset`);
  assert(!source.includes("api.cloudinary.com"), `${name} must not upload directly to Cloudinary`);
}
console.log("sync-phase2-tests: PASS (transactional version checks, conflict UI, unified authenticated upload)");
