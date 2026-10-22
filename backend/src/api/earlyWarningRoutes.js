/**
 * Express REST API Router for Phase 31 Predictive Operations & Early Warning Center
 * Endpoints (mounted at /api/v1/early-warning):
 * - GET /overview
 * - GET /warnings
 * - GET /warnings/:id
 * - GET /agents/:id
 * - GET /trends
 * - GET /predictions
 * - GET /risks
 * - GET /readiness
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

function createEarlyWarningRouter(earlyWarningService) {
    const router = express.Router();

    router.use(requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]));

    function getTenant(req) {
        return req.tenantId || req.headers['x-tenant-id'] || req.query.tenantId || 'default-tenant';
    }

    // GET /overview
    router.get('/overview', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const range = req.query.range || '24h';
            const data = earlyWarningService.getOverview({ tenantId, range });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /warnings
    router.get('/warnings', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = earlyWarningService.getWarnings({
                tenantId,
                severity: req.query.severity || null,
                agentId: req.query.agentId || null,
                range: req.query.range || '24h',
                includeAcknowledged: req.query.includeAcknowledged !== 'false'
            });
            res.json({ success: true, ...redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /warnings/:id
    router.get('/warnings/:id', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = earlyWarningService.getWarningById(req.params.id, { tenantId, range: req.query.range || '24h' });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Warning '${req.params.id}' not found`, code: 'WARNING_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /agents/:id
    router.get('/agents/:id', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = earlyWarningService.getAgentEarlyWarning(req.params.id, { tenantId, range: req.query.range || '24h' });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /trends (observed + trend only, no inference)
    router.get('/trends', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = earlyWarningService.getObservedTrends({
                tenantId,
                range: req.query.range || '24h',
                agentId: req.query.agentId || null
            });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /predictions (predictions only)
    router.get('/predictions', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = earlyWarningService.getPredictions({
                tenantId,
                agentId: req.query.agentId || null,
                range: req.query.range || '24h'
            });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /risks (fleet risk context enriched for early warning)
    router.get('/risks', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const overview = earlyWarningService.getOverview({ tenantId, range: req.query.range || '24h' });
            res.json({ success: true, data: redactSecrets({ tenantId, fleetRisk: overview.fleetRisk, topWarnings: overview.topWarnings }) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /readiness (response readiness per agent)
    router.get('/readiness', (req, res) => {
        try {
            const tenantId = getTenant(req);
            const data = earlyWarningService.getReadiness({ tenantId, range: req.query.range || '24h' });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /warnings/:id/acknowledge (operator/admin only)
    router.post('/warnings/:id/acknowledge', requireRole([ROLES.OPERATOR, ROLES.ADMIN]), (req, res) => {
        try {
            const tenantId = getTenant(req);
            const acknowledgedBy = req.headers['x-user'] || req.headers['x-role'] || 'operator';
            const note = req.body ? req.body.note : '';
            const data = earlyWarningService.acknowledgeWarning(req.params.id, { tenantId, acknowledgedBy, note });
            if (data.status === 'NOT_FOUND') {
                return res.status(404).json({ success: false, error: `Warning '${req.params.id}' not found`, code: 'WARNING_NOT_FOUND' });
            }
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}

module.exports = { createEarlyWarningRouter };
