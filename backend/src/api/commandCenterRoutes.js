/**
 * Express REST API Router for Agent Watchtower Command Center
 * Endpoints:
 * - GET /api/v1/command-center/overview
 * - GET /api/v1/command-center/attention
 * - GET /api/v1/command-center/incidents
 * - GET /api/v1/command-center/agents
 * - GET /api/v1/command-center/risks
 * - GET /api/v1/command-center/anomalies
 * - GET /api/v1/command-center/dependencies
 * - GET /api/v1/command-center/automations
 * - GET /api/v1/command-center/remediations
 * - GET /api/v1/command-center/activity
 * - GET /api/v1/command-center/changes
 * - GET /api/v1/command-center/summary
 * - GET /api/v1/command-center/agents/:id
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

function createCommandCenterRouter(commandCenterService) {
    const router = express.Router();

    router.use(requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]));

    function getTenant(req) {
        return req.tenantId || req.headers['x-tenant-id'] || req.query.tenantId || 'default';
    }

    // GET /overview
    router.get('/overview', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const overview = commandCenterService.getOverview({ tenantId });
            res.json(redactSecrets(overview));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve Command Center overview', message: err.message });
        }
    });

    // GET /attention
    router.get('/attention', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const attentionItems = commandCenterService.getAttentionItems({ tenantId });
            res.json(redactSecrets(attentionItems));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve operator attention items', message: err.message });
        }
    });

    // GET /incidents
    router.get('/incidents', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const incidents = commandCenterService.getActiveIncidents({ tenantId });
            res.json(redactSecrets(incidents));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve active incidents', message: err.message });
        }
    });

    // GET /agents
    router.get('/agents', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const agents = commandCenterService.getAgentHealthSummary({ tenantId });
            res.json(redactSecrets(agents));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve agent health summary', message: err.message });
        }
    });

    // GET /risks
    router.get('/risks', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const risks = commandCenterService.getRiskSummary({ tenantId });
            res.json(redactSecrets(risks));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve risk summary', message: err.message });
        }
    });

    // GET /anomalies
    router.get('/anomalies', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const anomalies = commandCenterService.getAnomalySummary({ tenantId });
            res.json(redactSecrets(anomalies));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve anomaly summary', message: err.message });
        }
    });

    // GET /dependencies
    router.get('/dependencies', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const deps = commandCenterService.getDependencyImpact({ tenantId });
            res.json(redactSecrets(deps));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve dependency impact', message: err.message });
        }
    });

    // GET /automations
    router.get('/automations', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const automations = commandCenterService.getRunningAutomations({ tenantId });
            res.json(redactSecrets(automations));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve running automations', message: err.message });
        }
    });

    // GET /remediations
    router.get('/remediations', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const remediations = commandCenterService.getRunningRemediations({ tenantId });
            res.json(redactSecrets(remediations));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve running remediations', message: err.message });
        }
    });

    // GET /activity
    router.get('/activity', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const limit = parseInt(req.query.limit, 10) || 50;
            const activity = commandCenterService.getRecentActivity({ tenantId, limit });
            res.json(redactSecrets(activity));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve activity feed', message: err.message });
        }
    });

    // GET /changes
    router.get('/changes', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const limit = parseInt(req.query.limit, 10) || 50;
            const changes = commandCenterService.getRecentChanges({ tenantId, limit });
            res.json(redactSecrets(changes));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve change feed', message: err.message });
        }
    });

    // GET /summary
    router.get('/summary', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const summary = commandCenterService.getSystemSummary({ tenantId });
            res.json(redactSecrets(summary));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve system summary', message: err.message });
        }
    });

    // GET /agents/:id
    router.get('/agents/:id', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const agentId = req.params.id;
            const summary = commandCenterService.getAgentSummary(agentId, { tenantId });
            if (summary.status === 'NOT_FOUND') {
                return res.status(404).json(redactSecrets(summary));
            }
            res.json(redactSecrets(summary));
        } catch (err) {
            res.status(500).json({ error: 'Failed to retrieve agent summary', message: err.message });
        }
    });

    return router;
}

module.exports = { createCommandCenterRouter };
