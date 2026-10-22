/**
 * Phase 22 — Universal Incident Management API Router
 * Domain-agnostic endpoints for incident listing, details, timelines, acknowledgement, and resolution.
 * Strictly complies with AgentWatchtower router standards & RBAC.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');
const { HealthDiagnosisGenerator } = require('../health/HealthDiagnosisGenerator');

router.use(requireAuth);

function getTenantId(req) {
    return req.headers['x-tenant-id'] || req.tenantId || 'default-tenant';
}

function getMonitoringService(req) {
    return req.app.get('agentMonitoringService');
}

// GET /api/v1/incidents — List incidents with optional filters
router.get('/api/v1/incidents', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const monitoringService = getMonitoringService(req);
        if (!monitoringService || !monitoringService.store) {
            return res.json({ success: true, data: [] });
        }

        const agentId = req.query.agentId || null;
        const status = req.query.status || null;
        const severity = req.query.severity || null;

        let incidents = monitoringService.store.listIncidents(tenantId, agentId);

        if (status) {
            incidents = incidents.filter(inc => (inc.status || inc.state) === status.toUpperCase());
        }
        if (severity) {
            incidents = incidents.filter(inc => inc.severity === severity.toUpperCase());
        }

        res.json({
            success: true,
            data: incidents
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: { message: err.message, code: 'INCIDENT_LIST_ERROR' }
        });
    }
});

// GET /api/v1/incidents/:id — Get detailed incident record
router.get('/api/v1/incidents/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const monitoringService = getMonitoringService(req);
        const incidentId = req.params.id;

        const incident = monitoringService ? monitoringService.store.getIncident(incidentId) : null;
        if (!incident) {
            return res.status(404).json({
                success: false,
                error: { message: `Incident '${incidentId}' not found`, code: 'INCIDENT_NOT_FOUND' }
            });
        }

        // Generate operational diagnosis for incident
        const diagnosis = HealthDiagnosisGenerator.generateDiagnosis(incident.agentId, {
            status: incident.status === 'RESOLVED' ? 'HEALTHY' : (incident.severity === 'CRITICAL' ? 'OFFLINE' : 'DEGRADED'),
            errorMessage: incident.lastError || (incident.evidence && incident.evidence[0]) || 'Incident recorded',
            consecutiveFailures: incident.failureCount || 1,
            lastSuccessfulCheck: incident.startedAt
        });

        res.json({
            success: true,
            data: {
                ...incident,
                diagnosis
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: { message: err.message, code: 'INCIDENT_FETCH_ERROR' }
        });
    }
});

// GET /api/v1/incidents/:id/timeline — Get incident event timeline
router.get('/api/v1/incidents/:id/timeline', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const monitoringService = getMonitoringService(req);
        const incidentId = req.params.id;
        const incident = monitoringService ? monitoringService.store.getIncident(incidentId) : null;

        if (!incident) {
            return res.status(404).json({
                success: false,
                error: { message: `Incident '${incidentId}' not found`, code: 'INCIDENT_NOT_FOUND' }
            });
        }

        const agentTimeline = monitoringService.store.getTimeline(incident.agentId, incident.tenantId, 100);
        const startTime = new Date(incident.startedAt).getTime();
        const endTime = incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : Date.now();

        const incidentEvents = agentTimeline.filter(evt => {
            const t = new Date(evt.timestamp).getTime();
            return t >= startTime - 60000 && t <= endTime + 60000;
        });

        res.json({
            success: true,
            data: {
                incidentId,
                agentId: incident.agentId,
                timeline: incidentEvents
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: { message: err.message, code: 'INCIDENT_TIMELINE_ERROR' }
        });
    }
});

// POST /api/v1/incidents/:id/acknowledge — Acknowledge an incident
router.post('/api/v1/incidents/:id/acknowledge', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const monitoringService = getMonitoringService(req);
        const incidentId = req.params.id;
        const incident = monitoringService ? monitoringService.store.getIncident(incidentId) : null;

        if (!incident) {
            return res.status(404).json({
                success: false,
                error: { message: `Incident '${incidentId}' not found`, code: 'INCIDENT_NOT_FOUND' }
            });
        }

        const actor = req.user ? req.user.username : 'operator';
        incident.status = 'ACKNOWLEDGED';
        incident.state = 'ACKNOWLEDGED';
        incident.acknowledgedAt = new Date().toISOString();
        incident.acknowledgedBy = actor;

        const updated = monitoringService.store.saveIncident(incident, incident.tenantId);

        monitoringService.store.addTimelineEntry(incident.agentId, {
            type: 'INCIDENT_ACKNOWLEDGED',
            message: `Incident ${incidentId} acknowledged by ${actor}`,
            actor
        }, incident.tenantId);

        res.json({
            success: true,
            data: updated
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: { message: err.message, code: 'INCIDENT_ACKNOWLEDGE_ERROR' }
        });
    }
});

// POST /api/v1/incidents/:id/resolve — Resolve an incident
router.post('/api/v1/incidents/:id/resolve', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const monitoringService = getMonitoringService(req);
        const incidentId = req.params.id;
        const incident = monitoringService ? monitoringService.store.getIncident(incidentId) : null;

        if (!incident) {
            return res.status(404).json({
                success: false,
                error: { message: `Incident '${incidentId}' not found`, code: 'INCIDENT_NOT_FOUND' }
            });
        }

        const actor = req.user ? req.user.username : 'operator';
        const now = new Date().toISOString();
        incident.status = 'RESOLVED';
        incident.state = 'RESOLVED';
        incident.resolvedAt = now;
        incident.resolvedBy = actor;
        if (!incident.recoveredAt) incident.recoveredAt = now;
        incident.durationMs = new Date(now).getTime() - new Date(incident.startedAt).getTime();

        const updated = monitoringService.store.saveIncident(incident, incident.tenantId);

        // Update active incident on agent status if present
        const agentStatus = monitoringService.store.getStatus(incident.agentId, incident.tenantId);
        if (agentStatus.activeIncidentId === incidentId) {
            agentStatus.activeIncidentId = null;
            monitoringService.store.saveStatus(incident.agentId, agentStatus, incident.tenantId);
        }

        monitoringService.store.addTimelineEntry(incident.agentId, {
            type: 'INCIDENT_RESOLVED',
            message: `Incident ${incidentId} resolved by ${actor}`,
            actor
        }, incident.tenantId);

        res.json({
            success: true,
            data: updated
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: { message: err.message, code: 'INCIDENT_RESOLVE_ERROR' }
        });
    }
});

module.exports = router;
