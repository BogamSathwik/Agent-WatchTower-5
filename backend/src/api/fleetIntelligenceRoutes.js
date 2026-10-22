/**
 * Express REST API Router for Agent Watchtower Fleet Intelligence
 * Endpoints:
 * - GET /api/v1/fleet-intelligence/overview
 * - GET /api/v1/fleet-intelligence/agents
 * - GET /api/v1/fleet-intelligence/agents/:id
 * - GET /api/v1/fleet-intelligence/recurring-problems
 * - GET /api/v1/fleet-intelligence/hotspots
 * - GET /api/v1/fleet-intelligence/dependencies
 * - GET /api/v1/fleet-intelligence/incidents
 * - GET /api/v1/fleet-intelligence/responses
 * - GET /api/v1/fleet-intelligence/recovery
 * - GET /api/v1/fleet-intelligence/trends
 * - GET /api/v1/fleet-intelligence/risks
 * - GET /api/v1/fleet-intelligence/improvements
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

function createFleetIntelligenceRouter(fleetIntelligenceService) {
    const router = express.Router();

    router.use(requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]));

    function getTenant(req) {
        return req.tenantId || req.headers['x-tenant-id'] || req.query.tenantId || 'default-tenant';
    }

    // GET /overview
    router.get('/overview', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getFleetOverview({ tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /agents
    router.get('/agents', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getAgentReliability({ tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /agents/:id
    router.get('/agents/:id', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getAgentReliability({ agentId: req.params.id, tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /recurring-problems
    router.get('/recurring-problems', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getRecurringProblems({ tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /hotspots
    router.get('/hotspots', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getOperationalHotspots({ tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /dependencies
    router.get('/dependencies', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getDependencyReliability({ tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /incidents
    router.get('/incidents', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getIncidentPatterns({ tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /responses
    router.get('/responses', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getResponseEffectiveness({ tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /recovery
    router.get('/recovery', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getRecoveryAnalysis({ tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /trends
    router.get('/trends', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const period = req.query.period || '24h';
            const data = fleetIntelligenceService.getLongTermTrends({ period, tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /risks
    router.get('/risks', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getFleetRisks({ tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /improvements
    router.get('/improvements', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = fleetIntelligenceService.getOperationalRecommendations({ tenantId });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}

module.exports = { createFleetIntelligenceRouter };
