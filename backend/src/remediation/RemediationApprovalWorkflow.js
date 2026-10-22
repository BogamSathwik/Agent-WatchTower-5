/**
 * Remediation Approval Workflow
 * Manages human approval requests, roles, expiration, and audit decisions.
 * Purely generic - zero business domain logic.
 */

class RemediationApprovalWorkflow {
    constructor(options = {}) {
        this.approvals = new Map(); // approvalId -> ApprovalRequest
        this.ttlMs = Number(options.ttlMs) || 86400000; // 24 hours default TTL
    }

    createApprovalRequest({ action, systemId, triggerReason, requester = 'system', timeoutMs }) {
        const id = `appr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const now = new Date();
        const ttl = Number(timeoutMs) > 0 ? Number(timeoutMs) : this.ttlMs;
        const expiresAt = new Date(now.getTime() + ttl).toISOString();

        const request = {
            approvalId: id,
            actionId: action.actionId || action.name,
            actionName: action.name,
            systemId: systemId || action.targetSystemId,
            riskLevel: action.riskLevel || 'MEDIUM',
            requiredRole: action.requiredRole || 'admin',
            triggerReason: triggerReason || 'Remediation policy requires approval',
            requester,
            status: 'REQUESTED',
            requestedAt: now.toISOString(),
            expiresAt,
            decision: null
        };

        this.approvals.set(id, request);
        return request;
    }

    getApproval(approvalId) {
        if (!approvalId) return null;
        const request = this.approvals.get(String(approvalId).trim());
        if (!request) return null;

        // Auto-expire check
        if (request.status === 'REQUESTED' && new Date(request.expiresAt) < new Date()) {
            request.status = 'EXPIRED';
        }
        return request;
    }

    checkExpiry(approvalId) {
        return this.getApproval(approvalId);
    }

    approve(approvalId, approver = 'admin', reason = 'Approved by authorized operator') {
        const request = this.getApproval(approvalId);
        if (!request) {
            const err = new Error(`Approval request '${approvalId}' not found`);
            err.statusCode = 404;
            throw err;
        }

        if (request.status !== 'REQUESTED') {
            const err = new Error(`Cannot approve request in status '${request.status}'`);
            err.statusCode = 400;
            throw err;
        }

        request.status = 'APPROVED';
        request.decision = {
            approver,
            decision: 'APPROVED',
            reason,
            decidedAt: new Date().toISOString()
        };

        this.approvals.set(approvalId, request);
        return request;
    }

    reject(approvalId, approver = 'admin', reason = 'Rejected by operator') {
        const request = this.getApproval(approvalId);
        if (!request) {
            const err = new Error(`Approval request '${approvalId}' not found`);
            err.statusCode = 404;
            throw err;
        }

        if (request.status !== 'REQUESTED') {
            const err = new Error(`Cannot reject request in status '${request.status}'`);
            err.statusCode = 400;
            throw err;
        }

        request.status = 'REJECTED';
        request.decision = {
            approver,
            decision: 'REJECTED',
            reason,
            decidedAt: new Date().toISOString()
        };

        this.approvals.set(approvalId, request);
        return request;
    }

    listApprovals(filters = {}) {
        let list = Array.from(this.approvals.values()).map(r => {
            if (r.status === 'REQUESTED' && new Date(r.expiresAt) < new Date()) {
                r.status = 'EXPIRED';
            }
            return r;
        });

        if (filters.status) {
            const s = String(filters.status).toUpperCase();
            list = list.filter(r => r.status === s);
        }
        if (filters.systemId) {
            list = list.filter(r => r.systemId === filters.systemId);
        }
        return list;
    }
}

module.exports = {
    RemediationApprovalWorkflow
};
