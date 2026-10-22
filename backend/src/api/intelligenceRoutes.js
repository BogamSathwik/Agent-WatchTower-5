/**
 * Universal Intelligence REST API Routes
 * Standardized endpoints for system correlation analysis, insight management, rule management, and intelligence overview.
 * AgentGenPro backend compatible router — strict /api route prefixing only.
 */

const express = require('express');
const { IntelligenceService } = require('../intelligence/IntelligenceService');
const { CorrelationRule } = require('../intelligence/CorrelationRule');
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

const defaultService = new IntelligenceService();

function createIntelligenceRouter(service = defaultService) {
    const router = express.Router();
    router.use(requireAuth);

    const store = service.insightStore;

    /**
     * POST /api/v1/intelligence/analyze/:systemId & /api/intelligence/analyze/:systemId
     * Run correlation analysis for a system (Operator/Admin).
     */
    router.post(['/api/v1/intelligence/analyze/:systemId', '/api/intelligence/analyze/:systemId'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
        try {
            const systemId = req.params.systemId;
            const window = req.query.window || (req.body && req.body.window) || '24h';
            const result = service.analyzeSystem(systemId, window);

            return res.status(200).json({
                success: true,
                message: `Intelligence correlation analysis completed for '${systemId}'`,
                data: result
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/intelligence/insights & /api/intelligence/insights
     * List all platform insights with filtering.
     */
    router.get(['/api/v1/intelligence/insights', '/api/intelligence/insights'], (req, res) => {
        try {
            const { systemId, status, severity, type, source, ruleId, window, limit } = req.query;
            const insights = store.listInsights({
                systemId, status, severity, type, source, ruleId, window, limit
            });
            return res.status(200).json({
                success: true,
                count: insights.length,
                data: insights.map(i => i.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/intelligence/insights/:insightId & /api/intelligence/insights/:insightId
     * Get specific insight by ID.
     */
    router.get(['/api/v1/intelligence/insights/:insightId', '/api/intelligence/insights/:insightId'], (req, res) => {
        try {
            const insight = store.getInsight(req.params.insightId);
            if (!insight) {
                return res.status(404).json({
                    success: false,
                    error: `Insight '${req.params.insightId}' not found`,
                    code: 'INSIGHT_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                data: insight.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/v1/intelligence/insights/:insightId/resolve & /api/intelligence/insights/:insightId/resolve
     * Resolve an insight (Operator/Admin).
     */
    router.post(['/api/v1/intelligence/insights/:insightId/resolve', '/api/intelligence/insights/:insightId/resolve'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
        try {
            const notes = req.body ? req.body.notes : null;
            const updated = store.updateInsightStatus(req.params.insightId, 'RESOLVED', { notes });
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    error: `Insight '${req.params.insightId}' not found`,
                    code: 'INSIGHT_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                message: `Insight '${req.params.insightId}' resolved`,
                data: updated.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/v1/intelligence/insights/:insightId/dismiss & /api/intelligence/insights/:insightId/dismiss
     * Dismiss an insight (Operator/Admin).
     */
    router.post(['/api/v1/intelligence/insights/:insightId/dismiss', '/api/intelligence/insights/:insightId/dismiss'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
        try {
            const reason = req.body ? req.body.reason : null;
            const updated = store.updateInsightStatus(req.params.insightId, 'DISMISSED', { reason });
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    error: `Insight '${req.params.insightId}' not found`,
                    code: 'INSIGHT_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                message: `Insight '${req.params.insightId}' dismissed`,
                data: updated.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/intelligence/:systemId/insights & /api/intelligence/:systemId/insights
     * Insights for a specific system.
     */
    router.get(['/api/v1/intelligence/:systemId/insights', '/api/intelligence/:systemId/insights'], (req, res) => {
        try {
            const insights = store.listInsights({
                systemId: req.params.systemId,
                status: req.query.status,
                severity: req.query.severity,
                limit: req.query.limit
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                count: insights.length,
                data: insights.map(i => i.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/intelligence/:systemId/overview & /api/intelligence/:systemId/overview
     * System intelligence overview across all dimensions.
     */
    router.get(['/api/v1/intelligence/:systemId/overview', '/api/intelligence/:systemId/overview'], (req, res) => {
        try {
            const overview = service.getSystemOverview(req.params.systemId, req.query.window || '24h');
            return res.status(200).json({
                success: true,
                data: overview
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/intelligence/:systemId/trends & /api/intelligence/:systemId/trends
     * Mathematical trends breakdown for a system.
     */
    router.get(['/api/v1/intelligence/:systemId/trends', '/api/intelligence/:systemId/trends'], (req, res) => {
        try {
            const trends = service.getSystemTrends(req.params.systemId, req.query.window || '24h');
            return res.status(200).json({
                success: true,
                data: trends
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/intelligence/:systemId/correlations & /api/intelligence/:systemId/correlations
     * Active correlation rules and match statistics for a system.
     */
    router.get(['/api/v1/intelligence/:systemId/correlations', '/api/intelligence/:systemId/correlations'], (req, res) => {
        try {
            const activeInsights = store.listInsights({ systemId: req.params.systemId });
            const rules = store.listRules({ enabled: true });

            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                activeRulesCount: rules.length,
                insightsCount: activeInsights.length,
                data: {
                    rules: rules.map(r => r.toJSON()),
                    insights: activeInsights.map(i => i.toJSON())
                }
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/v1/intelligence/rules & /api/intelligence/rules
     * Create a new Correlation Rule (Admin only).
     */
    router.post(['/api/v1/intelligence/rules', '/api/intelligence/rules'], requireRole([ROLES.ADMIN]), (req, res) => {
        try {
            const validation = CorrelationRule.validate(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid correlation rule payload',
                    code: 'INVALID_RULE',
                    errors: validation.errors
                });
            }

            const rule = store.saveRule(req.body);
            return res.status(201).json({
                success: true,
                message: `Correlation rule '${rule.ruleId}' created successfully`,
                data: rule.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/intelligence/rules & /api/intelligence/rules
     * List all correlation rules.
     */
    router.get(['/api/v1/intelligence/rules', '/api/intelligence/rules'], (req, res) => {
        try {
            const { enabled, severity } = req.query;
            const rules = store.listRules({ enabled, severity });
            return res.status(200).json({
                success: true,
                count: rules.length,
                data: rules.map(r => r.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * PATCH /api/v1/intelligence/rules/:ruleId & /api/intelligence/rules/:ruleId
     * Update a correlation rule (Admin only).
     */
    router.patch(['/api/v1/intelligence/rules/:ruleId', '/api/intelligence/rules/:ruleId'], requireRole([ROLES.ADMIN]), (req, res) => {
        try {
            const updated = store.updateRule(req.params.ruleId, req.body);
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    error: `Rule '${req.params.ruleId}' not found`,
                    code: 'RULE_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                message: `Correlation rule '${req.params.ruleId}' updated successfully`,
                data: updated.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * DELETE /api/v1/intelligence/rules/:ruleId & /api/intelligence/rules/:ruleId
     * Delete a correlation rule (Admin only).
     */
    router.delete(['/api/v1/intelligence/rules/:ruleId', '/api/intelligence/rules/:ruleId'], requireRole([ROLES.ADMIN]), (req, res) => {
        try {
            const deleted = store.deleteRule(req.params.ruleId);
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    error: `Rule '${req.params.ruleId}' not found`,
                    code: 'RULE_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                message: `Correlation rule '${req.params.ruleId}' deleted successfully`
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * Phase 23 Intelligence Endpoints
     */

    router.get('/api/v1/intelligence/agents/:id/baseline', (req, res) => {
        try {
            const agentId = req.params.id;
            const range = req.query.range || '24h';
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const monitoringService = req.app.get('agentMonitoringService');
            const store = monitoringService ? monitoringService.store : null;

            const { PredictiveBaselineEngine } = require('../intelligence/PredictiveBaselineEngine');
            const baselineEngine = new PredictiveBaselineEngine({ store });
            const result = baselineEngine.calculateBaseline(agentId, range, tenantId);

            return res.status(200).json({ success: true, data: result });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/api/v1/intelligence/agents/:id/anomalies', (req, res) => {
        try {
            const agentId = req.params.id;
            const range = req.query.range || '24h';
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const monitoringService = req.app.get('agentMonitoringService');
            const store = monitoringService ? monitoringService.store : null;

            const { AnomalyDetectionService } = require('../intelligence/AnomalyDetectionService');
            const anomalyService = new AnomalyDetectionService({ store });
            const anomalies = anomalyService.detectAnomalies(agentId, { tenantId, range });

            return res.status(200).json({ success: true, count: anomalies.length, data: anomalies });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get(['/api/v1/intelligence/agents/:id/risk', '/api/v1/intelligence/agents/:id/predictions'], (req, res) => {
        try {
            const agentId = req.params.id;
            const range = req.query.range || '24h';
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const monitoringService = req.app.get('agentMonitoringService');
            const store = monitoringService ? monitoringService.store : null;

            const { PredictiveRiskEngine } = require('../intelligence/PredictiveRiskEngine');
            const riskEngine = new PredictiveRiskEngine({ store });
            const risk = riskEngine.evaluateRisk(agentId, { tenantId, range });

            return res.status(200).json({ success: true, data: risk });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/api/v1/intelligence/anomalies', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const monitoringService = req.app.get('agentMonitoringService');
            const store = monitoringService ? monitoringService.store : null;

            const { AnomalyDetectionService } = require('../intelligence/AnomalyDetectionService');
            const anomalyService = new AnomalyDetectionService({ store });
            
            const allStatuses = store ? store.listStatuses(tenantId) : [];
            let allAnomalies = [];
            for (const st of allStatuses) {
                const anoms = anomalyService.detectAnomalies(st.agentId, { tenantId });
                allAnomalies = allAnomalies.concat(anoms);
            }

            return res.status(200).json({ success: true, count: allAnomalies.length, data: allAnomalies });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    router.get('/api/v1/intelligence/risk/overview', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const monitoringService = req.app.get('agentMonitoringService');
            const store = monitoringService ? monitoringService.store : null;

            const { PredictiveRiskEngine } = require('../intelligence/PredictiveRiskEngine');
            const riskEngine = new PredictiveRiskEngine({ store });

            const allStatuses = store ? store.listStatuses(tenantId) : [];
            const riskOverview = [];
            for (const st of allStatuses) {
                const risk = riskEngine.evaluateRisk(st.agentId, { tenantId });
                riskOverview.push(risk);
            }

            return res.status(200).json({
                success: true,
                count: riskOverview.length,
                agentsMonitored: riskOverview.length,
                anomaliesDetectedCount: riskOverview.reduce((acc, r) => acc + (r.anomaliesCount || 0), 0),
                highRiskCount: riskOverview.filter(r => r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL').length,
                data: riskOverview
            });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
}

const mainRouter = createIntelligenceRouter(defaultService);
mainRouter.createIntelligenceRouter = createIntelligenceRouter;
mainRouter.defaultService = defaultService;

module.exports = mainRouter;
