/**
 * Agent Service
 * Orchestrates Agent Contract validation, registration, capability discovery, execution,
 * health delegation, usage tracking, intelligence emission, and alerting notifications.
 */

const { AgentRegistry } = require('./AgentRegistry');
const { AgentContractValidator } = require('./AgentContractValidator');
const { AGENT_STATES } = require('./AgentStates');

class AgentService {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.agentRegistry = options.agentRegistry || new AgentRegistry({ systemRegistry: this.systemRegistry });
        this.executionService = options.executionService || null;
        this.healthEngine = options.healthEngine || null;
        this.qualityRunner = options.qualityRunner || null;
        this.usageCollector = options.usageCollector || null;
        this.intelligenceService = options.intelligenceService || null;
        this.alertingService = options.alertingService || null;
        // Optional application-state persistence (existing `agent_data` table
        // via PersistenceManager in mysql mode, memory/file otherwise).
        // Best-effort only: never throws.
        this.persistenceManager = options.persistenceManager || options.persistence || null;
    }

    _persistAgent(agent) {
        if (!this.persistenceManager || !agent) return;
        try {
            const snapshot = typeof agent.toJSON === 'function' ? agent.toJSON() : { ...agent };
            if (!snapshot || !snapshot.id) return;
            const pm = this.persistenceManager;
            if (typeof pm.setSafe === 'function') {
                const r = pm.setSafe('agents', snapshot.id, snapshot);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            } else if (typeof pm.set === 'function') {
                const r = pm.set('agents', snapshot.id, snapshot);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            }
        } catch (_) { /* persistence is best-effort */ }
    }

    /**
     * Register a new agent.
     */
    registerAgent(contractRaw) {
        const agent = this.agentRegistry.registerAgent(contractRaw);
        this._persistAgent(agent);

        // Record usage event
        if (this.usageCollector && typeof this.usageCollector.recordEvent === 'function') {
            this.usageCollector.recordEvent({
                systemId: agent.id,
                eventType: 'agent_registered',
                capability: 'registration',
                status: 'success',
                metadata: { category: agent.category, version: agent.version }
            });
        }

        return agent;
    }

    /**
     * Get agent by ID.
     */
    getAgent(id) {
        return this.agentRegistry.getAgent(id);
    }

    /**
     * List registered agents.
     */
    listAgents(filters = {}) {
        return this.agentRegistry.listAgents(filters);
    }

    /**
     * Update an agent contract.
     */
    updateAgent(id, updates = {}) {
        const updated = this.agentRegistry.updateAgent(id, updates);
        this._persistAgent(updated);
        return updated;
    }

    /**
     * Activate agent.
     */
    activateAgent(id) {
        const agent = this.agentRegistry.activateAgent(id);
        this._persistAgent(agent);
        return agent;
    }

    /**
     * Deactivate agent.
     */
    deactivateAgent(id) {
        const agent = this.agentRegistry.deactivateAgent(id);
        this._persistAgent(agent);
        return agent;
    }

    /**
     * Retire agent.
     */
    retireAgent(id) {
        const agent = this.agentRegistry.retireAgent(id);
        this._persistAgent(agent);
        return agent;
    }

    /**
     * Discover agent capabilities.
     */
    discoverCapabilities(id) {
        return this.agentRegistry.discoverCapabilities(id);
    }

    /**
     * Refresh metadata.
     */
    refreshMetadata(id, newMetadata = {}) {
        const agent = this.agentRegistry.refreshMetadata(id, newMetadata);
        this._persistAgent(agent);
        return agent;
    }

    /**
     * Get agent status.
     */
    getAgentStatus(id) {
        return this.agentRegistry.getAgentStatus(id);
    }

    /**
     * Execute capability with Capability Negotiation.
     */
    async executeCapability(agentId, params = {}) {
        const { capabilityId, operation, payload, action } = params;
        const targetOp = operation || action || capabilityId || 'execute';

        const agent = this.getAgent(agentId);
        if (!agent) {
            return {
                success: false,
                error: {
                    code: 'AGENT_NOT_FOUND',
                    message: `Agent with ID '${agentId}' not found`,
                    agentId
                }
            };
        }

        if (agent.lifecycleState === AGENT_STATES.DISABLED || agent.lifecycleState === AGENT_STATES.RETIRED) {
            return {
                success: false,
                error: {
                    code: 'AGENT_INACTIVE',
                    message: `Agent '${agentId}' is currently in '${agent.lifecycleState}' state and cannot execute capabilities`,
                    agentId
                }
            };
        }

        // Capability Negotiation Step
        const resolution = this.agentRegistry.resolveCapability(agentId, targetOp);
        if (!resolution.supported) {
            return {
                success: false,
                error: {
                    code: 'CAPABILITY_NOT_SUPPORTED',
                    message: `Capability or operation '${targetOp}' is not supported by agent '${agentId}'`,
                    agentId,
                    requested: targetOp
                }
            };
        }

        const startTime = Date.now();
        let result = null;
        let isSuccess = false;
        let errorMessage = null;

        try {
            if (this.executionService && typeof this.executionService.execute === 'function') {
                result = await this.executionService.execute(agentId, {
                    action: targetOp,
                    payload: payload || {},
                    parameters: params.parameters || {}
                });
                isSuccess = result.success !== false;
            } else {
                // Mock fallback execution if execution service is not attached
                result = {
                    success: true,
                    agentId,
                    capability: resolution.capability ? resolution.capability.id : targetOp,
                    executedOperation: targetOp,
                    output: payload || { status: 'executed' },
                    timestamp: new Date().toISOString()
                };
                isSuccess = true;
            }
        } catch (err) {
            isSuccess = false;
            errorMessage = err.message || 'Execution error';
            result = {
                success: false,
                error: {
                    code: err.code || 'EXECUTION_FAILED',
                    message: errorMessage,
                    agentId
                }
            };
        }

        const latencyMs = Date.now() - startTime;

        // Record Usage Event
        if (this.usageCollector && typeof this.usageCollector.recordEvent === 'function') {
            try {
                this.usageCollector.recordEvent({
                    systemId: agentId,
                    eventType: 'capability_execution',
                    capability: resolution.capability ? resolution.capability.id : targetOp,
                    operation: targetOp,
                    status: isSuccess ? 'success' : 'failure',
                    latencyMs,
                    metadata: { errorMessage }
                });
            } catch (e) { /* ignore tracking errors */ }
        }

        // Dispatch Intelligence Observation
        if (this.intelligenceService && typeof this.intelligenceService.recordObservation === 'function') {
            try {
                this.intelligenceService.recordObservation({
                    systemId: agentId,
                    source: 'agent_service',
                    metricName: 'capability_execution_latency',
                    value: latencyMs,
                    status: isSuccess ? 'healthy' : 'degraded',
                    metadata: { operation: targetOp }
                });
            } catch (e) { /* ignore intelligence errors */ }
        }

        return result;
    }

    /**
      * Delegate health check for single agent to HealthCheckEngine.
      * Uses the shared HealthCheckEngine.checkHealth as the generic probe path.
      * AgentMonitoringService remains the canonical continuous-monitoring loop;
      * this method is the on-demand delegation used by agent APIs.
      */
    async checkHealth(agentId) {
        const agent = this.getAgent(agentId);
        if (!agent) {
            const err = new Error(`Agent with ID '${agentId}' not found`);
            err.statusCode = 404;
            err.code = 'AGENT_NOT_FOUND';
            throw err;
        }

        if (this.healthEngine && typeof this.healthEngine.checkHealth === 'function') {
            const healthReport = await this.healthEngine.checkHealth(agentId);
            const hs = String(healthReport.status || healthReport.healthStatus || '').toUpperCase();
            // Update agent lifecycle state based on health
            if (hs === 'OFFLINE' || hs === 'UNHEALTHY' || hs === 'UNHEALTHY') {
                agent.lifecycleState = AGENT_STATES.OFFLINE;
            } else if (hs === 'DEGRADED') {
                agent.lifecycleState = AGENT_STATES.DEGRADED;
            } else if (hs === 'HEALTHY') {
                if (agent.lifecycleState !== AGENT_STATES.ACTIVE && agent.lifecycleState !== AGENT_STATES.DISABLED && agent.lifecycleState !== AGENT_STATES.RETIRED) {
                    agent.lifecycleState = AGENT_STATES.CONNECTED;
                }
            }
            try { this.agentRegistry._syncWithSystemRegistry(agent); } catch (_) {}
            return {
                agentId: agent.id,
                name: agent.name,
                lifecycleState: agent.lifecycleState,
                health: healthReport
            };
        }

        // Honest fallback when no health engine is wired: do not fabricate HEALTHY.
        return {
            agentId: agent.id,
            name: agent.name,
            lifecycleState: agent.lifecycleState,
            health: {
                systemId: agent.id,
                status: 'UNKNOWN',
                reason: 'HEALTH_ENGINE_UNAVAILABLE',
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Delegate health checks for all registered agents.
     */
    async checkAllHealth() {
        const agents = this.listAgents();
        const results = [];

        for (const agent of agents) {
            try {
                const healthRes = await this.checkHealth(agent.id);
                results.push(healthRes);
            } catch (err) {
                results.push({
                    agentId: agent.id,
                    name: agent.name,
                    error: err.message
                });
            }
        }

        return {
            timestamp: new Date().toISOString(),
            totalAgents: agents.length,
            results
        };
    }
}

module.exports = {
    AgentService
};
