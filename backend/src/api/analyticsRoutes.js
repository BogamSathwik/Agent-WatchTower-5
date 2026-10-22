/**
 * Phase 24 — Operational Analytics REST API Router
 * Exposes endpoints for platform overview, performance scorecards, trends, reliability,
 * recurring problems, operator attention, capacity intelligence, activity analysis, and agent comparison.
 */

const express = require('express');

function createAnalyticsRouter(operationalAnalyticsService) {
    const router = express.Router();

    const getTenantId = (req) => req.headers['x-tenant-id'] || req.tenantId || 'default-tenant';
    const getCorrelationId = (req) => req.headers['x-correlation-id'] || req.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const getService = (req) => {
        if (operationalAnalyticsService) return operationalAnalyticsService;
        if (req.app && req.app.get('operationalAnalyticsService')) return req.app.get('operationalAnalyticsService');
        throw new Error('OperationalAnalyticsService is not initialized');
    };

    // GET /overview — Platform-wide Operational Overview
    router.get('/overview', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const range = req.query.range || '24h';
            const service = getService(req);
            const overview = service.getPlatformOverview(range, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: overview
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'ANALYTICS_OVERVIEW_ERROR' }
            });
        }
    });

    // GET /agents/:id/performance — Agent Performance Scorecard
    router.get('/agents/:id/performance', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const range = req.query.range || '24h';
            const service = getService(req);
            const performance = service.getAgentPerformance(agentId, range, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: performance
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'AGENT_PERFORMANCE_ERROR' }
            });
        }
    });

    // GET /agents/:id/trends — Agent Performance Trends
    router.get('/agents/:id/trends', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const range = req.query.range || '7d';
            const service = getService(req);
            const trends = service.getAgentTrends(agentId, range, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: trends
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'AGENT_TRENDS_ERROR' }
            });
        }
    });

    // GET /agents/:id/reliability — Agent Reliability Analytics
    router.get('/agents/:id/reliability', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const range = req.query.range || '30d';
            const service = getService(req);
            const reliability = service.getAgentReliability(agentId, range, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: reliability
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'AGENT_RELIABILITY_ERROR' }
            });
        }
    });

    // GET /recurring-problems — Detect Recurring Operational Problems
    router.get('/recurring-problems', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.query.agentId || null;
            const service = getService(req);
            const problems = service.getRecurringProblems(tenantId, agentId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: problems
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'RECURRING_PROBLEMS_ERROR' }
            });
        }
    });

    // GET /operator-attention — Operator Attention Engine
    router.get('/operator-attention', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const service = getService(req);
            const attention = service.getOperatorAttention(tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: attention
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'OPERATOR_ATTENTION_ERROR' }
            });
        }
    });

    // GET /capacity — Capacity Intelligence
    router.get('/capacity', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.query.agentId || null;
            const service = getService(req);
            const capacity = service.getCapacityIntelligence(agentId, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: capacity
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'CAPACITY_INTELLIGENCE_ERROR' }
            });
        }
    });

    // GET /activity — Busiest Period Activity Analysis
    router.get('/activity', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const range = req.query.range || '24h';
            const service = getService(req);
            const activity = service.getActivityAnalysis(range, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: activity
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'ACTIVITY_ANALYSIS_ERROR' }
            });
        }
    });

    // GET /compare — Agent Operational Comparison
    router.get('/compare', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const range = req.query.range || '24h';
            const agentsParam = req.query.agents || '';
            const agentIds = agentsParam.split(',').map(s => s.trim()).filter(Boolean);
            const service = getService(req);
            const comparison = service.compareAgents(agentIds, range, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: comparison
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'AGENT_COMPARISON_ERROR' }
            });
        }
    });

    // GET /recommendations — Evidence-based Operational Recommendations
    router.get('/recommendations', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.query.agentId || null;
            const range = req.query.range || '24h';
            const service = getService(req);
            const recommendations = service.generateRecommendations(agentId, range, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: recommendations
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'RECOMMENDATIONS_ERROR' }
            });
        }
    });

    // POST /snapshots — Create Historical Snapshot
    router.post('/snapshots', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const service = getService(req);
            const snapshot = service.createHistoricalSnapshot(tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: snapshot
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'CREATE_SNAPSHOT_ERROR' }
            });
        }
    });

    // GET /snapshots — List Historical Snapshots
    router.get('/snapshots', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const service = getService(req);
            const snapshots = service.listHistoricalSnapshots(tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: snapshots
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'LIST_SNAPSHOTS_ERROR' }
            });
        }
    });

    return router;
}

module.exports = { createAnalyticsRouter };
