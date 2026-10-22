/**
 * Diagnostics Service
 * Aggregates runtime statistics, memory, uptime, SSE connections, persistence status, audit stats,
 * configuration, and dependency health without leaking credentials.
 */

const os = require('os');
const { defaultPlatformLifecycleService } = require('../lifecycle/PlatformLifecycleService');
const { defaultDependencyRegistry } = require('./DependencyRegistry');
const { defaultPersistenceManager } = require('../persistence/PersistenceManager');
const { auditLogService } = require('../audit/AuditLogService');
const { telemetryService } = require('../telemetry/TelemetryService');
const { configurationService } = require('../config/ConfigurationService');
const { sseManager } = require('../events/SSEManager');

class DiagnosticsService {
    constructor(options = {}) {
        this.lifecycleService = options.lifecycleService || defaultPlatformLifecycleService;
        this.dependencyRegistry = options.dependencyRegistry || defaultDependencyRegistry;
        this.persistenceManager = options.persistenceManager || defaultPersistenceManager;
        this.auditLogService = options.auditLogService || auditLogService;
        this.telemetryService = options.telemetryService || telemetryService;
        this.configurationService = options.configurationService || configurationService;
        this.sseManager = options.sseManager || sseManager;
        this.lastDiagnosticsResult = null;
    }

    async runDiagnostics() {
        const startTime = Date.now();

        const memory = process.memoryUsage();
        const uptime = process.uptime();
        const dependencies = await this.dependencyRegistry.checkAllDependencies();

        const persistenceStatus = this.persistenceManager.getStatus();
        const auditStats = typeof this.auditLogService.getStats === 'function' ? this.auditLogService.getStats() : {};
        const telemetryStats = typeof this.telemetryService.getOverview === 'function' ? this.telemetryService.getOverview() : {};
        const safeConfig = this.configurationService.getConfig();
        const lifecycleState = this.lifecycleService.getCurrentState();
        const activeSseClients = this.sseManager.getClientCount();

        const runtimeInfo = {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            pid: process.pid,
            uptimeSeconds: Math.floor(uptime),
            memoryUsageMB: {
                rss: Math.round(memory.rss / (1024 * 1024)),
                heapTotal: Math.round(memory.heapTotal / (1024 * 1024)),
                heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
                external: Math.round(memory.external / (1024 * 1024))
            },
            cpuCount: os.cpus().length
        };

        const result = {
            executedAt: new Date().toISOString(),
            durationMs: Date.now() - startTime,
            lifecycleState,
            runtime: runtimeInfo,
            sseClients: activeSseClients,
            requestStats: {
                totalRequests: telemetryStats.httpRequestsTotal || 0,
                errorCount: telemetryStats.httpErrorsTotal || 0,
                activeConnections: telemetryStats.activeConnections || 0
            },
            persistenceStatus,
            auditStats,
            configStatus: {
                environment: safeConfig.platform.environment,
                persistenceMode: safeConfig.persistence.mode,
                telemetryEnabled: safeConfig.telemetry.enabled
            },
            dependencies
        };

        this.lastDiagnosticsResult = result;

        if (this.sseManager) {
            this.sseManager.broadcast('DIAGNOSTICS_COMPLETED', {
                executedAt: result.executedAt,
                lifecycleState,
                durationMs: result.durationMs
            });
        }

        return result;
    }

    getLastDiagnostics() {
        return this.lastDiagnosticsResult;
    }
}

const defaultDiagnosticsService = new DiagnosticsService();

module.exports = {
    DiagnosticsService,
    defaultDiagnosticsService
};
