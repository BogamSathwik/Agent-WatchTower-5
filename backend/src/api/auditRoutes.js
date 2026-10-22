/**
 * Central Audit Log API Router
 * Exposes /api/v1/audit/* endpoints for audit overview, event search, event detail, and log export.
 * Enforces tenant context isolation and RBAC controls.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');
const { auditLogService } = require('../audit/AuditLogService');

router.use(requireAuth);

function getTenantId(req) {
    return req.tenantContext ? req.tenantContext.tenantId : (req.headers['x-tenant-id'] || 'default-tenant');
}

router.get('/api/v1/audit/overview', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const overview = auditLogService.getOverview(req.userRole === ROLES.ADMIN ? null : tenantId);
        res.json({ success: true, data: overview });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get(['/api/v1/audit/events', '/api/v1/audit/logs'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const filters = {
            tenantId: req.userRole === ROLES.ADMIN ? (req.query.tenantId || tenantId) : tenantId,
            eventType: req.query.eventType,
            actor: req.query.actor,
            resourceType: req.query.resourceType,
            outcome: req.query.outcome,
            severity: req.query.severity,
            dateFrom: req.query.dateFrom,
            dateTo: req.query.dateTo,
            limit: req.query.limit || 100
        };
        const events = auditLogService.listEvents(filters);
        res.json({ success: true, count: events.length, data: events });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/audit/events/:id', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const event = auditLogService.getEvent(req.params.id);
        if (!event) {
            return res.status(404).json({ success: false, error: { message: `Audit event '${req.params.id}' not found` } });
        }
        const tenantId = getTenantId(req);
        if (req.userRole !== ROLES.ADMIN && event.tenantId !== tenantId) {
            return res.status(403).json({ success: false, error: { message: 'Access denied to target tenant audit log' } });
        }
        res.json({ success: true, data: event });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/audit/export', requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const filters = {
            tenantId: req.query.allTenants === 'true' ? null : tenantId,
            limit: 5000
        };
        const exported = auditLogService.exportEvents(filters);
        res.json({ success: true, data: exported });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

module.exports = router;
