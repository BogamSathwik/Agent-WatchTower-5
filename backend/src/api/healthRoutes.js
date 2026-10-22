/**
 * Universal Health REST API Routes
 * Standardized endpoints for system health status, manual checks, history, aggregated metrics, and health configuration.
 * AgentGenPro backend compatible router — strict /api route prefixing only.
 */

const express = require('express');
const { HealthCheckEngine } = require('../health/HealthCheckEngine');
const { HealthAggregator } = require('../health/HealthAggregator');
const { HealthConfig } = require('../health/HealthConfig');
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

const defaultEngine = new HealthCheckEngine();

function createHealthRouter(engine = defaultEngine) {
    const router = express.Router();
    router.use(requireAuth);

    /**
     * GET /api/v1/health/overview & /api/health/overview
     * Get platform-wide health overview.
     */
    router.get(['/api/v1/health/overview', '/api/health/overview'], (req, res) => {
        try {
            const registeredSystems = engine.systemRegistry.getAllSystems();
            const overview = engine.healthStore.getOverview(registeredSystems);
            return res.status(200).json({
                success: true,
                data: overview
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Failed to generate health overview',
                message: error.message
            });
        }
    });

    /**
     * GET /api/v1/health/:systemId & /api/health/:systemId
     * Get current health state and latest measurement for a system.
     */
    router.get(['/api/v1/health/:systemId', '/api/health/:systemId'], (req, res) => {
        try {
            const systemId = req.params.systemId;
            const system = engine.systemRegistry.getSystemInstance(systemId);
            const state = engine.healthStore.getSystemState(system.id);
            const latest = engine.healthStore.getLatestMeasurement(system.id);
            const config = engine.healthStore.getHealthConfig(system.id);

            return res.status(200).json({
                success: true,
                data: {
                    systemId: system.id,
                    name: system.name,
                    version: system.version,
                    healthStatus: state.status,
                    lastChecked: state.lastChecked,
                    consecutiveFailures: state.consecutiveFailures,
                    consecutiveSuccesses: state.consecutiveSuccesses,
                    lastReason: state.lastReason,
                    config,
                    latestMeasurement: latest ? latest.toJSON() : null
                }
            });
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                error: error.message,
                code: error.code || 'HEALTH_FETCH_ERROR'
            });
        }
    });

    /**
     * POST /api/v1/health/:systemId/check & /api/health/:systemId/check
     * Trigger manual health check execution for a system.
     */
    router.post(['/api/v1/health/:systemId/check', '/api/health/:systemId/check'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
        try {
            const result = await engine.checkHealth(req.params.systemId, {
                overrideConfig: req.body
            });
            return res.status(200).json({
                success: true,
                message: `Health check executed for '${req.params.systemId}'`,
                data: result
            });
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/health/:systemId/history & /api/health/:systemId/history
     * Get historical health measurements with filtering.
     */
    router.get(['/api/v1/health/:systemId/history', '/api/health/:systemId/history'], (req, res) => {
        try {
            const { limit, status, startTime, endTime } = req.query;
            const history = engine.healthStore.getHistory(req.params.systemId, {
                limit, status, startTime, endTime
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                count: history.length,
                data: history
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/health/:systemId/metrics & /api/health/:systemId/metrics
     * Get aggregated health metrics over a time window (?window=1h|5m|24h|7d).
     */
    router.get(['/api/v1/health/:systemId/metrics', '/api/health/:systemId/metrics'], (req, res) => {
        try {
            const windowStr = req.query.window || '1h';
            const history = engine.healthStore.getHistory(req.params.systemId, { limit: 1000 });
            const metrics = HealthAggregator.computeMetrics(history, { window: windowStr });
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
     * GET /api/v1/health/:systemId/config & /api/health/:systemId/config
     * Get health check configuration for a system.
     */
    router.get(['/api/v1/health/:systemId/config', '/api/health/:systemId/config'], (req, res) => {
        try {
            const config = engine.healthStore.getHealthConfig(req.params.systemId);
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                data: config
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * PUT /api/v1/health/:systemId/config & /api/health/:systemId/config
     * Update health check configuration for a system (Admin only).
     */
    router.put(['/api/v1/health/:systemId/config', '/api/health/:systemId/config'], requireRole([ROLES.ADMIN]), (req, res) => {
        try {
            const validation = HealthConfig.validate(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid health check configuration',
                    code: 'INVALID_CONFIG',
                    errors: validation.errors
                });
            }

            const updatedConfig = engine.healthStore.setHealthConfig(req.params.systemId, req.body);
            return res.status(200).json({
                success: true,
                message: `Health configuration updated for system '${req.params.systemId}'`,
                data: updatedConfig
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

const mainRouter = createHealthRouter(defaultEngine);
mainRouter.createHealthRouter = createHealthRouter;
mainRouter.defaultEngine = defaultEngine;

module.exports = mainRouter;
