/**
 * Reasoning Engine REST API Router
 * Purely domain-agnostic router for agent reasoning, telemetry analysis, planning, decisions, and traces.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

router.use(requireAuth);

function getService(req) {
    const service = req.app.get('reasoningService');
    if (!service) {
        throw new Error('ReasoningService is not mounted on express application context');
    }
    return service;
}

// 1. GET /api/v1/reasoning/overview
router.get(['/api/v1/reasoning/overview', '/api/reasoning/overview'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        res.json({ success: true, data: service.getOverview() });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 2. POST /api/v1/reasoning/analyze
router.post(['/api/v1/reasoning/analyze', '/api/reasoning/analyze'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const { agentId = 'TEST-AGENT-001', observation = {}, execute = true } = req.body || {};
        const actor = req.user ? req.user.username : 'operator';
        const tenantId = req.headers['x-tenant-id'] || 'global';

        const result = await service.analyze(agentId, observation, { actor, tenantId, execute });
        res.json({ success: true, data: { decision: result.decision.toJSON(), trace: result.trace.toJSON() } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3. POST /api/v1/reasoning/plan
router.post(['/api/v1/reasoning/plan', '/api/reasoning/plan'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const { agentId = 'TEST-AGENT-001', goal = 'Evaluate agent health' } = req.body || {};
        const actor = req.user ? req.user.username : 'operator';

        const result = await service.plan(agentId, goal, { actor });
        res.json({ success: true, data: { decision: result.decision.toJSON(), trace: result.trace.toJSON() } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 4. POST /api/v1/reasoning/decide
router.post(['/api/v1/reasoning/decide', '/api/reasoning/decide'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const { agentId = 'TEST-AGENT-001', observation = {} } = req.body || {};
        const actor = req.user ? req.user.username : 'operator';

        const result = await service.decide(agentId, { observation, actor });
        res.json({ success: true, data: result.decision.toJSON() });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 5. GET /api/v1/reasoning/traces
router.get(['/api/v1/reasoning/traces', '/api/reasoning/traces'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const agentId = req.query.agentId;
        const traces = service.listTraces({ agentId });
        res.json({ success: true, data: traces });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 6. GET /api/v1/reasoning/traces/:id
router.get(['/api/v1/reasoning/traces/:id', '/api/reasoning/traces/:id'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const trace = service.getTrace(req.params.id);
        if (!trace) {
            return res.status(404).json({ success: false, error: { message: `Reasoning trace '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: trace.toJSON ? trace.toJSON() : trace });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

module.exports = router;
