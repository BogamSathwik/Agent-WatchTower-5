/**
 * Error Normalizer
 * Standardizes external network, HTTP, protocol, and adapter errors.
 * Prevents stack trace and credential leakage.
 */

const ERROR_CATEGORIES = Object.freeze({
    NETWORK: 'NETWORK',
    HTTP: 'HTTP',
    AUTH: 'AUTH',
    SECURITY: 'SECURITY',
    ADAPTER: 'ADAPTER',
    VALIDATION: 'VALIDATION',
    UNKNOWN: 'UNKNOWN'
});

class ErrorNormalizer {
    static get CATEGORIES() {
        return ERROR_CATEGORIES;
    }

    /**
     * Normalize raw exception or HTTP error into a standard structured payload.
     * @param {Error|Object} err 
     * @param {Object} context 
     * @returns {Object} Standardized error payload
     */
    static normalize(err, context = {}) {
        if (!err) {
            return {
                code: 'UNKNOWN_ERROR',
                message: 'An unknown error occurred',
                retryable: false,
                category: ERROR_CATEGORIES.UNKNOWN,
                status: 500
            };
        }

        // 1. Pre-formatted standard error payload
        if (err.code && err.category && typeof err.retryable === 'boolean') {
            return {
                code: err.code,
                message: err.message || 'Operation failed',
                retryable: err.retryable,
                category: err.category,
                status: err.status || 500
            };
        }

        const msg = String(err.message || err).toLowerCase();
        const rawCode = err.code ? String(err.code).toUpperCase() : '';

        // 2. Timeout errors
        if (rawCode === 'ETIMEDOUT' || rawCode === 'ESOCKETTIMEDOUT' || msg.includes('timeout') || msg.includes('timed out')) {
            return {
                code: 'TIMEOUT',
                message: 'External request timed out',
                retryable: true,
                category: ERROR_CATEGORIES.NETWORK,
                status: 504
            };
        }

        // 3. DNS lookup failure
        if (rawCode === 'ENOTFOUND' || msg.includes('getaddrinfo enotfound') || msg.includes('dns lookup failed')) {
            return {
                code: 'DNS_FAILURE',
                message: 'Target host DNS lookup failed',
                retryable: true,
                category: ERROR_CATEGORIES.NETWORK,
                status: 502
            };
        }

        // 4. Connection refused / resets
        if (rawCode === 'ECONNREFUSED' || rawCode === 'ECONNRESET' || msg.includes('connection refused') || msg.includes('socket hang up')) {
            return {
                code: 'CONNECTION_FAILURE',
                message: 'Connection to target system refused or reset',
                retryable: true,
                category: ERROR_CATEGORIES.NETWORK,
                status: 502
            };
        }

        // 5. SSRF Security Block
        if (msg.includes('ssrf') || msg.includes('blocked due to ssrf')) {
            return {
                code: 'SSRF_BLOCKED',
                message: err.message || 'Access to target URL blocked by SSRF security rules',
                retryable: false,
                category: ERROR_CATEGORIES.SECURITY,
                status: 403
            };
        }

        // 6. HTTP Status Error Codes
        const status = Number(err.status || err.statusCode);
        if (status) {
            if (status === 401) {
                return {
                    code: 'AUTH_FAILURE',
                    message: 'Authentication failed with external target',
                    retryable: false,
                    category: ERROR_CATEGORIES.AUTH,
                    status: 401
                };
            }
            if (status === 403) {
                return {
                    code: 'FORBIDDEN',
                    message: 'Authorization denied by external target',
                    retryable: false,
                    category: ERROR_CATEGORIES.AUTH,
                    status: 403
                };
            }
            if (status === 404) {
                return {
                    code: 'NOT_FOUND',
                    message: 'Requested resource or endpoint not found on target',
                    retryable: false,
                    category: ERROR_CATEGORIES.HTTP,
                    status: 404
                };
            }
            if (status >= 500) {
                return {
                    code: 'HTTP_SERVER_ERROR',
                    message: `External system returned server error (HTTP ${status})`,
                    retryable: true,
                    category: ERROR_CATEGORIES.HTTP,
                    status
                };
            }
            if (status >= 400) {
                return {
                    code: 'HTTP_CLIENT_ERROR',
                    message: `External system returned client error (HTTP ${status})`,
                    retryable: false,
                    category: ERROR_CATEGORIES.HTTP,
                    status
                };
            }
        }

        // 7. Generic Fallback
        return {
            code: 'ADAPTER_ERROR',
            message: err.message || 'External operation failed',
            retryable: false,
            category: ERROR_CATEGORIES.ADAPTER,
            status: status || 500
        };
    }
}

module.exports = {
    ERROR_CATEGORIES,
    ErrorNormalizer
};
