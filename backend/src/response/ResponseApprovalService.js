/**
 * Phase 29 — Response Approval Service
 * Manages approval state transitions for operational response plans.
 * Enforces RBAC permissions (Viewer role restricted) and records approval audit metadata.
 */

const APPROVAL_STATES = Object.freeze({
    NOT_REQUIRED: 'NOT_REQUIRED',
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED'
});

class ResponseApprovalService {
    constructor(options = {}) {
        this.planService = options.planService || null;
        this.auditService = options.auditService || null;
    }

    /**
     * Submits a plan for approval queue.
     */
    requestApproval(plan, tenantId = 'default-tenant') {
        if (!plan) throw new Error('Response plan is required for requesting approval.');

        const updated = this.planService.updatePlan(plan.planId, {
            approvalState: APPROVAL_STATES.PENDING,
            executionState: 'WAITING_APPROVAL'
        });

        if (this.auditService && typeof this.auditService.log === 'function') {
            this.auditService.log('RESPONSE_APPROVAL_REQUESTED', {
                planId: plan.planId,
                agentId: plan.targetAgentId,
                incidentId: plan.incidentId,
                tenantId
            });
        }

        return updated;
    }

    /**
     * Approves a pending response plan.
     */
    approveResponse(planId, { operatorId = 'OPERATOR', userRole = 'OPERATOR', tenantId = 'default-tenant' } = {}) {
        if (userRole === 'VIEWER') {
            const err = new Error("RBAC Access Denied: User role 'VIEWER' is not authorized to approve operational responses.");
            err.statusCode = 403;
            throw err;
        }

        const plan = this.planService.getPlan(planId);
        if (!plan) {
            const err = new Error(`Response plan '${planId}' not found.`);
            err.statusCode = 404;
            throw err;
        }

        if (plan.safetyClassification === 'UNSUPPORTED') {
            const err = new Error(`Cannot approve plan '${planId}': execution is unsupported for external agent ${plan.targetAgentId}.`);
            err.statusCode = 400;
            throw err;
        }

        const updated = this.planService.updatePlan(planId, {
            approvalState: APPROVAL_STATES.APPROVED,
            executionState: 'APPROVED',
            approvedBy: operatorId,
            approvedAt: new Date().toISOString()
        });

        if (this.auditService && typeof this.auditService.log === 'function') {
            this.auditService.log('RESPONSE_APPROVED', {
                planId,
                operatorId,
                userRole,
                agentId: plan.targetAgentId,
                tenantId
            });
        }

        return updated;
    }

    /**
     * Rejects a pending response plan.
     */
    rejectResponse(planId, { operatorId = 'OPERATOR', reason = 'Operator rejected execution', userRole = 'OPERATOR', tenantId = 'default-tenant' } = {}) {
        if (userRole === 'VIEWER') {
            const err = new Error("RBAC Access Denied: User role 'VIEWER' is not authorized to reject operational responses.");
            err.statusCode = 403;
            throw err;
        }

        const plan = this.planService.getPlan(planId);
        if (!plan) {
            const err = new Error(`Response plan '${planId}' not found.`);
            err.statusCode = 404;
            throw err;
        }

        const updated = this.planService.updatePlan(planId, {
            approvalState: APPROVAL_STATES.REJECTED,
            executionState: 'CANCELLED',
            rejectedBy: operatorId,
            rejectionReason: reason,
            rejectedAt: new Date().toISOString()
        });

        if (this.auditService && typeof this.auditService.log === 'function') {
            this.auditService.log('RESPONSE_REJECTED', {
                planId,
                operatorId,
                reason,
                agentId: plan.targetAgentId,
                tenantId
            });
        }

        return updated;
    }

    /**
     * Retrieves all pending approval queue items.
     */
    getApprovalQueue(tenantId = null) {
        const plans = this.planService.getAllPlans(tenantId);
        return plans.filter(p => p.approvalState === APPROVAL_STATES.PENDING);
    }
}

module.exports = { ResponseApprovalService, APPROVAL_STATES };
