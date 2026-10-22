/**
 * Universal Agent Telemetry REST API Router
 * Purely domain-agnostic router for ingesting, querying, and monitoring agent telemetry events.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');
const { telemetryService } = require('../telemetry/TelemetryService');

router.use(requireAuth);

function getService(req) {
    const service = req.app.get('telemetryIngestionService');
    if (!service) {
        throw new Error('TelemetryIngestionService is not mounted on express application context');
    }
    return service;
}

// 1. POST /api/v1/telemetry/events — Ingest Telemetry Event
router.post(['/api/v1/telemetry/events', '/api/telemetry/events'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const event = service.ingestEvent(req.body || {});
        res.status(201).json({ success: true, data: event });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message, code: 'TELEMETRY_INVALID' } });
    }
});

// 2. GET /api/v1/telemetry/overview — System Telemetry Overview
router.get(['/api/v1/telemetry/overview', '/api/telemetry/overview'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const overview = telemetryService.getOverview(req.app);
        res.json(overview);
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3. GET /api/v1/telemetry/metrics — Prometheus Text Metrics
router.get(['/api/v1/telemetry/metrics', '/api/telemetry/metrics'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const metrics = telemetryService.getPrometheusMetrics(req.app);
        res.setHeader('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (err) {
        res.status(500).send('# ERROR: Failed to generate metrics');
    }
});

// 4. GET /api/v1/telemetry/readiness — Production Readiness Evaluation
router.get(['/api/v1/telemetry/readiness', '/api/telemetry/readiness'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const readiness = telemetryService.getProductionReadinessChecks(req.app);
        res.json(readiness);
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 5. GET /api/v1/telemetry/events — Query Telemetry Events
router.get(['/api/v1/telemetry/events', '/api/telemetry/events'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const filters = {
            agentId: req.query.agentId,
            executionId: req.query.executionId,
            workflowId: req.query.workflowId,
            eventType: req.query.eventType,
            status: req.query.status,
            since: req.query.since
        };
        const events = service.getEvents(filters);
        res.json({ success: true, data: events });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 6. GET /api/v1/telemetry/agents/:agentId/timeline — Query Agent Telemetry Timeline
router.get(['/api/v1/telemetry/agents/:agentId/timeline', '/api/telemetry/agents/:agentId/timeline'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const limit = Number(req.query.limit) || 50;
        const timeline = service.getAgentTimeline(req.params.agentId, { limit });
        res.json({ success: true, data: timeline });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

module.exports = router;
