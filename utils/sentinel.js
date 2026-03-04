/**
 * Sentinel Logic
 * Advanced integrity checks for TrustChain.
 */

/**
 * Calculates syncIndex based on transaction timestamps using weighted temporal burst detection.
 *
 * @param {number[]} timestamps - Array of transaction timestamps (in seconds).
 * @returns {Object} - { syncIndex, burstRatio }
 */
const BURST_THRESHOLD = 10;
const MIN_TRANSACTIONS = 3;

const calculateSyncIndex = (timestamps) => {
  if (!timestamps || timestamps.length < MIN_TRANSACTIONS) {
    return { syncIndex: 0, burstRatio: 0 };
  }

  const sorted = [...timestamps].sort((a, b) => a - b);
  const diffs = [];
  let burstCount = 0;

  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i-1];
    diffs.push(diff);

    // Weighted burst detection: gaps <= BURST_THRESHOLD are considered bursts
    if (diff <= BURST_THRESHOLD) {
      burstCount++;
    }
  }

  if (diffs.length === 0) return { syncIndex: 0, burstRatio: 0 };

  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;

  // Calculate Coefficient of Variation (CV) based sync index
  let cvSyncIndex = 0;
  if (mean > 0) {
    const variance = diffs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / diffs.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean;
    cvSyncIndex = 1 / (1 + cv);
  } else {
    cvSyncIndex = 1; // All transactions at same time
  }

  // Calculate Burst Ratio
  const burstRatio = burstCount / diffs.length;

  // Final Sync Index is a weighted combination, prioritizing the higher signal
  // If burst ratio is high, it's definitely a bot.
  // If CV is low (regular intervals), it's also likely a bot.
  const syncIndex = Math.max(cvSyncIndex, burstRatio);

  return { syncIndex, burstRatio };
};

module.exports = {
  calculateSyncIndex
};
