/**
 * Universal Usage Analytics REST API Routes
 * Standardized endpoints for platform usage monitoring, recency, frequency, trends, and retention configuration.
 * AgentGenPro backend compatible router — strict /api route prefixing only.
 */

const express = require('express');
const { UsageEventCollector } = require('../usage/UsageEventCollector');
const { UsageAggregator } = require('../usage/UsageAggregator');
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

const defaultCollector = new UsageEventCollector();

function createUsageRouter(collector = defaultCollector) {
    const router = express.Router();
    router.use(requireAuth);

    const store = collector.usageStore;
    const aggregator = new UsageAggregator(store);

    /**
     * GET /api/v1/usage/overview & /api/usage/overview
     * Platform-wide usage analytics overview.
     */
    router.get(['/api/v1/usage/overview', '/api/usage/overview'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({ window: req.query.window || '24h' });
            return res.status(200).json({
                success: true,
                data: metrics
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/usage/events & /api/usage/events
     * List all platform usage events with filtering.
     */
    router.get(['/api/v1/usage/events', '/api/usage/events'], (req, res) => {
        try {
            const { systemId, capability, operation, category, source, status, startTime, endTime, limit } = req.query;
            const events = store.listEvents({
                systemId, capability, operation, category, source, status, startTime, endTime, limit
            });
            return res.status(200).json({
                success: true,
                count: events.length,
                data: events.map(e => e.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/usage/config & /api/usage/config
     * Get current retention policy settings.
     */
    router.get(['/api/v1/usage/config', '/api/usage/config'], (req, res) => {
        try {
            return res.status(200).json({
                success: true,
                data: store.getRetentionConfig()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * PUT /api/v1/usage/config & /api/usage/config
     * Update usage event retention policy (Admin only).
     */
    router.put(['/api/v1/usage/config', '/api/usage/config'], requireRole([ROLES.ADMIN]), (req, res) => {
        try {
            const updated = store.setRetentionConfig(req.body);
            return res.status(200).json({
                success: true,
                message: 'Retention policy updated',
                data: updated
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/usage/:systemId & /api/usage/:systemId
     * System-specific usage overview.
     */
    router.get(['/api/v1/usage/:systemId', '/api/usage/:systemId'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({
                systemId: req.params.systemId,
                window: req.query.window || '24h'
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                data: metrics
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/usage/:systemId/events & /api/usage/:systemId/events
     * Filtered usage events for a specific system.
     */
    router.get(['/api/v1/usage/:systemId/events', '/api/usage/:systemId/events'], (req, res) => {
        try {
            const { capability, operation, category, source, status, startTime, endTime, limit } = req.query;
            const events = store.getEventsBySystem(req.params.systemId, {
                capability, operation, category, source, status, startTime, endTime, limit
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                count: events.length,
                data: events.map(e => e.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/usage/:systemId/metrics & /api/usage/:systemId/metrics
     * Aggregated metrics for a system over time window.
     */
    router.get(['/api/v1/usage/:systemId/metrics', '/api/usage/:systemId/metrics'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({
                systemId: req.params.systemId,
                window: req.query.window || '24h'
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                data: metrics
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/usage/:systemId/trend & /api/usage/:systemId/trend
     * Time-series trend buckets for a system.
     */
    router.get(['/api/v1/usage/:systemId/trend', '/api/usage/:systemId/trend'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({
                systemId: req.params.systemId,
                window: req.query.window || '24h'
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                data: metrics.trend
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/usage/:systemId/capabilities & /api/usage/:systemId/capabilities
     * Capability usage breakdown.
     */
    router.get(['/api/v1/usage/:systemId/capabilities', '/api/usage/:systemId/capabilities'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({
                systemId: req.params.systemId,
                window: req.query.window || '24h'
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                count: metrics.uniqueCapabilitiesCount,
                data: metrics.capabilities
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/usage/:systemId/operations & /api/usage/:systemId/operations
     * Operation usage breakdown.
     */
    router.get(['/api/v1/usage/:systemId/operations', '/api/usage/:systemId/operations'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({
                systemId: req.params.systemId,
                window: req.query.window || '24h'
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                count: metrics.uniqueOperationsCount,
                data: metrics.operations
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/usage/:systemId/activity & /api/usage/:systemId/activity
     * Activity category and source breakdown.
     */
    router.get(['/api/v1/usage/:systemId/activity', '/api/usage/:systemId/activity'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({
                systemId: req.params.systemId,
                window: req.query.window || '24h'
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                categories: metrics.categories,
                sources: metrics.sources
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
}

const mainRouter = createUsageRouter(defaultCollector);
mainRouter.createUsageRouter = createUsageRouter;
mainRouter.defaultCollector = defaultCollector;

module.exports = mainRouter;
