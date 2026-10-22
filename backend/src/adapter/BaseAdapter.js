/**
 * Universal Base Adapter Interface
 * Base contract for all platform adapters (HTTP, Webhook, SDK, Mock, Custom).
 * Purely generic - contains zero domain-specific logic.
 */

class BaseAdapter {
    /**
     * @param {Object} metadata - Normalized AdapterMetadata object
     * @param {Object} options - Additional runtime options
     */
    constructor(metadata = {}, options = {}) {
        this.metadata = metadata;
        this.options = options;
        this.adapterId = metadata.adapterId || 'base-adapter';
        this.adapterType = metadata.adapterType || 'custom';
        this.supportedOperations = new Set(
            Array.isArray(metadata.supportedOperations)
                ? metadata.supportedOperations.map(op => String(op).trim().toLowerCase())
                : ['health', 'execute']
        );
        this.connected = false;
    }

    /**
     * Check if an operation is supported by this adapter instance.
     * @param {string} operation 
     * @returns {boolean}
     */
    supportsOperation(operation) {
        if (!operation || typeof operation !== 'string') return false;
        return this.supportedOperations.has(operation.trim().toLowerCase());
    }

    /**
     * Create standardized unsupported operation error.
     */
    createUnsupportedOperationError(operation) {
        return {
            success: false,
            error: {
                code: 'UNSUPPORTED_OPERATION',
                message: `Operation '${operation}' is not supported by adapter '${this.adapterId}' (type: ${this.adapterType})`,
                retryable: false,
                category: 'ADAPTER'
            },
            status: 400,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Establish connection to external target.
     */
    async connect(config = {}) {
        this.connected = true;
        return {
            success: true,
            status: 200,
            message: `Adapter '${this.adapterId}' connected successfully`
        };
    }

    /**
     * Terminate connection to external target.
     */
    async disconnect() {
        this.connected = false;
        return {
            success: true,
            status: 200,
            message: `Adapter '${this.adapterId}' disconnected successfully`
        };
    }

    /**
     * Execute health check verification on external system.
     */
    async healthCheck(payload = {}) {
        if (!this.supportsOperation('health')) {
            return this.createUnsupportedOperationError('health');
        }
        return {
            success: true,
            status: 200,
            healthy: true,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Execute generic operation payload on external system.
     */
    async execute(operation, payload = {}, context = {}) {
        if (!this.supportsOperation(operation)) {
            return this.createUnsupportedOperationError(operation);
        }
        throw new Error(`Adapter '${this.adapterId}' must implement execute() method`);
    }

    /**
     * Collect telemetry metrics or traces.
     */
    async collectTelemetry(criteria = {}) {
        if (!this.supportsOperation('telemetry')) {
            return this.createUnsupportedOperationError('telemetry');
        }
        return {
            success: true,
            status: 200,
            telemetry: []
        };
    }

    /**
     * Get adapter capabilities.
     */
    getCapabilities() {
        return Array.from(this.supportedOperations);
    }

    /**
     * Get adapter metadata.
     */
    getMetadata() {
        return {
            adapterId: this.adapterId,
            adapterType: this.adapterType,
            supportedOperations: Array.from(this.supportedOperations),
            connected: this.connected
        };
    }
}

module.exports = {
    BaseAdapter
};
