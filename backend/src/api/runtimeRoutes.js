/**
 * Universal Agent Runtime & Live Operations API Router
 * AgentGenPro Compliant.
 * Exposes live operational control, session management, capability execution, and runtime telemetry.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

function getRuntimeService(req) {
    const service = req.app.get('runtimeService');
    if (!service) {
        const err = new Error('RuntimeService not initialized on application');
        err.statusCode = 500;
        throw err;
    }
    return service;
}

router.use(requireAuth);

// 1. GET /api/v1/runtime/overview
router.get('/api/v1/runtime/overview', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getRuntimeService(req);
        const overview = service.getOverview();
        return res.status(200).json(overview);
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'INTERNAL_ERROR' }
        });
    }
});

// 2. GET /api/v1/runtime/systems
router.get('/api/v1/runtime/systems', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getRuntimeService(req);
        const systems = service.listSystems(req.query);
        return res.status(200).json({ success: true, count: systems.length, data: systems });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'INTERNAL_ERROR' }
        });
    }
});

// 3. GET /api/v1/runtime/systems/:id
router.get('/api/v1/runtime/systems/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getRuntimeService(req);
        const runtime = service.getSystemRuntime(req.params.id);
        if (!runtime) {
            return res.status(404).json({ success: false, error: { message: `System '${req.params.id}' runtime not found`, code: 'NOT_FOUND' } });
        }
        return res.status(200).json({ success: true, data: runtime });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'INTERNAL_ERROR' }
        });
    }
});

// 4. POST /api/v1/runtime/systems/:id/start
router.post('/api/v1/runtime/systems/:id/start', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getRuntimeService(req);
        const result = await service.startSystem(req.params.id, { actor: req.user ? req.user.role : 'operator', ...req.body });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'EXECUTION_FAILED' }
        });
    }
});

// 5. POST /api/v1/runtime/systems/:id/stop
router.post('/api/v1/runtime/systems/:id/stop', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getRuntimeService(req);
        const result = await service.stopSystem(req.params.id, { actor: req.user ? req.user.role : 'operator', ...req.body });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'EXECUTION_FAILED' }
        });
    }
});

// 6. POST /api/v1/runtime/systems/:id/restart
router.post('/api/v1/runtime/systems/:id/restart', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getRuntimeService(req);
        const result = await service.restartSystem(req.params.id, { actor: req.user ? req.user.role : 'operator', ...req.body });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'EXECUTION_FAILED' }
        });
    }
});

// 7. POST /api/v1/runtime/systems/:id/pause
router.post('/api/v1/runtime/systems/:id/pause', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getRuntimeService(req);
        const result = await service.pauseSystem(req.params.id, { actor: req.user ? req.user.role : 'operator', ...req.body });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'EXECUTION_FAILED' }
        });
    }
});

// 8. POST /api/v1/runtime/systems/:id/resume
router.post('/api/v1/runtime/systems/:id/resume', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getRuntimeService(req);
        const result = await service.resumeSystem(req.params.id, { actor: req.user ? req.user.role : 'operator', ...req.body });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'EXECUTION_FAILED' }
        });
    }
});

// 9. POST /api/v1/runtime/systems/:id/health-check
router.post('/api/v1/runtime/systems/:id/health-check', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getRuntimeService(req);
        const result = await service.checkHealth(req.params.id, { actor: req.user ? req.user.role : 'operator' });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'EXECUTION_FAILED' }
        });
    }
});

// 10. GET /api/v1/runtime/systems/:id/capabilities
router.get('/api/v1/runtime/systems/:id/capabilities', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getRuntimeService(req);
        const runtime = service.getSystemRuntime(req.params.id);
        if (!runtime) {
            return res.status(404).json({ success: false, error: { message: `System '${req.params.id}' not found`, code: 'NOT_FOUND' } });
        }
        return res.status(200).json({ success: true, data: { systemId: req.params.id, capabilities: runtime.capabilities } });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'INTERNAL_ERROR' }
        });
    }
});

// 11. POST /api/v1/runtime/systems/:id/execute
router.post('/api/v1/runtime/systems/:id/execute', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getRuntimeService(req);
        const { capability, operation, parameters, payload } = req.body || {};
        const opName = capability || operation || 'execute';
        const params = parameters || payload || {};

        const result = await service.executeCapability(req.params.id, opName, params, { actor: req.user ? req.user.role : 'operator' });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'EXECUTION_FAILED' }
        });
    }
});

// 12. GET /api/v1/runtime/executions
router.get('/api/v1/runtime/executions', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getRuntimeService(req);
        const executions = service.listExecutions(req.query);
        return res.status(200).json({ success: true, count: executions.length, data: executions });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'INTERNAL_ERROR' }
        });
    }
});

// 13. GET /api/v1/runtime/events
router.get('/api/v1/runtime/events', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getRuntimeService(req);
        const events = service.listEvents(req.query);
        return res.status(200).json({ success: true, count: events.length, data: events });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { message: err.message, code: err.code || 'INTERNAL_ERROR' }
        });
    }
});

module.exports = router;
