/**
 * Generic HTTP Adapter
 * Communicates with any external web application, microservice, or REST API endpoint.
 * Driven entirely by adapter metadata configuration.
 */

const { BaseAdapter } = require('./BaseAdapter');
const { SsrfProtector } = require('./SsrfProtector');
const { ConnectionManager } = require('./ConnectionManager');
const { RequestExecutor } = require('./RequestExecutor');
const { ResponseNormalizer } = require('./ResponseNormalizer');
const { ErrorNormalizer } = require('./ErrorNormalizer');

class HttpAdapter extends BaseAdapter {
    constructor(metadata = {}, options = {}) {
        super(metadata, options);
        this.endpoint = metadata.connectionConfigRef || metadata.endpoint || '';
        this.timeoutConfig = metadata.timeoutConfig || { connectTimeoutMs: 5000, readTimeoutMs: 10000 };
        this.authRef = metadata.authRef || { authType: 'none' };
        this.allowLocalhost = Boolean(options.allowLocalhost);
    }

    /**
     * Execute HTTP request against external target.
     */
    async execute(operation, payload = {}, context = {}) {
        if (!this.supportsOperation(operation)) {
            return this.createUnsupportedOperationError(operation);
        }

        const startTime = new Date();

        // 1. Target URL Resolution & Validation
        const targetUrl = payload.url || (payload.endpoint ? `${this.endpoint}${payload.endpoint}` : this.endpoint);

        if (!targetUrl) {
            const err = ErrorNormalizer.normalize(new Error('Missing target URL for HTTP execution'));
            return ResponseNormalizer.normalize({ success: false, error: err }, {
                systemId: context.systemId,
                adapterId: this.adapterId,
                operation,
                startTime
            });
        }

        // 2. SSRF Protection Check
        const ssrfCheck = SsrfProtector.validateUrl(targetUrl, { allowLocalhost: this.allowLocalhost });
        if (!ssrfCheck.safe) {
            const err = ErrorNormalizer.normalize(new Error(ssrfCheck.error));
            return ResponseNormalizer.normalize({ success: false, error: err }, {
                systemId: context.systemId,
                adapterId: this.adapterId,
                operation,
                startTime,
                request: { url: targetUrl, method: payload.method || 'POST' }
            });
        }

        // 3. HTTP Method & Headers setup
        const method = (payload.method || (operation === 'health' ? 'GET' : 'POST')).toUpperCase();
        const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        if (!allowedMethods.includes(method)) {
            const err = ErrorNormalizer.normalize(new Error(`Unsafe/unsupported HTTP method '${method}'`));
            return ResponseNormalizer.normalize({ success: false, error: err }, {
                systemId: context.systemId,
                adapterId: this.adapterId,
                operation,
                startTime
            });
        }

        const authHeaders = ConnectionManager.buildAuthHeaders(this.authRef);
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'UniversalPlatform-Adapter/1.0',
            ...authHeaders,
            ...(payload.headers || {})
        };

        const sanitizedHeaders = ConnectionManager.sanitizeHeaders(headers);

        // 4. Execute via RequestExecutor with bounded retries
        const execResult = await RequestExecutor.execute(async (reqId, attempt) => {
            // Native Node fetch or HTTP call
            const controller = new AbortController();
            const timeoutMs = Number(payload.timeoutMs) || this.timeoutConfig.readTimeoutMs || 5000;
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const fetchOptions = {
                    method,
                    headers,
                    signal: controller.signal
                };

                if (['POST', 'PUT', 'PATCH'].includes(method) && payload.data !== undefined) {
                    fetchOptions.body = typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data);
                }

                const response = await fetch(targetUrl, fetchOptions);
                clearTimeout(timer);

                let resData;
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    resData = await response.json();
                } else {
                    resData = await response.text();
                }

                if (!response.ok) {
                    const errorObj = new Error(`HTTP ${response.status}: ${response.statusText}`);
                    errorObj.status = response.status;
                    errorObj.data = resData;
                    throw errorObj;
                }

                return {
                    success: true,
                    status: response.status,
                    data: resData,
                    headers: Object.fromEntries(response.headers.entries())
                };
            } catch (err) {
                clearTimeout(timer);
                if (err.name === 'AbortError') {
                    const timeoutErr = new Error(`HTTP Request to '${targetUrl}' timed out after ${timeoutMs}ms`);
                    timeoutErr.code = 'ETIMEDOUT';
                    throw timeoutErr;
                }
                throw err;
            }
        }, {
            maxRetries: payload.maxRetries !== undefined ? payload.maxRetries : 2,
            retryDelayMs: payload.retryDelayMs || 100
        });

        // 5. Response Normalization
        return ResponseNormalizer.normalize({
            success: execResult.success,
            status: execResult.status,
            data: execResult.data,
            error: execResult.error,
            headers: execResult.headers
        }, {
            systemId: context.systemId,
            adapterId: this.adapterId,
            operation,
            startTime,
            request: {
                url: targetUrl,
                method,
                headers: sanitizedHeaders
            }
        });
    }

    /**
     * Health check wrapper.
     */
    async healthCheck(payload = {}, context = {}) {
        return this.execute('health', { method: 'GET', ...payload }, context);
    }
}

module.exports = {
    HttpAdapter
};
