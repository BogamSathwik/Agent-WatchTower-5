/**
 * Operational API Routes
 * Exposes endpoints for platform lifecycle, operational diagnostics, dependency health,
 * safe runtime configuration, and backup & restore management.
 */

const express = require('express');
const { defaultPlatformLifecycleService } = require('../lifecycle/PlatformLifecycleService');
const { defaultDependencyRegistry } = require('../operations/DependencyRegistry');
const { defaultDiagnosticsService } = require('../operations/DiagnosticsService');
const { defaultBackupService } = require('../persistence/BackupService');
const { configurationService } = require('../config/ConfigurationService');
const { defaultPersistenceManager } = require('../persistence/PersistenceManager');
const { auditLogService } = require('../audit/AuditLogService');
const { sseManager } = require('../events/SSEManager');
const { requireRole, ROLES } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/v1/operations/overview
router.get('/api/v1/operations/overview', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), async (req, res, next) => {
    try {
        const lifecycleSummary = defaultPlatformLifecycleService.getSummary();
        const persistenceStatus = defaultPersistenceManager.getStatus();
        const auditStats = auditLogService.getStats();
        const config = configurationService.getConfig();
        const activeSseClients = sseManager.getClientCount();
        const lastDiagnostics = defaultDiagnosticsService.getLastDiagnostics();

        // Agent stats
        let agentService = req.app.get('agentService');
        let agents = [];
        if (agentService && typeof agentService.listAgents === 'function') {
            agents = agentService.listAgents();
        }
        const agentsTotal = agents.length;
        const agentsHealthy = agents.filter(a => (a.healthStatus || 'HEALTHY') === 'HEALTHY').length;
        const agentsDegraded = agents.filter(a => a.healthStatus === 'DEGRADED').length;
        const agentsOffline = agents.filter(a => a.healthStatus === 'UNHEALTHY' || a.healthStatus === 'OFFLINE').length;
        const agentsActive = agents.filter(a => a.lifecycleState === 'ACTIVE').length;
        const agentsDisabled = agents.filter(a => a.lifecycleState === 'INACTIVE' || a.lifecycleState === 'DISABLED').length;
        const agentsRetired = agents.filter(a => a.lifecycleState === 'RETIRED').length;

        // System stats
        let systemRegistry = req.app.get('systemRegistry');
        const registeredSystemsCount = systemRegistry ? systemRegistry.getAllSystems().length : 0;

        // Alerting stats
        let alertingService = req.app.get('alertingService');
        let activeAlertsCount = 0;
        if (alertingService && typeof alertingService.getAlerts === 'function') {
            const alerts = alertingService.getAlerts({ status: 'ACTIVE' });
            activeAlertsCount = Array.isArray(alerts) ? alerts.length : 0;
        }

        // Remediation stats
        let remediationService = req.app.get('remediationService');
        let activeRemediationsCount = 0;
        if (remediationService && typeof remediationService.getHistory === 'function') {
            const history = remediationService.getHistory();
            activeRemediationsCount = Array.isArray(history) ? history.filter(r => r.status === 'RUNNING' || r.status === 'IN_PROGRESS').length : 0;
        }

        res.json({
            success: true,
            overview: {
                lifecycleState: lifecycleSummary.state,
                uptimeSeconds: lifecycleSummary.uptimeSeconds,
                startTime: lifecycleSummary.startTime,
                activeSseClients,
                persistenceMode: persistenceStatus.mode,
                persistenceStatus: persistenceStatus.status,
                auditLogsTotal: auditStats.totalEvents || auditStats.totalLogs || 0,
                environment: config.platform.environment,
                platformVersion: config.platform.version,
                latestDiagnosticsExecutedAt: lastDiagnostics ? lastDiagnostics.executedAt : null,
                productionReadiness: lastDiagnostics ? lastDiagnostics.aggregateStatus : 'PASS',
                agentsTotal,
                agentsHealthy,
                agentsDegraded,
                agentsOffline,
                agentsActive,
                agentsDisabled,
                agentsRetired,
                registeredSystemsCount,
                activeAlertsCount,
                activeRemediationsCount
            }
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/operations/activity
router.get('/api/v1/operations/activity', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : null;

        const activities = [];

        // 1. Audit events
        const auditEvents = auditLogService.listEvents({ limit: limit * 2 });
        for (const evt of auditEvents) {
            if (tenantId && evt.tenantId && evt.tenantId !== tenantId && evt.tenantId !== 'global') {
                continue;
            }
            activities.push({
                id: evt.id || `audit_${evt.timestamp}_${Math.random().toString(36).substring(2, 6)}`,
                timestamp: evt.timestamp,
                type: 'AUDIT',
                eventType: evt.eventType || evt.action || 'AUDIT_LOG',
                severity: evt.severity || (evt.outcome === 'FAILED' ? 'WARN' : 'INFO'),
                relatedAgentId: evt.resourceType === 'agent' ? evt.resourceId : (evt.metadata ? evt.metadata.agentId : null),
                relatedSystemId: evt.resourceType === 'system' ? evt.resourceId : (evt.metadata ? evt.metadata.systemId : null),
                actor: evt.actor || 'system',
                description: `${evt.action || evt.eventType} on ${evt.resourceType}:${evt.resourceId} (${evt.outcome})`,
                metadata: evt.metadata || {}
            });
        }

        // 2. Active Alerts
        let alertingService = req.app.get('alertingService');
        if (alertingService && typeof alertingService.getAlerts === 'function') {
            const alerts = alertingService.getAlerts() || [];
            for (const alert of alerts) {
                activities.push({
                    id: alert.id || `alert_${alert.createdAt}`,
                    timestamp: alert.createdAt || alert.updatedAt || new Date().toISOString(),
                    type: 'ALERT',
                    eventType: 'PLATFORM_ALERT',
                    severity: alert.severity === 'CRITICAL' ? 'CRITICAL' : (alert.severity === 'HIGH' ? 'WARN' : 'INFO'),
                    relatedAgentId: alert.agentId || alert.targetAgentId || null,
                    relatedSystemId: alert.systemId || alert.targetSystemId || null,
                    actor: 'alerting_engine',
                    description: alert.message || alert.title || `Alert triggered: ${alert.ruleName || alert.id}`,
                    metadata: { status: alert.status, ruleId: alert.ruleId }
                });
            }
        }

        // 3. Remediations
        let remediationService = req.app.get('remediationService');
        if (remediationService && typeof remediationService.getHistory === 'function') {
            const rems = remediationService.getHistory() || [];
            for (const rem of rems) {
                activities.push({
                    id: rem.id || `rem_${rem.timestamp}`,
                    timestamp: rem.timestamp || rem.createdAt || new Date().toISOString(),
                    type: 'REMEDIATION',
                    eventType: 'SELF_HEALING_ACTION',
                    severity: rem.status === 'SUCCESS' ? 'INFO' : (rem.status === 'FAILED' ? 'ERROR' : 'WARN'),
                    relatedAgentId: rem.agentId || rem.targetId || null,
                    relatedSystemId: rem.systemId || null,
                    actor: 'remediation_engine',
                    description: `Remediation action '${rem.action || rem.ruleName}' - ${rem.status}`,
                    metadata: { status: rem.status, action: rem.action }
                });
            }
        }

        // Sort descending by timestamp
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const sliced = activities.slice(0, limit);

        res.json({
            success: true,
            activities: sliced,
            totalCount: activities.length
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/operations/lifecycle
router.get('/api/v1/operations/lifecycle', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), (req, res, next) => {
    try {
        const summary = defaultPlatformLifecycleService.getSummary();
        res.json({
            success: true,
            lifecycle: summary
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/operations/diagnostics
router.get('/api/v1/operations/diagnostics', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), async (req, res, next) => {
    try {
        let lastResult = defaultDiagnosticsService.getLastDiagnostics();
        if (!lastResult) {
            lastResult = await defaultDiagnosticsService.runDiagnostics();
        }
        res.json({
            success: true,
            diagnostics: lastResult
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/operations/diagnostics/run
router.post('/api/v1/operations/diagnostics/run', requireRole([ROLES.OPERATOR, ROLES.ADMIN]), async (req, res, next) => {
    try {
        const correlationId = req.correlationId || req.headers['x-correlation-id'];
        const result = await defaultDiagnosticsService.runDiagnostics();
        
        auditLogService.logEvent({
            eventType: 'DIAGNOSTICS_RUN',
            action: 'run_diagnostics',
            actor: req.user ? req.user.username : 'operator',
            role: req.user ? req.user.role : 'operator',
            tenantId: req.tenantContext ? req.tenantContext.tenantId : 'global',
            resourceType: 'operations',
            resourceId: 'diagnostics',
            outcome: 'SUCCESS',
            severity: 'INFO',
            correlationId: correlationId || `corr_diag_${Date.now()}`,
            metadata: { durationMs: result.durationMs }
        });

        res.json({
            success: true,
            diagnostics: result
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/operations/dependencies
router.get('/api/v1/operations/dependencies', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), async (req, res, next) => {
    try {
        const dependencies = await defaultDependencyRegistry.checkAllDependencies();
        res.json({
            success: true,
            dependencies
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/operations/config
router.get('/api/v1/operations/config', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), (req, res, next) => {
    try {
        const cfg = configurationService.getConfig();
        res.json({
            success: true,
            config: {
                ...cfg,
                lifecycleState: defaultPlatformLifecycleService.getCurrentState(),
                currentTenant: req.tenantContext ? req.tenantContext.tenantId : 'global'
            }
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/operations/config/validate
router.get('/api/v1/operations/config/validate', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), (req, res, next) => {
    try {
        const cfg = configurationService.getConfig();
        const warnings = [];
        const errors = [];

        if (!cfg.platform || !cfg.platform.version) {
            errors.push('Platform version is missing from configuration');
        }
        if (cfg.persistence && cfg.persistence.mode !== 'memory' && cfg.persistence.mode !== 'file') {
            warnings.push(`Unusual persistence mode '${cfg.persistence.mode}'`);
        }

        res.json({
            success: true,
            validation: {
                valid: errors.length === 0,
                errors,
                warnings,
                validatedAt: new Date().toISOString()
            }
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/operations/backups
router.get('/api/v1/operations/backups', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), (req, res, next) => {
    try {
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : 'global';
        const backups = defaultBackupService.listBackups(tenantId);
        res.json({
            success: true,
            backups
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/operations/backups
router.post('/api/v1/operations/backups', requireRole([ROLES.ADMIN]), async (req, res, next) => {
    try {
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : 'global';
        const createdBy = req.user ? req.user.username : 'admin';
        const correlationId = req.correlationId || req.headers['x-correlation-id'];

        const backup = await defaultBackupService.createBackup(tenantId, createdBy, correlationId);
        res.status(201).json({
            success: true,
            backup
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/v1/operations/backups/:id
router.get('/api/v1/operations/backups/:id', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), (req, res, next) => {
    try {
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : 'global';
        const backup = defaultBackupService.getBackup(req.params.id, tenantId);
        res.json({
            success: true,
            backup
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/operations/backups/:id/validate
router.post('/api/v1/operations/backups/:id/validate', requireRole([ROLES.OPERATOR, ROLES.ADMIN]), (req, res, next) => {
    try {
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : 'global';
        const correlationId = req.correlationId || req.headers['x-correlation-id'];
        const validation = defaultBackupService.validateBackup(req.params.id, tenantId, correlationId);
        res.json({
            success: true,
            validation
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/v1/operations/backups/:id/restore
router.post('/api/v1/operations/backups/:id/restore', requireRole([ROLES.ADMIN]), async (req, res, next) => {
    try {
        const tenantId = req.tenantContext ? req.tenantContext.tenantId : 'global';
        const restoredBy = req.user ? req.user.username : 'admin';
        const correlationId = req.correlationId || req.headers['x-correlation-id'];

        const result = await defaultBackupService.restoreBackup(req.params.id, req.app, tenantId, restoredBy, correlationId);
        res.json({
            success: true,
            restore: result
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
