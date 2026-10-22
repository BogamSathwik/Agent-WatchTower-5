/**
 * Phase 25 — Automation Decision Service
 * Records, tracks, and manages state transitions for policy-driven automation decisions.
 * Enforces RBAC permissions, audit logging, and persistent decision history.
 */

const { auditLogService } = require('../audit/AuditLogService');

const DECISION_STATUSES = Object.freeze({
    EVALUATED: 'EVALUATED',
    APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    EXECUTING: 'EXECUTING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED'
});

class AutomationDecisionService {
    constructor(options = {}) {
        this.persistence = options.persistenceManager || options.persistence || null;
        this.auditLogService = options.auditService || auditLogService;
        this.decisions = new Map();
    }

    _persist(key, value) {
        if (!this.persistence) return;
        try {
            if (typeof this.persistence.setSafe === 'function') {
                this.persistence.setSafe('automation_decisions', key, value);
            } else if (typeof this.persistence.set === 'function') {
                const r = this.persistence.set('automation_decisions', key, value);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            } else if (typeof this.persistence.setItem === 'function') {
                this.persistence.setItem(`automation_decisions_${key}`, value);
            }
        } catch (_) {}
    }

    createDecision(data = {}, tenantId = 'default-tenant') {
        const id = data.decisionId || data.id || `dec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const tid = data.tenantId || tenantId;

        const approvalRequired = data.approvalRequired !== undefined 
            ? Boolean(data.approvalRequired) 
            : (data.approvalMode === 'REQUIRED' || data.approvalMode === 'MANUAL');

        let initialStatus = data.status || DECISION_STATUSES.EVALUATED;
        if (data.matched && approvalRequired && initialStatus === DECISION_STATUSES.EVALUATED) {
            initialStatus = DECISION_STATUSES.APPROVAL_REQUIRED;
        }

        const decision = {
            decisionId: id,
            id,
            policyId: data.policyId || 'pol_default',
            policyName: data.policyName || 'Default Automation Policy',
            eventId: data.eventId || `evt_${Date.now()}`,
            agentId: data.agentId || 'TEST-AGENT-001',
            tenantId: tid,
            matched: Boolean(data.matched),
            reasons: Array.isArray(data.reasons) ? data.reasons : [data.reasons || 'Policy evaluation completed.'],
            workflowId: data.workflowId || 'agent-recovery-workflow',
            approvalRequired,
            approvalMode: data.approvalMode || (approvalRequired ? 'REQUIRED' : 'AUTO_APPROVED'),
            status: initialStatus,
            dryRun: Boolean(data.dryRun),
            correlationId: data.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            approvedBy: data.approvedBy || null,
            approvedAt: data.approvedAt || null,
            rejectedBy: data.rejectedBy || null,
            rejectedAt: data.rejectedAt || null,
            executionId: data.executionId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const key = `${tid}:${id}`;
        this.decisions.set(key, decision);
        this._persist(key, decision);

        try {
            if (this.auditLogService && typeof this.auditLogService.log === 'function') {
                this.auditLogService.log({
                    event: 'AUTOMATION_DECISION_CREATED',
                    actor: 'system',
                    systemId: decision.agentId,
                    tenantId: tid,
                    correlationId: decision.correlationId,
                    details: { decisionId: id, policyId: decision.policyId, matched: decision.matched, status: decision.status }
                });
            }
        } catch (_) {}

        return { ...decision };
    }

    getDecision(decisionId, tenantId = 'default-tenant') {
        const key = `${tenantId}:${decisionId}`;
        if (this.decisions.has(key)) {
            return { ...this.decisions.get(key) };
        }
        for (const [k, d] of this.decisions.entries()) {
            if (d.decisionId === decisionId || d.id === decisionId) {
                if (d.tenantId === tenantId || tenantId === 'global' || d.tenantId === 'default-tenant') {
                    return { ...d };
                }
            }
        }
        return null;
    }

    listDecisions(tenantId = 'default-tenant', filters = {}) {
        const results = [];
        for (const [key, decision] of this.decisions.entries()) {
            if (decision.tenantId === tenantId || tenantId === 'global' || decision.tenantId === 'default-tenant') {
                if (filters.agentId && decision.agentId !== filters.agentId) continue;
                if (filters.status && decision.status !== filters.status) continue;
                if (filters.matched !== undefined && decision.matched !== Boolean(filters.matched)) continue;
                results.push({ ...decision });
            }
        }
        return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    approveDecision(decisionId, actor = 'operator', role = 'operator', tenantId = 'default-tenant') {
        // Enforce RBAC
        if (String(role).toLowerCase() === 'viewer') {
            const err = new Error("Role 'viewer' is not authorized to approve automation decisions.");
            err.statusCode = 403;
            throw err;
        }

        const decision = this.getDecision(decisionId, tenantId);
        if (!decision) {
            const err = new Error(`Automation decision '${decisionId}' not found.`);
            err.statusCode = 404;
            throw err;
        }

        if (decision.status !== DECISION_STATUSES.APPROVAL_REQUIRED && decision.status !== DECISION_STATUSES.EVALUATED) {
            const err = new Error(`Decision '${decisionId}' cannot be approved from current state '${decision.status}'.`);
            err.statusCode = 400;
            throw err;
        }

        const updated = {
            ...decision,
            status: DECISION_STATUSES.APPROVED,
            approvedBy: actor,
            approvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const key = `${decision.tenantId}:${decisionId}`;
        this.decisions.set(key, updated);
        this._persist(key, updated);

        try {
            if (this.auditLogService && typeof this.auditLogService.log === 'function') {
                this.auditLogService.log({
                    event: 'AUTOMATION_DECISION_APPROVED',
                    actor,
                    role,
                    systemId: decision.agentId,
                    tenantId: decision.tenantId,
                    correlationId: decision.correlationId,
                    details: { decisionId, policyId: decision.policyId, approvedBy: actor }
                });
            }
        } catch (_) {}

        return { ...updated };
    }

    rejectDecision(decisionId, actor = 'operator', role = 'operator', tenantId = 'default-tenant') {
        // Enforce RBAC
        if (String(role).toLowerCase() === 'viewer') {
            const err = new Error("Role 'viewer' is not authorized to reject automation decisions.");
            err.statusCode = 403;
            throw err;
        }

        const decision = this.getDecision(decisionId, tenantId);
        if (!decision) {
            const err = new Error(`Automation decision '${decisionId}' not found.`);
            err.statusCode = 404;
            throw err;
        }

        const updated = {
            ...decision,
            status: DECISION_STATUSES.REJECTED,
            rejectedBy: actor,
            rejectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const key = `${decision.tenantId}:${decisionId}`;
        this.decisions.set(key, updated);
        this._persist(key, updated);

        try {
            if (this.auditLogService && typeof this.auditLogService.log === 'function') {
                this.auditLogService.log({
                    event: 'AUTOMATION_DECISION_REJECTED',
                    actor,
                    role,
                    systemId: decision.agentId,
                    tenantId: decision.tenantId,
                    correlationId: decision.correlationId,
                    details: { decisionId, policyId: decision.policyId, rejectedBy: actor }
                });
            }
        } catch (_) {}

        return { ...updated };
    }

    updateStatus(decisionId, status, extra = {}, tenantId = 'default-tenant') {
        const decision = this.getDecision(decisionId, tenantId);
        if (!decision) return null;

        const updated = {
            ...decision,
            ...extra,
            status: String(status).toUpperCase(),
            updatedAt: new Date().toISOString()
        };

        const key = `${decision.tenantId}:${decisionId}`;
        this.decisions.set(key, updated);
        this._persist(key, updated);
        return { ...updated };
    }
}

module.exports = { AutomationDecisionService, DECISION_STATUSES };
