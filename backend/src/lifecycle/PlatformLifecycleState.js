/**
 * Platform Lifecycle State Machine & Valid Transitions
 * Defines deterministic states and valid state transitions for the AgentOS platform.
 */

const PLATFORM_STATES = Object.freeze({
    STARTING: 'STARTING',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    DEGRADED: 'DEGRADED',
    DRAINING: 'DRAINING',
    STOPPING: 'STOPPING',
    STOPPED: 'STOPPED',
    FAILED: 'FAILED'
});

const VALID_PLATFORM_TRANSITIONS = Object.freeze({
    [PLATFORM_STATES.STARTING]: [PLATFORM_STATES.INITIALIZING, PLATFORM_STATES.FAILED],
    [PLATFORM_STATES.INITIALIZING]: [PLATFORM_STATES.READY, PLATFORM_STATES.DEGRADED, PLATFORM_STATES.FAILED],
    [PLATFORM_STATES.READY]: [PLATFORM_STATES.DEGRADED, PLATFORM_STATES.DRAINING, PLATFORM_STATES.STOPPING, PLATFORM_STATES.FAILED],
    [PLATFORM_STATES.DEGRADED]: [PLATFORM_STATES.READY, PLATFORM_STATES.DRAINING, PLATFORM_STATES.STOPPING, PLATFORM_STATES.FAILED],
    [PLATFORM_STATES.DRAINING]: [PLATFORM_STATES.STOPPING, PLATFORM_STATES.FAILED],
    [PLATFORM_STATES.STOPPING]: [PLATFORM_STATES.STOPPED, PLATFORM_STATES.FAILED],
    [PLATFORM_STATES.STOPPED]: [PLATFORM_STATES.STARTING],
    [PLATFORM_STATES.FAILED]: [PLATFORM_STATES.STARTING, PLATFORM_STATES.STOPPING, PLATFORM_STATES.STOPPED]
});

function isValidPlatformState(state) {
    return Object.values(PLATFORM_STATES).includes(state);
}

function isValidTransition(currentState, newState) {
    if (!isValidPlatformState(currentState) || !isValidPlatformState(newState)) {
        return false;
    }
    if (currentState === newState) {
        return true;
    }
    const allowed = VALID_PLATFORM_TRANSITIONS[currentState] || [];
    return allowed.includes(newState);
}

module.exports = {
    PLATFORM_STATES,
    VALID_PLATFORM_TRANSITIONS,
    isValidPlatformState,
    isValidTransition
};
