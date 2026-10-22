/**
 * Health Measurement Data Model
 * Generic model for health measurement entries.
 */

const crypto = require('crypto');
const { HEALTH_STATES, HEALTH_REASONS, isValidState } = require('./HealthStates');

class HealthMeasurement {
    constructor(raw = {}) {
        this.measurementId = raw.measurementId || `meas_${crypto.randomBytes(8).toString('hex')}`;
        this.systemId = raw.systemId || 'unknown-system';
        this.timestamp = raw.timestamp || new Date().toISOString();
        this.status = isValidState(raw.status) ? raw.status : HEALTH_STATES.UNKNOWN;
        this.responseTimeMs = Number(raw.responseTimeMs) || 0;
        
        // Availability: 100 for Healthy/Degraded, 0 for Offline/Unknown
        this.availability = raw.availability !== undefined
            ? Number(raw.availability)
            : ([HEALTH_STATES.HEALTHY, HEALTH_STATES.DEGRADED].includes(this.status) ? 100 : 0);

        this.success = Boolean(raw.success);
        this.error = raw.error || null;
        this.errorCode = raw.error ? (raw.error.code || 'UNKNOWN') : null;
        
        this.consecutiveFailures = Number(raw.consecutiveFailures) || 0;
        this.consecutiveSuccesses = Number(raw.consecutiveSuccesses) || 0;
        
        this.reason = raw.reason || (this.success ? HEALTH_REASONS.HEALTH_CHECK_SUCCESS : HEALTH_REASONS.NO_EVIDENCE);
        this.adapterInfo = raw.adapterInfo || { adapterId: 'unknown', adapterType: 'custom' };
        this.operation = raw.operation || 'health';
        
        // Evidence object preserving raw metadata for health/quality/usage/anomaly engines
        this.evidence = raw.evidence || {};
    }

    toJSON() {
        return {
            measurementId: this.measurementId,
            systemId: this.systemId,
            timestamp: this.timestamp,
            status: this.status,
            responseTimeMs: this.responseTimeMs,
            availability: this.availability,
            success: this.success,
            error: this.error,
            errorCode: this.errorCode,
            consecutiveFailures: this.consecutiveFailures,
            consecutiveSuccesses: this.consecutiveSuccesses,
            reason: this.reason,
            adapterInfo: this.adapterInfo,
            operation: this.operation,
            evidence: this.evidence
        };
    }
}

module.exports = {
    HealthMeasurement
};
