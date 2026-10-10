const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require('@firebase/rules-unit-testing');
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where
} = require('firebase/firestore');

const PROJECT_ID = 'demo-workshop-firestore-security';
const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const ORDER = (customerId, no, status) => ({
  customerId, no, status, total: 5000, labor: 900, partsCost: 1200, partsTotal: 1600,
  remain: 3400, closed: status === 'مكتمل', updatedAt: new Date()
});

async function main() {
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8091, rules: RULES }
  });
  const alice = env.authenticatedContext('auth-alice').firestore();
  const bob = env.authenticatedContext('auth-bob').firestore();
  const oldAlice = env.authenticatedContext('old-alice').firestore();
  const directOwner = env.authenticatedContext('legacy-user').firestore();
  const stranger = env.authenticatedContext('not-a-staff-or-customer').firestore();
  const staff = env.authenticatedContext('staff-1').firestore();
  const anonymous = env.unauthenticatedContext().firestore();

  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const seed = [
        ['staff/staff-1', { name: 'Authorized staff' }],
        ['customers/customer-alice', { name: 'Alice', phone: '0100', portal: true }],
        ['customers/customer-bob', { name: 'Bob', phone: '0101', portal: true }],
        ['customers/old-alice', { name: 'Old Alice profile', phone: '0100', portal: true }],
        ['customers/legacy-user', { name: 'Legacy direct profile', phone: '0102', portal: true }],
        ['portalLinks/auth-alice', { customerId: 'customer-alice', disabled: false, mustChange: false }],
        ['portalLinks/auth-bob', { customerId: 'customer-bob', disabled: false, mustChange: false }],
        ['portalLinks/old-alice', { customerId: '_reset', disabled: true, replacedBy: 'auth-alice' }],
        ['devices/device-a', { customerId: 'customer-alice', type: 'washer', portal: true }],
        ['devices/device-b', { customerId: 'customer-bob', type: 'dryer', portal: true }],
        ['portalOrders/order-a', ORDER('customer-alice', 'A-100', 'مكتمل')],
        ['portalOrders/order-a-open', ORDER('customer-alice', 'A-101', 'جاري التنفيذ')],
        ['portalOrders/order-b', ORDER('customer-bob', 'B-100', 'مكتمل')],
        ['requests/secret-order', { customerId: 'customer-alice', total: 5000, status: 'مكتمل' }],
        ['portalPosts/public-article', { title: 'Public', published: true }],
        ['portalPosts/draft-article', { title: 'Private', published: false }]
      ];
      for (const [pathName, value] of seed) await setDoc(doc(db, pathName), value);
    });

    // Authenticated users can read only the customer identity linked to their UID.
    await assertSucceeds(getDoc(doc(alice, 'customers/customer-alice')));
    await assertFails(getDoc(doc(alice, 'customers/customer-bob')));
    await assertFails(getDocs(collection(alice, 'customers'))); // rules are not filters; an unbounded list is never owner-safe
    await assertFails(getDoc(doc(stranger, 'customers/customer-alice')));
    await assertSucceeds(getDoc(doc(bob, 'customers/customer-bob')));
    await assertSucceeds(getDoc(doc(directOwner, 'customers/legacy-user'))); // old accounts without portalLinks remain self-scoped
    await assertFails(getDoc(doc(directOwner, 'customers/customer-alice')));
    await assertSucceeds(updateDoc(doc(alice, 'customers/customer-alice'), { name: 'Alice Updated' }));
    await assertFails(updateDoc(doc(alice, 'customers/customer-alice'), { portal: false }));
    await assertFails(updateDoc(doc(alice, 'devices/device-a'), { customerId: 'customer-bob' }));
    await assertFails(updateDoc(doc(alice, 'portalLinks/auth-alice'), { customerId: 'customer-bob' }));

    // Reset/disabled identity cannot fall back to customers/{uid} even when the old UID is that doc ID.
    await assertFails(getDoc(doc(oldAlice, 'customers/old-alice')));
    await assertFails(getDoc(doc(oldAlice, 'portalOrders/order-a')));

    // Owner-scoped collection queries work; changing the customerId filter to another owner fails.
    const ownDevices = await assertSucceeds(getDocs(query(collection(alice, 'devices'), where('customerId', '==', 'customer-alice'))));
    if (ownDevices.size !== 1) throw new Error(`expected one Alice device, got ${ownDevices.size}`);
    await assertFails(getDocs(query(collection(alice, 'devices'), where('customerId', '==', 'customer-bob'))));
    const ownOrders = await assertSucceeds(getDocs(query(collection(alice, 'portalOrders'), where('customerId', '==', 'customer-alice'))));
    if (ownOrders.size !== 2) throw new Error(`expected two Alice orders, got ${ownOrders.size}`);
    await assertFails(getDocs(query(collection(alice, 'portalOrders'), where('customerId', '==', 'customer-bob'))));
    await assertFails(getDoc(doc(alice, 'portalOrders/order-b'))); // replacing a URL id is not authorization

    // Portal order projections are read-only to customers: no cost, amount, status, create, or delete writes.
    await assertFails(updateDoc(doc(alice, 'portalOrders/order-a'), { total: 1, partsCost: 0, status: 'مكتمل' }));
    await assertFails(updateDoc(doc(alice, 'portalOrders/order-a'), { status: 'ملغي', closed: false }));
    await assertFails(setDoc(doc(alice, 'portalOrders/fake-order'), ORDER('customer-alice', 'FAKE', 'مكتمل')));
    await assertFails(deleteDoc(doc(alice, 'portalOrders/order-a')));
    await assertFails(getDoc(doc(alice, 'requests/secret-order')));

    // A complaint can be added only for the authenticated customer's own completed projected order.
    const validComplaint = {
      customerId: 'customer-alice', orderId: 'order-a', orderNo: 'A-100',
      text: 'تم استلام الجهاز ولا يعمل بشكل صحيح.', status: 'جديد', reply: '', portal: true,
      createdAt: new Date()
    };
    await assertSucceeds(setDoc(doc(alice, 'portalComplaints/valid'), validComplaint));
    await assertFails(setDoc(doc(alice, 'portalComplaints/other-owner'), { ...validComplaint, orderId: 'order-b', orderNo: 'B-100' }));
    await assertFails(setDoc(doc(alice, 'portalComplaints/open-order'), { ...validComplaint, orderId: 'order-a-open', orderNo: 'A-101' }));
    await assertFails(setDoc(doc(alice, 'portalComplaints/fake-no'), { ...validComplaint, orderNo: 'B-100' }));
    await assertFails(setDoc(doc(alice, 'portalComplaints/spoof-customer'), { ...validComplaint, customerId: 'customer-bob' }));
    await assertFails(setDoc(doc(alice, 'portalComplaints/spoof-reply'), { ...validComplaint, reply: 'approved' }));
    await assertFails(updateDoc(doc(alice, 'portalComplaints/valid'), { status: 'مغلقة', reply: 'مقبول' }));

    // Optional device references on customer requests/questions must also belong to that customer.
    await assertSucceeds(setDoc(doc(alice, 'portalQuestions/question-a'), {
      customerId: 'customer-alice', customerName: 'Alice', deviceId: 'device-a', deviceLabel: 'washer',
      text: 'متى يكون موعد الصيانة القادم؟', status: 'جديد', answer: '', published: false, postId: '', portal: true, createdAt: new Date()
    }));
    await assertFails(setDoc(doc(alice, 'portalQuestions/question-b'), {
      customerId: 'customer-alice', customerName: 'Alice', deviceId: 'device-b', deviceLabel: 'dryer',
      text: 'هل وصل الجهاز؟', status: 'جديد', answer: '', published: false, postId: '', portal: true, createdAt: new Date()
    }));
    await assertFails(setDoc(doc(alice, 'portalRequests/request-b'), {
      customerId: 'customer-alice', deviceId: 'device-b', fault: 'broken', visit: '', executionPlace: '', note: '',
      handled: false, portal: true, createdAt: new Date()
    }));

    // Staff permissions come only from a server-managed staff document; no self-promotion or peer creation.
    await assertSucceeds(getDoc(doc(staff, 'staff/staff-1')));
    await assertFails(getDocs(collection(staff, 'staff')));
    await assertFails(setDoc(doc(staff, 'staff/injected-staff'), { active: true }));
    await assertFails(updateDoc(doc(staff, 'staff/staff-1'), { active: false }));
    await assertFails(setDoc(doc(stranger, 'staff/not-a-staff-or-customer'), { active: true }));
    await assertSucceeds(getDoc(doc(staff, 'requests/secret-order')));
    await assertFails(getDoc(doc(stranger, 'requests/secret-order')));
    await assertFails(getDoc(doc(anonymous, 'requests/secret-order')));

    // Only deliberately published portal posts are readable without staff membership.
    await assertSucceeds(getDoc(doc(anonymous, 'portalPosts/public-article')));
    await assertFails(getDoc(doc(anonymous, 'portalPosts/draft-article')));

    // طلب الصيانة السريع للزائر غير المسجّل: رقم الطلب = معرّف المستند، إنشاء بحقول سليمة فقط، ولا قراءة ولا تعديل إلا للموظف.
    const GUEST = (ref) => ({
      ref, name: 'زائر', phone: '01012345678', center: 'مطاي', village: 'أبو عزيز', street: 'شارع الجامعة',
      deviceType: 'غسالات', fault: 'الغسالة مش بتفتح', handled: false, guest: true, createdAt: require('firebase/firestore').serverTimestamp()
    });
    await assertSucceeds(setDoc(doc(anonymous, 'guestRequests/G-ABC234'), GUEST('G-ABC234')));
    await assertSucceeds(setDoc(doc(anonymous, 'guestRequests/G-ABC235'), { ...GUEST('G-ABC235'), village: '' }));
    await assertFails(setDoc(doc(anonymous, 'guestRequests/G-ABC234'), GUEST('G-ABC234'))); // نفس الرقم تاني = تعديل ← مرفوض
    await assertFails(setDoc(doc(anonymous, 'guestRequests/g1'), GUEST('g1'))); // صيغة الرقم غلط
    await assertFails(setDoc(doc(anonymous, 'guestRequests/G-ABC236'), GUEST('G-ZZZ999'))); // ref لا يطابق المعرّف
    await assertFails(setDoc(doc(anonymous, 'guestRequests/G-ABC237'), { ...GUEST('G-ABC237'), extra: 'x' }));
    await assertFails(setDoc(doc(anonymous, 'guestRequests/G-ABC238'), { ...GUEST('G-ABC238'), handled: true }));
    await assertFails(setDoc(doc(anonymous, 'guestRequests/G-ABC239'), { ...GUEST('G-ABC239'), phone: 'abc' }));
    await assertFails(setDoc(doc(anonymous, 'guestRequests/G-ABC242'), { ...GUEST('G-ABC242'), center: '' }));
    await assertFails(setDoc(doc(anonymous, 'guestRequests/G-ABC243'), { ...GUEST('G-ABC243'), fault: 'x'.repeat(1001) }));
    await assertFails(setDoc(doc(anonymous, 'guestRequests/G-ABC244'), { ...GUEST('G-ABC244'), createdAt: new Date('2020-01-01') }));
    await assertFails(getDoc(doc(anonymous, 'guestRequests/G-ABC234')));
    await assertFails(getDocs(collection(anonymous, 'guestRequests')));
    await assertFails(updateDoc(doc(anonymous, 'guestRequests/G-ABC234'), { handled: true }));
    await assertFails(deleteDoc(doc(anonymous, 'guestRequests/G-ABC234')));
    await assertFails(getDoc(doc(alice, 'guestRequests/G-ABC234')));
    await assertSucceeds(getDoc(doc(staff, 'guestRequests/G-ABC234')));
    await assertSucceeds(updateDoc(doc(staff, 'guestRequests/G-ABC234'), { handled: true }));

    // ---- phoneIndex: مرحلة 1 (القواعد الحالية) — قيود الإنشاء، والقراءة لسه مفتوحة ----
    const signedUp = env.authenticatedContext('phone-user', { email: 'New@Example.com' }).firestore();
    const otherUser = env.authenticatedContext('phone-other', { email: 'other@example.com' }).firestore();
    const noEmailUser = env.authenticatedContext('phone-noemail').firestore();
    await assertSucceeds(setDoc(doc(signedUp, 'phoneIndex/01012345678'), { email: 'new@example.com', uid: 'phone-user' })); // مقارنة الإيميل غير حساسة لحالة الحروف
    await assertFails(setDoc(doc(otherUser, 'phoneIndex/01112345678'), { email: 'new@example.com', uid: 'phone-other' })); // إيميل شخص تاني
    await assertFails(setDoc(doc(otherUser, 'phoneIndex/01112345678'), { email: 'other@example.com', uid: 'phone-user' })); // uid شخص تاني
    await assertFails(setDoc(doc(otherUser, 'phoneIndex/abc'), { email: 'other@example.com', uid: 'phone-other' })); // مفتاح مش رقم موبايل
    await assertFails(setDoc(doc(otherUser, 'phoneIndex/0131234567'), { email: 'other@example.com', uid: 'phone-other' }));
    await assertFails(setDoc(doc(otherUser, 'phoneIndex/01212345678'), { email: 'other@example.com', uid: 'phone-other', role: 'x' })); // حقل زيادة
    await assertFails(setDoc(doc(noEmailUser, 'phoneIndex/01212345678'), { email: 'x@example.com', uid: 'phone-noemail' })); // توكن من غير إيميل
    await assertFails(setDoc(doc(anonymous, 'phoneIndex/01212345678'), { email: 'x@example.com', uid: 'x' }));
    await assertFails(setDoc(doc(otherUser, 'phoneIndex/01012345678'), { email: 'other@example.com', uid: 'phone-other' })); // حجز رقم موجود = تعديل ← مرفوض
    await assertFails(updateDoc(doc(signedUp, 'phoneIndex/01012345678'), { email: 'z@example.com' }));
    await assertSucceeds(getDoc(doc(anonymous, 'phoneIndex/01012345678'))); // مؤقتًا حتى نشر الدوال (المرحلة 2)
    await assertFails(getDocs(collection(anonymous, 'phoneIndex')));
    await assertSucceeds(updateDoc(doc(staff, 'phoneIndex/01012345678'), { email: 'staff-fixed@example.com' }));
    await assertSucceeds(deleteDoc(doc(staff, 'phoneIndex/01012345678')));

    // ---- phoneIndex: مرحلة 2 (firestore.rules.proposed) — القراءة للموظفين وصاحب الحساب فقط ----
    const PROPOSED = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules.proposed'), 'utf8');
    const env2 = await initializeTestEnvironment({ projectId: PROJECT_ID + '-phase2', firestore: { host: '127.0.0.1', port: 8091, rules: PROPOSED } });
    try {
      await env2.withSecurityRulesDisabled(async context => {
        const db2 = context.firestore();
        await setDoc(doc(db2, 'staff/staff-1'), { name: 'Authorized staff' });
        await setDoc(doc(db2, 'phoneIndex/01012345678'), { email: 'owner@example.com', uid: 'phone-owner' });
      });
      const p2Owner = env2.authenticatedContext('phone-owner', { email: 'owner@example.com' }).firestore();
      const p2Other = env2.authenticatedContext('phone-other', { email: 'other@example.com' }).firestore();
      const p2Staff = env2.authenticatedContext('staff-1', { email: 'staff@example.com' }).firestore();
      const p2Anon = env2.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(p2Anon, 'phoneIndex/01012345678')));
      await assertFails(getDoc(doc(p2Other, 'phoneIndex/01012345678')));
      await assertFails(getDoc(doc(p2Other, 'phoneIndex/01999999999'))); // غير موجود: مفيش تلميح
      await assertFails(getDocs(collection(p2Other, 'phoneIndex')));
      await assertSucceeds(getDoc(doc(p2Owner, 'phoneIndex/01012345678')));
      await assertSucceeds(getDoc(doc(p2Staff, 'phoneIndex/01012345678')));
      await assertSucceeds(setDoc(doc(p2Other, 'phoneIndex/01112345678'), { email: 'other@example.com', uid: 'phone-other' })); // التسجيل الجديد لسه شغال
      await assertFails(setDoc(doc(p2Other, 'phoneIndex/01012345678'), { email: 'other@example.com', uid: 'phone-other' }));
    } finally {
      await env2.cleanup();
    }

    console.log('firestore-rules-emulator-tests: PASS (owner isolation, read-only orders, complaint ownership, device references, staff membership, URL-id tampering, phoneIndex create limits + phase-2 read lock)');
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error('firestore-rules-emulator-tests: FAIL', error);
  process.exitCode = 1;
});
