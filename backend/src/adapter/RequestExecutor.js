/**
 * Request Executor
 * Executes network requests with bounded retries, exponential backoff, and error classification.
 */

const { ErrorNormalizer } = require('./ErrorNormalizer');
const crypto = require('crypto');

class RequestExecutor {
    /**
     * Execute a request handler function with bounded retries.
     * @param {Function} requestFn - Async function executing the request
     * @param {Object} options - { maxRetries, retryDelayMs, timeoutMs }
     * @returns {Object} Execution result
     */
    static async execute(requestFn, options = {}) {
        const requestId = options.requestId || `req_${crypto.randomBytes(8).toString('hex')}`;
        const maxRetries = Math.min(Math.max(Number(options.maxRetries) || 0, 0), 5); // Bounded [0, 5]
        const retryDelayMs = Number(options.retryDelayMs) || 200;

        let attempt = 0;
        let lastError = null;

        while (attempt <= maxRetries) {
            attempt++;
            try {
                const result = await requestFn(requestId, attempt);
                return {
                    ...result,
                    requestId,
                    attempts: attempt
                };
            } catch (err) {
                const normalizedErr = ErrorNormalizer.normalize(err);
                lastError = normalizedErr;

                // Stop retrying if error is non-retryable or maxRetries reached
                if (!normalizedErr.retryable || attempt > maxRetries) {
                    return {
                        success: false,
                        error: normalizedErr,
                        status: normalizedErr.status || 500,
                        requestId,
                        attempts: attempt
                    };
                }

                // Exponential delay before retry
                const backoff = retryDelayMs * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, backoff));
            }
        }

        return {
            success: false,
            error: lastError || ErrorNormalizer.normalize(new Error('Max retries exceeded')),
            status: lastError ? lastError.status : 500,
            requestId,
            attempts: attempt
        };
    }
}

module.exports = {
    RequestExecutor
};
