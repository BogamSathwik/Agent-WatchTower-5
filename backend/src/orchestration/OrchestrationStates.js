/**
 * Orchestration Domain State & Enum Constants
 */

const RUN_STATES = Object.freeze({
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    PARTIAL: 'PARTIAL',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED'
});

const STEP_STATES = Object.freeze({
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
    SKIPPED: 'SKIPPED'
});

const EXECUTION_MODES = Object.freeze({
    SEQUENTIAL: 'SEQUENTIAL',
    PARALLEL: 'PARALLEL',
    DEPENDENCY_AWARE: 'DEPENDENCY_AWARE'
});

const TARGET_MODES = Object.freeze({
    SYSTEM: 'SYSTEM',
    SYSTEMS: 'SYSTEMS',
    ALL_ACTIVE: 'ALL_ACTIVE',
    FILTER: 'FILTER'
});

const FAILURE_POLICIES = Object.freeze({
    FAIL_FAST: 'FAIL_FAST',
    CONTINUE: 'CONTINUE',
    CONTINUE_AND_MARK_PARTIAL: 'CONTINUE_AND_MARK_PARTIAL'
});

const STEP_TYPES = Object.freeze({
    HEALTH: 'HEALTH',
    QUALITY: 'QUALITY',
    USAGE: 'USAGE',
    EXPERIENCE: 'EXPERIENCE',
    INTELLIGENCE: 'INTELLIGENCE',
    ALERT: 'ALERT',
    REPORT: 'REPORT'
});

const SCHEDULER_STATES = Object.freeze({
    STOPPED: 'STOPPED',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED'
});

const VALID_RUN_TRANSITIONS = Object.freeze({
    [RUN_STATES.PENDING]: [RUN_STATES.RUNNING, RUN_STATES.CANCELLED],
    [RUN_STATES.RUNNING]: [RUN_STATES.COMPLETED, RUN_STATES.PARTIAL, RUN_STATES.FAILED, RUN_STATES.CANCELLED],
    [RUN_STATES.COMPLETED]: [],
    [RUN_STATES.PARTIAL]: [],
    [RUN_STATES.FAILED]: [],
    [RUN_STATES.CANCELLED]: []
});

function isValidRunTransition(fromState, toState) {
    if (!fromState || !toState) return false;
    if (fromState === toState) return true;
    const allowed = VALID_RUN_TRANSITIONS[fromState];
    return Array.isArray(allowed) && allowed.includes(toState);
}

module.exports = {
    RUN_STATES,
    STEP_STATES,
    EXECUTION_MODES,
    TARGET_MODES,
    FAILURE_POLICIES,
    STEP_TYPES,
    SCHEDULER_STATES,
    VALID_RUN_TRANSITIONS,
    isValidRunTransition
};
