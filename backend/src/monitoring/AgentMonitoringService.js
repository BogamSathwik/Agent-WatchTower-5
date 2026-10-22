/**
 * Phase 17 — Agent Monitoring Service
 * Reusable domain-agnostic service for end-to-end monitoring, health state detection,
 * latency metrics, incident generation, and SSE event streaming for registered agents.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { MONITORING_STATES, MONITORING_EVENTS } = require('./AgentMonitoringStates');
const AgentMonitoringStore = require('./AgentMonitoringStore');
const { HealthDiagnosisGenerator } = require('../health/HealthDiagnosisGenerator');

class AgentMonitoringService {
    constructor(options = {}) {
        this.agentService = options.agentService || null;
        this.systemRegistry = options.systemRegistry || null;
        this.alertingService = options.alertingService || null;
        this.eventService = options.eventService || null;
        this.sseManager = options.sseManager || null;
        this.auditService = options.auditService || null;
        this.telemetryService = options.telemetryService || null;
        this.telemetryIngestionService = options.telemetryIngestionService || null;
        this.store = options.store || new AgentMonitoringStore(options.persistenceManager);

        this.timers = new Map(); // key: tenantId:agentId -> intervalTimer
        this.isChecking = new Map(); // key: tenantId:agentId -> boolean
    }

    _getKey(agentId, tenantId = 'default-tenant') {
        return `${tenantId}:${agentId}`;
    }

    _makeHttpRequest(urlStr, options = {}) {
        return new Promise((resolve) => {
            const startMs = Date.now();
            try {
                const parsedUrl = new URL(urlStr);
                const isHttps = parsedUrl.protocol === 'https:';
                const client = isHttps ? https : http;

                const reqOptions = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || (isHttps ? 443 : 80),
                    path: parsedUrl.pathname + parsedUrl.search,
                    method: options.method || 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'AgentWatchtower-MonitoringService/17.0',
                        ...(options.headers || {})
                    },
                    timeout: options.timeout || 5000
                };

                const req = client.request(reqOptions, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        const durationMs = Date.now() - startMs;
                        let json = null;
                        try {
                            json = JSON.parse(data);
                        } catch (e) {
                            json = { raw: data };
                        }
                        resolve({
                            success: res.statusCode >= 200 && res.statusCode < 300,
                            statusCode: res.statusCode,
                            data: json,
                            durationMs,
                            headers: res.headers
                        });
                    });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        success: false,
                        statusCode: 408,
                        error: 'REQUEST_TIMEOUT',
                        durationMs: Date.now() - startMs
                    });
                });

                req.on('error', (err) => {
                    resolve({
                        success: false,
                        statusCode: 503,
                        error: err.message || 'CONNECTION_REFUSED',
                        durationMs: Date.now() - startMs
                    });
                });

                if (options.body) {
                    const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                    req.write(bodyStr);
                }
                req.end();
            } catch (err) {
                resolve({
                    success: false,
                    statusCode: 400,
                    error: `URL_PARSING_ERROR: ${err.message}`,
                    durationMs: Date.now() - startMs
                });
            }
        });
    }

    async _resolveAgentEndpoint(agentId, tenantId = 'default-tenant') {
        const config = this.store.getConfig(agentId, tenantId);
        if (config.endpointOverride) {
            return config.endpointOverride;
        }

        // Try agentService if available (AgentService.getAgent(id) — no tenant arg).
        if (this.agentService && typeof this.agentService.getAgent === 'function') {
            try {
                const agent = await this.agentService.getAgent(agentId);
                if (agent) {
                    const plain = typeof agent.toJSON === 'function' ? agent.toJSON() : agent;
                    if (plain.connection && plain.connection.endpoint) return plain.connection.endpoint;
                    if (plain.runner && plain.runner.endpoint) return plain.runner.endpoint;
                    if (plain.endpoint) return plain.endpoint;
                    if (plain.baseUrl) return plain.baseUrl;
                    if (plain.contract && plain.contract.endpoint) return plain.contract.endpoint;
                    if (plain.metadata && plain.metadata.baseUrl) return plain.metadata.baseUrl;
                }
            } catch (err) {
                // fallback
            }
        }

        // Try systemRegistry if available (now preserves baseUrl/endpoint).
        if (this.systemRegistry && typeof this.systemRegistry.getSystem === 'function') {
            try {
                const sys = this.systemRegistry.getSystem(agentId);
                if (sys) {
                    if (sys.baseUrl) return sys.baseUrl;
                    if (sys.endpoint) return sys.endpoint;
                    if (sys.adapter && sys.adapter.baseUrl) return sys.adapter.baseUrl;
                    if (sys.adapter && sys.adapter.connectionConfigRef) return sys.adapter.connectionConfigRef;
                    if (sys.adapter && sys.adapter.endpoint) return sys.adapter.endpoint;
                    if (sys.metadata && sys.metadata.baseUrl) return sys.metadata.baseUrl;
                }
            } catch (err) {
                // fallback
            }
            // Instance form may carry fields dropped from JSON in older records
            if (typeof this.systemRegistry.getSystemInstance === 'function') {
                try {
                    const inst = this.systemRegistry.getSystemInstance(agentId);
                    if (inst) {
                        if (inst.baseUrl) return inst.baseUrl;
                        if (inst.endpoint) return inst.endpoint;
                        if (inst.adapter && (inst.adapter.baseUrl || inst.adapter.connectionConfigRef || inst.adapter.endpoint)) {
                            return inst.adapter.baseUrl || inst.adapter.connectionConfigRef || inst.adapter.endpoint;
                        }
                    }
                } catch (err) {
                    // fallback
                }
            }
        }

        // External agent endpoint fallbacks reuse the declarative profiles
        // (no new hardcoded URLs beyond the profile single source of truth).
        try {
            const profiles = require('../adapter/profiles/ExternalAgentProfiles');
            if ((agentId === 'compa-agent-ext' || agentId.includes('compa')) && profiles.COMPA_AGENT_PROFILE) {
                return profiles.COMPA_AGENT_PROFILE.baseUrl;
            }
            if ((agentId === 'repa-agent-ext' || agentId.includes('repa')) && profiles.REPA_AGENT_PROFILE) {
                return profiles.REPA_AGENT_PROFILE.baseUrl;
            }
        } catch (_) {
            if (agentId === 'compa-agent-ext' || agentId.includes('compa')) {
                return 'https://myblocks.in/compa-agent/';
            }
            if (agentId === 'repa-agent-ext' || agentId.includes('repa')) {
                return 'http://myblocks.in/repa-agent/REPA_Agent.html';
            }
        }

        // Default endpoint fallbacks for standard test agent setups
        if (agentId === 'TEST-AGENT-001' || agentId.includes('test-agent')) {
            return 'http://localhost:4001';
        }
        return 'http://localhost:3000';
    }

    _publishTelemetryEvent(telemetryPayload) {
        if (this.telemetryIngestionService && typeof this.telemetryIngestionService.ingestEvent === 'function') {
            try {
                this.telemetryIngestionService.ingestEvent(telemetryPayload);
            } catch (e) {}
        } else if (this.telemetryService && typeof this.telemetryService.recordEvent === 'function') {
            try {
                this.telemetryService.recordEvent(telemetryPayload);
            } catch (e) {}
        }
    }

    _publishMonitoringEvent(eventType, payload, correlationId = null) {
        const eventData = {
            eventType,
            source: 'AgentMonitoringService',
            timestamp: new Date().toISOString(),
            correlationId: correlationId || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            ...payload
        };

        // EventService has ingestEvent/dryRun (no emit). Use ingestEvent when present.
        if (this.eventService && typeof this.eventService.ingestEvent === 'function') {
            try {
                const ingestPayload = {
                    source: 'monitoring',
                    eventType: String(eventType || 'MONITORING_EVENT'),
                    severity: payload.severity || 'INFO',
                    systemId: payload.agentId || 'system',
                    agentId: payload.agentId,
                    tenantId: payload.tenantId,
                    payload: eventData,
                    correlationId: eventData.correlationId,
                    timestamp: eventData.timestamp
                };
                const maybePromise = this.eventService.ingestEvent(ingestPayload);
                if (maybePromise && typeof maybePromise.catch === 'function') maybePromise.catch(() => {});
            } catch (e) {}
        } else if (this.eventService && typeof this.eventService.emit === 'function') {
            try {
                this.eventService.emit(eventType, eventData);
            } catch (e) {}
        }
        // SSEManager.broadcast(eventType, payload) — two-arg signature.
        if (this.sseManager && typeof this.sseManager.broadcast === 'function') {
            try {
                this.sseManager.broadcast(eventType, eventData);
            } catch (e) {}
        }
        if (this.auditService && typeof this.auditService.logEvent === 'function') {
            try {
                this.auditService.logEvent({
                    eventType,
                    actor: 'monitoring_engine',
                    resource: payload.agentId || 'system',
                    outcome: 'SUCCESS',
                    severity: payload.severity || 'INFO',
                    correlationId: eventData.correlationId
                });
            } catch (e) {}
        }
        return eventData;
    }

    _emitMonitoringAlert({ title, description, severity, agentId, tenantId, correlationId, systemId }) {
        if (!this.alertingService) return null;
        const payload = {
            title,
            description,
            severity: severity || 'HIGH',
            source: 'AgentMonitoringService',
            systemId: systemId || agentId,
            agentId,
            tenantId,
            correlationId
        };
        try {
            if (typeof this.alertingService.createAlert === 'function') {
                return this.alertingService.createAlert(payload);
            }
            if (typeof this.alertingService.createManualAlert === 'function') {
                return this.alertingService.createManualAlert(payload);
            }
        } catch (e) {}
        return null;
    }

    /**
     * ONE coherent capability view reusing existing components.
     * Sources in priority order:
     *  1. DECLARED_CONTRACT — AgentService/AgentRegistry contract capabilities
     *  2. DISCOVERED_ENDPOINT — live /capabilities probe observed by monitoring
     *  3. CONFIGURED_PROFILE — SystemRegistry adapter/endpoints profile
     *  4. OPERATOR_DECLARED — explicit endpointOverride/config marker
     * Never invents capabilities; HTTP 200 alone is not capability proof.
     */
    getCapabilityView(agentId, tenantId = 'default-tenant') {
        const status = this.store.getStatus(agentId, tenantId);
        const observed = Array.isArray(status.capabilities) ? status.capabilities : [];
        const observedSource = status.capabilitySource || null;

        let contractCaps = [];
        if (this.agentService && typeof this.agentService.getAgent === 'function') {
            try {
                const agent = this.agentService.getAgent(agentId);
                const plain = agent && typeof agent.toJSON === 'function' ? agent.toJSON() : agent;
                if (plain && Array.isArray(plain.capabilities)) {
                    contractCaps = plain.capabilities.map(c => (c && typeof c === 'object' ? (c.id || c.name || c.type || JSON.stringify(c)) : String(c)));
                }
            } catch (_) {}
        }
        let profileCaps = [];
        let profileEndpoints = null;
        if (this.systemRegistry && typeof this.systemRegistry.getSystem === 'function') {
            try {
                const sys = this.systemRegistry.getSystem(agentId);
                if (sys) {
                    if (Array.isArray(sys.capabilities)) {
                        profileCaps = sys.capabilities.map(c => (c && typeof c === 'object' ? (c.id || c.name || c.type || JSON.stringify(c)) : String(c)));
                    }
                    profileEndpoints = (sys.adapter && sys.adapter.endpoints) || sys.endpoints || null;
                }
            } catch (_) {}
        }

        const items = [];
        const seen = new Set();
        const pushItem = (name, source, avail) => {
            const key = `${source}:${name}`;
            if (seen.has(key)) return;
            seen.add(key);
            items.push({ name: String(name), source, status: avail ? 'AVAILABLE' : 'DECLARED' });
        };
        contractCaps.forEach(n => pushItem(n, 'DECLARED_CONTRACT', observed.includes(n)));
        observed.forEach(n => { if (!contractCaps.includes(n)) pushItem(n, observedSource || 'DISCOVERED_ENDPOINT', true); });
        profileCaps.forEach(n => { if (!contractCaps.includes(n) && !observed.includes(n)) pushItem(n, 'CONFIGURED_PROFILE', false); });

        const hasAny = items.length > 0;
        return {
            status: hasAny ? 'AVAILABLE' : 'NOT_EXPOSED',
            message: hasAny ? `${items.length} capability declaration(s) on record.` : 'CAPABILITIES NOT EXPOSED — no contract, profile, or endpoint has exposed capabilities for this agent.',
            items,
            declared: contractCaps,
            discovered: observed,
            discoveredSource: observedSource,
            profileCapabilities: profileCaps,
            profileEndpoints,
            unsupported: []
        };
    }

    async getMonitoredAgents(tenantId = 'default-tenant') {
        const statuses = this.store.listStatuses(tenantId);
        return statuses;
    }

    async getAgentMonitoring(agentId, tenantId = 'default-tenant') {
        const config = this.store.getConfig(agentId, tenantId);
        const status = this.store.getStatus(agentId, tenantId);
        const timeline = this.store.getTimeline(agentId, tenantId, 50);
        const checkHistory = this.store.getCheckHistory(agentId, tenantId, 20);
        const incidents = this.store.listIncidents(tenantId, agentId);
        let capabilities = null;
        try { capabilities = this.getCapabilityView(agentId, tenantId); } catch (_) { capabilities = { status: 'NOT_EXPOSED', items: [] }; }

        return {
            config,
            status,
            capabilities,
            timeline,
            checkHistory,
            incidents
        };
    }

    async updateConfig(agentId, configData, tenantId = 'default-tenant') {
        const updated = this.store.saveConfig(agentId, configData, tenantId);
        
        // Restart monitoring scheduler if enabled interval changed
        if (this.timers.has(this._getKey(agentId, tenantId))) {
            this.stopMonitoring(agentId, tenantId);
            if (updated.enabled) {
                this.startMonitoring(agentId, tenantId);
            }
        }
        return updated;
    }

    async startMonitoring(agentId, tenantId = 'default-tenant') {
        const key = this._getKey(agentId, tenantId);
        const config = this.store.getConfig(agentId, tenantId);
        config.enabled = true;
        this.store.saveConfig(agentId, config, tenantId);

        const status = this.store.getStatus(agentId, tenantId);
        status.monitoringEnabled = true;
        this.store.saveStatus(agentId, status, tenantId);

        if (this.timers.has(key)) {
            clearInterval(this.timers.get(key));
        }

        const intervalMs = Math.max(1000, (config.healthIntervalSeconds || 15) * 1000);
        
        // Immediate check
        this.checkAgent(agentId, tenantId).catch(() => {});

        const timer = setInterval(() => {
            this.checkAgent(agentId, tenantId).catch(err => {
                console.error(`[AgentMonitoringService] Background check failed for ${agentId}:`, err.message);
            });
        }, intervalMs);

        this.timers.set(key, timer);

        this.store.addTimelineEntry(agentId, {
            type: 'MONITORING_STARTED',
            message: `Continuous monitoring started (interval ${config.healthIntervalSeconds}s)`
        }, tenantId);

        this._publishMonitoringEvent(MONITORING_EVENTS.AGENT_MONITORING_STARTED, {
            agentId,
            tenantId,
            intervalSeconds: config.healthIntervalSeconds
        });

        return this.store.getStatus(agentId, tenantId);
    }

    async stopMonitoring(agentId, tenantId = 'default-tenant') {
        const key = this._getKey(agentId, tenantId);
        if (this.timers.has(key)) {
            clearInterval(this.timers.get(key));
            this.timers.delete(key);
        }

        const config = this.store.getConfig(agentId, tenantId);
        config.enabled = false;
        this.store.saveConfig(agentId, config, tenantId);

        const status = this.store.getStatus(agentId, tenantId);
        status.monitoringEnabled = false;
        this.store.saveStatus(agentId, status, tenantId);

        this.store.addTimelineEntry(agentId, {
            type: 'MONITORING_STOPPED',
            message: 'Continuous monitoring stopped by operator'
        }, tenantId);

        this._publishMonitoringEvent(MONITORING_EVENTS.AGENT_MONITORING_STOPPED, {
            agentId,
            tenantId
        });

        return this.store.getStatus(agentId, tenantId);
    }

    async checkAgent(agentId, tenantId = 'default-tenant', options = {}) {
        const key = this._getKey(agentId, tenantId);
        
        // Failure isolation & overlapping check protection
        if (this.isChecking.get(key)) {
            return this.store.getStatus(agentId, tenantId);
        }

        this.isChecking.set(key, true);

        const config = this.store.getConfig(agentId, tenantId);
        const status = this.store.getStatus(agentId, tenantId);
        const correlationId = options.correlationId || `corr_check_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const baseUrl = await this._resolveAgentEndpoint(agentId, tenantId);

        let connectivity = 'CONNECTED';
        let healthState = MONITORING_STATES.UNKNOWN;
        let healthStatusCode = 0;
        let healthLatencyMs = 0;
        let checkError = null;
        let capabilitiesAvailable = [];
        let capLatencyMs = 0;
        let capabilitySource = status.capabilitySource || null;
        let capabilityProbed = false;

        try {
            // 1. Health Endpoint Check
            if (config.healthCheckEnabled) {
                const healthUrl = `${baseUrl.replace(/\/$/, '')}/health`;
                const healthRes = await this._makeHttpRequest(healthUrl, {
                    timeout: config.timeoutMs || 5000
                });

                healthStatusCode = healthRes.statusCode;
                healthLatencyMs = healthRes.durationMs;

                if (healthRes.error === 'REQUEST_TIMEOUT') {
                    connectivity = 'DISCONNECTED';
                    healthState = MONITORING_STATES.OFFLINE;
                    checkError = `Health check timed out after ${config.timeoutMs}ms`;
                } else if (!healthRes.success) {
                    if (healthStatusCode === 503 || (healthRes.data && healthRes.data.status === 'ERROR')) {
                        connectivity = 'CONNECTED';
                        healthState = MONITORING_STATES.UNHEALTHY;
                        checkError = healthRes.data?.error || `HTTP ${healthStatusCode} Service Unavailable`;
                    } else if (healthStatusCode === 0 || healthRes.error) {
                        connectivity = 'DISCONNECTED';
                        healthState = MONITORING_STATES.OFFLINE;
                        checkError = healthRes.error || `Connection failure to ${baseUrl}`;
                    } else {
                        connectivity = 'CONNECTED';
                        healthState = MONITORING_STATES.DEGRADED;
                        checkError = `Unexpected HTTP status ${healthStatusCode}`;
                    }
                } else {
                    connectivity = 'CONNECTED';
                    const rawState = (healthRes.data && healthRes.data.status) ? healthRes.data.status.toUpperCase() : 'HEALTHY';
                    
                    if (rawState === 'DEGRADED' || healthLatencyMs > (config.slowThresholdMs || 1500)) {
                        healthState = MONITORING_STATES.DEGRADED;
                    } else if (rawState === 'ERROR' || rawState === 'UNHEALTHY') {
                        healthState = MONITORING_STATES.UNHEALTHY;
                    } else {
                        healthState = MONITORING_STATES.HEALTHY;
                    }
                }
            }

            // 2. Capability Endpoint Check (if health succeeded or connected)
            // Never interpret HTTP 200 alone as capability proof: only an explicit
            // `capabilities` array counts as DISCOVERED_ENDPOINT evidence.
            if (config.capabilityCheckEnabled && connectivity === 'CONNECTED') {
                const capUrl = `${baseUrl.replace(/\/$/, '')}/capabilities`;
                const capRes = await this._makeHttpRequest(capUrl, {
                    timeout: config.timeoutMs || 5000
                });
                capLatencyMs = capRes.durationMs;
                capabilityProbed = true;
                if (capRes.success && capRes.data && Array.isArray(capRes.data.capabilities)) {
                    capabilitiesAvailable = capRes.data.capabilities;
                    capabilitySource = 'DISCOVERED_ENDPOINT';
                }
            }
        } catch (err) {
            connectivity = 'DISCONNECTED';
            healthState = MONITORING_STATES.OFFLINE;
            checkError = err.message;
        } finally {
            this.isChecking.set(key, false);
        }

        // Latency metric calculations
        const totalCheckLatency = healthLatencyMs + capLatencyMs;
        const prevLat = status.latency || { avgLatencyMs: 0, minLatencyMs: 0, maxLatencyMs: 0 };
        const newCount = (status.totalChecksCount || 0) + 1;
        const newAvg = prevLat.avgLatencyMs === 0 ? totalCheckLatency : Math.round((prevLat.avgLatencyMs * (newCount - 1) + totalCheckLatency) / newCount);
        const newMin = prevLat.minLatencyMs === 0 ? totalCheckLatency : Math.min(prevLat.minLatencyMs, totalCheckLatency);
        const newMax = Math.max(prevLat.maxLatencyMs, totalCheckLatency);

        // Failure vs Recovery State Machine evaluation
        let newConsecutiveFailures = status.consecutiveFailures || 0;
        let newConsecutiveRecoveries = status.consecutiveRecoveries || 0;
        let targetState = healthState;
        const previousState = status.currentState;

        const isFailure = (healthState === MONITORING_STATES.UNHEALTHY || healthState === MONITORING_STATES.OFFLINE || healthState === MONITORING_STATES.DEGRADED);

        if (isFailure) {
            newConsecutiveFailures += 1;
            newConsecutiveRecoveries = 0;
            status.lastFailureAt = new Date().toISOString();

            // Apply failure threshold before transition to severe state
            if (newConsecutiveFailures < (config.failureThreshold || 3) && previousState === MONITORING_STATES.HEALTHY) {
                targetState = MONITORING_STATES.HEALTHY; // suppress transient noise until threshold
            }
        } else if (healthState === MONITORING_STATES.HEALTHY) {
            newConsecutiveRecoveries += 1;
            status.lastSuccessfulCheckAt = new Date().toISOString();

            if (previousState !== MONITORING_STATES.HEALTHY && previousState !== MONITORING_STATES.UNKNOWN) {
                if (newConsecutiveRecoveries >= (config.recoveryThreshold || 1)) {
                    targetState = MONITORING_STATES.HEALTHY;
                    newConsecutiveFailures = 0;
                } else {
                    targetState = MONITORING_STATES.RECOVERING;
                }
            } else {
                newConsecutiveFailures = 0;
            }
        }

        // Save updated status
        const nextCheckInterval = (config.healthIntervalSeconds || 15) * 1000;
        const resolvedCapabilities = capabilitiesAvailable.length > 0
            ? capabilitiesAvailable
            : (Array.isArray(status.capabilities) ? status.capabilities : []);
        const resolvedCapabilitySource = capabilitiesAvailable.length > 0
            ? capabilitySource
            : (status.capabilitySource || null);
        const capabilityStatus = resolvedCapabilities.length > 0 ? 'AVAILABLE' : 'NOT_EXPOSED';
        const updatedStatus = this.store.saveStatus(agentId, {
            currentState: targetState,
            previousState,
            connectivity,
            lastCheckAt: new Date().toISOString(),
            nextCheckAt: new Date(Date.now() + nextCheckInterval).toISOString(),
            consecutiveFailures: newConsecutiveFailures,
            consecutiveRecoveries: newConsecutiveRecoveries,
            totalChecksCount: newCount,
            totalFailuresCount: isFailure ? (status.totalFailuresCount || 0) + 1 : (status.totalFailuresCount || 0),
            lastError: checkError,
            capabilities: resolvedCapabilities,
            capabilitySource: resolvedCapabilitySource,
            capabilityStatus,
            capabilityLastProbedAt: capabilityProbed ? new Date().toISOString() : (status.capabilityLastProbedAt || null),
            latency: {
                lastLatencyMs: totalCheckLatency,
                avgLatencyMs: newAvg,
                minLatencyMs: newMin,
                maxLatencyMs: newMax,
                healthLatencyMs,
                capabilityLatencyMs: capLatencyMs,
                executionLatencyMs: status.latency ? (status.latency.executionLatencyMs || 0) : 0
            }
        }, tenantId);

        // Record check history record
        const checkRecord = this.store.addCheckRecord(agentId, {
            timestamp: new Date().toISOString(),
            connectivity,
            healthState: targetState,
            healthStatusCode,
            durationMs: totalCheckLatency,
            error: checkError,
            correlationId
        }, tenantId);

        // Always publish telemetry for probe result & latency measurement
        this._publishTelemetryEvent({
            eventType: 'HEALTH_CHECK_RESULT',
            agentId,
            status: targetState,
            durationMs: totalCheckLatency,
            timestamp: new Date().toISOString(),
            correlationId,
            metrics: { latencyMs: totalCheckLatency, connectivity }
        });
        this._publishTelemetryEvent({
            eventType: 'LATENCY_MEASUREMENT',
            agentId,
            durationMs: totalCheckLatency,
            timestamp: new Date().toISOString(),
            correlationId
        });

        // Generate operational diagnosis via HealthDiagnosisGenerator
        try {
            const diagnosis = HealthDiagnosisGenerator.generateDiagnosis(agentId, {
                status: targetState,
                httpStatus: healthStatusCode,
                responseTimeMs: totalCheckLatency,
                errorMessage: checkError,
                consecutiveFailures: newConsecutiveFailures,
                lastSuccessfulCheck: updatedStatus.lastSuccessfulCheckAt
            });
            updatedStatus.latestDiagnosis = diagnosis;
            this.store.saveStatus(agentId, updatedStatus, tenantId);
        } catch (diagErr) {}

        // Handle Incident Creation & Updating on Failure (runs on every failed check)
        if (targetState === MONITORING_STATES.DEGRADED || targetState === MONITORING_STATES.UNHEALTHY || targetState === MONITORING_STATES.OFFLINE) {
            let inc = this.store.findActiveIncident(agentId, tenantId);
            if (inc) {
                inc.failureCount = (inc.failureCount || 0) + 1;
                if (checkError) {
                    inc.evidence = Array.from(new Set([...(inc.evidence || []), checkError]));
                }
                if (correlationId) {
                    inc.correlationIds = Array.from(new Set([...(inc.correlationIds || []), correlationId]));
                }
                inc = this.store.saveIncident(inc, tenantId);
            } else {
                inc = this.store.saveIncident({
                    agentId,
                    tenantId,
                    severity: targetState === MONITORING_STATES.OFFLINE ? 'CRITICAL' : (targetState === MONITORING_STATES.UNHEALTHY ? 'HIGH' : 'MEDIUM'),
                    status: 'OPEN',
                    type: targetState === MONITORING_STATES.OFFLINE ? 'AGENT_OFFLINE' : (targetState === MONITORING_STATES.DEGRADED ? 'AGENT_DEGRADED' : 'AGENT_HEALTH_FAILED'),
                    trigger: targetState === MONITORING_STATES.OFFLINE ? 'AGENT_OFFLINE' : 'AGENT_HEALTH_FAILED',
                    failureCount: newConsecutiveFailures,
                    summary: `${agentId} transitioned to ${targetState}`,
                    evidence: checkError ? [checkError] : [`Agent transitioned to ${targetState}`],
                    correlationIds: [correlationId]
                }, tenantId);
            }

            updatedStatus.activeIncidentId = inc.id;
            this.store.saveStatus(agentId, updatedStatus, tenantId);
        }

        // Detect State Changes & Incidents
        if (previousState !== targetState) {
            this.store.addTimelineEntry(agentId, {
                type: 'STATE_CHANGED',
                message: `Health state changed ${previousState} → ${targetState}`,
                fromState: previousState,
                toState: targetState,
                error: checkError
            }, tenantId);

            // Record STATE_TRANSITION telemetry event
            this._publishTelemetryEvent({
                eventType: 'STATE_TRANSITION',
                agentId,
                previousState,
                currentState: targetState,
                timestamp: new Date().toISOString(),
                correlationId
            });

            // Handle Alerts on state transition
            if (targetState === MONITORING_STATES.DEGRADED || targetState === MONITORING_STATES.UNHEALTHY || targetState === MONITORING_STATES.OFFLINE) {
                const inc = this.store.findActiveIncident(agentId, tenantId);
                this._emitMonitoringAlert({
                    title: `Agent Monitoring Alert: ${agentId} is ${targetState}`,
                    description: checkError || `Agent ${agentId} transitioned to state ${targetState}`,
                    severity: inc ? inc.severity : 'HIGH',
                    agentId,
                    tenantId,
                    correlationId
                });

                // Emit SYSTEM_ALERT_EMITTED telemetry
                this._publishTelemetryEvent({
                    eventType: 'SYSTEM_ALERT_EMITTED',
                    agentId,
                    status: targetState,
                    message: checkError || `Agent ${agentId} transitioned to ${targetState}`,
                    timestamp: new Date().toISOString(),
                    correlationId
                });

                const eventType = targetState === MONITORING_STATES.DEGRADED ? MONITORING_EVENTS.AGENT_DEGRADED :
                                 (targetState === MONITORING_STATES.OFFLINE ? MONITORING_EVENTS.AGENT_OFFLINE : MONITORING_EVENTS.AGENT_UNHEALTHY);
                
                this._publishMonitoringEvent(eventType, {
                    agentId,
                    tenantId,
                    state: targetState,
                    error: checkError,
                    incidentId: inc ? inc.id : null,
                    latencyMs: totalCheckLatency
                }, correlationId);
            } else if (targetState === MONITORING_STATES.HEALTHY && (previousState === MONITORING_STATES.UNHEALTHY || previousState === MONITORING_STATES.OFFLINE || previousState === MONITORING_STATES.DEGRADED || previousState === MONITORING_STATES.RECOVERING)) {
                // RECOVERY DETECTED
                const activeInc = this.store.findActiveIncident(agentId, tenantId) || (updatedStatus.activeIncidentId ? this.store.getIncident(updatedStatus.activeIncidentId) : null);
                if (activeInc) {
                    const now = new Date().toISOString();
                    activeInc.status = 'RESOLVED';
                    activeInc.state = 'RESOLVED';
                    activeInc.recoveredAt = now;
                    activeInc.resolvedAt = now;
                    const durationMs = new Date(now).getTime() - new Date(activeInc.startedAt).getTime();
                    activeInc.durationMs = durationMs;
                    const mins = Math.max(1, Math.round(durationMs / 60000));
                    activeInc.summary = `${agentId} recovered after approximately ${mins} minutes of unavailability.`;
                    this.store.saveIncident(activeInc, tenantId);
                }
                updatedStatus.activeIncidentId = null;
                this.store.saveStatus(agentId, updatedStatus, tenantId);

                this._emitMonitoringAlert({
                    title: `Agent Recovered: ${agentId}`,
                    description: `${agentId} recovered and is responding normally.`,
                    severity: 'INFO',
                    agentId,
                    tenantId,
                    correlationId
                });

                this.store.addTimelineEntry(agentId, {
                    type: 'RECOVERED',
                    message: `Agent recovered to HEALTHY state`
                }, tenantId);

                this._publishMonitoringEvent(MONITORING_EVENTS.AGENT_RECOVERED, {
                    agentId,
                    tenantId,
                    state: MONITORING_STATES.HEALTHY,
                    consecutiveRecoveries: newConsecutiveRecoveries
                }, correlationId);
            }

            this._publishMonitoringEvent(MONITORING_EVENTS.AGENT_HEALTH_CHANGED, {
                agentId,
                tenantId,
                fromState: previousState,
                toState: targetState,
                connectivity
            }, correlationId);
        } else {
            this._publishMonitoringEvent(MONITORING_EVENTS.AGENT_HEALTH_CHECKED, {
                agentId,
                tenantId,
                state: targetState,
                connectivity,
                latencyMs: totalCheckLatency
            }, correlationId);
        }

        return updatedStatus;
    }

    async performSafeExecutionCheck(agentId, tenantId = 'default-tenant', payload = {}) {
        const config = this.store.getConfig(agentId, tenantId);
        const status = this.store.getStatus(agentId, tenantId);
        const correlationId = payload.correlationId || `corr_exec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const baseUrl = await this._resolveAgentEndpoint(agentId, tenantId);

        const safePayload = {
            task: payload.task || 'monitoring_ping',
            parameters: payload.parameters || { mode: 'check' },
            timestamp: new Date().toISOString()
        };

        const execUrl = `${baseUrl.replace(/\/$/, '')}/execute`;
        const res = await this._makeHttpRequest(execUrl, {
            method: 'POST',
            body: safePayload,
            timeout: config.timeoutMs || 5000
        });

        const execResult = {
            success: res.success,
            statusCode: res.statusCode,
            durationMs: res.durationMs,
            data: res.data,
            error: res.error || (res.success ? null : `Execution failed with HTTP ${res.statusCode}`),
            timestamp: new Date().toISOString()
        };

        // Update execution latency in status
        status.latency.executionLatencyMs = res.durationMs;
        status.lastExecutionResult = execResult;
        this.store.saveStatus(agentId, status, tenantId);

        this.store.addTimelineEntry(agentId, {
            type: res.success ? 'EXECUTION_SUCCESS' : 'EXECUTION_FAILED',
            message: res.success ? `Test execution succeeded in ${res.durationMs}ms` : `Test execution failed: ${execResult.error}`,
            durationMs: res.durationMs,
            error: execResult.error
        }, tenantId);

        const eventType = res.success ? MONITORING_EVENTS.AGENT_EXECUTION_CHECKED : MONITORING_EVENTS.AGENT_EXECUTION_FAILED;
        this._publishMonitoringEvent(eventType, {
            agentId,
            tenantId,
            success: res.success,
            durationMs: res.durationMs,
            error: execResult.error
        }, correlationId);

        return execResult;
    }

    async checkAllAgents(tenantId = 'default-tenant') {
        const statuses = this.store.listStatuses(tenantId);
        const results = [];
        for (const st of statuses) {
            try {
                const res = await this.checkAgent(st.agentId, tenantId);
                results.push(res);
            } catch (err) {
                console.error(`Check all failed for agent ${st.agentId}:`, err.message);
            }
        }
        return results;
    }

    async proxyControlMode(agentId, tenantId = 'default-tenant', controlData = {}) {
        const baseUrl = await this._resolveAgentEndpoint(agentId, tenantId);
        const controlUrl = `${baseUrl.replace(/\/$/, '')}/control/mode`;
        const res = await this._makeHttpRequest(controlUrl, {
            method: 'POST',
            body: controlData,
            timeout: 5000
        });

        this.store.addTimelineEntry(agentId, {
            type: 'CONTROL_MODE_CHANGED',
            message: `Agent simulation mode set to: ${controlData.mode || 'NORMAL'}`,
            mode: controlData.mode
        }, tenantId);

        // Immediate check to reflect simulated state in Watchtower
        await this.checkAgent(agentId, tenantId);

        return res;
    }

    stopAll() {
        for (const [key, timer] of this.timers.entries()) {
            clearInterval(timer);
        }
        this.timers.clear();
        this.isChecking.clear();
    }
}

module.exports = AgentMonitoringService;
