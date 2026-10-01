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

    console.log('firestore-rules-emulator-tests: PASS (owner isolation, read-only orders, complaint ownership, device references, staff membership, URL-id tampering)');
  } finally {
    await env.cleanup();
  }
}

main().catch(error => {
  console.error('firestore-rules-emulator-tests: FAIL', error);
  process.exitCode = 1;
});
