const { calculateGini, calculateHHI, checkSyncIndex } = require('../services/integrityEngine');
const assert = require('node:assert');

console.log('Running New Integrity Engine Tests...\n');

// Gini Tests
try {
  const giniData = [
      { amount: 10 }, { amount: 10 }, { amount: 10 }, { amount: 10 }
  ];
  const gini1 = calculateGini(giniData);
  assert.strictEqual(gini1, 0, `Gini should be 0, got ${gini1}`);

  const giniData2 = [{ amount: 0 }, { amount: 0 }, { amount: 10 }];
  const gini2 = calculateGini(giniData2);
  // Manual calc: (0,0,10) -> sorted: 0,0,10. sum=10. n=3.
  // abs diffs: |0-0|+|0-10| + |0-0|+|0-10| + |10-0|+|10-0| = 0+10 + 0+10 + 10+10 = 40.
  // 2*n*sum = 2*3*10 = 60.
  // gini = 40/60 = 0.666...
  // Correction: 0.666... * (3/2) = 1.0
  assert.ok(Math.abs(gini2 - 1.0) < 0.001, `Gini should be 1.0, got ${gini2}`);

  const giniData3 = [{ amount: 10 }]; // Single tx
  const gini3 = calculateGini(giniData3);
  assert.strictEqual(gini3, 0, `Gini (n=1) should be 0, got ${gini3}`);

  console.log('✅ Gini Tests Passed');
} catch (e) {
  console.error('❌ Gini Tests Failed:', e.message);
  process.exit(1);
}

// HHI Tests
try {
  const hhiData = [{ value: 50 }, { value: 50 }]; // 50% each. HHI = 50^2 + 50^2 = 2500 + 2500 = 5000 / 10000 = 0.5
  const hhi1 = calculateHHI(hhiData);
  assert.strictEqual(hhi1, 0.5, `HHI should be 0.5, got ${hhi1}`);

  const hhiData2 = [{ value: 100 }]; // 100%. HHI = 100^2 = 10000 / 10000 = 1.0
  const hhi2 = calculateHHI(hhiData2);
  assert.strictEqual(hhi2, 1, `HHI should be 1, got ${hhi2}`);
  console.log('✅ HHI Tests Passed');
} catch (e) {
  console.error('❌ HHI Tests Failed:', e.message);
  process.exit(1);
}

// Sync Index Tests
try {
  const syncData = [
      { blockTime: 100 },
      { blockTime: 101 }, // Diff 1 (cluster)
      { blockTime: 102 }, // Diff 1 (cluster)
      { blockTime: 200 }  // Diff 98 (no cluster)
  ];
  // Sorted: 100, 101, 102, 200.
  // Diffs: 1, 1, 98.
  // Clusters: (101-100)=1<=2? YES. (102-101)=1<=2? YES. (200-102)=98<=2? NO.
  // Cluster Count = 2.
  // Total Signatures = 4.
  // Sync Index = 2/4 = 0.5.

  const sync1 = checkSyncIndex(syncData);
  assert.strictEqual(sync1, 0.5, `Sync Index should be 0.5, got ${sync1}`);
  console.log('✅ Sync Index Tests Passed');
} catch (e) {
  console.error('❌ Sync Index Tests Failed:', e.message);
  process.exit(1);
}

console.log('\nALL NEW INTEGRITY TESTS PASSED');
