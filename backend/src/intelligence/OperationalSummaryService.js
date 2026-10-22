/**
 * Phase 17 — Operational Summary Service
 * Reusable domain-agnostic summary engine that converts raw agent/system monitoring
 * data, health states, alerts, telemetry, and quality metrics into human-readable operational summaries.
 */

const SECRET_PATTERNS = [/password/i, /token/i, /apikey/i, /secret/i, /privatekey/i, /bearertoken/i, /credentials/i];

class OperationalSummaryService {
    constructor(options = {}) {
        this.agentService = options.agentService || null;
        this.monitoringService = options.agentMonitoringService || null;
        this.systemRegistry = options.systemRegistry || null;
        this.alertingService = options.alertingService || null;
        this.healthEngine = options.healthEngine || null;
    }

    _redactSecrets(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => this._redactSecrets(item));

        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            const isSecretKey = SECRET_PATTERNS.some(pat => pat.test(key));
            if (isSecretKey) {
                sanitized[key] = '***REDACTED***';
            } else if (value && typeof value === 'object') {
                sanitized[key] = this._redactSecrets(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    generateAgentSummary(agentData = {}, monitoringData = {}, alertData = []) {
        const agentId = agentData.id || agentData.agentId || monitoringData.agentId || 'UNKNOWN_AGENT';
        const agentName = agentData.name || agentData.agentName || agentId;
        const tenantId = agentData.tenantId || monitoringData.tenantId || 'default-tenant';

        const status = monitoringData.status || monitoringData || {};
        const config = monitoringData.config || {};
        const currentState = status.currentState || agentData.status || 'UNKNOWN';

        const good = [];
        const warnings = [];
        const problems = [];
        const information = [];
        const recommendedActions = [];

        let overallStatus = 'UNKNOWN';
        let headline = 'Insufficient monitoring data to determine condition.';
        let summary = 'Watchtower has not gathered enough evidence for this agent.';

        // 1. Evaluate Overall Status & Headline
        if (currentState === 'HEALTHY') {
            overallStatus = 'HEALTHY';
            headline = 'Agent is operating normally';
            summary = 'The agent is reachable, healthy, and responding within acceptable latency limits.';
        } else if (currentState === 'DEGRADED' || currentState === 'RECOVERING') {
            overallStatus = 'DEGRADED';
            headline = 'Agent performance is degraded';
            summary = 'The agent is reachable, but response time is slow or warning conditions are active.';
        } else if (currentState === 'UNHEALTHY' || currentState === 'OFFLINE') {
            overallStatus = currentState === 'OFFLINE' ? 'OFFLINE' : 'PROBLEM';
            headline = currentState === 'OFFLINE' ? 'Agent is unreachable / offline' : 'Agent health check is failing';
            summary = 'Watchtower detected failures or connectivity errors while communicating with this agent.';
        }

        // 2. Identify Positive Signals (GOOD)
        if (status.connectivity === 'CONNECTED') {
            good.push('🟢 Agent is connected and reachable via HTTP.');
        }
        if (currentState === 'HEALTHY') {
            good.push('🟢 Health checks are passing without errors.');
        }
        if (status.capabilities && status.capabilities.length > 0) {
            good.push(`🟢 Capability discovery succeeded (${status.capabilities.length} capabilities declared).`);
        }
        if (agentData.contractVersion || agentData.version) {
            good.push(`🟢 Valid Universal Agent Contract (v${agentData.contractVersion || agentData.version || '1.0.0'}).`);
        }
        if (status.latency && status.latency.lastLatencyMs > 0 && status.latency.lastLatencyMs < 1000) {
            good.push(`🟢 Fast response latency (${status.latency.lastLatencyMs} ms).`);
        }
        if (!status.activeIncidentId && alertData.length === 0) {
            good.push('🟢 No active incidents or unresolved alerts.');
        }

        // 3. Identify Non-Critical Warnings (WARNINGS)
        if (status.latency && status.latency.lastLatencyMs > 1500) {
            warnings.push(`🟡 Response latency is elevated (${status.latency.lastLatencyMs} ms).`);
        }
        if (status.consecutiveFailures > 0 && status.consecutiveFailures < (config.failureThreshold || 3)) {
            warnings.push(`🟡 Transient failure detected (${status.consecutiveFailures} consecutive retry attempts).`);
        }
        if (!agentData.authentication || agentData.authentication.authType === 'none' || agentData.authentication === 'none') {
            warnings.push('🟡 Authentication: No authentication configured for this endpoint.');
        }
        if (currentState === 'RECOVERING') {
            warnings.push('🟡 Agent is currently in RECOVERING state after a recent failure.');
        }

        // 4. Identify Problems (PROBLEMS)
        if (currentState === 'OFFLINE') {
            problems.push('🔴 Agent is currently unreachable or connection was refused.');
        }
        if (currentState === 'UNHEALTHY') {
            problems.push('🔴 Agent health check endpoint returned HTTP error or unhealthy status.');
        }
        if (status.lastError) {
            problems.push(`🔴 Latest Monitoring Error: ${status.lastError}`);
        }
        if (status.consecutiveFailures >= (config.failureThreshold || 3)) {
            problems.push(`🔴 Failure Threshold Exceeded: ${status.consecutiveFailures} consecutive failures recorded.`);
        }
        if (status.activeIncidentId) {
            problems.push(`🔴 Active Monitoring Incident: ${status.activeIncidentId} is currently OPEN.`);
        }

        // 5. Information Summary
        information.push(`ℹ️ Agent ID: ${agentId}`);
        information.push(`ℹ️ Category: ${agentData.category || 'automation'}`);
        information.push(`ℹ️ Endpoint: ${agentData.endpoint || agentData.baseUrl || config.endpointOverride || 'http://localhost:4001'}`);
        if (status.lastCheckAt) {
            information.push(`ℹ️ Last Check: ${new Date(status.lastCheckAt).toLocaleTimeString()}`);
        }
        if (status.latency) {
            information.push(`ℹ️ Average Latency: ${status.latency.avgLatencyMs || 0} ms (Min: ${status.latency.minLatencyMs || 0} ms, Max: ${status.latency.maxLatencyMs || 0} ms)`);
        }

        // 6. Generate Factual Recommended Actions
        if (overallStatus === 'HEALTHY') {
            recommendedActions.push('No immediate operator action required.');
        } else if (overallStatus === 'DEGRADED') {
            recommendedActions.push('Review recent agent response latency and inspect latest telemetry metrics.');
            recommendedActions.push('Check host server resource allocation if response latency remains high.');
        } else if (overallStatus === 'OFFLINE' || overallStatus === 'PROBLEM') {
            recommendedActions.push('Verify that the external agent service process is running on the target host.');
            recommendedActions.push('Confirm that the configured endpoint URL and network port are reachable.');
            recommendedActions.push('Inspect Audit Logs and Alerts for correlation IDs associated with recent checks.');
        }

        const technicalDetails = this._redactSecrets({
            agent: agentData,
            monitoring: monitoringData,
            alerts: alertData
        });

        return {
            agentId,
            agentName,
            tenantId,
            overallStatus,
            headline,
            summary,
            good: good.length > 0 ? good : ['🟢 Insufficient evidence for positive signals.'],
            warnings,
            problems,
            information,
            recommendedActions,
            lastUpdated: new Date().toISOString(),
            technicalDetails
        };
    }

    generateSystemSummary(systemData = {}) {
        const systemId = systemData.id || systemData.systemId || 'UNKNOWN_SYSTEM';
        const systemName = systemData.name || systemId;

        const good = [];
        const warnings = [];
        const problems = [];
        const information = [];
        const recommendedActions = [];

        const lifecycleState = systemData.onboardStatus || systemData.lifecycleState || 'UNKNOWN';

        let overallStatus = 'HEALTHY';
        let headline = 'System onboarding and integration profile operational';

        if (lifecycleState === 'ACTIVE' || lifecycleState === 'MONITORING') {
            good.push('🟢 System onboarding profile is active and monitored.');
        } else {
            warnings.push(`🟡 System lifecycle status is currently ${lifecycleState}.`);
        }

        if (systemData.adapter && systemData.adapter.adapterType) {
            good.push(`🟢 Configured with ${systemData.adapter.adapterType.toUpperCase()} adapter.`);
        }

        if (systemData.connection && systemData.connection.baseUrl) {
            information.push(`ℹ️ Base URL: ${systemData.connection.baseUrl}`);
        }

        if (!systemData.authentication || systemData.authentication.authType === 'none') {
            warnings.push('🟡 Authentication: No authentication configured for system endpoint.');
        } else {
            good.push(`🟢 Authentication configured (${systemData.authentication.authType}).`);
        }

        if (systemData.capabilities && systemData.capabilities.length > 0) {
            information.push(`ℹ️ Registered Capabilities: ${systemData.capabilities.join(', ')}`);
        }

        recommendedActions.push('Use "Test Connection" to verify adapter response status.');

        return {
            systemId,
            systemName,
            overallStatus,
            headline,
            summary: `Onboarding profile for ${systemName} is registered.`,
            good,
            warnings,
            problems,
            information,
            recommendedActions,
            lastUpdated: new Date().toISOString(),
            technicalDetails: this._redactSecrets(systemData)
        };
    }
}

module.exports = OperationalSummaryService;
