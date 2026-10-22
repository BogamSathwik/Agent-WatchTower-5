/**
 * RuntimeService
 * Unified facade orchestrating live operational runtime management, cross-engine integrations
 * (Health, Alerting, Remediation, Orchestration), session tracking, and capability execution.
 */

const RuntimeStore = require('./RuntimeStore');
const RuntimeExecutor = require('./RuntimeExecutor');
const { RUNTIME_COMMANDS, RUNTIME_STATES } = require('./RuntimeStates');
const RuntimeSession = require('./RuntimeSession');

class RuntimeService {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.agentRegistry = options.agentRegistry || null;
        this.executionService = options.executionService || null;
        this.healthEngine = options.healthEngine || null;
        this.alertingService = options.alertingService || null;
        this.remediationService = options.remediationService || null;
        this.orchestrationService = options.orchestrationService || null;

        this.store = options.runtimeStore || new RuntimeStore();
        this.executor = new RuntimeExecutor({
            systemRegistry: this.systemRegistry,
            executionService: this.executionService,
            runtimeStore: this.store
        });
    }

    /**
     * Get platform-wide runtime overview metrics & registered system states.
     */
    getOverview() {
        // Sync registered systems from systemRegistry
        if (this.systemRegistry && typeof this.systemRegistry.getAllSystems === 'function') {
            const allSystems = this.systemRegistry.getAllSystems();
            for (const sys of allSystems) {
                this.store.getOrCreateRuntime(sys.id, sys);
            }
        }

        const metrics = this.store.getOverviewMetrics();
        const runtimes = this.store.getAllRuntimes();

        return {
            success: true,
            metrics,
            runtimes,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get list of runtime managed systems.
     */
    listSystems(filter = {}) {
        if (this.systemRegistry && typeof this.systemRegistry.getAllSystems === 'function') {
            const allSystems = this.systemRegistry.getAllSystems();
            for (const sys of allSystems) {
                this.store.getOrCreateRuntime(sys.id, sys);
            }
        }

        let runtimes = this.store.getAllRuntimes();
        if (filter.state) {
            runtimes = runtimes.filter(r => r.state === filter.state);
        }
        if (filter.category) {
            runtimes = runtimes.filter(r => r.category === filter.category);
        }

        return runtimes;
    }

    /**
     * Get runtime state & profile for a specific system.
     */
    getSystemRuntime(systemId) {
        if (!systemId) return null;
        const id = String(systemId).trim();
        let sysObj = null;

        if (this.systemRegistry && typeof this.systemRegistry.getSystem === 'function') {
            sysObj = this.systemRegistry.getSystem(id);
        }

        const runtime = this.store.getOrCreateRuntime(id, sysObj || {});
        
        // Dynamic health sync
        if (this.healthEngine && typeof this.healthEngine.healthStore !== 'undefined') {
            const lastEval = this.healthEngine.healthStore.getLatestReport ? this.healthEngine.healthStore.getLatestReport(id) : null;
            if (lastEval) {
                runtime.healthStatus = lastEval.status || 'UNKNOWN';
            }
        }

        return runtime.toJSON();
    }

    /**
     * Execute operational command against a system.
     */
    async executeCommand(command, systemId, options = {}) {
        const id = String(systemId).trim();
        const res = await this.executor.executeCommand(command, id, options);

        // Integration Trigger: Emits Alert if command fails
        if (res && res.success === false && this.alertingService) {
            this.alertingService.processEvent({
                source: 'RUNTIME_ENGINE',
                type: 'RUNTIME_FAILURE',
                systemId: id,
                severity: 'HIGH',
                message: `Runtime command '${command}' failed on system '${id}'`,
                data: res
            });
        }

        // Integration Trigger: Health engine check sync
        if (command === RUNTIME_COMMANDS.HEALTH_CHECK && this.healthEngine && typeof this.healthEngine.evaluateHealth === 'function') {
            try {
                await this.healthEngine.evaluateHealth(id);
            } catch (e) {
                // Ignore background evaluation failure
            }
        }

        return res;
    }

    /**
     * Start a system runtime session.
     */
    async startSystem(systemId, options = {}) {
        return this.executeCommand(RUNTIME_COMMANDS.START, systemId, options);
    }

    /**
     * Stop a system runtime session.
     */
    async stopSystem(systemId, options = {}) {
        return this.executeCommand(RUNTIME_COMMANDS.STOP, systemId, options);
    }

    /**
     * Restart a system runtime.
     */
    async restartSystem(systemId, options = {}) {
        return this.executeCommand(RUNTIME_COMMANDS.RESTART, systemId, options);
    }

    /**
     * Pause a system runtime.
     */
    async pauseSystem(systemId, options = {}) {
        return this.executeCommand(RUNTIME_COMMANDS.PAUSE, systemId, options);
    }

    /**
     * Resume a system runtime.
     */
    async resumeSystem(systemId, options = {}) {
        return this.executeCommand(RUNTIME_COMMANDS.RESUME, systemId, options);
    }

    /**
     * Trigger health check for system.
     */
    async checkHealth(systemId, options = {}) {
        return this.executeCommand(RUNTIME_COMMANDS.HEALTH_CHECK, systemId, options);
    }

    /**
     * Execute capability operation.
     */
    async executeCapability(systemId, capability, parameters = {}, options = {}) {
        return this.executeCommand(RUNTIME_COMMANDS.EXECUTE, systemId, {
            ...options,
            capability,
            parameters
        });
    }

    /**
     * Fetch runtime execution history.
     */
    listExecutions(filter = {}) {
        return this.store.listExecutions(filter);
    }

    /**
     * Fetch runtime events stream.
     */
    listEvents(filter = {}) {
        return this.store.listEvents(filter);
    }
}

module.exports = RuntimeService;
