/**
 * Phase 34 — Response Outcome Analyzer
 * Analyzes the operational result from actual execution + verification +
 * live store reads. Verification states: VERIFIED_RECOVERED /
 * VERIFIED_IMPROVED / PARTIALLY_IMPROVED / UNCHANGED / DEGRADED / FAILED /
 * UNSUPPORTED / INSUFFICIENT_DATA. Never manufactures recovery.
 */

const VERIFICATION_OUTCOMES = Object.freeze({
    VERIFIED_RECOVERED: 'VERIFIED_RECOVERED',
    VERIFIED_IMPROVED: 'VERIFIED_IMPROVED',
    PARTIALLY_IMPROVED: 'PARTIALLY_IMPROVED',
    UNCHANGED: 'UNCHANGED',
    DEGRADED: 'DEGRADED',
    FAILED: 'FAILED',
    UNSUPPORTED: 'UNSUPPORTED',
    INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

function rankState(state) {
    const order = { HEALTHY: 3, DEGRADED: 2, UNHEALTHY: 1, OFFLINE: 0, UNKNOWN: -1 };
    return order[state] !== undefined ? order[state] : -1;
}

class ResponseOutcomeAnalyzer {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
    }

    /**
     * Analyze outcome from coordination record + verification + live state.
     */
    analyzeOutcome({ adaptivePlan, coordination, verificationBundle, tenantId = 'default-tenant' } = {}) {
        const agentId = adaptivePlan ? adaptivePlan.agentId : null;
        const coordOutcome = coordination ? coordination.outcome : null;

        if (coordOutcome === 'STOPPED_UNSUPPORTED') {
            return this._result(VERIFICATION_OUTCOMES.UNSUPPORTED, 'Execution unsupported for scope; no state change attempted.', coordination, verificationBundle, agentId, tenantId);
        }
        if (!coordination || !coordination.preState || coordination.preState.classification === 'INSUFFICIENT_DATA') {
            if (coordOutcome && coordOutcome.startsWith('STOPPED_')) {
                return this._result(VERIFICATION_OUTCOMES.INSUFFICIENT_DATA, `Plan stopped at ${coordOutcome}; outcome analysis has no execution evidence.`, coordination, verificationBundle, agentId, tenantId);
            }
            return this._result(VERIFICATION_OUTCOMES.INSUFFICIENT_DATA, 'Pre-response state unavailable; outcome cannot be established.', coordination, verificationBundle, agentId, tenantId);
        }

        const verification = verificationBundle ? verificationBundle.verification : null;
        const postState = (verificationBundle && verificationBundle.postState) || (coordination && coordination.postState) || null;
        if (!postState || postState.classification === 'INSUFFICIENT_DATA') {
            return this._result(VERIFICATION_OUTCOMES.INSUFFICIENT_DATA, 'Post-response state unavailable; verification cannot establish an outcome.', coordination, verificationBundle, agentId, tenantId);
        }

        const preRank = rankState(coordination.preState.currentState);
        const postRank = rankState(postState.currentState);
        const verified = verification ? verification.verified === true : null;

        let state = VERIFICATION_OUTCOMES.UNCHANGED;
        let summary = '';
        if (verified === true && postState.currentState === 'HEALTHY') {
            state = VERIFICATION_OUTCOMES.VERIFIED_RECOVERED;
            summary = `Target agent '${agentId}' restored to HEALTHY (verified by existing verification service).`;
        } else if (verified === true) {
            state = VERIFICATION_OUTCOMES.VERIFIED_IMPROVED;
            summary = `Verification passed for '${agentId}' with post state ${postState.currentState}.`;
        } else if (verified === false && postRank > preRank) {
            state = VERIFICATION_OUTCOMES.PARTIALLY_IMPROVED;
            summary = `Verification did not fully pass, but '${agentId}' improved from ${coordination.preState.currentState} to ${postState.currentState} (observed).`;
        } else if (verified === false && postRank === preRank) {
            state = (coordOutcome === 'EXECUTION_FAILED') ? VERIFICATION_OUTCOMES.FAILED : VERIFICATION_OUTCOMES.UNCHANGED;
            summary = state === VERIFICATION_OUTCOMES.FAILED
                ? `Execution failed for '${agentId}'; state remains ${postState.currentState} (observed).`
                : `No state change observed for '${agentId}': ${postState.currentState} before and after (observed).`;
        } else if (verified === false && postRank < preRank) {
            state = VERIFICATION_OUTCOMES.DEGRADED;
            summary = `State worsened for '${agentId}' from ${coordination.preState.currentState} to ${postState.currentState} (observed).`;
        } else {
            state = VERIFICATION_OUTCOMES.INSUFFICIENT_DATA;
            summary = 'Verification result inconclusive; outcome cannot be established.';
        }

        return this._result(state, summary, coordination, verificationBundle, agentId, tenantId);
    }

    _result(state, summary, coordination, verificationBundle, agentId, tenantId) {
        const verification = verificationBundle ? verificationBundle.verification : null;
        return {
            verificationState: state,
            summary,
            classification: state === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : (state === 'UNSUPPORTED' ? 'CONFIRMED' : 'OBSERVED'),
            agentId,
            tenantId,
            preState: coordination ? coordination.preState : null,
            postState: (verificationBundle && verificationBundle.postState) || (coordination && coordination.postState) || null,
            verificationServiceResult: verification ? { verified: verification.verified, status: verification.status } : null,
            analyzedAt: new Date().toISOString()
        };
    }
}

module.exports = { ResponseOutcomeAnalyzer, VERIFICATION_OUTCOMES };
