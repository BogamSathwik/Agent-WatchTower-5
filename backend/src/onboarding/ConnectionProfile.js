/**
 * ConnectionProfile Model
 * Encapsulates adapter parameters, URL security, headers, timeouts, and retries.
 */

const { SsrfProtector } = require('../adapter/SsrfProtector');
const { ConnectionManager } = require('../adapter/ConnectionManager');
const { ADAPTER_TYPES } = require('./OnboardingStates');

class ConnectionProfile {
    constructor(data = {}) {
        this.baseUrl = typeof data.baseUrl === 'string' ? data.baseUrl.trim() : '';
        this.adapterType = (data.adapterType || ADAPTER_TYPES.HTTP).toLowerCase();
        this.timeoutMs = typeof data.timeoutMs === 'number' && data.timeoutMs > 0 ? data.timeoutMs : 10000;
        
        this.retryConfig = {
            maxRetries: data.retryConfig && typeof data.retryConfig.maxRetries === 'number' ? Math.max(0, data.retryConfig.maxRetries) : 3,
            retryDelayMs: data.retryConfig && typeof data.retryConfig.retryDelayMs === 'number' ? Math.max(0, data.retryConfig.retryDelayMs) : 1000
        };

        this.defaultHeaders = data.defaultHeaders && typeof data.defaultHeaders === 'object' ? data.defaultHeaders : {};
        this.connectionMetadata = data.connectionMetadata && typeof data.connectionMetadata === 'object' ? data.connectionMetadata : {};
    }

    validate(options = {}) {
        const errors = [];
        const allowLocalhost = options.allowLocalhost !== false;

        if (this.adapterType !== ADAPTER_TYPES.MOCK && this.adapterType !== ADAPTER_TYPES.CUSTOM) {
            if (!this.baseUrl) {
                errors.push('baseUrl is required for connection profile');
            } else {
                const ssrfCheck = SsrfProtector.validateUrl(this.baseUrl, { allowLocalhost });
                if (!ssrfCheck.safe) {
                    errors.push(`URL security validation failed: ${ssrfCheck.error}`);
                }
            }
        }

        if (!Object.values(ADAPTER_TYPES).includes(this.adapterType)) {
            errors.push(`Invalid adapterType '${this.adapterType}'. Allowed: ${Object.values(ADAPTER_TYPES).join(', ')}`);
        }

        if (typeof this.timeoutMs !== 'number' || this.timeoutMs <= 0) {
            errors.push('timeoutMs must be a positive number');
        }

        return { valid: errors.length === 0, errors };
    }

    sanitize() {
        return {
            baseUrl: this.baseUrl,
            adapterType: this.adapterType,
            timeoutMs: this.timeoutMs,
            retryConfig: this.retryConfig,
            defaultHeaders: ConnectionManager.sanitizeHeaders(this.defaultHeaders),
            connectionMetadata: this.connectionMetadata
        };
    }

    toJSON() {
        return this.sanitize();
    }
}

module.exports = ConnectionProfile;
