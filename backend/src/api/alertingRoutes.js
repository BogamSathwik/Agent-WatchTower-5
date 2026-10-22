/**
 * Universal Alerting & Notification API Router
 * Complies strictly with AgentGenPro sub-router standards.
 * Purely domain-agnostic.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

router.use(requireAuth);

function getService(req) {
    return req.app.get('alertingService');
}

// --- Escalation Policy Routes ---

router.get('/api/v1/alerts/escalation-policies', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const policies = service.listEscalationPolicies();
        res.json({ success: true, data: policies });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.post('/api/v1/alerts/escalation-policies', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const policy = service.saveEscalationPolicy(req.body);
        res.status(201).json({ success: true, data: policy });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

router.put('/api/v1/alerts/escalation-policies/:id', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const updated = service.updateEscalationPolicy(req.params.id, req.body);
        res.json({ success: true, data: updated });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

router.delete('/api/v1/alerts/escalation-policies/:id', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const result = service.deleteEscalationPolicy(req.params.id);
        res.json({ success: true, data: result });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// --- Alert Rule Management Routes ---

router.post('/api/v1/alerts/rules', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const rule = service.createRule(req.body);
        res.status(201).json({ success: true, data: rule.toJSON() });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/alerts/rules', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const filters = {
            enabled: req.query.enabled !== undefined ? req.query.enabled === 'true' : undefined,
            source: req.query.source,
            targetSystemId: req.query.targetSystemId
        };
        const rules = service.listRules(filters).map(r => r.toJSON());
        res.json({ success: true, data: rules });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/alerts/rules/:ruleId', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const rule = service.getRule(req.params.ruleId);
        if (!rule) {
            return res.status(404).json({ success: false, error: { message: 'Alert rule not found' } });
        }
        res.json({ success: true, data: rule.toJSON() });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.patch('/api/v1/alerts/rules/:ruleId', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const updated = service.updateRule(req.params.ruleId, req.body);
        res.json({ success: true, data: updated.toJSON() });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

router.delete('/api/v1/alerts/rules/:ruleId', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const deleted = service.deleteRule(req.params.ruleId);
        if (!deleted) {
            return res.status(404).json({ success: false, error: { message: 'Alert rule not found' } });
        }
        res.json({ success: true, data: { deleted: true } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// --- Alert Management & History Routes ---

router.get('/api/v1/alerts/overview', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const overview = service.getOverview();
        res.json({ success: true, data: overview });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/alerts', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const filters = {
            systemId: req.query.systemId,
            status: req.query.status,
            severity: req.query.severity,
            category: req.query.category,
            source: req.query.source,
            ruleId: req.query.ruleId
        };
        const alerts = service.listAlerts(filters).map(a => a.toJSON());
        res.json({ success: true, data: alerts });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/alerts/:alertId', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const alert = service.getAlert(req.params.alertId);
        if (!alert) {
            return res.status(404).json({ success: false, error: { message: 'Alert not found' } });
        }
        res.json({ success: true, data: alert.toJSON() });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/alerts/:alertId/history', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const history = service.getAlertHistory(req.params.alertId);
        res.json({ success: true, data: history });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// --- Alert Lifecycle Action Routes ---

router.post('/api/v1/alerts/:alertId/escalate', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const actor = (req.user && req.user.username) || req.body.actor || 'operator';
        const reason = req.body.reason || 'Manual escalation';
        const alert = service.escalateAlert(req.params.alertId, actor, reason);
        res.json({ success: true, data: alert.toJSON() });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

router.post('/api/v1/alerts/:alertId/acknowledge', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const actor = (req.user && req.user.username) || req.body.actor || 'operator';
        const reason = req.body.reason || '';
        const alert = service.acknowledgeAlert(req.params.alertId, actor, reason);
        res.json({ success: true, data: alert.toJSON() });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

router.post('/api/v1/alerts/:alertId/resolve', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const actor = (req.user && req.user.username) || req.body.actor || 'operator';
        const evidence = req.body.evidence || [];
        const alert = service.resolveAlert(req.params.alertId, evidence, actor);
        res.json({ success: true, data: alert.toJSON() });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

router.post('/api/v1/alerts/:alertId/dismiss', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const actor = (req.user && req.user.username) || req.body.actor || 'operator';
        const reason = req.body.reason || '';
        const alert = service.dismissAlert(req.params.alertId, actor, reason);
        res.json({ success: true, data: alert.toJSON() });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

router.post('/api/v1/alerts/:alertId/reopen', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const reason = req.body.reason || 'Manually reopened';
        const alert = service.reopenAlert(req.params.alertId, reason);
        res.json({ success: true, data: alert.toJSON() });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// --- Alert Evaluation Trigger Routes ---

router.post('/api/v1/alerts/evaluate/:systemId', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.body.window || req.query.window || '15m';
        const report = await service.evaluateSystem(req.params.systemId, window);
        res.json({ success: true, data: report });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// --- Notification Channel & Policy Routes ---

router.get('/api/v1/notifications/channels', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const channels = service.listChannels();
        res.json({ success: true, data: channels });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/notifications/policies', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const policies = service.listPolicies().map(p => p.toJSON());
        res.json({ success: true, data: policies });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.post('/api/v1/notifications/policies', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const policy = service.createPolicy(req.body);
        res.status(201).json({ success: true, data: policy.toJSON() });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

router.patch('/api/v1/notifications/policies/:policyId', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const updated = service.updatePolicy(req.params.policyId, req.body);
        res.json({ success: true, data: updated.toJSON() });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

router.delete('/api/v1/notifications/policies/:policyId', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const deleted = service.deletePolicy(req.params.policyId);
        res.json({ success: true, data: { deleted } });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/notifications/deliveries', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const filters = {
            alertId: req.query.alertId,
            channelId: req.query.channelId,
            status: req.query.status
        };
        const deliveries = service.listDeliveries(filters);
        res.json({ success: true, data: deliveries });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

module.exports = router;
