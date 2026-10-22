/**
 * Health Configuration
 * Standardized configuration schema and validation for system health monitoring.
 * Driven entirely by system contract and custom overrides.
 */

class HealthConfig {
    static normalize(raw = {}) {
        if (typeof raw !== 'object' || raw === null) {
            raw = {};
        }

        const enabled = raw.enabled !== false;
        const checkIntervalMs = Math.max(Number(raw.checkIntervalMs) || 30000, 1000);
        const timeoutMs = Math.max(Number(raw.timeoutMs) || 5000, 100);
        const retryCount = Math.min(Math.max(Number(raw.retryCount) || 1, 0), 5);
        const retryDelayMs = Math.max(Number(raw.retryDelayMs) || 100, 0);

        const failureThreshold = Math.max(Number(raw.failureThreshold) || 3, 1);
        const recoveryThreshold = Math.max(Number(raw.recoveryThreshold) || 2, 1);

        const latencyThresholdMs = Math.max(Number(raw.latencyThresholdMs) || 2000, 10);
        const degradedThresholdMs = Math.max(Number(raw.degradedThresholdMs) || Math.max(latencyThresholdMs * 2, 4000), latencyThresholdMs);

        const healthOperation = typeof raw.healthOperation === 'string' && raw.healthOperation.trim()
            ? raw.healthOperation.trim().toLowerCase()
            : 'health';

        const endpointRef = raw.endpointRef || raw.endpoint || null;
        const expectedStatus = Number(raw.expectedStatus) || 200;

        return {
            enabled,
            checkIntervalMs,
            timeoutMs,
            retryCount,
            retryDelayMs,
            failureThreshold,
            recoveryThreshold,
            latencyThresholdMs,
            degradedThresholdMs,
            healthOperation,
            endpointRef,
            expectedStatus
        };
    }

    /**
     * Validate health configuration payload.
     * @param {Object} raw 
     * @returns {Object} { valid: boolean, errors: Array }
     */
    static validate(raw) {
        const errors = [];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                valid: false,
                errors: [{ field: 'root', code: 'INVALID_PAYLOAD', message: 'Health configuration must be a non-null object' }]
            };
        }

        if (raw.checkIntervalMs !== undefined && (typeof raw.checkIntervalMs !== 'number' || raw.checkIntervalMs < 1000)) {
            errors.push({ field: 'checkIntervalMs', code: 'INVALID_VALUE', message: 'checkIntervalMs must be a number >= 1000ms' });
        }

        if (raw.timeoutMs !== undefined && (typeof raw.timeoutMs !== 'number' || raw.timeoutMs < 100)) {
            errors.push({ field: 'timeoutMs', code: 'INVALID_VALUE', message: 'timeoutMs must be a number >= 100ms' });
        }

        if (raw.retryCount !== undefined && (typeof raw.retryCount !== 'number' || raw.retryCount < 0 || raw.retryCount > 5)) {
            errors.push({ field: 'retryCount', code: 'INVALID_VALUE', message: 'retryCount must be between 0 and 5' });
        }

        if (raw.failureThreshold !== undefined && (typeof raw.failureThreshold !== 'number' || raw.failureThreshold < 1)) {
            errors.push({ field: 'failureThreshold', code: 'INVALID_VALUE', message: 'failureThreshold must be an integer >= 1' });
        }

        if (raw.recoveryThreshold !== undefined && (typeof raw.recoveryThreshold !== 'number' || raw.recoveryThreshold < 1)) {
            errors.push({ field: 'recoveryThreshold', code: 'INVALID_VALUE', message: 'recoveryThreshold must be an integer >= 1' });
        }

        if (raw.latencyThresholdMs !== undefined && (typeof raw.latencyThresholdMs !== 'number' || raw.latencyThresholdMs < 10)) {
            errors.push({ field: 'latencyThresholdMs', code: 'INVALID_VALUE', message: 'latencyThresholdMs must be a number >= 10ms' });
        }

        if (raw.degradedThresholdMs !== undefined) {
            if (typeof raw.degradedThresholdMs !== 'number' || raw.degradedThresholdMs < 10) {
                errors.push({ field: 'degradedThresholdMs', code: 'INVALID_VALUE', message: 'degradedThresholdMs must be a number >= 10ms' });
            } else if (raw.latencyThresholdMs && raw.degradedThresholdMs < raw.latencyThresholdMs) {
                errors.push({ field: 'degradedThresholdMs', code: 'INVALID_THRESHOLD', message: 'degradedThresholdMs cannot be smaller than latencyThresholdMs' });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = {
    HealthConfig
};
