/**
 * Universal Workflow Automation REST API Router
 * AgentGenPro compliant sub-router for workflow automation & intelligent orchestration.
 * Purely domain-agnostic.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

router.use(requireAuth);

function getService(req) {
    const service = req.app.get('workflowService');
    if (!service) {
        throw new Error('WorkflowService is not mounted on express application context');
    }
    return service;
}

// 1. GET /api/v1/workflows/overview
router.get(['/api/v1/workflows/overview', '/api/workflows/overview'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;
        res.json({ success: true, data: service.getOverview(tenantId) });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 2. GET /api/v1/workflows
router.get(['/api/v1/workflows', '/api/workflows'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;
        const filters = {
            tenantId,
            status: req.query.status,
            search: req.query.search
        };
        const workflows = service.listWorkflows(filters).map(w => w.toJSON ? w.toJSON() : w);
        res.json({ success: true, data: workflows });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 2b. GET /api/v1/workflows/executions (collection across all workflows)
// Registered before '/:id' routes so 'executions' is never treated as a workflow id.
// Returns real tenant-scoped executions (newest first) from the workflow store.
router.get(['/api/v1/workflows/executions', '/api/workflows/executions'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;
        const executions = service.listExecutions({ tenantId, status: req.query.status, workflowId: req.query.workflowId, limit: req.query.limit });
        res.json({ success: true, data: executions });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 2c. GET /api/v1/workflow-executions (collection across all workflows, supports ?limit=)
// Returns real tenant-scoped executions (newest first) from the workflow store.
router.get(['/api/v1/workflow-executions', '/api/workflow-executions'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;
        const executions = service.listExecutions({ tenantId, status: req.query.status, workflowId: req.query.workflowId, limit: req.query.limit });
        res.json({ success: true, data: executions });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3. POST /api/v1/workflows
router.post(['/api/v1/workflows', '/api/workflows'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : 'global';
        const actor = req.user ? req.user.username : 'operator';
        const workflow = service.createWorkflow(req.body, tenantId, actor);
        res.status(201).json({ success: true, data: workflow.toJSON ? workflow.toJSON() : workflow });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message, code: 'WORKFLOW_CREATION_FAILED' } });
    }
});

// 4. GET /api/v1/workflows/:id
router.get(['/api/v1/workflows/:id', '/api/workflows/:id'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;
        const workflow = service.getWorkflow(req.params.id, tenantId);
        if (!workflow) {
            return res.status(404).json({ success: false, error: { message: `Workflow '${req.params.id}' not found`, code: 'WORKFLOW_NOT_FOUND' } });
        }
        res.json({ success: true, data: workflow.toJSON ? workflow.toJSON() : workflow });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 5. PATCH /api/v1/workflows/:id
router.patch(['/api/v1/workflows/:id', '/api/workflows/:id'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;
        const actor = req.user ? req.user.username : 'operator';
        const updated = service.updateWorkflow(req.params.id, req.body, tenantId, actor);
        res.json({ success: true, data: updated.toJSON ? updated.toJSON() : updated });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 6. DELETE /api/v1/workflows/:id
router.delete(['/api/v1/workflows/:id', '/api/workflows/:id'], requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;
        const actor = req.user ? req.user.username : 'admin';
        const deleted = service.deleteWorkflow(req.params.id, tenantId, actor);
        if (!deleted) {
            return res.status(404).json({ success: false, error: { message: `Workflow '${req.params.id}' not found` } });
        }
        res.json({ success: true, message: `Workflow '${req.params.id}' deleted successfully` });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 7. POST /api/v1/workflows/:id/validate
router.post(['/api/v1/workflows/:id/validate', '/api/workflows/:id/validate'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;
        const validation = service.validateWorkflow(req.params.id, tenantId);
        res.json({ success: true, validation });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 500;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 8. POST /api/v1/workflows/:id/execute & /run
router.post(['/api/v1/workflows/:id/execute', '/api/workflows/:id/execute', '/api/v1/workflows/:id/run', '/api/workflows/:id/run'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : 'global';
        const actor = req.user ? req.user.username : 'operator';
        const correlationId = req.correlationId || req.headers['x-correlation-id'];

        const execution = await service.executeWorkflow(req.params.id, {
            tenantId,
            actor,
            correlationId,
            variables: req.body ? req.body.variables : {}
        });

        res.json({ success: true, data: execution });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 9. POST /api/v1/workflows/:id/pause
router.post(['/api/v1/workflows/:id/pause', '/api/workflows/:id/pause'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const actor = req.user ? req.user.username : 'operator';
        const record = service.pauseExecution(req.params.id, actor);
        res.json({ success: true, data: record });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// 10. POST /api/v1/workflows/:id/resume
router.post(['/api/v1/workflows/:id/resume', '/api/workflows/:id/resume'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const actor = req.user ? req.user.username : 'operator';
        const record = service.resumeExecution(req.params.id, actor);
        res.json({ success: true, data: record });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// 11. POST /api/v1/workflows/:id/cancel
router.post(['/api/v1/workflows/:id/cancel', '/api/workflows/:id/cancel'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const actor = req.user ? req.user.username : 'operator';
        const record = service.cancelExecution(req.params.id, actor);
        res.json({ success: true, data: record });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// 12. GET /api/v1/workflows/:id/executions
router.get(['/api/v1/workflows/:id/executions', '/api/workflows/:id/executions'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;
        const executions = service.listExecutions({ workflowId: req.params.id, tenantId });
        res.json({ success: true, data: executions });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 13. GET /api/v1/workflow-executions/:id
router.get(['/api/v1/workflow-executions/:id', '/api/workflow-executions/:id'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;
        const execution = service.getExecution(req.params.id, tenantId);
        if (!execution) {
            return res.status(404).json({ success: false, error: { message: `Execution '${req.params.id}' not found`, code: 'EXECUTION_NOT_FOUND' } });
        }
        res.json({ success: true, data: execution });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 14. POST /api/v1/workflow-executions/:id/approve
router.post(['/api/v1/workflow-executions/:id/approve', '/api/workflow-executions/:id/approve'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const actor = req.user ? req.user.username : 'operator';
        const role = req.user ? req.user.role : 'operator';
        const record = await service.approveExecution(req.params.id, actor, role);
        res.json({ success: true, data: record });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// 15. POST /api/v1/workflow-executions/:id/reject
router.post(['/api/v1/workflow-executions/:id/reject', '/api/workflow-executions/:id/reject'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const actor = req.user ? req.user.username : 'operator';
        const record = service.cancelExecution(req.params.id, actor);
        res.json({ success: true, data: record });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

module.exports = router;
