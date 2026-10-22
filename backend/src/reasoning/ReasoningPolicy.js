/**
 * ReasoningPolicy
 * Controls authorization, safety policies, and operator approval gates for reasoning engine decisions.
 */

class ReasoningPolicy {
    constructor(raw = {}) {
        this.requireOperatorApproval = Boolean(raw.requireOperatorApproval ?? false);
        this.allowedActions = Array.isArray(raw.allowedActions)
            ? raw.allowedActions
            : ['HEALTH_CHECK', 'CAPABILITY_DISCOVERY', 'RUN_DIAGNOSTICS', 'CREATE_ALERT', 'EXECUTE_TEST_CAPABILITY', 'MCP_TOOL_CALL'];
        this.maxActionsPerReasoning = Math.max(1, Number(raw.maxActionsPerReasoning) || 5);
        this.confidenceThreshold = Number(raw.confidenceThreshold) || 0.7;
    }

    isActionAllowed(actionType) {
        if (this.allowedActions.includes('*')) return true;
        return this.allowedActions.includes(actionType);
    }

    requiresApproval(actionType, confidence = 1.0) {
        if (this.requireOperatorApproval) return true;
        if (confidence < this.confidenceThreshold) return true;
        return false;
    }
}

module.exports = { ReasoningPolicy };
