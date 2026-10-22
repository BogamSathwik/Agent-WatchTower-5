/**
 * Universal Autonomous Remediation & Self-Healing Engine REST API Router
 * AgentGenPro backend compliant sub-router — explicit /api/v1/remediation/... route paths.
 * Purely domain-agnostic.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

router.use(requireAuth);

function getService(req) {
    const service = req.app.get('remediationService');
    if (!service) {
        throw new Error('RemediationService is not mounted on express application context');
    }
    return service;
}

// 1. GET /api/v1/remediation/overview
router.get('/api/v1/remediation/overview', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const timeWindowMs = req.query.timeWindowMs ? parseInt(req.query.timeWindowMs, 10) : 86400000;
        const metrics = service.getMetrics(timeWindowMs);
        const actionsCount = service.listActions().length;
        const rulesCount = service.listRules().length;
        const policy = service.getPolicy();
        const pendingApprovalsCount = service.listApprovals({ status: 'REQUESTED' }).length;

        res.json({
            success: true,
            data: {
                metrics,
                actionsCount,
                rulesCount,
                policyMode: policy ? policy.mode : 'MANUAL',
                pendingApprovalsCount
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 2. GET /api/v1/remediation/actions
router.get('/api/v1/remediation/actions', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const actions = service.listActions(req.query).map(a => a.toJSON ? a.toJSON() : a);
        res.json({ success: true, data: actions });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3. POST /api/v1/remediation/actions
router.post('/api/v1/remediation/actions', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const action = service.createAction(req.body);
        res.status(201).json({ success: true, data: action.toJSON ? action.toJSON() : action });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 4. GET /api/v1/remediation/actions/:id
router.get('/api/v1/remediation/actions/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const action = service.getAction(req.params.id);
        if (!action) {
            return res.status(404).json({ success: false, error: { message: `Remediation action '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: action.toJSON ? action.toJSON() : action });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 5. PATCH /api/v1/remediation/actions/:id
router.patch('/api/v1/remediation/actions/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const updated = service.updateAction(req.params.id, req.body);
        res.json({ success: true, data: updated.toJSON ? updated.toJSON() : updated });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 6. DELETE /api/v1/remediation/actions/:id
router.delete('/api/v1/remediation/actions/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const deleted = service.deleteAction(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, error: { message: `Action '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: { deleted: true, actionId: req.params.id } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 7. GET /api/v1/remediation/rules
router.get('/api/v1/remediation/rules', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const rules = service.listRules(req.query).map(r => r.toJSON ? r.toJSON() : r);
        res.json({ success: true, data: rules });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 8. POST /api/v1/remediation/rules
router.post('/api/v1/remediation/rules', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const rule = service.createRule(req.body);
        res.status(201).json({ success: true, data: rule.toJSON ? rule.toJSON() : rule });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 9. GET /api/v1/remediation/rules/:id
router.get('/api/v1/remediation/rules/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const rule = service.getRule(req.params.id);
        if (!rule) {
            return res.status(404).json({ success: false, error: { message: `Remediation rule '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: rule.toJSON ? rule.toJSON() : rule });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 10. PATCH /api/v1/remediation/rules/:id
router.patch('/api/v1/remediation/rules/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const updated = service.updateRule(req.params.id, req.body);
        res.json({ success: true, data: updated.toJSON ? updated.toJSON() : updated });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 11. DELETE /api/v1/remediation/rules/:id
router.delete('/api/v1/remediation/rules/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const deleted = service.deleteRule(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, error: { message: `Rule '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: { deleted: true, ruleId: req.params.id } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 12. GET /api/v1/remediation/policy
router.get('/api/v1/remediation/policy', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const policy = service.getPolicy();
        res.json({ success: true, data: policy ? policy.toJSON() : null });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 13. PATCH /api/v1/remediation/policy
router.patch('/api/v1/remediation/policy', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const updated = service.setPolicy(req.body);
        res.json({ success: true, data: updated.toJSON ? updated.toJSON() : updated });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// 14. GET /api/v1/remediation/executions
router.get('/api/v1/remediation/executions', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const executions = service.listExecutions(req.query);
        res.json({ success: true, data: executions });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 15. GET /api/v1/remediation/executions/:id
router.get('/api/v1/remediation/executions/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const execution = service.getExecution(req.params.id);
        if (!execution) {
            return res.status(404).json({ success: false, error: { message: `Remediation execution '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: execution });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 16. GET /api/v1/remediation/approvals
router.get('/api/v1/remediation/approvals', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const approvals = service.listApprovals(req.query);
        res.json({ success: true, data: approvals });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 17. GET /api/v1/remediation/approvals/:id
router.get('/api/v1/remediation/approvals/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const approval = service.getApproval(req.params.id);
        if (!approval) {
            return res.status(404).json({ success: false, error: { message: `Approval request '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: approval });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 18. POST /api/v1/remediation/dry-run
router.post('/api/v1/remediation/dry-run', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const { actionId, systemId, options } = req.body || {};
        if (!actionId) {
            return res.status(400).json({ success: false, error: { message: "'actionId' is required for dry-run execution" } });
        }
        const result = await service.runDryRun(actionId, systemId, { ...options, actor: req.user ? req.user.role : 'operator' });
        res.json({ success: true, data: result });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 19. POST /api/v1/remediation/execute
router.post('/api/v1/remediation/execute', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const { actionId, systemId, options } = req.body || {};
        if (!actionId) {
            return res.status(400).json({ success: false, error: { message: "'actionId' is required for remediation execution" } });
        }
        const result = await service.executeRemediation(actionId, systemId, { ...options, actor: req.user ? req.user.role : 'operator' });
        res.json({ success: true, data: result });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 20. POST /api/v1/remediation/approvals/:id/approve
router.post('/api/v1/remediation/approvals/:id/approve', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const approver = (req.user && req.user.role) || req.body.approver || 'admin';
        const reason = req.body.reason || 'Approved via API';
        const result = await service.approveRequest(req.params.id, approver, reason);
        res.json({ success: true, data: result });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 21. POST /api/v1/remediation/approvals/:id/reject
router.post('/api/v1/remediation/approvals/:id/reject', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const approver = (req.user && req.user.role) || req.body.approver || 'admin';
        const reason = req.body.reason || 'Rejected via API';
        const result = service.rejectRequest(req.params.id, approver, reason);
        res.json({ success: true, data: result });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 22. POST /api/v1/remediation/executions/:id/cancel
router.post('/api/v1/remediation/executions/:id/cancel', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const execution = service.getExecution(req.params.id);
        if (!execution) {
            return res.status(404).json({ success: false, error: { message: `Execution '${req.params.id}' not found` } });
        }
        execution.status = 'CANCELLED';
        execution.error = `Execution cancelled by ${req.user ? req.user.role : 'operator'}`;
        res.json({ success: true, data: execution });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 23. POST /api/v1/remediation/executions/:id/rollback
router.post('/api/v1/remediation/executions/:id/rollback', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const result = await service.rollbackExecution(req.params.id);
        res.json({ success: true, data: result });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 24. GET /api/v1/remediation/agents/:id/history
router.get('/api/v1/remediation/agents/:id/history', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const agentId = req.params.id;
        const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
        const executions = service.listExecutions({ systemId: agentId });

        res.json({
            success: true,
            agentId,
            tenantId,
            count: executions.length,
            data: executions
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 25. GET /api/v1/remediation/:id
router.get('/api/v1/remediation/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const execution = service.getExecution(req.params.id) || service.getAction(req.params.id);
        if (!execution) {
            return res.status(404).json({ success: false, error: { message: `Remediation item '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: execution.toJSON ? execution.toJSON() : execution });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 26. POST /api/v1/remediation/:id/approve
router.post('/api/v1/remediation/:id/approve', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const approver = (req.user && req.user.role) || req.body.approver || 'admin';
        const reason = req.body.reason || 'Approved via API';
        const result = await service.approveRequest(req.params.id, approver, reason);
        res.json({ success: true, data: result });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

module.exports = router;
