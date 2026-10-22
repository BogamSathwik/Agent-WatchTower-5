/**
 * Agent Lifecycle States
 * Defines standardized, domain-agnostic states for registered agents.
 */

const AGENT_STATES = Object.freeze({
    REGISTERED: 'REGISTERED',
    VALIDATING: 'VALIDATING',
    VALID: 'VALID',
    INVALID: 'INVALID',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    ACTIVE: 'ACTIVE',
    DEGRADED: 'DEGRADED',
    OFFLINE: 'OFFLINE',
    DISABLED: 'DISABLED',
    RETIRED: 'RETIRED',
    UNKNOWN: 'UNKNOWN'
});

module.exports = {
    AGENT_STATES
};
