/**
 * Generic Mock Adapter
 * Simulates external system connectivity for testing.
 * Configurable latency, success/failure, timeouts, and custom data payloads.
 */

const { BaseAdapter } = require('./BaseAdapter');
const { ResponseNormalizer } = require('./ResponseNormalizer');
const { ErrorNormalizer } = require('./ErrorNormalizer');

class MockAdapter extends BaseAdapter {
    constructor(metadata = {}, options = {}) {
        super({
            adapterId: 'mock-adapter',
            adapterType: 'mock',
            supportedOperations: ['health', 'execute', 'telemetry', 'testing'],
            ...metadata
        }, options);

        this.mockConfig = options.mockConfig || {};
    }

    async execute(operation, payload = {}, context = {}) {
        if (!this.supportsOperation(operation)) {
            return this.createUnsupportedOperationError(operation);
        }

        const startTime = new Date();
        const latency = payload.simulatedLatencyMs || this.mockConfig.simulatedLatencyMs || 10;
        if (latency > 0) {
            await new Promise(resolve => setTimeout(resolve, latency));
        }

        // Simulate timeout
        if (payload.simulateTimeout || this.mockConfig.simulateTimeout) {
            const timeoutErr = new Error('Simulated operation timeout');
            timeoutErr.code = 'ETIMEDOUT';
            timeoutErr.status = 504;
            const err = ErrorNormalizer.normalize(timeoutErr);
            return ResponseNormalizer.normalize({ success: false, error: err, status: 504 }, {
                systemId: context.systemId,
                adapterId: this.adapterId,
                operation,
                startTime
            });
        }

        // Simulate failure
        if (payload.simulateFailure || this.mockConfig.simulateFailure) {
            const status = payload.simulatedStatus || this.mockConfig.simulatedStatus || 500;
            const errObj = new Error(payload.simulatedErrorMessage || 'Simulated mock adapter failure');
            errObj.status = status;
            const err = ErrorNormalizer.normalize(errObj);
            return ResponseNormalizer.normalize({ success: false, error: err, status }, {
                systemId: context.systemId,
                adapterId: this.adapterId,
                operation,
                startTime
            });
        }

        // Default mock success response
        const data = payload.mockData || this.mockConfig.mockData || {
            message: `Mock execution of '${operation}' completed successfully`,
            echoPayload: payload
        };

        return ResponseNormalizer.normalize({
            success: true,
            status: 200,
            data
        }, {
            systemId: context.systemId,
            adapterId: this.adapterId,
            operation,
            startTime
        });
    }

    async healthCheck(payload = {}, context = {}) {
        return this.execute('health', payload, context);
    }
}

module.exports = {
    MockAdapter
};
