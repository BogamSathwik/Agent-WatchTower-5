/**
 * Universal Health States
 * Generic health state definitions for monitored external systems.
 * Decoupled from System Lifecycle states.
 */

const HEALTH_STATES = Object.freeze({
    HEALTHY: 'HEALTHY',
    DEGRADED: 'DEGRADED',
    OFFLINE: 'OFFLINE',
    UNKNOWN: 'UNKNOWN'
});

const HEALTH_REASONS = Object.freeze({
    HEALTH_CHECK_SUCCESS: 'HEALTH_CHECK_SUCCESS',
    LATENCY_THRESHOLD_EXCEEDED: 'LATENCY_THRESHOLD_EXCEEDED',
    CONSECUTIVE_FAILURES_EXCEEDED: 'CONSECUTIVE_FAILURES_EXCEEDED',
    HEALTH_CAPABILITY_UNAVAILABLE: 'HEALTH_CAPABILITY_UNAVAILABLE',
    UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
    TIMEOUT: 'TIMEOUT',
    DNS_FAILURE: 'DNS_FAILURE',
    CONNECTION_FAILURE: 'CONNECTION_FAILURE',
    HTTP_SERVER_ERROR: 'HTTP_SERVER_ERROR',
    HTTP_CLIENT_ERROR: 'HTTP_CLIENT_ERROR',
    AUTH_FAILURE: 'AUTH_FAILURE',
    FORBIDDEN: 'FORBIDDEN',
    SSRF_BLOCKED: 'SSRF_BLOCKED',
    SYSTEM_NOT_FOUND: 'SYSTEM_NOT_FOUND',
    NO_EVIDENCE: 'NO_EVIDENCE'
});

function isValidState(state) {
    return Object.values(HEALTH_STATES).includes(state);
}

class HealthStates {
    static get STATES() {
        return HEALTH_STATES;
    }

    static get REASONS() {
        return HEALTH_REASONS;
    }

    static isValidState(state) {
        return isValidState(state);
    }
}

module.exports = {
    HEALTH_STATES,
    HEALTH_REASONS,
    HealthStates,
    isValidState
};
