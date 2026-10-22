/**
 * Express REST API Router for Phase 32 Operational Scenario & Decision Intelligence Center
 * Explicit /api/v1/decision-intelligence paths (mounted via app.use(router)).
 * Read-only analysis is viewer-readable. Creation is operator/admin-gated but
 * still planning-only: nothing here executes a response or remediation.
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

function createDecisionIntelligenceRouter(decisionService) {
    const router = express.Router();

    function getTenant(req) {
        return req.tenantId || req.headers['x-tenant-id'] || req.query.tenantId || 'default-tenant';
    }

    const viewerPlus = requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]);
    const operatorPlus = requireRole([ROLES.OPERATOR, ROLES.ADMIN]);

    // GET /api/v1/decision-intelligence/overview
    router.get('/api/v1/decision-intelligence/overview', viewerPlus, (req, res) => {
        try {
            const data = decisionService.getScenarioOverview({ tenantId: getTenant(req), range: req.query.range || '24h' });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/decision-intelligence/scenarios
    router.get('/api/v1/decision-intelligence/scenarios', viewerPlus, (req, res) => {
        try {
            const list = decisionService.listScenarios({ tenantId: getTenant(req) });
            res.json({ success: true, count: list.length, data: redactSecrets(list) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/decision-intelligence/scenarios
    router.post('/api/v1/decision-intelligence/scenarios', operatorPlus, (req, res) => {
        try {
            const body = req.body || {};
            // Support creation from an early warning without duplicating logic.
            if (body.warningId && !body.scenarioType) {
                const created = decisionService.createScenarioFromWarning(body.warningId, {
                    tenantId: getTenant(req),
                    range: body.range || '24h',
                    contextNote: body.contextNote || body.note || ''
                });
                if (created.status === 'NOT_FOUND') {
                    return res.status(404).json({ success: false, error: `Warning '${body.warningId}' not found`, code: 'WARNING_NOT_FOUND' });
                }
                return res.status(201).json({ success: true, data: redactSecrets(created) });
            }
            if (!body.scenarioType) {
                return res.status(400).json({ success: false, error: 'scenarioType is required (or warningId to build from an early warning).', code: 'INVALID_SCENARIO' });
            }
            const created = decisionService.createScenario({
                scenarioType: body.scenarioType,
                agentId: body.agentId || null,
                tenantId: getTenant(req),
                range: body.range || '24h',
                warningId: body.warningId || null,
                title: body.title || null,
                contextNote: body.contextNote || body.note || ''
            });
            return res.status(201).json({ success: true, data: redactSecrets(created) });
        } catch (err) {
            const status = /Unsupported scenarioType/.test(err.message) ? 400 : 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/decision-intelligence/scenarios/:id
    router.get('/api/v1/decision-intelligence/scenarios/:id', viewerPlus, (req, res) => {
        try {
            const data = decisionService.getScenario(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Scenario '${req.params.id}' not found`, code: 'SCENARIO_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/decision-intelligence/scenarios/:id/options
    router.get('/api/v1/decision-intelligence/scenarios/:id/options', viewerPlus, (req, res) => {
        try {
            const data = decisionService.getScenarioOptions(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Scenario '${req.params.id}' not found`, code: 'SCENARIO_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/decision-intelligence/scenarios/:id/evidence
    router.get('/api/v1/decision-intelligence/scenarios/:id/evidence', viewerPlus, (req, res) => {
        try {
            const data = decisionService.getScenarioEvidence(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Scenario '${req.params.id}' not found`, code: 'SCENARIO_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/decision-intelligence/scenarios/:id/impact
    router.get('/api/v1/decision-intelligence/scenarios/:id/impact', viewerPlus, (req, res) => {
        try {
            const data = decisionService.getScenarioImpact(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Scenario '${req.params.id}' not found`, code: 'SCENARIO_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/decision-intelligence/scenarios/:id/risks
    router.get('/api/v1/decision-intelligence/scenarios/:id/risks', viewerPlus, (req, res) => {
        try {
            const data = decisionService.getScenarioRisks(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Scenario '${req.params.id}' not found`, code: 'SCENARIO_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/decision-intelligence/scenarios/:id/history
    router.get('/api/v1/decision-intelligence/scenarios/:id/history', viewerPlus, (req, res) => {
        try {
            const data = decisionService.getScenarioHistory(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Scenario '${req.params.id}' not found`, code: 'SCENARIO_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/decision-intelligence/agents/:id/scenario
    router.get('/api/v1/decision-intelligence/agents/:id/scenario', viewerPlus, (req, res) => {
        try {
            const data = decisionService.getAgentScenario(req.params.id, { tenantId: getTenant(req), range: req.query.range || '24h' });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/decision-intelligence/fleet/scenario
    router.get('/api/v1/decision-intelligence/fleet/scenario', viewerPlus, (req, res) => {
        try {
            const data = decisionService.getFleetScenario({ tenantId: getTenant(req), range: req.query.range || '24h' });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}

module.exports = { createDecisionIntelligenceRouter };
