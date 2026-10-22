/**
 * Universal System Onboarding & Configuration REST API Router
 * AgentGenPro backend compliant sub-router — explicit /api/v1/onboarding/... route paths.
 * Purely domain-agnostic.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

router.use(requireAuth);

function getService(req) {
    const service = req.app.get('onboardingService');
    if (!service) {
        throw new Error('OnboardingService is not mounted on express application context');
    }
    return service;
}

// 1. GET /api/v1/onboarding/systems
router.get('/api/v1/onboarding/systems', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const list = service.listOnboardings().map(o => o.sanitize ? o.sanitize() : o);
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 2. GET /api/v1/onboarding/systems/:id
router.get('/api/v1/onboarding/systems/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const onboarding = service.getOnboarding(req.params.id);
        if (!onboarding) {
            return res.status(404).json({ success: false, error: { message: `Onboarded system '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: onboarding.sanitize ? onboarding.sanitize() : onboarding });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3. POST /api/v1/onboarding/systems
router.post('/api/v1/onboarding/systems', requireRole([ROLES.ADMIN]), async (req, res) => {
    try {
        const service = getService(req);
        const onboarding = await service.onboardSystem(req.body);
        res.status(201).json({ success: true, data: onboarding.sanitize ? onboarding.sanitize() : onboarding });
    } catch (err) {
        const status = err.statusCode || (err.message.includes('already exists') ? 409 : 400);
        res.status(status).json({ success: false, error: { message: err.message, errors: err.errors || [] } });
    }
});

// 4. PATCH /api/v1/onboarding/systems/:id
router.patch('/api/v1/onboarding/systems/:id', requireRole([ROLES.ADMIN]), async (req, res) => {
    try {
        const service = getService(req);
        const updated = await service.updateConfiguration(req.params.id, req.body);
        res.json({ success: true, data: updated.sanitize ? updated.sanitize() : updated });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 5. DELETE /api/v1/onboarding/systems/:id
router.delete('/api/v1/onboarding/systems/:id', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const retired = service.retireSystem(req.params.id);
        res.json({ success: true, data: { retired: true, systemId: req.params.id, status: retired.status } });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 500;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 6. POST /api/v1/onboarding/systems/:id/validate
router.post('/api/v1/onboarding/systems/:id/validate', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const onboarding = service.getOnboarding(req.params.id);
        if (!onboarding) {
            return res.status(404).json({ success: false, error: { message: `Onboarded system '${req.params.id}' not found` } });
        }
        const validator = require('../onboarding/OnboardingValidator');
        const valRes = validator.validate(onboarding.sanitize());
        res.json({ success: true, data: valRes });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 7. POST /api/v1/onboarding/systems/:id/test-connection
router.post('/api/v1/onboarding/systems/:id/test-connection', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const result = await service.testConnection(req.params.id, req.body || {});
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 8. POST /api/v1/onboarding/systems/:id/discover-capabilities
router.post('/api/v1/onboarding/systems/:id/discover-capabilities', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const discoveryReport = await service.discoverCapabilities(req.params.id, req.body || {});
        res.json({ success: true, data: discoveryReport });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 9. GET /api/v1/onboarding/systems/:id/config
router.get('/api/v1/onboarding/systems/:id/config', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const onboarding = service.getOnboarding(req.params.id);
        if (!onboarding) {
            return res.status(404).json({ success: false, error: { message: `Onboarded system '${req.params.id}' not found` } });
        }
        res.json({
            success: true,
            data: {
                systemId: req.params.id,
                connection: onboarding.connection.sanitize(),
                authentication: onboarding.authentication.sanitize(),
                monitoring: onboarding.monitoring.toJSON(),
                capabilities: onboarding.capabilities
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 10. PATCH /api/v1/onboarding/systems/:id/config
router.patch('/api/v1/onboarding/systems/:id/config', requireRole([ROLES.ADMIN]), async (req, res) => {
    try {
        const service = getService(req);
        const updated = await service.updateConfiguration(req.params.id, req.body);
        res.json({ success: true, data: updated.sanitize ? updated.sanitize() : updated });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 11. POST /api/v1/onboarding/systems/:id/activate
router.post('/api/v1/onboarding/systems/:id/activate', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const onboarding = service.activateSystem(req.params.id);
        res.json({ success: true, data: onboarding.sanitize() });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 12. POST /api/v1/onboarding/systems/:id/deactivate
router.post('/api/v1/onboarding/systems/:id/deactivate', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const onboarding = service.deactivateSystem(req.params.id);
        res.json({ success: true, data: onboarding.sanitize() });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 13. POST /api/v1/onboarding/systems/:id/retire
router.post('/api/v1/onboarding/systems/:id/retire', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const onboarding = service.retireSystem(req.params.id);
        res.json({ success: true, data: onboarding.sanitize() });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 14. GET /api/v1/onboarding/systems/:id/status
router.get('/api/v1/onboarding/systems/:id/status', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const onboarding = service.getOnboarding(req.params.id);
        if (!onboarding) {
            return res.status(404).json({ success: false, error: { message: `Onboarded system '${req.params.id}' not found` } });
        }
        res.json({
            success: true,
            data: {
                systemId: req.params.id,
                onboardingStatus: onboarding.status,
                lastConnectionTest: onboarding.lastConnectionTest,
                updatedAt: onboarding.updatedAt
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 15. GET /api/v1/onboarding/systems/:id/profile
router.get('/api/v1/onboarding/systems/:id/profile', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const profile = await service.getSystemProfile(req.params.id);
        res.json({ success: true, data: profile });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 16. POST /api/v1/onboarding/external/test-connection
router.post('/api/v1/onboarding/external/test-connection', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const extService = req.app.get('externalAgentOnboardingService') || new (require('../onboarding/ExternalAgentOnboardingService').ExternalAgentOnboardingService)({
            systemRegistry: req.app.get('systemRegistry'),
            healthEngine: req.app.get('healthEngine')
        });

        const result = await extService.testConnection(req.body || {});
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message, code: 'EXTERNAL_TEST_FAILED' } });
    }
});

// 17. POST /api/v1/onboarding/external/register
router.post('/api/v1/onboarding/external/register', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const extService = req.app.get('externalAgentOnboardingService') || new (require('../onboarding/ExternalAgentOnboardingService').ExternalAgentOnboardingService)({
            systemRegistry: req.app.get('systemRegistry'),
            healthEngine: req.app.get('healthEngine')
        });

        const actor = req.user ? req.user.username : 'operator';
        const registered = await extService.registerExternalAgent(req.body || {}, actor);
        // Wire registration into the single monitoring flow: ensure monitoring
        // config exists and record one real probe (no competing loop created here).
        try {
            const monitoringService = req.app.get('agentMonitoringService');
            const agentId = registered && registered.agent && registered.agent.id;
            if (monitoringService && agentId) {
                const tenantId = req.headers['x-tenant-id'] || req.tenantId || 'default-tenant';
                try { monitoringService.store.saveConfig(agentId, { enabled: true }, tenantId); } catch (_) {}
                try { await monitoringService.checkAgent(agentId, tenantId); } catch (_) {}
            }
        } catch (_) {}
        res.status(201).json({ success: true, data: registered });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message, code: 'EXTERNAL_REGISTRATION_FAILED' } });
    }
});

module.exports = router;
