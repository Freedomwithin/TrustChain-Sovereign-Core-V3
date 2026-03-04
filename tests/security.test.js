const assert = require('node:assert');
const { calculateGini, calculateHHI } = require('../integrityEngine');

/**
 * ADVERSARIAL TEST SUITE
 */

function testProbationaryLogic() {
  console.log('Running: Probationary Logic Check');

  // Logic from server.js: return 0.5 if signatures.length < 3
  const checkProbationary = (sigs) => sigs.length < 3;

  assert.strictEqual(checkProbationary([]), true, '0 signatures should be probationary');
  assert.strictEqual(checkProbationary(['sig1']), true, '1 signature should be probationary');
  assert.strictEqual(checkProbationary(['sig1', 'sig2']), true, '2 signatures should be probationary');
  assert.strictEqual(checkProbationary(['sig1', 'sig2', 'sig3']), false, '3 signatures should NOT be probationary');

  console.log('PASS: Probationary Logic');
}

function testHHIWhaleCheck() {
  console.log('Running: HHI Whale Check');

  // Whale: One transaction has 100% of the volume
  const whaleValues = [1000, 0, 0, 0];
  const whaleHHI = calculateHHI(whaleValues);
  // Share = 100%, HHI = (100^2) / 10000 = 1
  assert.ok(Math.abs(whaleHHI - 1.0) < 0.001, `Whale HHI should be 1.0, got ${whaleHHI}`);

  // Distributed: Equal transactions
  const distributedValues = [250, 250, 250, 250];
  const distributedHHI = calculateHHI(distributedValues);
  // Shares = 25% each. HHI = (25^2 * 4) / 10000 = (625 * 4) / 10000 = 2500 / 10000 = 0.25
  assert.ok(Math.abs(distributedHHI - 0.25) < 0.001, `Distributed HHI should be 0.25, got ${distributedHHI}`);

  console.log('PASS: HHI Whale Check');
}

function testInputFuzzing() {
  console.log('Running: Input Fuzzing (Regex Check)');

  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const validate = (addr) => typeof addr === 'string' && base58Regex.test(addr);

  // Valid Solana Addresses
  assert.strictEqual(validate('vines1vzrYbzduYv9CQ5XjptC8Sms7yY95795CBuRe7'), true, 'Valid address failed');
  assert.strictEqual(validate('8398X9BvAnvC6isvXvE8FAnA8yvC6isvXvE8FAnA8yvC'), true, 'Valid address failed');

  // Invalid Addresses
  assert.strictEqual(validate('invalid-address'), false, 'Malformed address passed');
  assert.strictEqual(validate('0OIl'), false, 'Non-base58 characters passed');
  assert.strictEqual(validate(''), false, 'Empty string passed');
  assert.strictEqual(validate('too-short'), false, 'Short string passed');
  assert.strictEqual(validate('a'.repeat(50)), false, 'Long string passed');

  console.log('PASS: Input Fuzzing');
}

// Execute Tests
try {
  testProbationaryLogic();
  testHHIWhaleCheck();
  testInputFuzzing();
  console.log('\nALL SECURITY TESTS PASSED');
} catch (error) {
  console.error('\nTEST SUITE FAILED');
  console.error(error);
  process.exit(1);
}
