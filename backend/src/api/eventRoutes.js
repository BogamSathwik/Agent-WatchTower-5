/**
 * AgentGenPro Backend Router — Event Control & Automation Engine
 * Exposes /api/v1/events/* endpoints for source management, rule definitions, event ingestion,
 * SSE event stream, dry-run simulations, and execution audit logging.
 */

const express = require('express');
const router = express.Router();
const { requireRole, ROLES } = require('../middleware/authMiddleware');
const { sseManager } = require('../events/SSEManager');

function getEventService(req) {
    const service = req.app.get('eventService');
    if (!service) {
        const err = new Error('EventService not initialized on application');
        err.statusCode = 500;
        err.code = 'SERVICE_NOT_AVAILABLE';
        throw err;
    }
    return service;
}

// 0. Real-time SSE Event Stream Endpoint
router.get('/api/v1/events/stream', (req, res) => {
    sseManager.addClient(req, res);
});

// 1. Overview Metrics
router.get('/api/v1/events/overview', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const overview = service.getOverview();
        res.json(overview);
    } catch (err) {
        next(err);
    }
});

// 2. Sources Management
router.get('/api/v1/events/sources', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const sources = service.listSources();
        res.json({ success: true, count: sources.length, data: sources });
    } catch (err) {
        next(err);
    }
});

router.post('/api/v1/events/sources', requireRole([ROLES.ADMIN]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const source = service.registerSource(req.body);
        res.status(201).json({ success: true, message: 'Event source registered successfully', data: source });
    } catch (err) {
        next(err);
    }
});

router.patch('/api/v1/events/sources/:id', requireRole([ROLES.ADMIN]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const updated = service.updateSource(req.params.id, req.body);
        res.json({ success: true, message: 'Event source updated successfully', data: updated });
    } catch (err) {
        next(err);
    }
});

router.delete('/api/v1/events/sources/:id', requireRole([ROLES.ADMIN]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const result = service.deleteSource(req.params.id);
        res.json({ success: true, message: 'Event source deleted successfully', data: result });
    } catch (err) {
        next(err);
    }
});

// 3. Rules Management
router.get('/api/v1/events/rules', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const rules = service.listRules();
        res.json({ success: true, count: rules.length, data: rules });
    } catch (err) {
        next(err);
    }
});

router.post('/api/v1/events/rules', requireRole([ROLES.ADMIN]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const rule = service.registerRule(req.body);
        res.status(201).json({ success: true, message: 'Event rule created successfully', data: rule });
    } catch (err) {
        next(err);
    }
});

router.patch('/api/v1/events/rules/:id', requireRole([ROLES.ADMIN]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const updated = service.updateRule(req.params.id, req.body);
        res.json({ success: true, message: 'Event rule updated successfully', data: updated });
    } catch (err) {
        next(err);
    }
});

router.delete('/api/v1/events/rules/:id', requireRole([ROLES.ADMIN]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const result = service.deleteRule(req.params.id);
        res.json({ success: true, message: 'Event rule deleted successfully', data: result });
    } catch (err) {
        next(err);
    }
});

// 4. Ingestion & Processing
router.post('/api/v1/events/ingest', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const result = await service.ingestEvent(req.body);
        res.status(202).json({ success: true, message: 'Event ingested successfully', data: result });
    } catch (err) {
        next(err);
    }
});

router.post('/api/v1/events/process', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const result = await service.ingestEvent(req.body);
        res.json({ success: true, message: 'Event processed', data: result });
    } catch (err) {
        next(err);
    }
});

router.post('/api/v1/events/dry-run', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const result = await service.dryRun(req.body);
        res.json({ success: true, message: 'Event dry-run simulation complete', data: result });
    } catch (err) {
        next(err);
    }
});

// 5. Events Listing & Search
router.get('/api/v1/events/executions', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const executions = service.listExecutions();
        res.json({ success: true, count: executions.length, data: executions });
    } catch (err) {
        next(err);
    }
});

router.get('/api/v1/events/audit', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const executions = service.listExecutions();
        res.json({ success: true, count: executions.length, data: executions });
    } catch (err) {
        next(err);
    }
});

router.get('/api/v1/events', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const events = service.listEvents();
        res.json({ success: true, count: events.length, data: events });
    } catch (err) {
        next(err);
    }
});

router.post('/api/v1/events', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const result = await service.ingestEvent(req.body);
        res.status(201).json({ success: true, message: 'Event created', data: result });
    } catch (err) {
        next(err);
    }
});

router.get('/api/v1/events/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res, next) => {
    try {
        const service = getEventService(req);
        const event = service.getEvent(req.params.id);
        res.json({ success: true, data: event });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
