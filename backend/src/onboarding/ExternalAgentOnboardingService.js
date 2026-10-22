/**
 * ExternalAgentOnboardingService
 * Provides a dedicated, secure onboarding workflow for external HTTP agents.
 * Performs URL validation, connectivity probing, metadata discovery, endpoint mapping,
 * registration in SystemRegistry, and initial health verification.
 */

const { ExternalAgentAdapter } = require('../adapter/ExternalAgentAdapter');
const { SsrfProtector } = require('../adapter/SsrfProtector');
const { auditLogService } = require('../audit/AuditLogService');

class ExternalAgentOnboardingService {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry;
        this.healthEngine = options.healthEngine;
        this.allowLocalhost = options.allowLocalhost ?? true;
    }

    /**
     * Test connectivity and discover metadata for an external agent URL before registration.
     */
    async testConnection(config = {}) {
        const baseUrl = (config.baseUrl || config.url || '').trim();
        if (!baseUrl) {
            throw new Error('Base URL is required to test external agent connectivity');
        }

        // 1. SSRF Check
        const ssrfCheck = SsrfProtector.validateUrl(baseUrl, { allowLocalhost: this.allowLocalhost });
        if (!ssrfCheck.safe) {
            return {
                reachable: false,
                status: 'OFFLINE',
                reason: 'SSRF_BLOCKED',
                error: ssrfCheck.error,
                discoveredCapabilities: [],
                endpointsMapped: {}
            };
        }

        // 2. Instantiate transient ExternalAgentAdapter
        const adapter = new ExternalAgentAdapter({
            id: `probe_${Date.now()}`,
            baseUrl,
            authRef: config.authRef || { authType: config.authType || 'none' },
            endpoints: config.endpoints || {
                health: { path: config.healthEndpoint || '', method: 'GET', enabled: true },
                contract: { path: config.contractEndpoint || '/contract', method: 'GET', enabled: Boolean(config.contractEndpoint) },
                capabilities: { path: config.capabilitiesEndpoint || '/capabilities', method: 'GET', enabled: Boolean(config.capabilitiesEndpoint) },
                execution: { path: config.executionEndpoint || '/execute', method: 'POST', enabled: Boolean(config.executionEndpoint) }
            },
            timeoutConfig: { connectTimeoutMs: 5000, readTimeoutMs: 8000 }
        }, { allowLocalhost: this.allowLocalhost });

        // 3. Execute Probe
        const probeResult = await adapter.execute('health', {}, { systemId: 'PROBE_TEMP' });

        const reachable = probeResult.success || probeResult.status === 'HEALTHY' || probeResult.status === 'DEGRADED';
        const detectedContentType = probeResult.contentType || 'unknown';

        // 4. Map Discovered Capabilities
        const discoveredCapabilities = ['health', 'monitoring'];
        const endpointsMapped = {
            health: 'CONFIGURED',
            contract: config.contractEndpoint ? 'CONFIGURED' : 'UNSUPPORTED',
            capabilities: config.capabilitiesEndpoint ? 'CONFIGURED' : 'UNSUPPORTED',
            status: config.statusEndpoint ? 'CONFIGURED' : 'UNSUPPORTED',
            execution: config.executionEndpoint ? 'CONFIGURED' : 'UNSUPPORTED'
        };

        if (config.contractEndpoint) discoveredCapabilities.push('contract');
        if (config.capabilitiesEndpoint) discoveredCapabilities.push('capabilities');
        if (config.executionEndpoint) discoveredCapabilities.push('execution');

        return {
            reachable,
            status: probeResult.status || (reachable ? 'HEALTHY' : 'OFFLINE'),
            httpStatus: probeResult.httpStatus || (reachable ? 200 : 0),
            latencyMs: probeResult.durationMs || 0,
            detectedContentType,
            discoveredCapabilities,
            endpointsMapped,
            evidence: probeResult.evidence || [`HTTP Status ${probeResult.httpStatus || 200}`],
            rawProbeData: probeResult.data || null
        };
    }

    /**
     * Register an external agent into the universal platform registry.
     */
    async registerExternalAgent(payload = {}, actor = 'operator') {
        const id = (payload.id || payload.agentId || `ext-${Date.now()}`).trim();
        const name = (payload.name || payload.agentName || id).trim();
        const baseUrl = (payload.baseUrl || '').trim();

        if (!baseUrl) throw new Error('Base URL is required for external agent registration');

        // SSRF Check
        const ssrfCheck = SsrfProtector.validateUrl(baseUrl, { allowLocalhost: this.allowLocalhost });
        if (!ssrfCheck.safe) throw new Error(`Registration rejected by security policy: ${ssrfCheck.error}`);

        const category = payload.category || 'external_agent';
        const version = payload.version || '1.0.0';
        const contractVersion = payload.contractVersion || '1.0.0';

        const capabilities = Array.isArray(payload.capabilities) && payload.capabilities.length > 0
            ? payload.capabilities
            : ['health', 'monitoring'];

        const endpoints = payload.endpoints || {
            health: { path: payload.healthEndpoint || '', method: 'GET', enabled: true },
            contract: { path: payload.contractEndpoint || '', method: 'GET', enabled: Boolean(payload.contractEndpoint) },
            capabilities: { path: payload.capabilitiesEndpoint || '', method: 'GET', enabled: Boolean(payload.capabilitiesEndpoint) },
            status: { path: payload.statusEndpoint || '', method: 'GET', enabled: Boolean(payload.statusEndpoint) },
            execution: { path: payload.executionEndpoint || '', method: 'POST', enabled: Boolean(payload.executionEndpoint) }
        };

        const agentRecord = {
            id,
            name,
            category,
            version,
            contractVersion,
            baseUrl,
            capabilities,
            adapter: {
                adapterId: `adapter_${id}`,
                adapterType: 'ExternalAgentAdapter',
                baseUrl,
                authRef: payload.authRef || { authType: payload.authType || 'none' },
                endpoints,
                timeoutConfig: payload.timeoutConfig || { connectTimeoutMs: 5000, readTimeoutMs: 8000 },
                retryConfig: payload.retryConfig || { maxRetries: 2, retryDelayMs: 1000 }
            },
            onboardedAt: new Date().toISOString(),
            onboardStatus: 'MONITORING',
            isExternal: true
        };

        // Register in SystemRegistry
        if (this.systemRegistry && typeof this.systemRegistry.registerSystem === 'function') {
            this.systemRegistry.registerSystem(agentRecord);
        }

        // Audit Log
        auditLogService.logEvent({
            eventType: 'EXTERNAL_AGENT_ONBOARDED',
            action: 'register_external_agent',
            actor,
            role: 'operator',
            resourceType: 'agent',
            resourceId: id,
            outcome: 'SUCCESS',
            severity: 'INFO',
            metadata: { name, baseUrl, category }
        });

        // Initial Health Check if healthEngine is present
        let initialHealth = { status: 'UNKNOWN' };
        if (this.healthEngine && typeof this.healthEngine.checkHealth === 'function') {
            try {
                initialHealth = await this.healthEngine.checkHealth(id);
            } catch (err) {
                initialHealth = { status: 'OFFLINE', error: err.message };
            }
        }

        return {
            agent: agentRecord,
            initialHealth
        };
    }
}

module.exports = { ExternalAgentOnboardingService };
