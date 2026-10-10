# Firestore security-rule tests

These tests run only against the local Firebase Emulator Suite with a `demo-*` project ID. They do not contact or deploy to production.

From this directory run:

```sh
npm ci
npm test
```

The first run may download the Firestore Emulator JAR. The test copies the canonical `../firestore.rules` into this directory temporarily, starts the emulator, exercises authenticated and unauthenticated client operations, then removes the temporary rules copy.

## Staff provisioning

`staff/{uid}` is a server-managed allowlist. Add or remove membership through Firebase Console or a trusted Admin SDK environment; the browser app and a currently authorized staff account cannot create or update membership records.

## Operational security notes

- Online employee sessions must be verified against the server-side `staff/{uid}` document before the app reveals cached data. If Firebase cannot be reached, the UI remains covered.
- Offline use is retained only for the same UID that was successfully checked as staff earlier on that device. A staff revocation cannot reach that device while it is offline; access is rechecked and blocked on reconnection. Choose a strict no-offline policy if immediate revocation must take precedence over offline operation.
- `phoneIndex/{phone}`: `firestore.rules` (المرحلة 1) تقيّد الإنشاء (مفتاح رقم موبايل مصري + إيميل الحساب نفسه + uid صاحب الجلسة) لكن القراءة المباشرة لسه مفتوحة عشان مسار الدخول القديم. بعد نشر دوال `portalLoginLookup` و`portalPhoneAvailable` وتحديث الواجهة، انشر `firestore.rules.proposed` (المرحلة 2) اللي بتقفل القراءة على الموظفين وصاحب الحساب فقط. الاختبار ده بيغطي المرحلتين. خطوات الإطلاق في `PHONE-INDEX-APP-CHECK-ROLLOUT.md`.
- The rules have been tested locally only. Review the project/environment and deploy them to the intended Firebase project separately; no production rules were deployed by this change.

The isolated test-tool lockfile is audited separately from the workshop app. At this revision npm reports five **moderate** advisories in Firebase CLI/transitive tooling; the rules test dependencies have no remaining High/Critical advisories after pinning patched gRPC. A forced CLI downgrade increased the audit findings and introduced a Critical `tar` advisory, so it was intentionally avoided. Recheck these dev-tool advisories when upgrading Firebase CLI.
