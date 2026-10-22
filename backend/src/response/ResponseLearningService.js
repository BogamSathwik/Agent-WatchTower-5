/**
 * Phase 29 — Response Learning Service
 * Records structured historical learning data from past response outcomes.
 * Purely analytical and observational — does NOT automatically mutate safety policies without operator consent.
 */

class ResponseLearningService {
    constructor(options = {}) {
        this.records = [];
        this.persistence = options.persistenceManager || options.persistence || null;
    }

    _persist() {
        if (!this.persistence) return;
        try {
            if (typeof this.persistence.setSafe === 'function') {
                this.persistence.setSafe('response_learning', 'outcomes', this.records);
            } else if (typeof this.persistence.set === 'function') {
                const r = this.persistence.set('response_learning', 'outcomes', this.records);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            }
        } catch (_) {}
    }

    /**
     * Records a completed response outcome for future analytical reference.
     */
    recordOutcome({
        problemType = 'HEALTH_DEGRADATION',
        agentId = 'UNKNOWN',
        evidencePattern = [],
        actionSelected = null,
        executionResult = 'COMPLETED',
        verificationResult = 'VERIFIED',
        recoveryTimeMs = 0,
        incidentOutcome = 'RESOLVED',
        tenantId = 'default-tenant'
    } = {}) {
        const record = {
            id: `learn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            timestamp: new Date().toISOString(),
            problemType,
            agentId,
            evidencePattern,
            actionSelected: actionSelected?.actionType || actionSelected?.title || 'INSPECT_HEALTH',
            actionTitle: actionSelected?.title || 'Diagnostic Check',
            executionResult,
            verificationResult,
            recoveryTimeMs,
            incidentOutcome,
            tenantId
        };

        this.records.push(record);
        this._persist();
        return record;
    }

    /**
     * Retrieves historical outcomes matching problem type or agent.
     */
    getHistoricalOutcomes({ problemType = null, agentId = null, tenantId = null } = {}) {
        return this.records.filter(r => {
            if (tenantId && r.tenantId !== tenantId) return false;
            if (problemType && r.problemType !== problemType) return false;
            if (agentId && r.agentId !== agentId) return false;
            return true;
        });
    }
}

module.exports = { ResponseLearningService };
