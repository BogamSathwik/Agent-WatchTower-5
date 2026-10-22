/**
 * Express REST API Router for Phase 34 Adaptive Response Orchestration & Outcome Learning
 * Explicit /api/v1/adaptive-response paths (mounted via app.use(router)).
 * Reads are viewer-visible. Plan creation/approval/execution/verification are
 * operator-gated and delegate to existing Response Center infrastructure —
 * approval is never bypassed and nothing executes outside it.
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

function createAdaptiveResponseRouter(adaptiveService) {
    const router = express.Router();

    function getTenant(req) {
        return req.tenantId || req.headers['x-tenant-id'] || req.query.tenantId || 'default-tenant';
    }

    function getOperator(req) {
        return req.headers['x-user'] || req.headers['x-role'] || 'operator';
    }

    function getRole(req) {
        return req.headers['x-role'] || req.headers['x-user-role'] || 'OPERATOR';
    }

    function notFound(res, kind, id) {
        return res.status(404).json({ success: false, error: `${kind} '${id}' not found`, code: 'ADAPTIVE_PLAN_NOT_FOUND' });
    }

    function forbidden(res, err) {
        return res.status(err.statusCode || 403).json({ success: false, error: err.message, code: 'FORBIDDEN' });
    }

    const viewerPlus = requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]);
    const operatorPlus = requireRole([ROLES.OPERATOR, ROLES.ADMIN]);

    // GET /api/v1/adaptive-response/overview
    router.get('/api/v1/adaptive-response/overview', viewerPlus, (req, res) => {
        try {
            const data = adaptiveService.getOverview({ tenantId: getTenant(req) });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/adaptive-response/plans
    router.get('/api/v1/adaptive-response/plans', viewerPlus, (req, res) => {
        try {
            const data = adaptiveService.getHistory({ tenantId: getTenant(req) });
            res.json({ success: true, count: data.plans.length, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/adaptive-response/plans
    router.post('/api/v1/adaptive-response/plans', operatorPlus, (req, res) => {
        try {
            const body = req.body || {};
            if (!body.agentId) {
                return res.status(400).json({ success: false, error: 'agentId is required to create a response plan.', code: 'INVALID_PLAN' });
            }
            const data = adaptiveService.createPlan({
                agentId: body.agentId,
                incidentId: body.incidentId || null,
                warningId: body.warningId || null,
                decisionScenarioId: body.decisionScenarioId || null,
                simulationId: body.simulationId || null,
                responseOptionType: body.responseOptionType || null,
                tenantId: getTenant(req),
                range: body.range || '24h',
                operator: getOperator(req),
                userRole: getRole(req),
                contextNote: body.contextNote || body.note || ''
            }, { operator: getOperator(req), userRole: getRole(req) });
            return res.status(201).json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/adaptive-response/history
    router.get('/api/v1/adaptive-response/history', viewerPlus, (req, res) => {
        try {
            const data = adaptiveService.getHistory({ tenantId: getTenant(req) });
            res.json({ success: true, count: data.plans.length, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/adaptive-response/effectiveness
    router.get('/api/v1/adaptive-response/effectiveness', viewerPlus, (req, res) => {
        try {
            const data = adaptiveService.getEffectiveness({
                tenantId: getTenant(req),
                responseType: req.query.responseType || null,
                agentId: req.query.agentId || null
            });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/adaptive-response/agents/:id
    router.get('/api/v1/adaptive-response/agents/:id', viewerPlus, (req, res) => {
        try {
            const data = adaptiveService.getAgentResponseHistory(req.params.id, { tenantId: getTenant(req) });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/adaptive-response/plans/:id
    router.get('/api/v1/adaptive-response/plans/:id', viewerPlus, (req, res) => {
        try {
            const data = adaptiveService.getPlan(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Adaptive plan', req.params.id);
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/adaptive-response/plans/:id/eligibility
    router.get('/api/v1/adaptive-response/plans/:id/eligibility', viewerPlus, (req, res) => {
        try {
            const data = adaptiveService.checkEligibility(req.params.id, { tenantId: getTenant(req), userRole: getRole(req) });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Adaptive plan', req.params.id);
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/adaptive-response/plans/:id/approve
    router.post('/api/v1/adaptive-response/plans/:id/approve', operatorPlus, (req, res) => {
        try {
            const data = adaptiveService.approvePlan(req.params.id, { tenantId: getTenant(req), operator: getOperator(req), userRole: getRole(req) });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Adaptive plan', req.params.id);
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            if (err.statusCode === 403 || /Access Denied|not authorized/i.test(err.message)) return forbidden(res, err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/adaptive-response/plans/:id/execute
    router.post('/api/v1/adaptive-response/plans/:id/execute', operatorPlus, async (req, res) => {
        try {
            const data = await adaptiveService.executePlan(req.params.id, { tenantId: getTenant(req), operator: getOperator(req), userRole: getRole(req) });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Adaptive plan', req.params.id);
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            if (err.statusCode === 403 || /Access Denied|not authorized/i.test(err.message)) return forbidden(res, err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/adaptive-response/plans/:id/verify
    router.post('/api/v1/adaptive-response/plans/:id/verify', operatorPlus, async (req, res) => {
        try {
            const data = await adaptiveService.verifyPlan(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Adaptive plan', req.params.id);
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/adaptive-response/plans/:id/outcome
    router.get('/api/v1/adaptive-response/plans/:id/outcome', viewerPlus, (req, res) => {
        try {
            const data = adaptiveService.analyzeOutcome(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Adaptive plan', req.params.id);
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/adaptive-response/plans/:id/learning
    router.get('/api/v1/adaptive-response/plans/:id/learning', viewerPlus, (req, res) => {
        try {
            const data = adaptiveService.learnFromOutcome(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Adaptive plan', req.params.id);
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}

module.exports = { createAdaptiveResponseRouter };
