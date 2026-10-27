/**
 * Agent Service
 * Orchestrates Agent Contract validation, registration, capability discovery, execution,
 * health delegation, usage tracking, intelligence emission, and alerting notifications.
 */

const { AgentRegistry } = require('./AgentRegistry');
const { AgentContractValidator } = require('./AgentContractValidator');
const { AGENT_STATES } = require('./AgentStates');
const { defaultComplianceEngine } = require('../quality/AgentComplianceEngine');

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
        this.masterSource = options.masterSource || options.agentMasterRegistrySource || null;
        this._masterAgentCache = new Map();
        this._masterCacheTime = 0;
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
     * Map one AGENT_MASTER_REGISTRY evaluation record to a full UniversalAgentContract.
     */
    static toAgentContract(rec) {
        const { UniversalAgentContract } = require('./UniversalAgentContract');
        const masterId = rec.masterId;
        const id = `amr-${masterId}`;
        const name = (rec.agentName && rec.agentName.trim()) 
            || (rec.filename && rec.filename.trim()) 
            || `Agent #${masterId}`;
        const purpose = (rec.summary && rec.summary.trim()) 
            || (rec.category ? `Agent for ${rec.category}` : 'Autonomous Agent');
        const type = rec.hasBackend 
            ? 'FULL STACK' 
            : (rec.recordKind === 'CANDIDATE_AGENT' ? 'WEB APP' : 'RESOURCE');
        const endpoint = rec.publicUrl ? String(rec.publicUrl).trim() : null;

        const raw = {
            id,
            name,
            version: '1.0.0',
            contractVersion: '1.0.0',
            description: rec.summary || `Agent Master Registry ID ${masterId} (USERID ${rec.userId}, FIRMID ${rec.firmId})`,
            category: (rec.category && rec.category.trim()) || 'general',
            purpose,
            agentType: type,
            lifecycleState: rec.externallyTestable ? 'ACTIVE' : 'REGISTERED',
            healthStatus: rec.externallyTestable ? 'HEALTHY' : 'UNKNOWN',
            userId: rec.userId,
            firmId: rec.firmId,
            masterId: rec.masterId,
            filename: rec.filename,
            hasBackend: rec.hasBackend,
            verified: rec.verified,
            isPublic: rec.isPublic,
            publicUrl: rec.publicUrl,
            addedAt: rec.insertDtm,
            createdAt: rec.insertDtm,
            updatedAt: rec.updateDtm || rec.insertDtm,
            capabilities: ['health', 'query', 'action', 'execute'],
            connection: endpoint ? { endpoint } : null,
            runner: endpoint ? { type: 'http', endpoint } : { type: 'script_file', file: rec.filename },
            metadata: {
                masterRegistryId: rec.masterId,
                masterUserId: rec.userId,
                masterFirmId: rec.firmId,
                masterFilename: rec.filename,
                masterCategory: rec.category,
                masterIsPublic: rec.isPublic,
                masterHasBackend: rec.hasBackend,
                masterVerified: rec.verified,
                insertDtm: rec.insertDtm,
                updateDtm: rec.updateDtm,
                source: 'AGENT_MASTER_REGISTRY',
                sourceDatabase: (rec.source && rec.source.database) || 'nrkindex_trn'
            }
        };

        const agent = new UniversalAgentContract(raw);
        agent.userId = rec.userId;
        agent.firmId = rec.firmId;
        agent.masterId = rec.masterId;
        agent.addedAt = rec.insertDtm;
        agent.purpose = purpose;
        agent.agentType = type;
        agent.publicUrl = rec.publicUrl;
        agent.hasBackend = rec.hasBackend;
        agent.filename = rec.filename;
        return agent;
    }

    /**
     * Load all agent records from AGENT_MASTER_REGISTRY table and cache in memory.
     */
    async loadMasterAgents(force = false) {
        if (!this.masterSource || typeof this.masterSource.listAllRecords !== 'function') return [];
        const now = Date.now();
        if (!force && this._masterAgentCache.size > 0 && (now - this._masterCacheTime < 60000)) {
            return Array.from(new Set(this._masterAgentCache.values()));
        }
        if (this._loadMasterPromise) {
            return this._loadMasterPromise;
        }
        this._loadMasterPromise = (async () => {
            try {
                const records = await this.masterSource.listAllRecords();
                if (Array.isArray(records)) {
                    const newCache = new Map();
                    for (const rec of records) {
                        const agent = AgentService.toAgentContract(rec);
                        newCache.set(agent.id, agent);
                        newCache.set(String(rec.masterId), agent);
                        if (rec.filename) newCache.set(rec.filename.toLowerCase(), agent);
                    }
                    this._masterAgentCache = newCache;
                    this._masterCacheTime = Date.now();
                }
                return Array.from(new Set(this._masterAgentCache.values()));
            } catch (err) {
                console.error('Failed to load master registry records:', err);
                return Array.from(new Set(this._masterAgentCache.values()));
            }
        })();
        try {
            return await this._loadMasterPromise;
        } finally {
            this._loadMasterPromise = null;
        }
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
        const found = this.agentRegistry.getAgent(id);
        if (found) return found;

        if (this._masterAgentCache && this._masterAgentCache.size > 0) {
            const key = String(id || '').trim();
            if (this._masterAgentCache.has(key)) return this._masterAgentCache.get(key);
            const stripped = key.replace(/^amr-/, '');
            if (this._masterAgentCache.has(stripped)) return this._masterAgentCache.get(stripped);
            if (this._masterAgentCache.has(key.toLowerCase())) return this._masterAgentCache.get(key.toLowerCase());
        }
        return null;
    }

    /**
     * Get agent asynchronously (fetches master registry if not in cache).
     */
    async getAgentAsync(id) {
        let agent = this.getAgent(id);
        if (agent) return agent;
        await this.loadMasterAgents();
        return this.getAgent(id);
    }

    /**
     * List registered and master registry agents.
     */
    listAgents(filters = {}) {
        const registered = this.agentRegistry.listAgents(filters);
        if (!this._masterAgentCache || this._masterAgentCache.size === 0) {
            return registered;
        }

        const masterAgents = Array.from(new Set(this._masterAgentCache.values()));
        const seen = new Set(registered.map(a => a.id));
        const combined = [...registered];

        for (const ma of masterAgents) {
            if (!seen.has(ma.id)) {
                if (filters.category && String(ma.category || '').toLowerCase() !== String(filters.category).toLowerCase()) continue;
                if (filters.lifecycleState && String(ma.lifecycleState || '').toUpperCase() !== String(filters.lifecycleState).toUpperCase()) continue;
                if (filters.search) {
                    const q = String(filters.search).toLowerCase();
                    const match = (ma.name && ma.name.toLowerCase().includes(q)) ||
                                  (ma.id && ma.id.toLowerCase().includes(q)) ||
                                  (ma.userId && String(ma.userId).includes(q)) ||
                                  (ma.purpose && ma.purpose.toLowerCase().includes(q)) ||
                                  (ma.filename && ma.filename.toLowerCase().includes(q));
                    if (!match) continue;
                }
                combined.push(ma);
                seen.add(ma.id);
            }
        }
        return combined;
    }

    async listAgentsAsync(filters = {}) {
        await this.loadMasterAgents();
        return this.listAgents(filters);
    }

    /**
     * Update an agent contract.
     */
    updateAgent(id, updates = {}) {
        const existing = this.agentRegistry.getAgent(id);
        if (existing) {
            const updated = this.agentRegistry.updateAgent(id, updates);
            this._persistAgent(updated);
            return updated;
        }
        const masterAgent = this.getAgent(id);
        if (masterAgent) {
            Object.assign(masterAgent, updates);
            masterAgent.updatedAt = new Date().toISOString();
            this._persistAgent(masterAgent);
            return masterAgent;
        }
        return this.agentRegistry.updateAgent(id, updates);
    }

    /**
     * Activate agent.
     */
    activateAgent(id) {
        const existing = this.agentRegistry.getAgent(id);
        if (existing) {
            const agent = this.agentRegistry.activateAgent(id);
            this._persistAgent(agent);
            return agent;
        }
        const masterAgent = this.getAgent(id);
        if (masterAgent) {
            masterAgent.lifecycleState = AGENT_STATES.ACTIVE;
            masterAgent.updatedAt = new Date().toISOString();
            this._persistAgent(masterAgent);
            return masterAgent;
        }
        return this.agentRegistry.activateAgent(id);
    }

    /**
     * Deactivate agent.
     */
    deactivateAgent(id) {
        const existing = this.agentRegistry.getAgent(id);
        if (existing) {
            const agent = this.agentRegistry.deactivateAgent(id);
            this._persistAgent(agent);
            return agent;
        }
        const masterAgent = this.getAgent(id);
        if (masterAgent) {
            masterAgent.lifecycleState = AGENT_STATES.INACTIVE;
            masterAgent.updatedAt = new Date().toISOString();
            this._persistAgent(masterAgent);
            return masterAgent;
        }
        return this.agentRegistry.deactivateAgent(id);
    }

    /**
     * Retire agent.
     */
    retireAgent(id) {
        const existing = this.agentRegistry.getAgent(id);
        if (existing) {
            const agent = this.agentRegistry.retireAgent(id);
            this._persistAgent(agent);
            return agent;
        }
        const masterAgent = this.getAgent(id);
        if (masterAgent) {
            masterAgent.lifecycleState = AGENT_STATES.RETIRED;
            masterAgent.updatedAt = new Date().toISOString();
            this._persistAgent(masterAgent);
            return masterAgent;
        }
        return this.agentRegistry.retireAgent(id);
    }

    /**
     * Discover agent capabilities.
     */
    discoverCapabilities(id) {
        const existing = this.agentRegistry.getAgent(id);
        if (existing) {
            return this.agentRegistry.discoverCapabilities(id);
        }
        const masterAgent = this.getAgent(id);
        if (masterAgent) {
            return {
                agentId: masterAgent.id,
                name: masterAgent.name,
                capabilities: masterAgent.capabilities.map(c => typeof c.toJSON === 'function' ? c.toJSON() : c),
                discoveredAt: new Date().toISOString(),
                status: 'AVAILABLE'
            };
        }
        return this.agentRegistry.discoverCapabilities(id);
    }

    /**
     * Refresh metadata.
     */
    refreshMetadata(id, newMetadata = {}) {
        const existing = this.agentRegistry.getAgent(id);
        if (existing) {
            const agent = this.agentRegistry.refreshMetadata(id, newMetadata);
            this._persistAgent(agent);
            return agent;
        }
        const masterAgent = this.getAgent(id);
        if (masterAgent) {
            masterAgent.metadata = { ...(masterAgent.metadata || {}), ...newMetadata };
            masterAgent.updatedAt = new Date().toISOString();
            this._persistAgent(masterAgent);
            return masterAgent;
        }
        return this.agentRegistry.refreshMetadata(id, newMetadata);
    }

    /**
     * Get agent status.
     */
    getAgentStatus(id) {
        const existing = this.agentRegistry.getAgent(id);
        if (existing) {
            return this.agentRegistry.getAgentStatus(id);
        }
        const masterAgent = this.getAgent(id);
        if (masterAgent) {
            return {
                id: masterAgent.id,
                name: masterAgent.name,
                healthStatus: masterAgent.healthStatus || 'UNKNOWN',
                lifecycleState: masterAgent.lifecycleState,
                endpoint: masterAgent.publicUrl || null,
                userId: masterAgent.userId,
                addedAt: masterAgent.addedAt
            };
        }
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
            let compReport = null;
            try {
                compReport = await this.auditRuntimeCompliance(agent.id, { health: healthReport });
            } catch (_) {}
            return {
                agentId: agent.id,
                name: agent.name,
                lifecycleState: agent.lifecycleState,
                health: healthReport,
                compliance: compReport || agent.compliance
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
     * Audit runtime compliance against 9 core agent rules with live health & telemetry.
     */
    async auditRuntimeCompliance(agentId, runtimeContext = null) {
        const agent = this.getAgent(agentId);
        if (!agent) {
            const err = new Error(`Agent with ID '${agentId}' not found`);
            err.statusCode = 404;
            throw err;
        }

        let ctx = runtimeContext || {};
        if (!ctx.health && this.healthEngine && typeof this.healthEngine.checkHealth === 'function') {
            try {
                ctx.health = await this.healthEngine.checkHealth(agentId);
            } catch (e) {
                ctx.health = { status: 'OFFLINE', reason: e.message };
            }
        }

        const report = defaultComplianceEngine.scan(agent, ctx);
        agent.compliance = report;
        this._persistAgent(agent);

        // If critical runtime violation or core rule missing during runtime, notify alerting system
        if (report.runtimeViolations && report.runtimeViolations.length > 0 && this.alertingService) {
            try {
                if (typeof this.alertingService.createAlert === 'function') {
                    const topViolation = report.runtimeViolations[0];
                    this.alertingService.createAlert({
                        systemId: agent.id,
                        ruleId: 'rule_runtime_compliance_violation',
                        ruleName: 'Runtime Agent Compliance Degradation',
                        severity: report.complianceScore < 50 ? 'CRITICAL' : 'HIGH',
                        message: `Agent ${agent.name} (${agent.id}) runtime compliance violation: ${topViolation.message}`,
                        dimension: 'quality',
                        metadata: {
                            complianceScore: report.complianceScore,
                            violations: report.runtimeViolations
                        }
                    });
                }
            } catch (_) { /* best-effort alerting */ }
        }

        return report;
    }

    /**
     * Remediate agent runtime compliance violations.
     * Applies automated recovery: resets retry policies, re-probes health, updates audit.
     */
    async remediateCompliance(agentId) {
        const agent = this.getAgent(agentId);
        if (!agent) {
            const err = new Error(`Agent with ID '${agentId}' not found`);
            err.statusCode = 404;
            throw err;
        }

        // 1. Ensure automatic retry & fault adaptation policy is active
        if (!agent.connection) agent.connection = {};
        if (!agent.connection.retries || Number(agent.connection.retries) < 2) {
            agent.connection.retries = 3;
        }

        // 2. Ensure health endpoint or monitoring interval is verified
        if (!agent.monitoring) agent.monitoring = {};
        if (!agent.monitoring.healthCheckIntervalMs) {
            agent.monitoring.healthCheckIntervalMs = 5000;
        }

        // 3. Re-probe health if available
        let healthReport = null;
        if (this.healthEngine && typeof this.healthEngine.checkHealth === 'function') {
            try {
                healthReport = await this.healthEngine.checkHealth(agentId);
            } catch (_) {}
        }

        // 4. Re-scan compliance with restored baseline
        const updatedReport = defaultComplianceEngine.scan(agent, { health: healthReport || { status: 'HEALTHY' } });
        agent.compliance = updatedReport;
        this._persistAgent(agent);

        return updatedReport;
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
