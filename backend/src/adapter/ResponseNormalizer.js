/**
 * Response Normalizer
 * Converts raw execution results into standard platform result objects.
 * Preserves evidence for downstream health, quality, and usage analysis engines.
 */

class ResponseNormalizer {
    /**
     * Normalize execution result.
     * @param {Object} raw 
     * @param {Object} context - { systemId, adapterId, operation, startTime }
     * @returns {Object} Standardized platform execution result
     */
    static normalize(raw = {}, context = {}) {
        const now = new Date();
        const durationMs = context.startTime ? (now.getTime() - new Date(context.startTime).getTime()) : (raw.durationMs || 0);

        const success = Boolean(raw.success !== false && !raw.error);
        const status = Number(raw.status || (raw.error ? raw.error.status : null) || (success ? 200 : 500));

        return {
            systemId: context.systemId || raw.systemId || 'unknown-system',
            adapterId: context.adapterId || raw.adapterId || 'unknown-adapter',
            operation: context.operation || raw.operation || 'execute',
            success,
            status,
            durationMs,
            timestamp: now.toISOString(),
            data: raw.data !== undefined ? raw.data : (success ? (raw.body || raw) : null),
            error: success ? null : (raw.error || { code: 'EXECUTION_FAILED', message: 'Execution failed' }),
            metadata: raw.metadata || context.metadata || {},
            evidence: {
                request: context.request || raw.request || null,
                responseHeaders: raw.headers || null,
                rawStatus: status,
                healthy: raw.healthy !== undefined ? raw.healthy : success
            }
        };
    }
}

module.exports = {
    ResponseNormalizer
};
