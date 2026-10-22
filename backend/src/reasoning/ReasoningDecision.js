/**
 * ReasoningDecision Model
 * Structured output of a reasoning evaluation step.
 * Contains observation, analysis, options, selected action, policy, and next steps.
 */

class ReasoningDecision {
    constructor(raw = {}) {
        this.decisionId = raw.decisionId || `dec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.agentId = raw.agentId || 'global';
        this.status = raw.status || 'ACTION_PROPOSED'; // OBSERVED, ANALYZED, ACTION_PROPOSED, EXECUTED, COMPLETED, ESCALATED, REJECTED
        this.observation = raw.observation || '';
        this.analysis = raw.analysis || '';
        this.options = Array.isArray(raw.options) ? raw.options : [];
        this.selectedAction = (typeof raw.selectedAction === 'object' && raw.selectedAction !== null)
            ? raw.selectedAction
            : { type: 'HEALTH_CHECK', targetAgentId: this.agentId };
        this.confidence = typeof raw.confidence === 'number' ? raw.confidence : 0.95;
        this.policy = raw.policy || 'AUTOMATED'; // AUTOMATED, OPERATOR_APPROVAL, ALLOWLIST_CHECK
        this.reason = raw.reason || '';
        this.nextStep = raw.nextStep || '';
        this.actionResult = raw.actionResult !== undefined ? raw.actionResult : null;
        this.timestamp = raw.timestamp || new Date().toISOString();
        this.metadata = typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
    }

    toJSON() {
        return {
            decisionId: this.decisionId,
            agentId: this.agentId,
            status: this.status,
            observation: this.observation,
            analysis: this.analysis,
            options: this.options,
            selectedAction: this.selectedAction,
            confidence: this.confidence,
            policy: this.policy,
            reason: this.reason,
            nextStep: this.nextStep,
            actionResult: this.actionResult,
            timestamp: this.timestamp,
            metadata: this.metadata
        };
    }
}

module.exports = { ReasoningDecision };
