/**
 * Universal Reporting & Decision Dashboard REST API Router
 * AgentGenPro backend compliant router — explicit /api/v1/reports/ route paths.
 * Purely domain-agnostic.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

router.use(requireAuth);

function getService(req) {
    return req.app.get('reportingService');
}

// --- Platform-wide Reports Overview & System List Routes ---

router.get('/api/v1/reports/overview', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const overview = service.getOverview();
        res.json({ success: true, data: overview });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/systems', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const registry = req.app.get('systemRegistry');
        const systems = registry ? registry.getAllSystems().map(s => ({
            id: s.id,
            name: s.name,
            version: s.version,
            category: s.category,
            capabilities: s.capabilities
        })) : [];
        res.json({ success: true, data: systems });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// --- Side-by-Side Multi-System Comparison Route ---

router.get('/api/v1/reports/compare', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const systemIds = req.query.systemIds ? req.query.systemIds.split(',').map(s => s.trim()).filter(Boolean) : [];
        const window = req.query.window || '24h';
        const comparison = await service.compareSystems(systemIds, window);
        res.json({ success: true, data: comparison });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// --- System Specific Reports & Sub-Section Routes ---

router.get('/api/v1/reports/:systemId', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const report = await service.getLatestReport(req.params.systemId, window);
        if (!report) {
            return res.status(404).json({ success: false, error: { message: `Report for system '${req.params.systemId}' not found` } });
        }
        res.json({ success: true, data: report.toJSON ? report.toJSON() : report });
    } catch (err) {
        console.error('REPORT_ROUTE_ERROR:', err);
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/:systemId/summary', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const report = await service.getLatestReport(req.params.systemId, window);
        res.json({
            success: true,
            data: {
                systemId: report.systemId,
                systemName: report.systemName,
                window: report.window,
                overallStatus: report.overallStatus,
                statusReasons: report.statusReasons,
                summary: report.summary,
                attentionItems: report.attentionItems
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/:systemId/health', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const section = await service.getReportSection(req.params.systemId, 'health', window);
        res.json({ success: true, data: section });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/:systemId/quality', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const section = await service.getReportSection(req.params.systemId, 'quality', window);
        res.json({ success: true, data: section });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/:systemId/usage', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const section = await service.getReportSection(req.params.systemId, 'usage', window);
        res.json({ success: true, data: section });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/:systemId/experience', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const section = await service.getReportSection(req.params.systemId, 'experience', window);
        res.json({ success: true, data: section });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/:systemId/intelligence', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const section = await service.getReportSection(req.params.systemId, 'intelligence', window);
        res.json({ success: true, data: section });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/:systemId/alerts', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const section = await service.getReportSection(req.params.systemId, 'alerts', window);
        res.json({ success: true, data: section });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/:systemId/trends', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const report = await service.getLatestReport(req.params.systemId, window);
        res.json({ success: true, data: report.trends || [] });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/:systemId/changes', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const changes = await service.getChanges(req.params.systemId, window);
        res.json({ success: true, data: changes });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

router.get('/api/v1/reports/:systemId/export', requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.query.window || '24h';
        const exported = await service.exportReportJSON(req.params.systemId, window);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=report_${req.params.systemId}_${window}.json`);
        res.json({ success: true, data: exported });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// --- Fresh Report Generation Trigger Route ---

router.post('/api/v1/reports/:systemId/generate', requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const window = req.body.window || req.query.window || '24h';
        const report = await service.generateReport(req.params.systemId, window);
        res.status(201).json({ success: true, data: report.toJSON ? report.toJSON() : report });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

module.exports = router;
