/**
 * Universal System Contract
 * Defines standard data model and factory for registered external systems.
 * Purely generic - contains no application-specific logic.
 */

const { LIFECYCLE_STATES } = require('../lifecycle/SystemLifecycle');
const { AdapterMetadata } = require('../adapter/AdapterMetadata');

class UniversalSystemContract {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.id = raw.id ? String(raw.id).trim() : '';
        this.name = raw.name ? String(raw.name).trim() : '';
        this.version = raw.version ? String(raw.version).trim() : '1.0.0';
        this.contractVersion = raw.contractVersion ? String(raw.contractVersion).trim() : '1.0.0';
        this.description = raw.description ? String(raw.description).trim() : '';
        this.category = raw.category ? String(raw.category).trim() : 'general';

        // Capabilities list (normalized array of objects)
        this.capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];

        // Adapter metadata
        this.adapter = AdapterMetadata.normalize(raw.adapter);

        // Preserve reachable endpoint at contract top-level so monitoring can
        // resolve it without depending on adapter internals. Sources in order:
        // explicit baseUrl/endpoint, then adapter baseUrl/connectionConfigRef.
        const explicitBase = (typeof raw.baseUrl === 'string' && raw.baseUrl.trim())
            ? raw.baseUrl.trim()
            : ((typeof raw.endpoint === 'string' && raw.endpoint.trim()) ? raw.endpoint.trim() : null);
        this.baseUrl = explicitBase || this.adapter.baseUrl || this.adapter.connectionConfigRef || null;
        this.endpoint = explicitBase || this.adapter.endpoint || this.adapter.connectionConfigRef || null;

        // Lifecycle state
        this.lifecycleState = raw.lifecycleState && Object.values(LIFECYCLE_STATES).includes(raw.lifecycleState)
            ? raw.lifecycleState
            : LIFECYCLE_STATES.REGISTERED;

        // Configuration references
        this.healthConfigRef = raw.healthConfigRef || null;
        this.executionConfigRef = raw.executionConfigRef || null;
        this.telemetryConfigRef = raw.telemetryConfigRef || null;
        this.qualityConfigRef = raw.qualityConfigRef || null;
        this.usageConfigRef = raw.usageConfigRef || null;
        this.feedbackConfigRef = raw.feedbackConfigRef || null;

        // Endpoint definitions
        this.endpoints = raw.endpoints || null;

        // Arbitrary generic metadata
        this.metadata = (typeof raw.metadata === 'object' && raw.metadata !== null && !Array.isArray(raw.metadata))
            ? raw.metadata
            : {};

        this.createdAt = raw.createdAt || now;
        this.updatedAt = raw.updatedAt || now;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            version: this.version,
            contractVersion: this.contractVersion,
            description: this.description,
            category: this.category,
            capabilities: this.capabilities,
            adapter: AdapterMetadata.sanitize(this.adapter),
            baseUrl: this.baseUrl,
            endpoint: this.endpoint,
            lifecycleState: this.lifecycleState,
            healthConfigRef: this.healthConfigRef,
            executionConfigRef: this.executionConfigRef,
            telemetryConfigRef: this.telemetryConfigRef,
            qualityConfigRef: this.qualityConfigRef,
            usageConfigRef: this.usageConfigRef,
            feedbackConfigRef: this.feedbackConfigRef,
            endpoints: this.endpoints,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = {
    UniversalSystemContract
};
