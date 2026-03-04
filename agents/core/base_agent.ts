export interface TemporalObserver {
  gini: number;
  hhi: number;
  syncIndex: number;
}

// 🏛️ Added 'SYBIL' to align with the rest of the ecosystem
export interface IntegrityDecision {
  status: 'VERIFIED' | 'PROBATIONARY' | 'SYBIL';
  score: TemporalObserver;
  reason?: string;
  decision?: string; // Added to match server.js response
}

export class RiskAuditorAgent {
  // Tightened to 0.35 to match your server.js Configuration
  static readonly PROBATIONARY_SYNC_INDEX_THRESHOLD = 0.35;
  static readonly GINI_THRESHOLD = 0.7;
  // Lowered floor to 0.05 to prevent "Balance Stress" during demo
  static readonly MIN_SOL_STAKE = 0.05;

  /**
   * @param data - The temporal observer data (gini, hhi, syncIndex)
   * @param solBalance - The wallet balance in SOL (not Lamports)
   */
  public evaluate(data: TemporalObserver, solBalance: number): IntegrityDecision {
    // 1. Economic Stake Check
    if (solBalance < RiskAuditorAgent.MIN_SOL_STAKE) {
      return {
        status: 'PROBATIONARY',
        score: data,
        reason: 'Institutional floor not met for notarization.'
      };
    }

    // 2. Anti-Bot / Sybil Guard
    if (data.syncIndex > RiskAuditorAgent.PROBATIONARY_SYNC_INDEX_THRESHOLD || data.gini > RiskAuditorAgent.GINI_THRESHOLD) {
      return {
        status: 'SYBIL',
        score: data,
        reason: 'Behavioral anomaly detected: High synchronization or inequality.'
      };
    }

    // 3. New Identity Guard
    if (data.syncIndex === 0 && data.gini === 0 && solBalance <= RiskAuditorAgent.MIN_SOL_STAKE) {
      return {
        status: 'PROBATIONARY',
        score: data,
        reason: 'Awaiting behavioral notarization history.'
      };
    }

    return {
      status: 'VERIFIED',
      score: data,
      reason: 'Sovereign Integrity Verified.'
    };
  }

  static getIntegrityDecision(data: any, solBalance: number): IntegrityDecision {
    const agent = new RiskAuditorAgent();
    const result = agent.evaluate({
      gini: data.gini || 0,
      hhi: data.hhi || 0,
      syncIndex: data.syncIndex || 0
    }, solBalance);

    return {
      ...result,
      decision: result.status === 'VERIFIED' ? 'AUTHORIZED_ACTOR' : 'RELEVANT_RISK_DETECTED'
    };
  }
}