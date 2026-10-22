/**
 * Phase 35 — Improvement Approval Service
 * RBAC-guarded governance actions. Viewers are read-only; every mutating
 * action throws for viewer roles. Approval records carry actor, timestamp,
 * tenant, proposal, previous/new state, and optional reason.
 */

function assertOperator(userRole) {
    if (String(userRole || 'OPERATOR').toUpperCase() === 'VIEWER') {
        const err = new Error("RBAC Access Denied: User role 'VIEWER' is read-only for improvement governance.");
        err.statusCode = 403;
        throw err;
    }
}

class ImprovementApprovalService {
    constructor(options = {}) {
        this.governanceService = options.governanceService || null;
    }

    _requireGovernance() {
        if (!this.governanceService) throw new Error('Governance service not wired.');
    }

    approve(proposal, { actor = 'operator', userRole = 'OPERATOR', reason = '', tenantId = null } = {}) {
        assertOperator(userRole);
        this._requireGovernance();
        return this.governanceService.approveThroughStages(proposal, { actor, reason, tenantId: tenantId || proposal.tenantId });
    }

    reject(proposal, { actor = 'operator', userRole = 'OPERATOR', reason = '', tenantId = null } = {}) {
        assertOperator(userRole);
        this._requireGovernance();
        return [this.governanceService.transition(proposal, 'REJECTED', { actor, reason, tenantId: tenantId || proposal.tenantId })];
    }

    defer(proposal, { actor = 'operator', userRole = 'OPERATOR', reason = '', tenantId = null } = {}) {
        assertOperator(userRole);
        this._requireGovernance();
        return [this.governanceService.transition(proposal, 'DEFERRED', { actor, reason, tenantId: tenantId || proposal.tenantId })];
    }

    reopen(proposal, { actor = 'operator', userRole = 'OPERATOR', reason = '', tenantId = null } = {}) {
        assertOperator(userRole);
        this._requireGovernance();
        return [this.governanceService.transition(proposal, 'DRAFT', { actor, reason, tenantId: tenantId || proposal.tenantId })];
    }

    close(proposal, { actor = 'operator', userRole = 'OPERATOR', reason = '', tenantId = null } = {}) {
        assertOperator(userRole);
        this._requireGovernance();
        return [this.governanceService.transition(proposal, 'CLOSED', { actor, reason, tenantId: tenantId || proposal.tenantId })];
    }

    startImplementationTracking(proposal, { actor = 'operator', userRole = 'OPERATOR', reason = '', implementationRef = '', tenantId = null } = {}) {
        assertOperator(userRole);
        this._requireGovernance();
        if (proposal.status !== 'APPROVED') {
            const err = new Error(`Implementation tracking requires APPROVED status (current: ${proposal.status}). Approval is never bypassed.`);
            err.statusCode = 409;
            throw err;
        }
        if (!implementationRef || !String(implementationRef).trim()) {
            const err = new Error('An implementation reference is required to track implementation (e.g. change ticket, commit, or runbook reference). Outcomes stay NOT_IMPLEMENTED without it.');
            err.statusCode = 409;
            throw err;
        }
        proposal.implementationRef = String(implementationRef).slice(0, 300);
        proposal.implementationStatus = 'IN_PROGRESS';
        return [this.governanceService.transition(proposal, 'IMPLEMENTATION_TRACKING', { actor, reason, tenantId: tenantId || proposal.tenantId })];
    }
}

module.exports = { ImprovementApprovalService };
