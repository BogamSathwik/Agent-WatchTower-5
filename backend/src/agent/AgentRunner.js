/**
 * Agent Runner Definition
 * Encapsulates standard connection and execution runner configuration for external agents.
 * Integrates with existing Adapter Framework and SsrfProtector.
 */

const { ADAPTER_TYPES, AUTH_TYPES, AdapterMetadata } = require('../adapter/AdapterMetadata');

class AgentRunner {
    constructor(raw = {}) {
        this.type = raw.type ? String(raw.type).trim().toLowerCase() : (raw.adapterType ? String(raw.adapterType).trim().toLowerCase() : 'http');
        this.endpoint = raw.endpoint ? String(raw.endpoint).trim() : (raw.connectionConfigRef ? String(raw.connectionConfigRef).trim() : '');
        this.method = raw.method ? String(raw.method).trim().toUpperCase() : 'POST';
        this.timeoutMs = Number(raw.timeoutMs) || Number(raw.timeoutConfig?.readTimeoutMs) || 10000;
        
        // Authentication metadata
        this.authentication = (typeof raw.authentication === 'object' && raw.authentication !== null)
            ? raw.authentication
            : (typeof raw.authRef === 'object' && raw.authRef !== null ? raw.authRef : { authType: AUTH_TYPES.NONE });

        this.headers = (typeof raw.headers === 'object' && raw.headers !== null && !Array.isArray(raw.headers))
            ? raw.headers
            : {};

        this.params = (typeof raw.params === 'object' && raw.params !== null && !Array.isArray(raw.params))
            ? raw.params
            : {};

        this.capabilityMapping = (typeof raw.capabilityMapping === 'object' && raw.capabilityMapping !== null && !Array.isArray(raw.capabilityMapping))
            ? raw.capabilityMapping
            : {};
    }

    static normalize(runner) {
        if (!runner) return new AgentRunner();
        if (runner instanceof AgentRunner) return runner;
        return new AgentRunner(runner);
    }

    /**
     * Converts to compatible AdapterMetadata structure for existing execution engine.
     */
    toAdapterMetadata() {
        return AdapterMetadata.normalize({
            adapterType: this.type,
            adapterId: `${this.type}-agent-adapter`,
            supportedOperations: ['health', 'execute', 'search', 'telemetry'],
            connectionConfigRef: this.endpoint,
            authRef: this.authentication,
            timeoutConfig: {
                connectTimeoutMs: Math.min(this.timeoutMs, 5000),
                readTimeoutMs: this.timeoutMs
            },
            capabilityMapping: this.capabilityMapping
        });
    }

    /**
     * Return sanitized object with credentials redacted.
     */
    sanitize() {
        const copy = JSON.parse(JSON.stringify(this.toJSON()));
        if (copy.authentication) {
            if (copy.authentication.token) copy.authentication.token = '[REDACTED]';
            if (copy.authentication.apiKey) copy.authentication.apiKey = '[REDACTED]';
            if (copy.authentication.secret) copy.authentication.secret = '[REDACTED]';
            if (copy.authentication.password) copy.authentication.password = '[REDACTED]';
            if (copy.authentication.key) copy.authentication.key = '[REDACTED]';
        }
        if (copy.headers) {
            for (const key of Object.keys(copy.headers)) {
                if (key.toLowerCase().includes('auth') || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')) {
                    copy.headers[key] = '[REDACTED]';
                }
            }
        }
        return copy;
    }

    toJSON() {
        return {
            type: this.type,
            endpoint: this.endpoint,
            method: this.method,
            timeoutMs: this.timeoutMs,
            authentication: this.authentication,
            headers: this.headers,
            params: this.params,
            capabilityMapping: this.capabilityMapping
        };
    }
}

module.exports = {
    AgentRunner
};
