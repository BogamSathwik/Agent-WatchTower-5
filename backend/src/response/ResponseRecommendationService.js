/**
 * Phase 29 — Response Recommendation Service
 * Recommends response options by pairing current evidence with historical learning data.
 */

class ResponseRecommendationService {
    constructor(options = {}) {
        this.learningService = options.learningService || null;
        this.optionEngine = options.optionEngine || null;
    }

    /**
     * Recommends response options based on historical outcomes and available engine options.
     */
    getRecommendations({ agentId = 'UNKNOWN', incident = null, problemSummary = 'Operational issue', tenantId = 'default-tenant' } = {}) {
        const problemType = incident?.problemType || 'HEALTH_DEGRADATION';
        
        let previousOutcomes = [];
        if (this.learningService) {
            previousOutcomes = this.learningService.getHistoricalOutcomes({ agentId, tenantId });
            if (previousOutcomes.length === 0) {
                previousOutcomes = this.learningService.getHistoricalOutcomes({ problemType, tenantId });
            }
        }

        let availableOptions = [];
        if (this.optionEngine) {
            availableOptions = this.optionEngine.generateOptions({ agentId, incident, problemSummary, tenantId });
        }

        const previouslyObserved = previousOutcomes.map(o => ({
            actionType: o.actionSelected,
            title: o.actionTitle,
            historicalOutcome: o.verificationResult === 'VERIFIED' ? 'SUCCESSFUL_RECOVERY' : 'VERIFICATION_FAILED',
            lastUsedAt: o.timestamp,
            recoveryTimeMs: o.recoveryTimeMs
        }));

        return {
            agentId,
            incidentId: incident?.incidentId || null,
            problemType,
            previouslyObservedResponses: previouslyObserved,
            availableResponses: availableOptions,
            recommendationSummary: previouslyObserved.some(p => p.historicalOutcome === 'SUCCESSFUL_RECOVERY')
                ? `Historical data indicates '${previouslyObserved[0].title}' previously resulted in verified recovery.`
                : 'No historical recovery matches found. Review available diagnostic and response options.'
        };
    }
}

module.exports = { ResponseRecommendationService };
