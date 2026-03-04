import axios from 'axios';

/**
 * TrustChain Reputation Engine
 * Fetches external reputation data and combines with local integrity metrics.
 */

// Default score if FairScale API is unreachable or returns 404
const DEFAULT_FAIR_SCORE = 50;
const CACHE_TTL = 60000; // 60 seconds

// In-memory cache: Map<address, { score: number, timestamp: number }>
interface CacheEntry {
    score: number;
    timestamp: number;
}
const scoreCache = new Map<string, CacheEntry>();

/**
 * Fetches the FairScore for a given wallet address with caching.
 * @param {string} address - The wallet address.
 * @returns {Promise<number>} - The FairScore (0-100).
 */
export const getFairScore = async (address: string): Promise<number> => {
  const now = Date.now();

  // Check cache
  if (scoreCache.has(address)) {
    const cached = scoreCache.get(address)!;
    if (now - cached.timestamp < CACHE_TTL) {
      return cached.score;
    }
    scoreCache.delete(address); // Expired
  }

  let score = DEFAULT_FAIR_SCORE;

  try {
    const response = await axios.get(`https://sales.fairscale.xyz/api/score/${address}`, {
      timeout: 3000 // 3s timeout to avoid blocking verification
    });

    if (response.data && typeof response.data.score === 'number') {
      let rawScore = response.data.score;

      // Resilience: Ensure finite number
      if (Number.isFinite(rawScore)) {
          // Normalize if score is 0-1 (heuristic)
          if (rawScore <= 1 && rawScore > 0) {
            rawScore = rawScore * 100;
          }
          // Strict clamping (0-100)
          score = Math.min(Math.max(rawScore, 0), 100);
      } else {
          console.warn(`[ReputationEngine] Non-finite score received for ${address}:`, rawScore);
      }
    } else {
        // Fallback if structure is different
        console.warn(`[ReputationEngine] Unexpected response format for ${address}:`, response.data);
    }

  } catch (error: any) {
    // Log error but suppress full stack trace to keep logs clean
    const status = error.response ? error.response.status : 'UNKNOWN';
    if (status !== 404) {
        console.warn(`[ReputationEngine] Failed to fetch FairScore for ${address} (Status: ${status}):`, error.message);
    }
    // For 404, we just return default (new wallet) without noise
  }

  // Cache the result (whether success or default/error fallback)
  scoreCache.set(address, { score, timestamp: now });

  // Prevent memory leak: Schedule removal
  const timer = setTimeout(() => {
    scoreCache.delete(address);
  }, CACHE_TTL);
  // Ensure the timer doesn't block the process from exiting (e.g. in tests)
  timer.unref();

  return score;
};

/**
 * Calculates the Total Reputation Score based on weighted logic.
 * Formula: (TrustChainBehavioral * 0.7) + (FairScaleSocial * 0.3)
 * @param {number} trustChainScore - Derived from local integrity (0-100).
 * @param {number} fairScore - Fetched from FairScale (0-100).
 * @returns {number} - The weighted total score (0-100).
 */
export const calculateTotalScore = (trustChainScore: number, fairScore: number): number => {
  const weightedTrust = trustChainScore * 0.7;
  const weightedFair = fairScore * 0.3;
  return Math.round(weightedTrust + weightedFair);
};
