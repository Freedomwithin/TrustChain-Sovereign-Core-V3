import axios from 'axios';
import { getFairScore, calculateTotalScore } from '../services/reputationEngine.js';
import assert from 'assert';

async function runTests() {
  console.log("Starting Advanced Reputation Engine Tests...");

  let mockResponses = {};
  let callCounts = {};

  // Mock setup
  const originalGet = axios.get;
  const mockGet = async (url) => {
      const address = url.split('/').pop();
      // Reset call count if not exists
      if (callCounts[address] === undefined) callCounts[address] = 0;

      callCounts[address]++;

      if (mockResponses[address]) {
          if (mockResponses[address].error) {
              throw mockResponses[address].error;
          }
          return { data: mockResponses[address].data };
      }
      // Default mock for unknown addresses if needed, or throw
      throw new Error(`Unexpected URL: ${url}`);
  };

  // Apply mock
  axios.get = mockGet;

  try {
      // Test 1: Weighted Score Calculation
      console.log("Test 1: Weighted Score Calculation");
      // (100 * 0.7) + (100 * 0.3) = 100
      assert.strictEqual(calculateTotalScore(100, 100), 100);
      // (0 * 0.7) + (0 * 0.3) = 0
      assert.strictEqual(calculateTotalScore(0, 0), 0);
      // (50 * 0.7) + (50 * 0.3) = 50
      assert.strictEqual(calculateTotalScore(50, 50), 50);
      // (80 * 0.7) + (20 * 0.3) = 56 + 6 = 62
      assert.strictEqual(calculateTotalScore(80, 20), 62);
      console.log("   Passed");

      // Test 2: Caching Logic
      console.log("Test 2: Caching Logic");
      const addr1 = "Addr1_CachingTest";
      mockResponses[addr1] = { data: { score: 75 } };
      callCounts[addr1] = 0;

      // First call
      const score1 = await getFairScore(addr1);
      assert.strictEqual(score1, 75);
      assert.strictEqual(callCounts[addr1], 1, "Should call API once");

      // Second call (immediate)
      const score2 = await getFairScore(addr1);
      assert.strictEqual(score2, 75);
      assert.strictEqual(callCounts[addr1], 1, "Should hit cache (no new API call)");

      console.log("   Passed");

      // Test 3: Resilience (NaN/Infinity)
      console.log("Test 3: Resilience (NaN/Infinity)");
      const addrInf = "Addr_Infinity";
      mockResponses[addrInf] = { data: { score: Infinity } };
      const scoreInf = await getFairScore(addrInf);
      // If Infinity, Number.isFinite is false -> returns default 50
      assert.strictEqual(scoreInf, 50, "Infinity should result in default score 50");

      const addrNaN = "Addr_NaN";
      mockResponses[addrNaN] = { data: { score: NaN } };
      const scoreNaN = await getFairScore(addrNaN);
      assert.strictEqual(scoreNaN, 50, "NaN should result in default score 50");

      // Test Clamping
      const addrHigh = "Addr_High";
      mockResponses[addrHigh] = { data: { score: 150 } };
      const scoreHigh = await getFairScore(addrHigh);
      assert.strictEqual(scoreHigh, 100, "Should clamp >100 to 100");

      const addrLow = "Addr_Low";
      mockResponses[addrLow] = { data: { score: -10 } };
      const scoreLow = await getFairScore(addrLow);
      assert.strictEqual(scoreLow, 0, "Should clamp <0 to 0");

      console.log("   Passed");

      // Test 4: Error Handling & Caching Default
      console.log("Test 4: Error Handling & Caching Default");
      const addrErr = "Addr_Error";
      mockResponses[addrErr] = { error: { message: "Network Error", response: { status: 500 } } };
      callCounts[addrErr] = 0;

      const scoreErr1 = await getFairScore(addrErr);
      assert.strictEqual(scoreErr1, 50, "Error should return default 50");
      assert.strictEqual(callCounts[addrErr], 1);

      // Second call should return cached default 50 without hitting API again
      const scoreErr2 = await getFairScore(addrErr);
      assert.strictEqual(scoreErr2, 50);
      assert.strictEqual(callCounts[addrErr], 1, "Should cache default score on error");

      console.log("   Passed");

  } catch (e) {
      console.error("Test Failed:", e);
      process.exit(1);
  } finally {
      axios.get = originalGet;
  }

  console.log("All Advanced Tests Passed!");
}

runTests();
