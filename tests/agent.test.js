const assert = require('node:assert');
const { RiskAuditorAgent, Configuration } = require('../agents/RiskAuditorAgent');

/**
 * RiskAuditorAgent Test Suite
 * Exhaustive coverage of Gini/HHI scores, from organic human patterns to sophisticated high-frequency Sybil clusters.
 */

async function testRiskAuditorAgent() {
  console.log('Running: RiskAuditorAgent Tests');

  let passed = 0;
  let failed = 0;

  const runTest = async (name, data, expectedStatus, expectedReasonIncludes) => {
    try {
      const result = await RiskAuditorAgent.getIntegrityDecision('test_addr', data);
      assert.strictEqual(result.status, expectedStatus, `${name} - Expected status ${expectedStatus}, got ${result.status}`);
      if (expectedReasonIncludes) {
         assert.ok(result.reason.includes(expectedReasonIncludes), `${name} - Expected reason to include "${expectedReasonIncludes}", got "${result.reason}"`);
      }
      passed++;
      console.log(`PASS: ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL: ${name}`);
      console.error(e.message);
    }
  };

  // --- Probationary Cases (< 3 tx) ---
  await runTest('Probationary - 0 transactions', { transactions: [], positions: [], signatures: [] }, 'PROBATIONARY', 'Insufficient transaction history');
  await runTest('Probationary - 1 transaction', { transactions: [{ amount: 100 }], positions: [{ value: 10 }], signatures: [{ blockTime: 1000 }] }, 'PROBATIONARY', 'Insufficient transaction history');
  await runTest('Probationary - 2 transactions', { transactions: [{ amount: 100 }, { amount: 200 }], positions: [], signatures: [{ blockTime: 1000 }, { blockTime: 1005 }] }, 'PROBATIONARY', 'Insufficient transaction history');

  // --- Verified Cases (Organic Human Patterns) ---
  await runTest('Verified - 3 equal transactions', {
    transactions: [{ amount: 10 }, { amount: 10 }, { amount: 10 }],
    positions: [{ value: 100 }, { value: 100 }, { value: 100 }],
    signatures: [{ blockTime: 1000 }, { blockTime: 2000 }, { blockTime: 4000 }]
  }, 'VERIFIED');

  await runTest('Verified - 10 varied transactions', {
    transactions: [{amount: 10}, {amount: 25}, {amount: 5}, {amount: 40}, {amount: 15}, {amount: 30}, {amount: 12}, {amount: 8}, {amount: 22}, {amount: 18}],
    positions: [{value: 50}, {value: 30}, {value: 20}],
    signatures: [
      {blockTime: 1000}, {blockTime: 1500}, {blockTime: 2300}, {blockTime: 3800}, {blockTime: 5000},
      {blockTime: 7200}, {blockTime: 8500}, {blockTime: 9900}, {blockTime: 12000}, {blockTime: 15000}
    ]
  }, 'VERIFIED');

  await runTest('Verified - Low Gini, No Sync', {
    transactions: [{amount: 100}, {amount: 110}, {amount: 90}, {amount: 105}],
    positions: [{value: 100}],
    signatures: [{blockTime: 100}, {blockTime: 200}, {blockTime: 300}, {blockTime: 400}]
  }, 'VERIFIED');

  // High volume organic user
  const organicTxs = Array(50).fill(0).map((_, i) => ({ amount: 10 + (i % 10) }));
  const organicSigs = Array(50).fill(0).map((_, i) => ({ blockTime: i * 100 }));
  await runTest('Verified - 50 transactions, organic', {
    transactions: organicTxs,
    positions: [{ value: 100 }],
    signatures: organicSigs
  }, 'VERIFIED');

  // --- Sybil Cases (High Gini / Single Massive Extractions) ---
  await runTest('Sybil - Single massive extraction (High Gini)', {
    transactions: [{ amount: 10000 }, { amount: 0 }, { amount: 0 }, { amount: 0 }],
    positions: [],
    signatures: [{ blockTime: 1000 }, { blockTime: 2000 }, { blockTime: 3000 }, { blockTime: 4000 }] // No sync
  }, 'SYBIL', 'High temporal synchronization or extreme inequality');

  await runTest('Sybil - Single massive extraction 2 (High Gini)', {
    transactions: [{ amount: 50000 }, { amount: 0 }, { amount: 0 }, { amount: 0 }],
    positions: [],
    signatures: [{ blockTime: 10 }, { blockTime: 20 }, { blockTime: 30 }, { blockTime: 40 }] // No sync
  }, 'SYBIL');

  // --- Sybil Cases (High SyncIndex / Perfectly Timed Signatures) ---
  await runTest('Sybil - High Frequency / Perfectly timed (High Sync Index)', {
    transactions: [{ amount: 10 }, { amount: 10 }, { amount: 10 }],
    positions: [],
    signatures: [{ blockTime: 1000 }, { blockTime: 1001 }, { blockTime: 1002 }]
  }, 'SYBIL');

  await runTest('Sybil - High Frequency Cluster 2', {
    transactions: [{ amount: 10 }, { amount: 10 }, { amount: 10 }, { amount: 10 }],
    positions: [],
    signatures: [{ blockTime: 500 }, { blockTime: 502 }, { blockTime: 504 }, { blockTime: 506 }]
  }, 'SYBIL');

  // --- Edge Cases & Permutations ---

  // Generate many edge cases programmatically
  for (let i = 1; i <= 20; i++) {
    const isSybil = i % 2 === 0;
    // For sybil, create either a massive Gini or a massive SyncIndex
    if (isSybil) {
      if (i % 4 === 0) {
        // High Gini
        await runTest(`Auto Sybil High Gini ${i}`, {
          transactions: [{ amount: 10000 * i }, { amount: 0 }, { amount: 0 }, { amount: 0 }],
          positions: [],
          signatures: [{ blockTime: 1000 }, { blockTime: 2000 }, { blockTime: 3000 }, { blockTime: 4000 }]
        }, 'SYBIL');
      } else {
        // High Sync
        await runTest(`Auto Sybil High Sync ${i}`, {
          transactions: [{ amount: 10 }, { amount: 10 }, { amount: 10 }],
          positions: [],
          signatures: [{ blockTime: i * 1000 }, { blockTime: i * 1000 + 1 }, { blockTime: i * 1000 + 2 }]
        }, 'SYBIL');
      }
    } else {
      // Verified (organic)
      await runTest(`Auto Verified Organic ${i}`, {
        transactions: [{ amount: 10 + i }, { amount: 12 + i }, { amount: 15 + i }],
        positions: [],
        signatures: [{ blockTime: i * 1000 }, { blockTime: i * 1000 + 50 }, { blockTime: i * 1000 + 100 }]
      }, 'VERIFIED');
    }
  }

  // More mixed permutations
  // Zero amounts
  await runTest('Sybil - Zero amounts with 1 high', {
    transactions: [{amount: 0}, {amount: 0}, {amount: 0}, {amount: 100}],
    positions: [],
    signatures: [{blockTime: 100}, {blockTime: 200}, {blockTime: 300}, {blockTime: 400}]
  }, 'SYBIL');

  // Negative amounts (should be abs in calculateGini)
  await runTest('Sybil - Negative massive extraction', {
    transactions: [{amount: -10000}, {amount: 0}, {amount: 0}, {amount: 0}],
    positions: [],
    signatures: [{blockTime: 100}, {blockTime: 200}, {blockTime: 300}, {blockTime: 400}]
  }, 'SYBIL');

  await runTest('Verified - Negative and positive organic', {
    transactions: [{amount: -10}, {amount: 15}, {amount: -12}, {amount: 20}],
    positions: [],
    signatures: [{blockTime: 100}, {blockTime: 200}, {blockTime: 300}, {blockTime: 400}]
  }, 'VERIFIED');

  // HHI specific variations (HHI doesn't affect status directly in RiskAuditorAgent, but affects notarization/scores)
  await runTest('Verified - High HHI but low Gini/Sync', {
    transactions: [{amount: 10}, {amount: 10}, {amount: 10}],
    positions: [{value: 10000}, {value: 1}], // Very high HHI
    signatures: [{blockTime: 100}, {blockTime: 200}, {blockTime: 300}]
  }, 'VERIFIED');

  // Test zero transactions but has signatures (probationary check looks at signatures length)
  await runTest('Verified - 0 tx, 4 signatures (handled gracefully)', {
    transactions: [],
    positions: [],
    signatures: [{blockTime: 100}, {blockTime: 200}, {blockTime: 300}, {blockTime: 400}]
  }, 'VERIFIED');

  // Add 10 more varied tests to reach 50+ total
  for (let i = 1; i <= 15; i++) {
     const txs = Array(5).fill(0).map((_, idx) => ({ amount: 100 + (idx * i) }));
     const sigs = Array(5).fill(0).map((_, idx) => ({ blockTime: idx * 100 * i }));

     await runTest(`Auto Verified Extended ${i}`, {
        transactions: txs,
        positions: [{value: i * 10}],
        signatures: sigs
     }, 'VERIFIED');
  }

  console.log(`
Test Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

testRiskAuditorAgent().catch(err => {
  console.error(err);
  process.exit(1);
});
