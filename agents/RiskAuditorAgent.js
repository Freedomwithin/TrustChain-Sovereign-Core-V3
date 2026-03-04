import { calculateGini, calculateHHI, checkSyncIndex } from '../services/integrityEngine.js';
import { submitNotarization } from '../utils/solanaBridge.js';

class Configuration {
  // Sync Index: Lower = Human, Higher = Bot/Scripted
  static PROBATIONARY_SYNC_INDEX_THRESHOLD = 0.35;
  // Gini: Lower = Equal spread, Higher = Single massive extractor move
  static GINI_THRESHOLD = 0.7;
  static MIN_TRANSACTIONS = 3;
}

class RiskAuditorAgent {
  /**
   * 🏛️ The Notary Side-Effect
   * Ensures VERIFIED behavior is anchored on-chain without blocking the main thread.
   */
  static async notarizeDecision(address, decision) {
    if (decision.status === 'SYBIL') {
      console.error(`[SECURITY EVENT] Sybil detected for wallet: ${address}`);
      // Future: Log to Sentinel DB or trigger on-chain blacklist
    } else if (decision.status === 'VERIFIED') {
      try {
        // Notarize to the 4AX88... Program
        await submitNotarization(address, decision.status, decision.scores.gini, decision.scores.hhi);
      } catch (error) {
        console.error(`[NOTARY ERROR] Failed to notarize verified wallet ${address}:`, error.message);
        // Swallow error: Integrity of the response is higher priority than the side-effect
      }
    }
  }

  /**
   * ☸️ The Decision Engine
   * Grounded in realistic data rather than positive projections.
   */
  static async getIntegrityDecision(address, data) {
    const gini = calculateGini(data.transactions);
    const hhi = calculateHHI(data.positions);
    const syncIndex = checkSyncIndex(data.signatures);
    const txCount = data.signatures ? data.signatures.length : 0;
    
    // Default to the middle path
    let status = 'VERIFIED';
    let reason = 'Behavior aligns with organic patterns.';

    // 1. Probationary Check (New Wallets)
    if (txCount < Configuration.MIN_TRANSACTIONS) {
      status = 'PROBATIONARY';
      reason = 'Insufficient transaction history for full analysis.';
    }
    // 2. Sybil Detection (0.86 Gini capture)
    else if (syncIndex > Configuration.PROBATIONARY_SYNC_INDEX_THRESHOLD || gini > Configuration.GINI_THRESHOLD) {
      status = 'SYBIL';
      reason = 'High temporal synchronization or extreme inequality detected.';
    }

    const decision = {
      status,
      scores: {
        gini: parseFloat(gini.toFixed(4)),
        hhi: parseFloat(hhi.toFixed(4)),
        syncIndex: parseFloat(syncIndex.toFixed(4))
      },
      reason,
      decision: status === 'VERIFIED' ? 'AUTHORIZED_ACTOR' : 'RELEVANT_RISK_DETECTED'
    };

    // Verified async side-effect
    // Trigger the on-chain notarization as an async side effect
    await RiskAuditorAgent.notarizeDecision(address, decision);

    return decision;
  }
}

export { RiskAuditorAgent, Configuration };
