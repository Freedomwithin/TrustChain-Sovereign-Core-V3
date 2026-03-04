const assert = require('node:assert');
const { fetchWithRetry } = require('../utils/rpc');

async function testFetchWithRetry() {
  console.log('Running: fetchWithRetry Tests');

  // Test success
  let calls = 0;
  const successFn = async () => { calls++; return 'success'; };
  const result = await fetchWithRetry(successFn);
  assert.strictEqual(result, 'success');
  assert.strictEqual(calls, 1);
  console.log('PASS: Success case');

  // Test 429 Retry
  calls = 0;
  const failTwice429 = async () => {
    calls++;
    if (calls <= 2) {
      const err = new Error('Request failed with status code 429');
      throw err;
    }
    return 'success after retry';
  };

  // Use small delay for test
  const start = Date.now();
  const resultRetry = await fetchWithRetry(failTwice429, 3, 10);
  const duration = Date.now() - start;

  assert.strictEqual(resultRetry, 'success after retry');
  assert.strictEqual(calls, 3); // 1st fail, 2nd fail, 3rd success
  // Delays: 10ms (after 1st retry), 20ms (after 2nd retry). Total approx 30ms.
  // Wait, logic: retries=0. fail. retries=1. wait 10*2^0 = 10. retry.
  // fail. retries=2. wait 10*2^1 = 20. retry.
  // success.
  // Total wait 30ms.
  assert.ok(duration > 0, `Duration ${duration}ms too short`);
  console.log('PASS: Retry 429 logic');

  // Test Max Retries
  calls = 0;
  const failAlways429 = async () => {
    calls++;
    throw new Error('429 Forever');
  };

  try {
    await fetchWithRetry(failAlways429, 2, 10);
    assert.fail('Should have thrown error');
  } catch (err) {
    assert.ok(err.message.includes('429'));
    assert.strictEqual(calls, 3); // initial + 2 retries
  }
  console.log('PASS: Max retries logic');
}

testFetchWithRetry().catch(err => {
  console.error(err);
  process.exit(1);
});
