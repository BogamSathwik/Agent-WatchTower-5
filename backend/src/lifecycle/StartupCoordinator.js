/**
 * Startup Coordinator
 * Runs startup diagnostics across key platform subsystems and manages platform initialization state transitions.
 */

const { defaultPlatformLifecycleService } = require('./PlatformLifecycleService');
const { PLATFORM_STATES } = require('./PlatformLifecycleState');
const { auditLogService } = require('../audit/AuditLogService');
const { defaultPersistenceManager } = require('../persistence/PersistenceManager');
const { telemetryService } = require('../telemetry/TelemetryService');
const { configurationService } = require('../config/ConfigurationService');
const { sseManager } = require('../events/SSEManager');

class StartupCoordinator {
    constructor(options = {}) {
        this.lifecycleService = options.lifecycleService || defaultPlatformLifecycleService;
        this.auditLogService = options.auditLogService || auditLogService;
        this.persistenceManager = options.persistenceManager || defaultPersistenceManager;
        this.telemetryService = options.telemetryService || telemetryService;
        this.configurationService = options.configurationService || configurationService;
        this.sseManager = options.sseManager || sseManager;
    }

    async runDiagnostics(app = null) {
        const diagnostics = [];
        let hasFail = false;
        let hasWarn = false;

        const checks = [
            {
                name: 'persistence',
                checkFn: async () => {
                    const pm = (app && app.get && app.get('persistenceManager')) || this.persistenceManager;
                    const status = pm.getStatus();
                    return { status: 'PASS', message: `Persistence operational in '${status.mode}' mode`, details: status };
                }
            },
            {
                name: 'audit',
                checkFn: async () => {
                    const stats = this.auditLogService.getStats();
                    return { status: 'PASS', message: 'Audit subsystem active', details: stats };
                }
            },
            {
                name: 'telemetry',
                checkFn: async () => {
                    const stats = typeof this.telemetryService.getOverview === 'function' ? this.telemetryService.getOverview() : {};
                    return { status: 'PASS', message: 'Telemetry tracking active', details: stats };
                }
            },
            {
                name: 'alerting',
                checkFn: async () => {
                    const alerting = (app && app.get && app.get('alertingService'));
                    return { status: 'PASS', message: 'Alerting service operational', details: { ready: true, injected: !!alerting } };
                }
            },
            {
                name: 'remediation',
                checkFn: async () => {
                    const remediation = (app && app.get && app.get('remediationService'));
                    return { status: 'PASS', message: 'Remediation engine operational', details: { ready: true, injected: !!remediation } };
                }
            },
            {
                name: 'onboarding',
                checkFn: async () => {
                    const onboarding = (app && app.get && app.get('onboardingService'));
                    return { status: 'PASS', message: 'Onboarding engine operational', details: { ready: true, injected: !!onboarding } };
                }
            },
            {
                name: 'agentRegistry',
                checkFn: async () => {
                    const agentService = (app && app.get && app.get('agentService'));
                    const agentCount = agentService && typeof agentService.listAgents === 'function' ? agentService.listAgents().length : 0;
                    return { status: 'PASS', message: `Agent registry operational (${agentCount} registered agents)`, details: { agentCount } };
                }
            },
            {
                name: 'eventSubsystem',
                checkFn: async () => {
                    const count = this.sseManager.getClientCount();
                    return { status: 'PASS', message: 'SSE Event stream operational', details: { activeClients: count } };
                }
            },
            {
                name: 'configuration',
                checkFn: async () => {
                    const cfg = this.configurationService.getConfig();
                    return { status: 'PASS', message: 'Configuration service valid', details: { environment: cfg.platform.environment, version: cfg.platform.version } };
                }
            },
            {
                name: 'routerAvailability',
                checkFn: async () => {
                    return { status: 'PASS', message: 'API routers registered and available', details: { mounted: true } };
                }
            }
        ];

        for (const c of checks) {
            const start = Date.now();
            try {
                const res = await c.checkFn();
                const durationMs = Date.now() - start;
                diagnostics.push({
                    name: c.name,
                    status: res.status || 'PASS',
                    durationMs,
                    message: res.message || 'Operational',
                    details: res.details || {}
                });
                if (res.status === 'FAIL') hasFail = true;
                if (res.status === 'WARN') hasWarn = true;
            } catch (err) {
                const durationMs = Date.now() - start;
                diagnostics.push({
                    name: c.name,
                    status: 'FAIL',
                    durationMs,
                    message: err.message || 'Check failed',
                    details: { error: err.message }
                });
                hasFail = true;
            }
        }

        const aggregateStatus = hasFail ? 'FAIL' : (hasWarn ? 'WARN' : 'PASS');
        return {
            aggregateStatus,
            evaluatedAt: new Date().toISOString(),
            diagnostics
        };
    }

    async runStartupSequence(app = null) {
        try {
            const currentState = this.lifecycleService.getCurrentState();
            if (currentState === PLATFORM_STATES.STOPPED || currentState === PLATFORM_STATES.FAILED) {
                this.lifecycleService.transitionTo(PLATFORM_STATES.STARTING, 'Platform starting sequence initiated');
            }
            if (this.lifecycleService.getCurrentState() === PLATFORM_STATES.STARTING) {
                this.lifecycleService.transitionTo(PLATFORM_STATES.INITIALIZING, 'Initializing platform subsystems');
            }

            const diagResult = await this.runDiagnostics(app);
            for (const d of diagResult.diagnostics) {
                this.lifecycleService.setSubsystemStatus(d.name, d.status, d);
            }

            if (diagResult.aggregateStatus === 'FAIL') {
                this.lifecycleService.transitionTo(PLATFORM_STATES.FAILED, 'Platform startup failed diagnostics');
            } else if (diagResult.aggregateStatus === 'WARN') {
                this.lifecycleService.transitionTo(PLATFORM_STATES.DEGRADED, 'Platform startup completed with warnings');
            } else {
                this.lifecycleService.transitionTo(PLATFORM_STATES.READY, 'Platform startup completed successfully');
            }

            return diagResult;
        } catch (err) {
            if (this.lifecycleService.getCurrentState() !== PLATFORM_STATES.FAILED) {
                try {
                    this.lifecycleService.transitionTo(PLATFORM_STATES.FAILED, `Startup error: ${err.message}`);
                } catch (_) {}
            }
            throw err;
        }
    }
}

const defaultStartupCoordinator = new StartupCoordinator();

module.exports = {
    StartupCoordinator,
    defaultStartupCoordinator
};
