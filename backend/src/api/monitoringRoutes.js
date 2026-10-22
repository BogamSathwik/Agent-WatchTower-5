/**
 * Phase 17 — Agent Monitoring REST API Routes
 * AgentGenPro Compliant Router for End-to-End Agent Monitoring & Observability.
 */

const express = require('express');

function createMonitoringRouter(monitoringService) {
    const router = express.Router();

    const getTenantId = (req) => req.headers['x-tenant-id'] || req.tenantId || 'default-tenant';
    const getCorrelationId = (req) => req.headers['x-correlation-id'] || req.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // GET /api/v1/monitoring/agents — List monitored agents
    router.get('/agents', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agents = await monitoringService.getMonitoredAgents(tenantId);
            res.json({
                success: true,
                data: agents
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'MONITORING_ERROR' }
            });
        }
    });

    // POST /api/v1/monitoring/check-all — Check all monitored agents
    router.post('/check-all', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const results = await monitoringService.checkAllAgents(tenantId);
            res.json({
                success: true,
                data: results
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'CHECK_ALL_ERROR' }
            });
        }
    });

    // GET /api/v1/monitoring/agents/:id — Get detailed monitoring state for an agent
    router.get('/agents/:id', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const details = await monitoringService.getAgentMonitoring(agentId, tenantId);
            res.json({
                success: true,
                data: details
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'AGENT_MONITORING_NOT_FOUND' }
            });
        }
    });

    // GET /api/v1/monitoring/agents/:id/status — Get agent current monitoring status
    router.get('/agents/:id/status', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const status = monitoringService.store.getStatus(agentId, tenantId);
            res.json({
                success: true,
                data: status
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'AGENT_STATUS_NOT_FOUND' }
            });
        }
    });

    // POST /api/v1/monitoring/agents/:id/start — Start continuous monitoring
    router.post('/agents/:id/start', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const status = await monitoringService.startMonitoring(agentId, tenantId);
            res.json({
                success: true,
                data: status
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'START_MONITORING_ERROR' }
            });
        }
    });

    // POST /api/v1/monitoring/agents/:id/stop — Stop continuous monitoring
    router.post('/agents/:id/stop', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const status = await monitoringService.stopMonitoring(agentId, tenantId);
            res.json({
                success: true,
                data: status
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'STOP_MONITORING_ERROR' }
            });
        }
    });

    // POST /api/v1/monitoring/agents/:id/check — Trigger immediate health/capability check
    router.post('/agents/:id/check', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const correlationId = getCorrelationId(req);
            const agentId = req.params.id;
            const status = await monitoringService.checkAgent(agentId, tenantId, { correlationId });
            res.json({
                success: true,
                data: status
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'CHECK_AGENT_ERROR' }
            });
        }
    });

    // POST /api/v1/monitoring/agents/:id/test-execution — Trigger safe test execution
    router.post('/agents/:id/test-execution', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const correlationId = getCorrelationId(req);
            const agentId = req.params.id;
            const payload = req.body || {};
            payload.correlationId = correlationId;

            const result = await monitoringService.performSafeExecutionCheck(agentId, tenantId, payload);
            res.json({
                success: result.success,
                data: result
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'TEST_EXECUTION_ERROR' }
            });
        }
    });

    // PUT /api/v1/monitoring/agents/:id/config — Update monitoring configuration
    router.put('/agents/:id/config', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const configData = req.body || {};
            const updated = await monitoringService.updateConfig(agentId, configData, tenantId);
            res.json({
                success: true,
                data: updated
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'CONFIG_UPDATE_ERROR' }
            });
        }
    });

    // GET /api/v1/monitoring/agents/:id/history — Get historical monitoring data for time-range (1h, 24h, 7d, 30d)
    router.get('/agents/:id/history', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const range = req.query.range || '24h';
            const history = monitoringService.store.getAgentHistoryByRange(agentId, range, tenantId);
            res.json({
                success: true,
                data: history
            });
        } catch (err) {
            const statusCode = err.statusCode || 500;
            res.status(statusCode).json({
                success: false,
                error: { message: err.message, code: 'MONITORING_HISTORY_ERROR' }
            });
        }
    });

    // GET /api/v1/monitoring/agents/:id/performance — Get historical response time performance & degradation metrics
    router.get('/agents/:id/performance', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const range = req.query.range || '24h';
            const perf = monitoringService.store.getAgentPerformance(agentId, range, tenantId);
            res.json({
                success: true,
                data: perf
            });
        } catch (err) {
            const statusCode = err.statusCode || 500;
            res.status(statusCode).json({
                success: false,
                error: { message: err.message, code: 'PERFORMANCE_METRICS_ERROR' }
            });
        }
    });

    // GET /api/v1/monitoring/history/overview — Get platform-wide historical monitoring overview
    router.get('/history/overview', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const overview = monitoringService.store.getGlobalHistoryOverview(tenantId);
            res.json({
                success: true,
                data: overview
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'GLOBAL_HISTORY_OVERVIEW_ERROR' }
            });
        }
    });

    // POST /api/v1/monitoring/agents/:id/control/mode — Proxy test agent simulation mode
    router.post('/agents/:id/control/mode', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const agentId = req.params.id;
            const controlData = req.body || {};
            const result = await monitoringService.proxyControlMode(agentId, tenantId, controlData);
            res.json({
                success: result.success,
                data: result
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { message: err.message, code: 'CONTROL_MODE_ERROR' }
            });
        }
    });

    return router;
}

module.exports = {
    createMonitoringRouter
};
