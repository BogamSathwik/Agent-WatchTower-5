/**
 * Express REST API Router for Agent Watchtower Response Center
 * Endpoints:
 * - GET /api/v1/response/plans
 * - POST /api/v1/response/plans
 * - GET /api/v1/response/plans/:id
 * - POST /api/v1/response/plans/:id/approve
 * - POST /api/v1/response/plans/:id/reject
 * - POST /api/v1/response/plans/:id/execute
 * - POST /api/v1/response/plans/:id/rollback
 * - GET /api/v1/response/plans/:id/history
 * - GET /api/v1/response/recommendations
 * - GET /api/v1/response/approval-queue
 */

const express = require('express');
const { requireRole, ROLES } = require('../middleware/authMiddleware');

function redactSecrets(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(redactSecrets);

    const redacted = {};
    const secretKeys = ['apikey', 'password', 'token', 'secret', 'authorization', 'auth'];

    for (const [key, val] of Object.entries(obj)) {
        if (secretKeys.includes(key.toLowerCase())) {
            redacted[key] = '[REDACTED]';
        } else if (typeof val === 'object' && val !== null) {
            redacted[key] = redactSecrets(val);
        } else {
            redacted[key] = val;
        }
    }
    return redacted;
}

function createResponseRouter(responseCenterService) {
    const router = express.Router();

    router.use(requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]));

    function getTenant(req) {
        return req.tenantId || req.headers['x-tenant-id'] || req.query.tenantId || 'default-tenant';
    }

    function getUserRole(req) {
        return req.userRole || req.user?.role || req.headers['x-user-role'] || 'OPERATOR';
    }

    function getOperatorId(req) {
        return req.user?.id || req.headers['x-user-id'] || 'OPERATOR';
    }

    // GET /api/v1/response/plans
    router.get('/plans', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const status = req.query.status;
            const agentId = req.query.agentId;
            const plans = responseCenterService.getAllPlans({ tenantId, status, agentId });
            res.json({ success: true, data: redactSecrets(plans) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/response/plans
    router.post('/plans', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const userRole = getUserRole(req);
            const operatorId = getOperatorId(req);
            const { agentId, incidentId, selectedAction } = req.body || {};

            if (!agentId) {
                return res.status(400).json({ success: false, error: 'agentId is required to create response plan' });
            }

            const plan = responseCenterService.createResponsePlan({
                agentId,
                incidentId,
                selectedAction,
                operatorId,
                userRole,
                tenantId
            });

            res.status(201).json({ success: true, data: redactSecrets(plan) });
        } catch (err) {
            const status = err.statusCode || 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/response/approval-queue
    router.get('/approval-queue', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const queue = responseCenterService.getApprovalQueue({ tenantId });
            res.json({ success: true, data: redactSecrets(queue) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/response/recommendations
    router.get('/recommendations', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const agentId = req.query.agentId || 'UNKNOWN';
            const incidentId = req.query.incidentId || null;
            const recs = responseCenterService.getRecommendations({ agentId, incidentId, tenantId });
            res.json({ success: true, data: redactSecrets(recs) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/response/plans/:id
    router.get('/plans/:id', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const plan = responseCenterService.getResponseStatus({ planId: req.params.id, tenantId });
            if (!plan) {
                return res.status(404).json({ success: false, error: `Response plan '${req.params.id}' not found.` });
            }
            res.json({ success: true, data: redactSecrets(plan) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/response/plans/:id/approve
    router.post('/plans/:id/approve', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const userRole = getUserRole(req);
            const operatorId = getOperatorId(req);

            const updated = responseCenterService.approveResponse({
                planId: req.params.id,
                operatorId,
                userRole,
                tenantId
            });

            res.json({ success: true, data: redactSecrets(updated) });
        } catch (err) {
            const status = err.statusCode || 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/response/plans/:id/reject
    router.post('/plans/:id/reject', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const userRole = getUserRole(req);
            const operatorId = getOperatorId(req);
            const reason = req.body?.reason || 'Operator rejected';

            const updated = responseCenterService.rejectResponse({
                planId: req.params.id,
                operatorId,
                reason,
                userRole,
                tenantId
            });

            res.json({ success: true, data: redactSecrets(updated) });
        } catch (err) {
            const status = err.statusCode || 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/response/plans/:id/execute
    router.post('/plans/:id/execute', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const userRole = getUserRole(req);
            const operatorId = getOperatorId(req);

            const result = await responseCenterService.executeResponse({
                planId: req.params.id,
                operatorId,
                userRole,
                tenantId
            });

            res.json({ success: true, data: redactSecrets(result) });
        } catch (err) {
            const status = err.statusCode || 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/response/plans/:id/rollback
    router.post('/plans/:id/rollback', async (req, res) => {
        try {
            const tenantId = getTenant(req);
            const userRole = getUserRole(req);
            const operatorId = getOperatorId(req);
            const reason = req.body?.reason || 'Manual rollback request';

            const updated = await responseCenterService.rollbackResponse({
                planId: req.params.id,
                operatorId,
                reason,
                userRole,
                tenantId
            });

            res.json({ success: true, data: redactSecrets(updated) });
        } catch (err) {
            const status = err.statusCode || 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/response/plans/:id/history
    router.get('/plans/:id/history', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const history = responseCenterService.getResponseHistory({ planId: req.params.id, tenantId });
            res.json({ success: true, data: redactSecrets(history) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}

module.exports = { createResponseRouter };
