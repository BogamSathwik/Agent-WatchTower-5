/**
 * Express REST API Router for Phase 33 Operational Simulation & What-If Intelligence Center
 * Explicit /api/v1/simulations paths (mounted via app.use(router)).
 * Creation/running is operator-gated but strictly planning-only:
 * running a simulation computes branches — it never executes anything.
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

function createSimulationRouter(simulationService) {
    const router = express.Router();

    function getTenant(req) {
        return req.tenantId || req.headers['x-tenant-id'] || req.query.tenantId || 'default-tenant';
    }

    function getOperator(req) {
        return req.headers['x-user'] || req.headers['x-role'] || 'operator';
    }

    const viewerPlus = requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]);
    const operatorPlus = requireRole([ROLES.OPERATOR, ROLES.ADMIN]);

    // GET /api/v1/simulations/overview
    router.get('/api/v1/simulations/overview', viewerPlus, (req, res) => {
        try {
            const data = simulationService.getOverview({ tenantId: getTenant(req) });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/simulations
    router.get('/api/v1/simulations', viewerPlus, (req, res) => {
        try {
            const list = simulationService.getSimulations({ tenantId: getTenant(req) });
            res.json({ success: true, count: list.length, data: redactSecrets(list) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/simulations
    router.post('/api/v1/simulations', operatorPlus, (req, res) => {
        try {
            const body = req.body || {};
            const tenantId = getTenant(req);
            // Creation from a decision scenario or early warning carries
            // evidence forward by reference (no engine duplication).
            if (body.decisionScenarioId && !body.simulationType) {
                const created = simulationService.createSimulationFromDecision(body.decisionScenarioId, {
                    tenantId,
                    simulationType: body.simulationType || null,
                    responseOptionType: body.responseOptionType || null,
                    contextNote: body.contextNote || body.note || ''
                }, { operator: getOperator(req) });
                if (created.status === 'NOT_FOUND') {
                    return res.status(404).json({ success: false, error: `Decision scenario '${body.decisionScenarioId}' not found`, code: 'DECISION_SCENARIO_NOT_FOUND' });
                }
                return res.status(201).json({ success: true, data: redactSecrets(created) });
            }
            if (body.warningId && !body.simulationType) {
                const created = simulationService.createSimulationFromWarning(body.warningId, {
                    tenantId,
                    range: body.range || '24h',
                    simulationType: body.simulationType || null,
                    contextNote: body.contextNote || body.note || ''
                }, { operator: getOperator(req) });
                if (created.status === 'NOT_FOUND') {
                    return res.status(404).json({ success: false, error: `Warning '${body.warningId}' not found`, code: 'WARNING_NOT_FOUND' });
                }
                return res.status(201).json({ success: true, data: redactSecrets(created) });
            }
            if (!body.simulationType) {
                return res.status(400).json({ success: false, error: 'simulationType is required (or decisionScenarioId / warningId to build from existing analysis).', code: 'INVALID_SIMULATION' });
            }
            const created = simulationService.createSimulation({
                simulationType: body.simulationType,
                agentId: body.agentId || null,
                tenantId,
                range: body.range || '24h',
                warningId: body.warningId || null,
                decisionScenarioId: body.decisionScenarioId || null,
                incidentId: body.incidentId || null,
                dependencyTarget: body.dependencyTarget || null,
                responseOptionType: body.responseOptionType || null,
                title: body.title || null,
                contextNote: body.contextNote || body.note || ''
            }, { operator: getOperator(req) });
            return res.status(201).json({ success: true, data: redactSecrets(created) });
        } catch (err) {
            const status = /Unsupported simulationType|requires /.test(err.message) ? 400 : 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/simulations/agents/:id
    router.get('/api/v1/simulations/agents/:id', viewerPlus, (req, res) => {
        try {
            const list = simulationService.getAgentSimulations(req.params.id, { tenantId: getTenant(req) });
            res.json({ success: true, count: list.length, data: redactSecrets(list) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/simulations/fleet
    router.get('/api/v1/simulations/fleet', viewerPlus, (req, res) => {
        try {
            const list = simulationService.getFleetSimulations({ tenantId: getTenant(req) });
            res.json({ success: true, count: list.length, data: redactSecrets(list) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/simulations/compare
    router.post('/api/v1/simulations/compare', viewerPlus, (req, res) => {
        try {
            const body = req.body || {};
            if (!Array.isArray(body.simulationIds) || body.simulationIds.length === 0) {
                return res.status(400).json({ success: false, error: 'simulationIds (non-empty array) is required.', code: 'INVALID_COMPARE' });
            }
            const data = simulationService.compareSimulations(body.simulationIds.slice(0, 10), { tenantId: getTenant(req) });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/simulations/:id
    router.get('/api/v1/simulations/:id', viewerPlus, (req, res) => {
        try {
            const data = simulationService.getSimulation(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Simulation '${req.params.id}' not found`, code: 'SIMULATION_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/simulations/:id/run (planning-only computation)
    router.post('/api/v1/simulations/:id/run', operatorPlus, (req, res) => {
        try {
            const data = simulationService.runSimulation(req.params.id, { tenantId: getTenant(req), operator: getOperator(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Simulation '${req.params.id}' not found`, code: 'SIMULATION_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/simulations/:id/assumptions
    router.get('/api/v1/simulations/:id/assumptions', viewerPlus, (req, res) => {
        try {
            const data = simulationService.getSimulation(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Simulation '${req.params.id}' not found`, code: 'SIMULATION_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets({ simulationId: req.params.id, tenantId: getTenant(req), assumptions: data.assumptions }) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/simulations/:id/impact
    router.get('/api/v1/simulations/:id/impact', viewerPlus, (req, res) => {
        try {
            const data = simulationService.getSimulation(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Simulation '${req.params.id}' not found`, code: 'SIMULATION_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets({ simulationId: req.params.id, tenantId: getTenant(req), impact: data.impact }) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/simulations/:id/paths
    router.get('/api/v1/simulations/:id/paths', viewerPlus, (req, res) => {
        try {
            const data = simulationService.getSimulation(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Simulation '${req.params.id}' not found`, code: 'SIMULATION_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets({ simulationId: req.params.id, tenantId: getTenant(req), paths: data.paths, comparison: data.comparison }) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/simulations/:id/outcomes
    router.get('/api/v1/simulations/:id/outcomes', viewerPlus, (req, res) => {
        try {
            const data = simulationService.getSimulation(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Simulation '${req.params.id}' not found`, code: 'SIMULATION_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets({ simulationId: req.params.id, tenantId: getTenant(req), outcomes: data.outcomes, uncertainty: data.uncertainty, missingInformation: data.missingInformation }) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/simulations/:id/history
    router.get('/api/v1/simulations/:id/history', viewerPlus, (req, res) => {
        try {
            const data = simulationService.getSimulationHistory(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Simulation '${req.params.id}' not found`, code: 'SIMULATION_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}

module.exports = { createSimulationRouter };
