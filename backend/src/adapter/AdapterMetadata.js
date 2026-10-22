/**
 * Adapter Metadata
 * Represents metadata required to connect a registered system to an adapter (Phase 2 readiness).
 * Does not implement execution logic.
 */

const ADAPTER_TYPES = Object.freeze({
    HTTP: 'http',
    GRPC: 'grpc',
    WEBHOOK: 'webhook',
    SDK: 'sdk',
    CUSTOM: 'custom'
});

const AUTH_TYPES = Object.freeze({
    NONE: 'none',
    API_KEY: 'api_key',
    BEARER: 'bearer',
    OAUTH2: 'oauth2',
    CUSTOM: 'custom'
});

class AdapterMetadata {
    static get ADAPTER_TYPES() {
        return ADAPTER_TYPES;
    }

    static get AUTH_TYPES() {
        return AUTH_TYPES;
    }

    static normalize(rawAdapter = {}) {
        if (typeof rawAdapter !== 'object' || rawAdapter === null) {
            return {
                adapterType: ADAPTER_TYPES.HTTP,
                adapterId: 'default-http-adapter',
                supportedOperations: ['health', 'execute'],
                connectionConfigRef: null,
                authRef: { authType: AUTH_TYPES.NONE },
                timeoutConfig: { connectTimeoutMs: 5000, readTimeoutMs: 10000 },
                capabilityMapping: {}
            };
        }

        const adapterType = typeof rawAdapter.adapterType === 'string'
            ? rawAdapter.adapterType.toLowerCase()
            : ADAPTER_TYPES.HTTP;

        const adapterId = typeof rawAdapter.adapterId === 'string' && rawAdapter.adapterId.trim()
            ? rawAdapter.adapterId.trim()
            : `${adapterType}-adapter`;

        const supportedOperations = Array.isArray(rawAdapter.supportedOperations)
            ? rawAdapter.supportedOperations.map(op => String(op).trim().toLowerCase())
            : ['health', 'execute'];

        const authRef = (typeof rawAdapter.authRef === 'object' && rawAdapter.authRef !== null)
            ? {
                authType: typeof rawAdapter.authRef.authType === 'string' ? rawAdapter.authRef.authType.toLowerCase() : AUTH_TYPES.NONE,
                keyName: rawAdapter.authRef.keyName || null,
                tokenRef: rawAdapter.authRef.tokenRef || null
            }
            : { authType: AUTH_TYPES.NONE };

        const timeoutConfig = (typeof rawAdapter.timeoutConfig === 'object' && rawAdapter.timeoutConfig !== null)
            ? {
                connectTimeoutMs: Number(rawAdapter.timeoutConfig.connectTimeoutMs) || 5000,
                readTimeoutMs: Number(rawAdapter.timeoutConfig.readTimeoutMs) || 10000
            }
            : { connectTimeoutMs: 5000, readTimeoutMs: 10000 };

        // Preserve endpoint reachability info (single source of truth for monitoring).
        // Historical payloads use baseUrl / endpoint / connectionConfigRef interchangeably.
        const baseUrl = typeof rawAdapter.baseUrl === 'string' && rawAdapter.baseUrl.trim()
            ? rawAdapter.baseUrl.trim()
            : (typeof rawAdapter.connectionConfigRef === 'string' && rawAdapter.connectionConfigRef.trim()
                ? rawAdapter.connectionConfigRef.trim()
                : (typeof rawAdapter.endpoint === 'string' && rawAdapter.endpoint.trim() ? rawAdapter.endpoint.trim() : null));
        const connectionConfigRef = typeof rawAdapter.connectionConfigRef === 'string' && rawAdapter.connectionConfigRef.trim()
            ? rawAdapter.connectionConfigRef.trim()
            : baseUrl;

        return {
            adapterType,
            adapterId,
            supportedOperations,
            connectionConfigRef,
            baseUrl,
            endpoint: baseUrl,
            endpoints: (typeof rawAdapter.endpoints === 'object' && rawAdapter.endpoints !== null) ? rawAdapter.endpoints : null,
            authRef,
            timeoutConfig,
            capabilityMapping: rawAdapter.capabilityMapping || {}
        };
    }

    /**
     * Remove sensitive auth credentials before returning payload in public/log responses.
     */
    static sanitize(adapterMetadata) {
        if (!adapterMetadata) return null;
        const copy = JSON.parse(JSON.stringify(adapterMetadata));
        if (copy.authRef) {
            delete copy.authRef.secretKey;
            delete copy.authRef.password;
            delete copy.authRef.token;
        }
        return copy;
    }
}

module.exports = {
    ADAPTER_TYPES,
    AUTH_TYPES,
    AdapterMetadata
};
