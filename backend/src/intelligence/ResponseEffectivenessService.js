/**
 * Phase 30 — Response Effectiveness Service
 * Evaluates historical response plan performance from Phase 29 Response Learning records.
 * Purely observational analytics — does NOT mutate response policies directly.
 */

class ResponseEffectivenessService {
    constructor(options = {}) {
        this.responseCenterService = options.responseCenterService || null;
        this.learningService = options.learningService || null;
    }

    _getLearningService() {
        return this.learningService || (this.responseCenterService ? this.responseCenterService.learningService : null);
    }

    /**
     * Calculates effectiveness breakdown by response action type.
     */
    getResponseEffectiveness(tenantId = 'default-tenant') {
        const learning = this._getLearningService();
        const records = learning ? learning.getHistoricalOutcomes({ tenantId }) : [];

        const breakdownMap = new Map();

        // Standard default action types if records are empty
        const defaultActionTypes = ['EXECUTE_REMEDIATION', 'EXECUTE_WORKFLOW', 'INSPECT_HEALTH'];
        defaultActionTypes.forEach(type => {
            breakdownMap.set(type, {
                responseType: type,
                usesCount: 0,
                successfulCount: 0,
                failedCount: 0,
                verificationSuccessRate: '100%',
                rollbackFrequency: 0,
                avgRecoveryTimeMs: 'NOT_AVAILABLE',
                associatedIncidentTypes: ['AGENT_OFFLINE', 'HEALTH_DEGRADATION']
            });
        });

        records.forEach(r => {
            const type = r.actionSelected || 'EXECUTE_REMEDIATION';
            if (!breakdownMap.has(type)) {
                breakdownMap.set(type, {
                    responseType: type,
                    usesCount: 0,
                    successfulCount: 0,
                    failedCount: 0,
                    verificationSuccessRate: '0%',
                    rollbackFrequency: 0,
                    avgRecoveryTimeMs: 'NOT_AVAILABLE',
                    associatedIncidentTypes: []
                });
            }

            const item = breakdownMap.get(type);
            item.usesCount++;
            if (r.verificationResult === 'VERIFIED') {
                item.successfulCount++;
            } else {
                item.failedCount++;
            }
            if (r.problemType && !item.associatedIncidentTypes.includes(r.problemType)) {
                item.associatedIncidentTypes.push(r.problemType);
            }
        });

        // Compute rates
        breakdownMap.forEach(item => {
            if (item.usesCount > 0) {
                const pct = Math.round((item.successfulCount / item.usesCount) * 100);
                item.verificationSuccessRate = `${pct}%`;
            }
        });

        return Array.from(breakdownMap.values());
    }

    analyzeResponseEffectiveness(tenantId = 'default-tenant') {
        const types = this.getResponseEffectiveness(tenantId);
        const totalUses = types.reduce((sum, t) => sum + t.usesCount, 0);
        const totalSuccess = types.reduce((sum, t) => sum + t.successfulCount, 0);
        const overallRate = totalUses > 0 ? totalSuccess / totalUses : 1.0;

        return {
            tenantId,
            totalHistoricalResponses: totalUses,
            overallVerificationSuccessRate: overallRate,
            responseTypes: types
        };
    }
}

module.exports = { ResponseEffectivenessService };
