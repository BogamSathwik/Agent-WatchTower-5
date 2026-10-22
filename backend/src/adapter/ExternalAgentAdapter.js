/**
 * ExternalAgentAdapter
 * Universal, domain-agnostic adapter for monitoring and interacting with external HTTP-based agents.
 * Supports fully configurable endpoint mappings, auth types, request/response transformers,
 * health status normalization, and explicit capability management.
 */

const { BaseAdapter } = require('./BaseAdapter');
const { SsrfProtector } = require('./SsrfProtector');
const { ConnectionManager } = require('./ConnectionManager');
const { RequestExecutor } = require('./RequestExecutor');
const { ResponseNormalizer } = require('./ResponseNormalizer');
const { ErrorNormalizer } = require('./ErrorNormalizer');

class ExternalAgentAdapter extends BaseAdapter {
    constructor(metadata = {}, options = {}) {
        super(metadata, options);

        this.adapterId = metadata.id || metadata.adapterId || `ext_adapter_${Date.now()}`;
        this.baseUrl = metadata.baseUrl || metadata.connectionConfigRef || metadata.endpoint || '';
        this.authRef = metadata.authRef || metadata.auth || { authType: 'none' };

        // Endpoint Mappings
        this.endpoints = {
            health: metadata.endpoints?.health || { path: '', method: 'GET', enabled: true },
            contract: metadata.endpoints?.contract || { path: '/contract', method: 'GET', enabled: false },
            capabilities: metadata.endpoints?.capabilities || { path: '/capabilities', method: 'GET', enabled: false },
            status: metadata.endpoints?.status || { path: '/status', method: 'GET', enabled: false },
            execution: metadata.endpoints?.execution || { path: '/execute', method: 'POST', enabled: false }
        };

        // Configuration
        this.timeoutConfig = metadata.timeoutConfig || { connectTimeoutMs: 5000, readTimeoutMs: 10000 };
        this.retryConfig = metadata.retryConfig || { maxRetries: 2, retryDelayMs: 1000 };
        this.allowLocalhost = Boolean(options.allowLocalhost);

        // Capabilities declaration
        this.declaredCapabilities = Array.isArray(metadata.capabilities)
            ? metadata.capabilities
            : ['health'];

        // Response Mappings
        this.responseMappings = metadata.responseMappings || {
            healthStatusField: 'status',
            healthyValues: ['HEALTHY', 'UP', 'OK', '200', 'OPERATIONAL', 'RUNNING'],
            degradedValues: ['DEGRADED', 'WARN', 'SLOW', 'PARTIAL'],
            offlineValues: ['OFFLINE', 'DOWN', 'ERROR', 'UNHEALTHY', 'FAIL']
        };
    }

    /**
     * Check whether an operation is supported by this external adapter configuration.
     */
    supportsOperation(operation) {
        const op = String(operation || '').toLowerCase();
        if (op === 'health' || op === 'connectivity') return true;
        if (this.endpoints[op] && this.endpoints[op].enabled) return true;
        return this.declaredCapabilities.includes(op);
    }

    /**
     * Execute probe or action against external agent.
     */
    async execute(operation, payload = {}, context = {}) {
        const op = String(operation || 'health').toLowerCase();
        const startTime = new Date();

        // Handle unsupported operations gracefully
        if (!this.supportsOperation(op)) {
            const result = ResponseNormalizer.normalize({
                success: false,
                status: 501,
                healthStatus: 'UNSUPPORTED',
                supported: false,
                reason: 'CAPABILITY_UNSUPPORTED',
                error: {
                    code: 'CAPABILITY_UNSUPPORTED',
                    message: `Operation '${operation}' is not supported by external agent configuration`
                },
                metadata: { healthStatus: 'UNSUPPORTED', reason: 'CAPABILITY_UNSUPPORTED' }
            }, {
                systemId: context.systemId,
                adapterId: this.adapterId,
                operation,
                startTime
            });
            result.healthStatus = 'UNSUPPORTED';
            result.reason = 'CAPABILITY_UNSUPPORTED';
            return result;
        }

        // Determine target endpoint details
        const endpointMapping = this.endpoints[op] || { path: '', method: 'GET' };
        let path = endpointMapping.path !== undefined ? endpointMapping.path : '';
        if (payload.path) path = payload.path;

        let targetUrl = payload.url || (path ? `${this.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}` : this.baseUrl);
        if (!targetUrl) {
            return ResponseNormalizer.normalize({
                success: false,
                status: 'OFFLINE',
                reason: 'MISSING_BASE_URL',
                error: { code: 'MISSING_BASE_URL', message: 'No target URL or Base URL provided for external agent' }
            }, { systemId: context.systemId, adapterId: this.adapterId, operation, startTime });
        }

        // SSRF Check
        const ssrfCheck = SsrfProtector.validateUrl(targetUrl, { allowLocalhost: this.allowLocalhost });
        if (!ssrfCheck.safe) {
            return ResponseNormalizer.normalize({
                success: false,
                status: 'OFFLINE',
                reason: 'SSRF_BLOCKED',
                error: { code: 'SSRF_BLOCKED', message: ssrfCheck.error }
            }, { systemId: context.systemId, adapterId: this.adapterId, operation, startTime });
        }

        const method = (payload.method || endpointMapping.method || (op === 'health' ? 'GET' : 'POST')).toUpperCase();
        const authHeaders = ConnectionManager.buildAuthHeaders(this.authRef);
        const headers = {
            'User-Agent': 'AgentWatchtower-ExternalAdapter/1.0',
            ...authHeaders,
            ...(payload.headers || {})
        };

        const timeoutMs = Number(payload.timeoutMs) || this.timeoutConfig.readTimeoutMs || 8000;
        const maxRetries = Number(payload.maxRetries) || this.retryConfig.maxRetries || 1;

        // Perform HTTP Probe / Request with retries
        let lastError = null;
        let response = null;
        let durationMs = 0;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const reqStart = process.hrtime.bigint();
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const fetchOpts = {
                    method,
                    headers,
                    signal: controller.signal
                };

                if (['POST', 'PUT', 'PATCH'].includes(method) && payload.data !== undefined) {
                    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
                    fetchOpts.body = typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data);
                }

                response = await fetch(targetUrl, fetchOpts);
                clearTimeout(timer);

                const reqEnd = process.hrtime.bigint();
                durationMs = Number(reqEnd - reqStart) / 1e6;

                // Success probe handling
                const contentType = response.headers.get('content-type') || '';
                let bodyData = null;

                if (contentType.includes('application/json')) {
                    try { bodyData = await response.json(); } catch (e) { bodyData = await response.text(); }
                } else {
                    bodyData = await response.text();
                }

                const httpStatus = response.status;
                const is2xx = response.ok;

                // Normalize health status
                const normalizedHealth = this._normalizeHealthStatus(httpStatus, bodyData, durationMs);

                const normalizedResult = ResponseNormalizer.normalize({
                    success: is2xx,
                    status: httpStatus,
                    reason: normalizedHealth.reason,
                    httpStatus,
                    contentType,
                    data: bodyData,
                    durationMs,
                    evidence: normalizedHealth.evidence,
                    adapterInfo: {
                        adapterId: this.adapterId,
                        adapterType: 'ExternalAgentAdapter',
                        targetUrl,
                        method
                    }
                }, {
                    systemId: context.systemId,
                    adapterId: this.adapterId,
                    operation,
                    startTime
                });

                normalizedResult.status = normalizedHealth.status;
                normalizedResult.healthStatus = normalizedHealth.status;
                normalizedResult.reason = normalizedHealth.reason;
                return normalizedResult;

            } catch (err) {
                clearTimeout(timer);
                lastError = err;
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, this.retryConfig.retryDelayMs || 500));
                }
            }
        }

        // Probe Failure
        const isTimeout = lastError?.name === 'AbortError' || lastError?.message?.includes('aborted');
        const errorCategory = isTimeout ? 'TIMEOUT' : 'CONNECTION_FAILURE';

        const failedResult = ResponseNormalizer.normalize({
            success: false,
            status: 503,
            reason: errorCategory,
            error: {
                code: errorCategory,
                message: isTimeout ? `Request timed out after ${timeoutMs}ms` : (lastError?.message || 'Connection failed')
            },
            adapterInfo: {
                adapterId: this.adapterId,
                adapterType: 'ExternalAgentAdapter',
                targetUrl
            }
        }, {
            systemId: context.systemId,
            adapterId: this.adapterId,
            operation,
            startTime
        });

        failedResult.status = 'OFFLINE';
        failedResult.healthStatus = 'OFFLINE';
        failedResult.reason = errorCategory;
        return failedResult;
    }

    /**
     * Map HTTP status code and response payload into universal health state.
     */
    _normalizeHealthStatus(httpStatus, bodyData, durationMs) {
        if (httpStatus >= 500) {
            return {
                status: 'OFFLINE',
                reason: 'HTTP_SERVER_ERROR',
                evidence: [`HTTP Status ${httpStatus}`, 'Server reported internal failure']
            };
        }

        if (httpStatus === 404) {
            return {
                status: 'DEGRADED',
                reason: 'ENDPOINT_NOT_FOUND',
                evidence: [`HTTP Status 404`, 'Specific API path missing, reachability OK']
            };
        }

        if (httpStatus >= 400) {
            return {
                status: 'DEGRADED',
                reason: 'HTTP_CLIENT_ERROR',
                evidence: [`HTTP Status ${httpStatus}`, 'Authentication or request schema error']
            };
        }

        // Check response latency threshold (e.g. > 5000ms is DEGRADED)
        if (durationMs > 5000) {
            return {
                status: 'DEGRADED',
                reason: 'HIGH_LATENCY',
                evidence: [`Latency ${durationMs.toFixed(0)}ms exceeds threshold (5000ms)`]
            };
        }

        // Check JSON body health field if present
        if (bodyData && typeof bodyData === 'object') {
            const fieldVal = String(bodyData[this.responseMappings.healthStatusField] || bodyData.health || bodyData.status || '').toUpperCase();
            if (this.responseMappings.offlineValues.includes(fieldVal)) {
                return { status: 'OFFLINE', reason: 'PAYLOAD_STATUS_OFFLINE', evidence: [`Payload field status: ${fieldVal}`] };
            }
            if (this.responseMappings.degradedValues.includes(fieldVal)) {
                return { status: 'DEGRADED', reason: 'PAYLOAD_STATUS_DEGRADED', evidence: [`Payload field status: ${fieldVal}`] };
            }
        }

        return {
            status: 'HEALTHY',
            reason: 'PROBE_SUCCESS',
            evidence: [`HTTP Status ${httpStatus}`, `Latency ${durationMs.toFixed(0)}ms`]
        };
    }
}

module.exports = { ExternalAgentAdapter };
