/**
 * System Execution Service
 * High-level orchestration service resolving systems, verifying capabilities,
 * instantiating adapters, executing operations, and returning normalized results.
 * Purely generic - zero business-domain logic.
 */

const { SystemRegistry } = require('../registry/SystemRegistry');
const { CapabilityRegistry } = require('../registry/CapabilityRegistry');
const { AdapterFactory } = require('../adapter/AdapterFactory');
const { AdapterRegistry } = require('../adapter/AdapterRegistry');
const { ConnectionManager } = require('../adapter/ConnectionManager');
const { ResponseNormalizer } = require('../adapter/ResponseNormalizer');
const { ErrorNormalizer } = require('../adapter/ErrorNormalizer');

class SystemExecutionService {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || new SystemRegistry();
        this.capabilityRegistry = options.capabilityRegistry || new CapabilityRegistry();
        this.adapterRegistry = options.adapterRegistry || new AdapterRegistry();
        this.adapterFactory = options.adapterFactory || new AdapterFactory(this.adapterRegistry);
        this.connectionManager = options.connectionManager || new ConnectionManager();
        this.allowLocalhost = Boolean(options.allowLocalhost);
        this.usageCollector = options.usageCollector || null;
    }

    /**
     * Connect to a system via its adapter.
     */
    async connectSystem(systemId, config = {}) {
        const system = this.systemRegistry.getSystemInstance(systemId);
        const adapter = this.adapterFactory.createAdapter(system.adapter, { allowLocalhost: this.allowLocalhost });
        const connResult = await adapter.connect(config);
        
        if (connResult.success) {
            this.connectionManager.createConnection(system.id, { adapterId: adapter.adapterId });
        }

        return ResponseNormalizer.normalize(connResult, {
            systemId: system.id,
            adapterId: adapter.adapterId,
            operation: 'connect'
        });
    }

    /**
     * Disconnect from a system.
     */
    async disconnectSystem(systemId) {
        const system = this.systemRegistry.getSystemInstance(systemId);
        const adapter = this.adapterFactory.createAdapter(system.adapter, { allowLocalhost: this.allowLocalhost });
        const disconnResult = await adapter.disconnect();
        this.connectionManager.closeConnection(system.id);

        return ResponseNormalizer.normalize(disconnResult, {
            systemId: system.id,
            adapterId: adapter.adapterId,
            operation: 'disconnect'
        });
    }

    /**
     * Execute a generic operation on a registered system.
     * @param {string} systemId 
     * @param {string} operation - e.g. 'health', 'execute', 'telemetry', 'testing'
     * @param {Object} payload 
     * @param {Object} context 
     */
    async executeOperation(systemId, operation, payload = {}, context = {}) {
        const startTime = new Date();

        if (!operation || typeof operation !== 'string') {
            const err = ErrorNormalizer.normalize(new Error('Operation name must be a non-empty string'), { status: 400 });
            return ResponseNormalizer.normalize({ success: false, error: err }, { systemId, operation: 'unknown', startTime });
        }

        const normalizedOp = operation.trim().toLowerCase();

        // 1. System Resolution
        let system;
        try {
            system = this.systemRegistry.getSystemInstance(systemId);
        } catch (err) {
            const normalizedErr = ErrorNormalizer.normalize(err);
            return ResponseNormalizer.normalize({ success: false, error: normalizedErr, status: err.statusCode || 404 }, {
                systemId,
                operation: normalizedOp,
                startTime
            });
        }

        // 2. System Capability Negotiation
        // Check if system declares support for requested operation/capability
        const systemHasCap = this.capabilityRegistry.hasCapability(system.capabilities, normalizedOp);
        if (!systemHasCap && normalizedOp !== 'connect' && normalizedOp !== 'disconnect') {
            const err = {
                code: 'CAPABILITY_MISMATCH',
                message: `System '${system.id}' does not possess capability '${normalizedOp}'`,
                retryable: false,
                category: 'VALIDATION',
                status: 400
            };
            return ResponseNormalizer.normalize({ success: false, error: err, status: 400 }, {
                systemId: system.id,
                adapterId: system.adapter ? system.adapter.adapterId : 'unknown-adapter',
                operation: normalizedOp,
                startTime
            });
        }

        // 3. Adapter Resolution
        let adapter;
        try {
            adapter = this.adapterFactory.createAdapter(system.adapter, { allowLocalhost: this.allowLocalhost });
        } catch (err) {
            const normalizedErr = ErrorNormalizer.normalize(err);
            return ResponseNormalizer.normalize({ success: false, error: normalizedErr, status: 400 }, {
                systemId: system.id,
                operation: normalizedOp,
                startTime
            });
        }

        // 4. Adapter Operation Support Verification
        if (!adapter.supportsOperation(normalizedOp) && normalizedOp !== 'connect' && normalizedOp !== 'disconnect') {
            const unsupported = adapter.createUnsupportedOperationError(normalizedOp);
            return ResponseNormalizer.normalize(unsupported, {
                systemId: system.id,
                adapterId: adapter.adapterId,
                operation: normalizedOp,
                startTime
            });
        }

        // 5. Execute Operation via Adapter
        try {
            let result;
            if (normalizedOp === 'health') {
                result = await adapter.healthCheck(payload, { systemId: system.id, ...context });
            } else {
                result = await adapter.execute(normalizedOp, payload, { systemId: system.id, ...context });
            }

            const normalizedRes = ResponseNormalizer.normalize(result, {
                systemId: system.id,
                adapterId: adapter.adapterId,
                operation: normalizedOp,
                startTime
            });

            if (this.usageCollector) {
                const durationMs = Date.now() - startTime.getTime();
                this.usageCollector.recordActivity({
                    systemId: system.id,
                    capability: context.capability || normalizedOp,
                    operation: normalizedOp,
                    status: normalizedRes.success ? 'SUCCESS' : 'FAILED',
                    durationMs,
                    source: context.source || 'api',
                    actor: context.actor || 'user',
                    category: context.category || 'EXECUTION',
                    metadata: { adapterId: adapter.adapterId }
                });
            }

            return normalizedRes;
        } catch (err) {
            const normalizedErr = ErrorNormalizer.normalize(err);
            const normalizedRes = ResponseNormalizer.normalize({ success: false, error: normalizedErr }, {
                systemId: system.id,
                adapterId: adapter.adapterId,
                operation: normalizedOp,
                startTime
            });

            if (this.usageCollector) {
                const durationMs = Date.now() - startTime.getTime();
                this.usageCollector.recordActivity({
                    systemId: system.id,
                    capability: context.capability || normalizedOp,
                    operation: normalizedOp,
                    status: 'ERROR',
                    durationMs,
                    source: context.source || 'api',
                    actor: context.actor || 'user',
                    category: context.category || 'EXECUTION',
                    metadata: { error: normalizedErr.code }
                });
            }

            return normalizedRes;
        }
    }

    /**
     * Get system's configured adapter metadata and connection status.
     */
    getSystemAdapter(systemId) {
        const system = this.systemRegistry.getSystemInstance(systemId);
        const connection = this.connectionManager.getConnection(system.id);
        return {
            systemId: system.id,
            adapter: system.adapter,
            connection: connection || { status: 'DISCONNECTED' }
        };
    }
}

module.exports = {
    SystemExecutionService
};
