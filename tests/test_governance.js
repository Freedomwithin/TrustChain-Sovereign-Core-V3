import assert from 'node:assert';
import { calculateVoterWeight } from '../integrityEngine.js';

console.log('Running Governance Logic Tests...\n');

try {
  // Test Case 1: High Score (Steward)
  const score1 = 90;
  const hhi1 = 0.2;
  const weight1 = calculateVoterWeight(score1, hhi1);
  assert.strictEqual(weight1, 1.5, `Score 90, HHI 0.2 -> Should be 1.5, got ${weight1}`);

  // Test Case 2: Medium Score (Verified)
  const score2 = 50;
  const hhi2 = 0.2;
  const weight2 = calculateVoterWeight(score2, hhi2);
  assert.strictEqual(weight2, 1.0, `Score 50, HHI 0.2 -> Should be 1.0, got ${weight2}`);

  // Test Case 3: Low Score (Probationary)
  const score3 = 20;
  const hhi3 = 0.2;
  const weight3 = calculateVoterWeight(score3, hhi3);
  assert.strictEqual(weight3, 0.1, `Score 20, HHI 0.2 -> Should be 0.1, got ${weight3}`);

  // Test Case 4: Zero Score (Blocked)
  const score4 = 0;
  const hhi4 = 0.2;
  const weight4 = calculateVoterWeight(score4, hhi4);
  assert.strictEqual(weight4, 0.0, `Score 0, HHI 0.2 -> Should be 0.0, got ${weight4}`);

  // Test Case 5: Whale (HHI > 0.8) -> Probationary even if score is high
  const score5 = 90;
  const hhi5 = 0.85;
  const weight5 = calculateVoterWeight(score5, hhi5);
  assert.strictEqual(weight5, 0.1, `Score 90, HHI 0.85 (Whale) -> Should be 0.1, got ${weight5}`);

  console.log('✅ calculateVoterWeight logic verified.');
} catch (e) {
  console.error('❌ Governance Logic Test Failed:', e.message);
  process.exit(1);
}
