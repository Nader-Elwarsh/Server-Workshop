const assert = require('assert'); const { validateArgs } = require('./functions/staging-setup');
const bad = (a, re) => assert.throws(() => validateArgs(a), re);
bad([], /usage/); bad(['elwarsha-elfanya', 'a@b.co', 'secret1'], /production/); bad(['my-real-project', 'a@b.co', 'secret1'], /staging/);
bad(['elwarsha-staging', 'not-an-email', 'secret1'], /email/); bad(['elwarsha-staging', 'a@b.co', '123'], /password/);
assert.strictEqual(validateArgs(['elwarsha-staging', 'a@b.co', 'secret1']).projectId, 'elwarsha-staging');
assert.strictEqual(validateArgs(['my-stg-1', 'a@b.co', 'secret1']).projectId, 'my-stg-1');
console.log('staging-setup-tests: PASS');
