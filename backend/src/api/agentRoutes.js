/**
 * Universal Agent REST API Router
 * AgentGenPro backend compliant sub-router — explicit /api/... route paths.
 * Purely domain-agnostic.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');
const { auditLogService } = require('../audit/AuditLogService');

router.use(requireAuth);

function getService(req) {
    const service = req.app.get('agentService');
    if (!service) {
        throw new Error('AgentService is not mounted on express application context');
    }
    return service;
}

// 1. POST /api/v1/agents/register
router.post(['/api/v1/agents/register', '/api/agents/register'], requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const agent = service.registerAgent(req.body);
        res.status(201).json({ success: true, data: agent.sanitize() });
    } catch (err) {
        // Always return a JSON body with a non-empty reason: a missing
        // message here is what surfaces upstream as a generic failure.
        const reason = (err && err.message) ? String(err.message) : 'Agent registration failed';
        const status = (err && err.statusCode) || (reason.includes('already exists') ? 409 : 400);
        res.status(status).json({ success: false, error: { message: reason, code: (err && err.code) || 'REGISTRATION_FAILED', errors: (err && err.errors) || [] } });
    }
});

// 2. GET /api/v1/agents
router.get(['/api/v1/agents', '/api/agents'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const filters = {
            category: req.query.category,
            lifecycleState: req.query.lifecycleState,
            search: req.query.search
        };
        const agents = service.listAgents(filters).map(a => a.sanitize());
        res.json({ success: true, data: agents });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3. GET /api/v1/agents/health/check-all (must be registered before :id route)
router.post(['/api/v1/agents/health/check-all', '/api/agents/health/check-all'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const result = await service.checkAllHealth();
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3b. GET /api/v1/agents/:id/summary (Human-readable Operational Summary)
router.get(['/api/v1/agents/:id/summary', '/api/agents/:id/summary'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const tenantId = req.headers['x-tenant-id'] || req.tenantId || 'default-tenant';
        const agentId = req.params.id;
        const service = getService(req);
        const monitoringService = req.app.get('agentMonitoringService');
        const summaryService = req.app.get('operationalSummaryService');

        let agentData = { id: agentId, agentId: agentId };
        if (service && typeof service.getAgent === 'function') {
            const ag = service.getAgent(agentId);
            if (ag) {
                const sanitized = ag.sanitize ? ag.sanitize() : ag;
                agentData = { ...agentData, ...sanitized };
            }
        }

        let monitoringData = {};
        if (monitoringService && typeof monitoringService.getAgentMonitoring === 'function') {
            try {
                monitoringData = await monitoringService.getAgentMonitoring(agentId, tenantId) || {};
            } catch (e) {}
        }

        const OperationalSummaryService = require('../intelligence/OperationalSummaryService');
        const activeSummaryService = summaryService || new OperationalSummaryService();
        const summary = activeSummaryService.generateAgentSummary(agentData, monitoringData);

        res.json({
            success: true,
            data: summary
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: { message: err.message, code: 'SUMMARY_ERROR' }
        });
    }
});

// 4. GET /api/v1/agents/:id
router.get(['/api/v1/agents/:id', '/api/agents/:id'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const agent = service.getAgent(req.params.id);
        if (!agent) {
            return res.status(404).json({ success: false, error: { message: `Agent '${req.params.id}' not found`, code: 'AGENT_NOT_FOUND' } });
        }
        res.json({ success: true, data: agent.sanitize() });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 5. PATCH /api/v1/agents/:id
router.patch(['/api/v1/agents/:id', '/api/agents/:id'], requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const updated = service.updateAgent(req.params.id, req.body);
        res.json({ success: true, data: updated.sanitize() });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message, code: err.code || 'UPDATE_FAILED', errors: err.errors || [] } });
    }
});

// 6. POST /api/v1/agents/:id/activate
router.post(['/api/v1/agents/:id/activate', '/api/agents/:id/activate'], requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const activated = service.activateAgent(req.params.id);
        res.json({ success: true, data: activated.sanitize() });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 7. POST /api/v1/agents/:id/deactivate
router.post(['/api/v1/agents/:id/deactivate', '/api/agents/:id/deactivate'], requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const deactivated = service.deactivateAgent(req.params.id);
        res.json({ success: true, data: deactivated.sanitize() });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 8. POST /api/v1/agents/:id/retire
router.post(['/api/v1/agents/:id/retire', '/api/agents/:id/retire'], requireRole([ROLES.ADMIN]), (req, res) => {
    try {
        const service = getService(req);
        const retired = service.retireAgent(req.params.id);
        res.json({ success: true, data: retired.sanitize() });
    } catch (err) {
        const status = err.statusCode || 400;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 9. GET /api/v1/agents/:id/capabilities
router.get(['/api/v1/agents/:id/capabilities', '/api/agents/:id/capabilities'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const discovery = service.discoverCapabilities(req.params.id);
        res.json({ success: true, data: discovery });
    } catch (err) {
        const status = err.statusCode || 500;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 10. POST /api/v1/agents/:id/discover-capabilities
router.post(['/api/v1/agents/:id/discover-capabilities', '/api/agents/:id/discover-capabilities'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const discovery = service.discoverCapabilities(req.params.id);
        res.json({ success: true, data: discovery });
    } catch (err) {
        const status = err.statusCode || 500;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 11. GET /api/v1/agents/:id/status
router.get(['/api/v1/agents/:id/status', '/api/agents/:id/status'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const status = service.getAgentStatus(req.params.id);
        res.json({ success: true, data: status });
    } catch (err) {
        const status = err.statusCode || 500;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 12. GET /api/v1/agents/:id/metadata
router.get(['/api/v1/agents/:id/metadata', '/api/agents/:id/metadata'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const agent = service.getAgent(req.params.id);
        if (!agent) {
            return res.status(404).json({ success: false, error: { message: `Agent '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: { agentId: agent.id, metadata: agent.metadata } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 13. POST /api/v1/agents/:id/refresh-metadata
router.post(['/api/v1/agents/:id/refresh-metadata', '/api/agents/:id/refresh-metadata'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const updated = service.refreshMetadata(req.params.id, req.body || {});
        res.json({ success: true, data: updated.sanitize() });
    } catch (err) {
        const status = err.statusCode || 500;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 14. POST /api/v1/agents/:id/health
router.post(['/api/v1/agents/:id/health', '/api/agents/:id/health'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const health = await service.checkHealth(req.params.id);
        res.json({ success: true, data: health });
    } catch (err) {
        const status = err.statusCode || 500;
        res.status(status).json({ success: false, error: { message: err.message } });
    }
});

// 15. POST /api/v1/agents/:id/execute
router.post(['/api/v1/agents/:id/execute', '/api/agents/:id/execute'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const result = await service.executeCapability(req.params.id, req.body || {});
        if (!result.success && result.error && result.error.code === 'CAPABILITY_NOT_SUPPORTED') {
            return res.status(400).json({ success: false, error: result.error });
        }
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 16. GET /api/v1/agents/:id/operations
router.get(['/api/v1/agents/:id/operations', '/api/agents/:id/operations'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const service = getService(req);
        const agent = service.getAgent(req.params.id);
        if (!agent) {
            return res.status(404).json({
                success: false,
                error: { message: `Agent '${req.params.id}' not found`, code: 'AGENT_NOT_FOUND' }
            });
        }

        // Capabilities & status
        let capabilities = [];
        try {
            capabilities = service.discoverCapabilities(agent.id);
        } catch (e) {
            capabilities = agent.capabilities || [];
        }

        // Health status
        let healthData = {
            currentHealth: agent.healthStatus || 'HEALTHY',
            lastHealthCheck: agent.lastHealthCheck || agent.updatedAt || agent.createdAt,
            availability: agent.lifecycleState === 'ACTIVE' ? 100 : (agent.lifecycleState === 'INACTIVE' ? 0 : 50),
            recentTransitions: agent.healthHistory || []
        };

        // Activity for this agent
        const auditEvents = auditLogService.listEvents({ limit: 100 })
            .filter(e => (e.resourceId === agent.id || (e.metadata && e.metadata.agentId === agent.id)));

        let alertingService = req.app.get('alertingService');
        let agentAlerts = [];
        if (alertingService && typeof alertingService.getAlerts === 'function') {
            agentAlerts = (alertingService.getAlerts() || []).filter(a => a.agentId === agent.id || a.targetAgentId === agent.id);
        }

        let remediationService = req.app.get('remediationService');
        let agentRemediations = [];
        if (remediationService && typeof remediationService.getHistory === 'function') {
            agentRemediations = (remediationService.getHistory() || []).filter(r => r.agentId === agent.id || r.targetId === agent.id);
        }

        const activity = [];
        auditEvents.forEach(evt => {
            activity.push({
                id: evt.id,
                timestamp: evt.timestamp,
                type: 'AUDIT',
                severity: evt.severity || 'INFO',
                description: `${evt.action || evt.eventType} (${evt.outcome})`,
                actor: evt.actor
            });
        });
        agentAlerts.forEach(alt => {
            activity.push({
                id: alt.id,
                timestamp: alt.createdAt || alt.updatedAt,
                type: 'ALERT',
                severity: alt.severity,
                description: alt.message || alt.title,
                actor: 'alerting_engine'
            });
        });
        agentRemediations.forEach(rem => {
            activity.push({
                id: rem.id,
                timestamp: rem.timestamp,
                type: 'REMEDIATION',
                severity: rem.status === 'SUCCESS' ? 'INFO' : 'WARN',
                description: `Remediation: ${rem.action} - ${rem.status}`,
                actor: 'remediation_engine'
            });
        });
        activity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Safe Non-Secret Config
        const safeMetadata = { ...(agent.metadata || {}) };
        delete safeMetadata.apiKey;
        delete safeMetadata.api_key;
        delete safeMetadata.token;
        delete safeMetadata.password;
        delete safeMetadata.secret;
        delete safeMetadata.privateKey;
        delete safeMetadata.bearerToken;

        // Role-allowed actions
        const userRole = (req.userRole || req.headers['x-user-role'] || (req.user ? req.user.role : ROLES.VIEWER)).toLowerCase();
        const allowedActions = [];
        if ([ROLES.ADMIN, ROLES.OPERATOR].includes(userRole)) {
            allowedActions.push('health_check', 'refresh_metadata', 'execute');
        }
        if (userRole === ROLES.ADMIN) {
            allowedActions.push('activate', 'deactivate', 'retire');
        }

        // Lineage / Relationships
        const relationships = {
            agentId: agent.id,
            runner: agent.runner || agent.runnerEndpoint || 'default-runner',
            systemId: agent.systemId || agent.targetSystemId || (agent.metadata && agent.metadata.systemId) || 'system-core',
            capabilitiesCount: Array.isArray(capabilities.capabilities) ? capabilities.capabilities.length : (Array.isArray(capabilities) ? capabilities.length : 0),
            healthStatus: agent.healthStatus || 'HEALTHY'
        };

        res.json({
            success: true,
            data: {
                identity: {
                    id: agent.id,
                    name: agent.name,
                    category: agent.category,
                    version: agent.version,
                    contractVersion: agent.contractVersion || '1.0.0',
                    lifecycleState: agent.lifecycleState,
                    createdAt: agent.createdAt,
                    updatedAt: agent.updatedAt
                },
                runtime: {
                    runner: agent.runner || 'default-runner',
                    endpoint: agent.endpoint || agent.runnerEndpoint || '/api/v1/agents/execute',
                    runtimeState: agent.lifecycleState === 'ACTIVE' ? 'RUNNING' : agent.lifecycleState,
                    lastExecution: agent.lastExecutionAt || agent.updatedAt || null,
                    activeExecutions: agent.activeExecutions || 0
                },
                capabilities,
                health: healthData,
                activity: activity.slice(0, 20),
                configuration: safeMetadata,
                allowedActions,
                relationships
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

module.exports = router;
