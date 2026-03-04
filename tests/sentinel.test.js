const { calculateSyncIndex } = require('../utils/sentinel');

console.log('Running Sentinel Logic Tests...\n');

const tests = [
  {
    name: 'Empty Array',
    timestamps: [],
    expected: { syncIndex: 0, burstRatio: 0 }
  },
  {
    name: 'Short Array',
    timestamps: [1000],
    expected: { syncIndex: 0, burstRatio: 0 }
  },
  {
    name: 'Regular Intervals (1m gap)',
    timestamps: [100, 160, 220, 280, 340],
    // Regular intervals mean high CV-based sync (low variance), low burst ratio (gaps > 10s).
    // CV = 0, Sync = 1/(1+0) = 1.
    // Burst = 0/4 = 0.
    // Result Sync = Max(1, 0) = 1.
    expectedRange: { syncIndex: [0.9, 1.1], burstRatio: [0, 0.1] }
  },
  {
    name: 'Burst (All < 10s gap)',
    timestamps: [100, 105, 108, 110, 112],
    // Gaps: 5, 3, 2, 2. All <= 10.
    // Burst Ratio = 1.
    // CV based sync might vary but shouldn't be 0.
    // Result Sync >= 1.
    expectedRange: { syncIndex: [0.9, 1.1], burstRatio: [0.9, 1.1] }
  },
  {
    name: 'Mixed (Some bursts)',
    timestamps: [100, 200, 205, 300, 305],
    // Gaps: 100, 5, 95, 5.
    // Bursts: 5, 5 (2 bursts). Total gaps: 4.
    // Burst Ratio: 0.5.
    // CV: Mean = 51.25. Variance is high. Sync from CV low.
    // Result Sync >= 0.5.
    expectedRange: { syncIndex: [0.4, 0.6], burstRatio: [0.4, 0.6] }
  }
];

let passed = 0;

tests.forEach(test => {
  const result = calculateSyncIndex(test.timestamps);
  console.log(`Test: ${test.name}`);
  console.log(`Input: ${JSON.stringify(test.timestamps)}`);
  console.log(`Output:`, result);

  let success = true;
  if (test.expected) {
    if (result.syncIndex !== test.expected.syncIndex || result.burstRatio !== test.expected.burstRatio) {
      success = false;
    }
  } else if (test.expectedRange) {
    if (result.syncIndex < test.expectedRange.syncIndex[0] || result.syncIndex > test.expectedRange.syncIndex[1]) {
        success = false;
        console.error(`SyncIndex out of range. Expected ${test.expectedRange.syncIndex[0]}-${test.expectedRange.syncIndex[1]}`);
    }
    if (result.burstRatio < test.expectedRange.burstRatio[0] || result.burstRatio > test.expectedRange.burstRatio[1]) {
        success = false;
        console.error(`BurstRatio out of range. Expected ${test.expectedRange.burstRatio[0]}-${test.expectedRange.burstRatio[1]}`);
    }
  }

  if (success) {
    console.log('✅ Passed\n');
    passed++;
  } else {
    console.log('❌ Failed\n');
  }
});

console.log(`Passed ${passed} / ${tests.length}`);
if (passed === tests.length) process.exit(0);
else process.exit(1);
