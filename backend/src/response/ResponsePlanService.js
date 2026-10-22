/**
 * Phase 29 — Response Plan Service
 * Constructs, formats, and manages structured operational Response Plans.
 * Generates deterministic, human-readable narrative explanations without vague AI assumptions.
 */

class ResponsePlanService {
    constructor(options = {}) {
        this.plans = new Map();
        this.persistence = options.persistenceManager || options.persistence || null;
    }

    _persist(key, value) {
        if (!this.persistence) return;
        try {
            if (typeof this.persistence.setSafe === 'function') {
                this.persistence.setSafe('response_plans', key, value);
            } else if (typeof this.persistence.set === 'function') {
                const r = this.persistence.set('response_plans', key, value);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            } else if (typeof this.persistence.setItem === 'function') {
                this.persistence.setItem(`response_plans_${key}`, value);
            }
        } catch (_) {}
    }

    /**
     * Builds a response plan object.
     */
    createPlan({
        incidentId = null,
        targetAgentId = 'UNKNOWN_AGENT',
        problemSummary = 'Operational degradation detected',
        evidence = [],
        responseOptions = [],
        selectedAction = null,
        safety = {},
        operatorId = 'SYSTEM',
        tenantId = 'default-tenant',
        sourceRecordIds = []
    }) {
        const timestamp = new Date().toISOString();
        const responseId = `resp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const planId = responseId;

        const safetyClassification = safety.safetyLevel || 'REQUIRES_APPROVAL';
        const approvalRequired = safety.requiresApproval !== undefined ? Boolean(safety.requiresApproval) : true;

        const initialApprovalState = approvalRequired ? 'PENDING' : 'NOT_REQUIRED';
        const initialExecutionState = safetyClassification === 'UNSUPPORTED'
            ? 'UNSUPPORTED'
            : (approvalRequired ? 'WAITING_APPROVAL' : 'PLANNED');

        const narrative = this.generateNarrative({
            selectedAction,
            targetAgentId,
            problemSummary,
            evidence,
            safety,
            incidentId
        });

        const plan = {
            responseId,
            planId,
            incidentId: incidentId || `inc_${Date.now()}`,
            targetAgentId,
            problemSummary,
            evidence: Array.isArray(evidence) ? evidence : [evidence],
            responseOptions,
            selectedAction: selectedAction || responseOptions[0] || null,
            safetyClassification,
            safety,
            approvalState: initialApprovalState,
            executionState: initialExecutionState,
            verificationState: 'PENDING',
            rollbackState: safety.rollbackAvailable ? 'AVAILABLE' : 'UNSUPPORTED',
            expectedOutcome: `Restore ${targetAgentId} health baseline to HEALTHY state.`,
            actualOutcome: null,
            operator: operatorId,
            tenantId,
            createdAt: timestamp,
            updatedAt: timestamp,
            sourceRecordIds,
            narrativeExplanation: narrative
        };

        this.plans.set(planId, plan);
        this._persist(planId, plan);

        return plan;
    }

    /**
     * Generates a deterministic narrative response explanation.
     */
    generateNarrative({ selectedAction, targetAgentId, problemSummary, evidence, safety, incidentId }) {
        const actionTitle = selectedAction?.title || selectedAction?.actionType || 'Inspection Protocol';
        const actionType = selectedAction?.actionType || 'INSPECT_HEALTH';
        const isUnsupported = safety?.safetyLevel === 'UNSUPPORTED';

        const evidenceSummary = Array.isArray(evidence) && evidence.length > 0
            ? evidence.map(e => typeof e === 'string' ? e : e.summary || e.title || JSON.stringify(e)).join('; ')
            : 'Automated monitoring telemetry anomalies detected.';

        return {
            whyProposed: `Target agent ${targetAgentId} exhibits degradation: "${problemSummary}". Action '${actionTitle}' addresses this issue directly.`,
            evidenceSupported: evidenceSummary,
            whatWillChange: isUnsupported 
                ? `No state change will occur. Execution is unsupported for ${targetAgentId}.`
                : `Initiates state action '${actionType}' on agent ${targetAgentId} to trigger recovery routines.`,
            whatCouldBeAffected: safety?.blastRadius === 'HIGH'
                ? `High blast radius detected. Downstream dependent agents of ${targetAgentId} may experience brief latency adjustments during execution.`
                : `Minimal blast radius. Action targets only ${targetAgentId}.`,
            requiresApproval: safety?.requiresApproval ? 'YES. Operator approval is mandatory before proceeding.' : 'NO. Action is pre-cleared for immediate execution.',
            howVerified: `Post-execution checks will query health endpoints and error metrics for ${targetAgentId} to verify HEALTHY status.`,
            whatIfFails: safety?.rollbackAvailable
                ? `If post-execution verification fails, automated safe rollback will be triggered to restore previous state.`
                : `If verification fails, incident ${incidentId || 'active'} will be escalated to high-priority operator queue.`
        };
    }

    getPlan(planId) {
        return this.plans.get(planId) || null;
    }

    updatePlan(planId, updates = {}) {
        const plan = this.plans.get(planId);
        if (!plan) return null;

        Object.assign(plan, updates, { updatedAt: new Date().toISOString() });
        this.plans.set(planId, plan);
        this._persist(planId, plan);
        return plan;
    }

    getAllPlans(tenantId = null) {
        let list = Array.from(this.plans.values());
        if (tenantId) {
            list = list.filter(p => p.tenantId === tenantId);
        }
        return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
}

module.exports = { ResponsePlanService };
