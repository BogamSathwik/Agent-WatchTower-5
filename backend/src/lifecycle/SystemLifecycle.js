/**
 * System Lifecycle State Machine
 * Manages generic system lifecycle states independently from runtime health monitoring.
 */

const LIFECYCLE_STATES = Object.freeze({
    REGISTERED: 'REGISTERED',
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    DEGRADED: 'DEGRADED',
    OFFLINE: 'OFFLINE',
    RETIRED: 'RETIRED',
    UNKNOWN: 'UNKNOWN'
});

const VALID_TRANSITIONS = Object.freeze({
    [LIFECYCLE_STATES.REGISTERED]: [LIFECYCLE_STATES.ACTIVE, LIFECYCLE_STATES.INACTIVE, LIFECYCLE_STATES.RETIRED],
    [LIFECYCLE_STATES.ACTIVE]: [LIFECYCLE_STATES.INACTIVE, LIFECYCLE_STATES.DEGRADED, LIFECYCLE_STATES.OFFLINE, LIFECYCLE_STATES.RETIRED],
    [LIFECYCLE_STATES.INACTIVE]: [LIFECYCLE_STATES.ACTIVE, LIFECYCLE_STATES.RETIRED],
    [LIFECYCLE_STATES.DEGRADED]: [LIFECYCLE_STATES.ACTIVE, LIFECYCLE_STATES.INACTIVE, LIFECYCLE_STATES.OFFLINE, LIFECYCLE_STATES.RETIRED],
    [LIFECYCLE_STATES.OFFLINE]: [LIFECYCLE_STATES.ACTIVE, LIFECYCLE_STATES.INACTIVE, LIFECYCLE_STATES.RETIRED],
    [LIFECYCLE_STATES.RETIRED]: [], // Terminal state
    [LIFECYCLE_STATES.UNKNOWN]: [LIFECYCLE_STATES.REGISTERED, LIFECYCLE_STATES.ACTIVE, LIFECYCLE_STATES.INACTIVE, LIFECYCLE_STATES.RETIRED]
});

class SystemLifecycle {
    static get STATES() {
        return LIFECYCLE_STATES;
    }

    static isValidState(state) {
        return Object.values(LIFECYCLE_STATES).includes(state);
    }

    static canTransition(currentState, newState) {
        if (!this.isValidState(currentState) || !this.isValidState(newState)) {
            return false;
        }
        if (currentState === newState) {
            return true;
        }
        const allowed = VALID_TRANSITIONS[currentState] || [];
        return allowed.includes(newState);
    }
}

module.exports = {
    LIFECYCLE_STATES,
    SystemLifecycle
};
