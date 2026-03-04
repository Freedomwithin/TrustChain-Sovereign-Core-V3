import { getFairScore, calculateTotalScore } from '../services/reputationEngine.js';
import assert from 'assert';

async function runTests() {
  console.log("Testing Reputation Engine...");

  // Test 1: calculateTotalScore
  console.log("   Test 1: calculateTotalScore logic");
  const trustChainScore = 80;
  const fairScore = 60;
  // Expected: (80 * 0.7) + (60 * 0.3) = 56 + 18 = 74
  const total = calculateTotalScore(trustChainScore, fairScore);
  assert.strictEqual(total, 74, `Expected 74, got ${total}`);
  console.log("   Passed");

  // Test 2: getFairScore (Real API Check)
  console.log("   Test 2: getFairScore (Real API Check)");
  const testAddress = "JCq7a2E3r4M3aA2xQm4uXpKdV1FBocWLqUqgjLG81Xcg";
  const score = await getFairScore(testAddress);
  console.log(`   Fetched Score for ${testAddress}: ${score}`);
  assert.ok(typeof score === 'number', "Score should be a number");
  assert.ok(score >= 0 && score <= 100, "Score should be between 0 and 100");
  console.log("   Passed");

  // Test 3: getFairScore (Invalid Address or 404)
  console.log("   Test 3: getFairScore (Handling 404/Error)");
  const invalidAddress = "InvalidAddress123";
  const defaultScore = await getFairScore(invalidAddress);
  console.log(`   Fetched Score for invalid: ${defaultScore}`);
  assert.strictEqual(defaultScore, 50, "Should return default score 50 on error");
  console.log("   Passed");

  console.log("All tests passed!");
}

runTests().catch(err => {
  console.error("Test Failed:", err);
  process.exit(1);
});
