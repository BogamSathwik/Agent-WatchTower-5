/**
 * Universal Orchestration & Continuous Monitoring REST API Router
 * AgentGenPro backend compliant sub-router — explicit /api/v1/orchestration/... route paths.
 * Purely domain-agnostic.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

router.use(requireAuth);

function getService(req) {
    const service = req.app.get('orchestrationService');
    if (!service) {
        throw new Error('OrchestrationService is not mounted on express application context');
    }
    return service;
}

// 1. GET /api/v1/orchestration/overview
router.get('/api/v1/orchestration/overview', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        res.json({ success: true, data: service.getOverview() });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 2. GET /api/v1/orchestration/plans
router.get('/api/v1/orchestration/plans', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const plans = service.listPlans().map(p => p.toJSON ? p.toJSON() : p);
        res.json({ success: true, data: plans });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3. GET /api/v1/orchestration/plans/:id
router.get('/api/v1/orchestration/plans/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const plan = service.getPlan(req.params.id);
        if (!plan) {
            return res.status(404).json({ success: false, error: { message: `Orchestration plan '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: plan.toJSON ? plan.toJSON() : plan });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 4. POST /api/v1/orchestration/plans
router.post('/api/v1/orchestration/plans', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const plan = service.createPlan(req.body);
        res.status(201).json({ success: true, data: plan.toJSON ? plan.toJSON() : plan });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// 5. PATCH /api/v1/orchestration/plans/:id
router.patch('/api/v1/orchestration/plans/:id', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const updated = service.updatePlan(req.params.id, req.body);
        res.json({ success: true, data: updated.toJSON ? updated.toJSON() : updated });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 6. DELETE /api/v1/orchestration/plans/:id
router.delete('/api/v1/orchestration/plans/:id', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const deleted = service.deletePlan(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, error: { message: `Orchestration plan '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: { deleted: true, planId: req.params.id } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 7. POST /api/v1/orchestration/plans/:id/run
router.post('/api/v1/orchestration/plans/:id/run', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey || null;
        const result = await service.runPlan(req.params.id, { idempotencyKey });
        res.json({ success: true, data: result.toJSON ? result.toJSON() : result });
    } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 8. GET /api/v1/orchestration/runs
router.get('/api/v1/orchestration/runs', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const runs = service.listRuns().map(r => r.toJSON ? r.toJSON() : r);
        res.json({ success: true, data: runs });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 9. GET /api/v1/orchestration/runs/:id
router.get('/api/v1/orchestration/runs/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const run = service.getRun(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: { message: `Orchestration run '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: run.toJSON ? run.toJSON() : run });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 10. POST /api/v1/orchestration/runs/:id/cancel
router.post('/api/v1/orchestration/runs/:id/cancel', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const cancelled = service.cancelRun(req.params.id);
        if (!cancelled) {
            return res.status(400).json({ success: false, error: { message: `Run '${req.params.id}' cannot be cancelled or was not found` } });
        }
        res.json({ success: true, data: { cancelled: true, runId: req.params.id } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 11. Scheduler Controls
router.get('/api/v1/orchestration/scheduler/status', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        res.json({ success: true, data: service.orchestrationScheduler.getStatus() });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.post('/api/v1/orchestration/scheduler/start', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const status = service.orchestrationScheduler.start();
        res.json({ success: true, data: status });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.post('/api/v1/orchestration/scheduler/stop', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const status = service.orchestrationScheduler.stop();
        res.json({ success: true, data: status });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.post('/api/v1/orchestration/scheduler/pause', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const status = service.orchestrationScheduler.pause();
        res.json({ success: true, data: status });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.post('/api/v1/orchestration/scheduler/resume', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const status = service.orchestrationScheduler.resume();
        res.json({ success: true, data: status });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

module.exports = router;
