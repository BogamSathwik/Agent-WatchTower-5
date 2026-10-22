/**
 * Phase 34 — Response Eligibility Engine
 * Determines whether an existing response option/plan is currently eligible
 * using the existing safety model, approval state, capability and support
 * information. Never invents execution capabilities.
 *
 * States: ELIGIBLE / APPROVAL_REQUIRED / UNSUPPORTED / INSUFFICIENT_DATA /
 *          BLOCKED / ALREADY_IN_PROGRESS
 */

const ELIGIBILITY_STATES = Object.freeze({
    ELIGIBLE: 'ELIGIBLE',
    APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
    UNSUPPORTED: 'UNSUPPORTED',
    INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
    BLOCKED: 'BLOCKED',
    ALREADY_IN_PROGRESS: 'ALREADY_IN_PROGRESS'
});

function isExternalAgent(agentId) {
    return !!agentId && /compa|repa/i.test(String(agentId));
}

class ResponseEligibilityEngine {
    constructor(options = {}) {
        this.responseCenterService = options.responseCenterService || null;
        this.monitoringService = options.monitoringService || null;
    }

    /**
     * Evaluate eligibility for an adaptive plan (backed by a Response Center plan).
     */
    checkEligibility(adaptivePlan, { tenantId = 'default-tenant', userRole = 'OPERATOR' } = {}) {
        const reasons = [];
        if (!adaptivePlan) {
            return { state: ELIGIBILITY_STATES.INSUFFICIENT_DATA, reasons: ['No response plan record supplied.'], checkedAt: new Date().toISOString() };
        }
        const agentId = adaptivePlan.agentId;
        const rcPlan = this._getRcPlan(adaptivePlan);

        // 1. External-agent support: existing inspect-only behavior wins.
        if (isExternalAgent(agentId)) {
            reasons.push(`External agent '${agentId}': execution endpoints are disabled; inspect-only behavior maintained.`);
            return { state: ELIGIBILITY_STATES.UNSUPPORTED, reasons, checkedAt: new Date().toISOString() };
        }
        if (rcPlan && (rcPlan.executionState === 'UNSUPPORTED' || rcPlan.safetyClassification === 'UNSUPPORTED')) {
            reasons.push('Existing safety evaluation reports UNSUPPORTED for this scope/action.');
            return { state: ELIGIBILITY_STATES.UNSUPPORTED, reasons, checkedAt: new Date().toISOString() };
        }

        // 2. Missing backing plan or option.
        if (!rcPlan) {
            reasons.push('INSUFFICIENT_DATA: no backing Response Center plan found for this adaptive plan.');
            return { state: ELIGIBILITY_STATES.INSUFFICIENT_DATA, reasons, checkedAt: new Date().toISOString() };
        }
        if (!rcPlan.selectedAction) {
            reasons.push('INSUFFICIENT_DATA: backing plan has no selected response action.');
            return { state: ELIGIBILITY_STATES.INSUFFICIENT_DATA, reasons, checkedAt: new Date().toISOString() };
        }

        // 3. Re-check live safety (never trust a stale evaluation alone).
        const liveSafety = this._evaluateLiveSafety(rcPlan, agentId, userRole, tenantId);
        if (liveSafety && liveSafety.safetyLevel === 'UNSUPPORTED') {
            reasons.push(...(liveSafety.reasons || ['Live safety evaluation reports UNSUPPORTED.']));
            return { state: ELIGIBILITY_STATES.UNSUPPORTED, reasons, checkedAt: new Date().toISOString() };
        }
        if (liveSafety && liveSafety.safetyLevel === 'RESTRICTED') {
            reasons.push(...(liveSafety.reasons || [`Role '${userRole}' is restricted from this action.`]));
            return { state: ELIGIBILITY_STATES.BLOCKED, reasons, checkedAt: new Date().toISOString() };
        }

        // 4. Terminal states block re-execution.
        if (['EXECUTING', 'VERIFYING', 'ROLLING_BACK'].includes(rcPlan.executionState)) {
            reasons.push(`Backing plan is currently ${rcPlan.executionState}; concurrent execution is not allowed.`);
            return { state: ELIGIBILITY_STATES.ALREADY_IN_PROGRESS, reasons, checkedAt: new Date().toISOString() };
        }
        if (['VERIFIED', 'COMPLETED'].includes(rcPlan.executionState)) {
            reasons.push(`Backing plan already reached terminal state ${rcPlan.executionState}; create a new plan for further action.`);
            return { state: ELIGIBILITY_STATES.BLOCKED, reasons, checkedAt: new Date().toISOString() };
        }
        if (rcPlan.approvalState === 'REJECTED' || rcPlan.executionState === 'REJECTED' || rcPlan.executionState === 'CANCELLED') {
            reasons.push('Backing plan was rejected or cancelled; it cannot proceed to execution.');
            return { state: ELIGIBILITY_STATES.BLOCKED, reasons, checkedAt: new Date().toISOString() };
        }

        // 5. Approval gate (existing approval model is authoritative).
        const requiresApproval = liveSafety
            ? liveSafety.requiresApproval !== false
            : (rcPlan.safety ? rcPlan.safety.requiresApproval !== false : true);
        const approved = rcPlan.approvalState === 'APPROVED' || rcPlan.approvalState === 'NOT_REQUIRED';
        if (requiresApproval && !approved) {
            reasons.push(`Approval is required (approvalState=${rcPlan.approvalState}). Execution stops at APPROVAL_REQUIRED.`);
            return { state: ELIGIBILITY_STATES.APPROVAL_REQUIRED, reasons, checkedAt: new Date().toISOString() };
        }

        reasons.push(`Safety '${liveSafety ? liveSafety.safetyLevel : rcPlan.safetyClassification}' allows execution; approval '${rcPlan.approvalState}' satisfied.`);
        return { state: ELIGIBILITY_STATES.ELIGIBLE, reasons, checkedAt: new Date().toISOString() };
    }

    _getRcPlan(adaptivePlan) {
        try {
            const svc = this.responseCenterService;
            if (!svc || !svc.planService || typeof svc.planService.getPlan !== 'function') return null;
            return svc.planService.getPlan(adaptivePlan.responseCenterPlanId) || null;
        } catch (e) {
            return null;
        }
    }

    _evaluateLiveSafety(rcPlan, agentId, userRole, tenantId) {
        try {
            const svc = this.responseCenterService;
            if (!svc || typeof svc.evaluateResponseSafety !== 'function') return null;
            return svc.evaluateResponseSafety({ action: rcPlan.selectedAction, agentId, userRole, incident: null });
        } catch (e) {
            return null;
        }
    }
}

module.exports = { ResponseEligibilityEngine, ELIGIBILITY_STATES, isExternalAgent };
