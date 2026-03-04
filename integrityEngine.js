/**
 * TrustChain Integrity Engine
 * Logic: Dual Gatekeeper (FairScale + Gini/HHI)
 * Ported to CommonJS for stability and deployment.
 */

/**
 * Calculates the Gini Coefficient to detect wealth/liquidity concentration.
 * Range: 0 (Perfect Equality) to 1 (Total Inequality)
 */
const calculateGini = (values) => {
  if (!values || values.length < 2) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let sumOfAbsoluteDifferences = 0;
  let sumOfValues = 0;

  for (let i = 0; i < n; i++) {
    sumOfValues += sorted[i];
    for (let j = 0; j < n; j++) {
      sumOfAbsoluteDifferences += Math.abs(sorted[i] - sorted[j]);
    }
  }

  // Corrected math to avoid the "0.25" bug Jules found
  if (sumOfValues === 0) return 0.0001;
  return sumOfAbsoluteDifferences / (2 * n * sumOfValues);
};

/**
 * Calculates HHI as a gas-efficient proxy for on-chain concentration.
 */
const calculateHHI = (values) => {
  if (!values || values.length === 0) return 0;
  const total = values.reduce((acc, val) => acc + val, 0);
  if (total === 0) return 0;

  // HHI = Sum of squares of percentage shares
  return values.reduce((acc, val) => {
    const share = (val / total) * 100;
    return acc + (share * share);
  }, 0) / 10000; // Normalized 0-1
};

/**
 * Calculates syncIndex based on transaction timestamps.
 * Detects automated/bot-like behavior (highly synchronized).
 */
const calculateSyncIndex = (timestamps) => {
  if (!timestamps || timestamps.length < 3) return 0;

  const sorted = [...timestamps].sort((a, b) => a - b);
  const diffs = [];
  for (let i = 1; i < sorted.length; i++) {
    diffs.push(sorted[i] - sorted[i-1]);
  }

  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  if (mean === 0) return 1; // All transactions in same block? Highly synchronized.

  const variance = diffs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / diffs.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of Variation (CV) = stdDev / mean
  // If CV is low (regular intervals), syncIndex is high.
  // If CV is high (random intervals), syncIndex is low.
  // Range: 0 to 1.
  const cv = stdDev / mean;
  return 1 / (1 + cv);
};

/**
 * Dual Gatekeeper Logic
 * Cross-references FairScale Tier with local Integrity Score
 */
const checkLpEligibility = async (fairScoreTier, walletEvents) => {
  // 1. Calculate concentration based on current balances
  // Optimize: Scan only the last 15 signatures to prevent timeouts
  const recentEvents = walletEvents.slice(-50);

  const balances = recentEvents.reduce((acc, event) => {
    acc[event.wallet] = (acc[event.wallet] || 0) + Math.abs(event.amount);
    return acc;
  }, {});

  const gini = calculateGini(Object.values(balances));

  // 2. Dual Gatekeeper Check (Referencing AGENT.md rules)
  if (fairScoreTier < 2) {
    return { eligible: false, reason: "FairScale Tier insufficient (Sybil risk)", gini };
  }

  if (gini > 0.3) {
    return { eligible: false, reason: "Gini coefficient too high (Extractive behavior)", gini };
  }

  return { eligible: true, gini };
};

/**
 * Calculates the DAO Governance multiplier based on TrustChain behavioral integrity.
 * This is the value that will eventually be notarized to the on-chain PDA.
 *
 * Logic Update:
 * - HHI > 0.8 triggers "Probationary" (0.1x) to mitigate whale dominance.
 * - Score 0 is always "Blocked".
 */
const calculateVoterWeight = (score, hhi = 0) => {
    if (score <= 0) return 0.0;
    if (hhi > 0.8) return 0.1; // Whale anti-concentration mechanism
    if (score >= 85) return 1.5;
    if (score >= 40) return 1.0;
    return 0.1;
};

export { calculateGini, calculateHHI, calculateSyncIndex, checkLpEligibility, calculateVoterWeight };
