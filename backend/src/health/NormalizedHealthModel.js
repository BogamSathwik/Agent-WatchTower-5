/**
 * Normalized Health Model
 * Generic domain-agnostic health observation data structure supporting external HTTP agents,
 * internal microservices, and contract-compliant agents.
 */

const NORMALIZED_HEALTH_STATES = Object.freeze({
    HEALTHY: 'HEALTHY',
    DEGRADED: 'DEGRADED',
    OFFLINE: 'OFFLINE',
    UNKNOWN: 'UNKNOWN',
    UNSUPPORTED: 'UNSUPPORTED'
});

class NormalizedHealthMeasurement {
    constructor(data = {}) {
        this.systemId = String(data.systemId || 'UNKNOWN');
        this.status = Object.values(NORMALIZED_HEALTH_STATES).includes(data.status)
            ? data.status
            : NORMALIZED_HEALTH_STATES.UNKNOWN;
        this.responseTimeMs = Number(data.responseTimeMs || data.durationMs || 0);
        this.timestamp = data.timestamp || new Date().toISOString();
        this.consecutiveSuccesses = Number(data.consecutiveSuccesses || 0);
        this.consecutiveFailures = Number(data.consecutiveFailures || 0);
        this.lastSuccessfulCheck = data.lastSuccessfulCheck || null;
        this.lastFailedCheck = data.lastFailedCheck || null;
        this.errorCategory = data.errorCategory || data.reason || 'NONE';
        this.httpStatus = Number(data.httpStatus || (data.status === 'HEALTHY' ? 200 : 0));
        this.errorMessage = data.errorMessage || (data.error ? data.error.message : '');
        this.availabilityPercentage = Number(data.availabilityPercentage ?? (data.status === 'HEALTHY' ? 100 : 0));
        this.evidence = Array.isArray(data.evidence) ? data.evidence : [];
    }

    toJSON() {
        return {
            systemId: this.systemId,
            status: this.status,
            responseTimeMs: this.responseTimeMs,
            timestamp: this.timestamp,
            consecutiveSuccesses: this.consecutiveSuccesses,
            consecutiveFailures: this.consecutiveFailures,
            lastSuccessfulCheck: this.lastSuccessfulCheck,
            lastFailedCheck: this.lastFailedCheck,
            errorCategory: this.errorCategory,
            httpStatus: this.httpStatus,
            errorMessage: this.errorMessage,
            availabilityPercentage: this.availabilityPercentage,
            evidence: this.evidence
        };
    }
}

module.exports = {
    NORMALIZED_HEALTH_STATES,
    NormalizedHealthMeasurement
};
