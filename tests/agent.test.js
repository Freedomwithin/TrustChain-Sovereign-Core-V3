const assert = require('node:assert');
const { RiskAuditorAgent, Configuration } = require('../agents/RiskAuditorAgent');

/**
 * RiskAuditorAgent Test Suite
 */

async function testRiskAuditorAgent() {
  console.log('Running: RiskAuditorAgent Tests');

  // Test Probationary Case
  const probationaryData = {
    transactions: [{ amount: 100 }, { amount: 200 }], // Only 2 tx
    positions: [],
    signatures: []
  };
  const probResult = await RiskAuditorAgent.getIntegrityDecision('addr', probationaryData);
  assert.strictEqual(probResult.status, 'PROBATIONARY');
  assert.strictEqual(probResult.reason, 'Insufficient transaction history for full analysis.');
  console.log('PASS: Probationary Logic');

  // Test Sybil Case (High Gini)
  const highGiniData = {
    transactions: [{ amount: 1000 }, { amount: 0 }, { amount: 0 }], // Gini will be high
    positions: [],
    signatures: [] // SyncIndex 0
  };
  const sybilResult = await RiskAuditorAgent.getIntegrityDecision('addr', highGiniData);
  // Gini for 1000, 0, 0:
  // values: 0, 0, 1000. sum=1000. n=3.
  // diffs: |0-0|+|0-1000| + |0-0|+|0-1000| + |1000-0|+|1000-0| = 1000 + 1000 + 1000 + 1000 = 4000.
  // denom = 2 * 3^2 * (1000/3) = 18 * 333.33 = 6000.
  // gini = 4000 / 6000 = 0.666
  // Wait, threshold is 0.7.
  // Let's make it more extreme: 10000, 0, 0, 0 (n=4)
  // values: 0, 0, 0, 10000. sum=10000. n=4.
  // diffs from 10000: 3 * 10000 = 30000. And symmetrically 30000. Total 60000.
  // denom = 2 * 16 * 2500 = 32 * 2500 = 80000.
  // gini = 60000 / 80000 = 0.75 > 0.7

  const extremeGiniData = {
      transactions: [{ amount: 10000 }, { amount: 0 }, { amount: 0 }, { amount: 0 }],
      positions: [],
      signatures: []
  };
  const extremeResult = await RiskAuditorAgent.getIntegrityDecision('addr', extremeGiniData);
  assert.strictEqual(extremeResult.status, 'SYBIL');
  assert.ok(extremeResult.scores.gini > Configuration.GINI_THRESHOLD, `Gini ${extremeResult.scores.gini} should be > ${Configuration.GINI_THRESHOLD}`);
  console.log('PASS: Sybil Logic (High Gini)');


  // Test Sybil Case (High Sync Index)
  const highSyncData = {
    transactions: [{ amount: 10 }, { amount: 10 }, { amount: 10 }], // Low Gini
    positions: [],
    signatures: [
      { blockTime: 1000 },
      { blockTime: 1001 },
      { blockTime: 1002 },
      { blockTime: 1003 }
    ]
  };
  // checkSyncIndex logic: clusters = diff <= 2.
  // 1000, 1001 (diff 1), 1002 (diff 1), 1003 (diff 1).
  // 3 intervals <= 2. signatures length 4. 3/4 = 0.75 > 0.35
  const syncResult = await RiskAuditorAgent.getIntegrityDecision('addr', highSyncData);
  assert.strictEqual(syncResult.status, 'SYBIL');
  assert.ok(syncResult.scores.syncIndex > Configuration.PROBATIONARY_SYNC_INDEX_THRESHOLD);
  console.log('PASS: Sybil Logic (High Sync Index)');

  // Test Verified Case
  const verifiedData = {
    transactions: [{ amount: 10 }, { amount: 20 }, { amount: 15 }, { amount: 25 }],
    positions: [{ value: 100 }, { value: 100 }, { value: 100 }], // HHI low
    signatures: [
        { blockTime: 1000 },
        { blockTime: 2000 },
        { blockTime: 4000 },
        { blockTime: 8000 }
    ] // Diff: 1000, 2000, 4000. All > 2. SyncIndex 0.
  };
  const verifiedResult = await RiskAuditorAgent.getIntegrityDecision('addr', verifiedData);
  assert.strictEqual(verifiedResult.status, 'VERIFIED');
  console.log('PASS: Verified Logic');
}

testRiskAuditorAgent().catch(err => {
  console.error(err);
  process.exit(1);
});
