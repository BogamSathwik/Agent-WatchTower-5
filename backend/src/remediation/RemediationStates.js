/**
 * Remediation Lifecycle States
 * Standardized lifecycle states for autonomous remediation and self-healing actions.
 * Purely domain-agnostic.
 */

const REMEDIATION_STATES = Object.freeze({
    PLANNED: 'PLANNED',
    VALIDATING: 'VALIDATING',
    BLOCKED: 'BLOCKED',
    AWAITING_APPROVAL: 'AWAITING_APPROVAL',
    APPROVED: 'APPROVED',
    EXECUTING: 'EXECUTING',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    VERIFYING: 'VERIFYING',
    VERIFIED: 'VERIFIED',
    ROLLING_BACK: 'ROLLING_BACK',
    ROLLED_BACK: 'ROLLED_BACK',
    ROLLBACK_FAILED: 'ROLLBACK_FAILED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
    SKIPPED: 'SKIPPED'
});

const RISK_LEVELS = Object.freeze({
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
});

const EXECUTION_MODES = Object.freeze({
    MANUAL: 'MANUAL',
    APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
    AUTOMATIC: 'AUTOMATIC',
    DISABLED: 'DISABLED'
});

module.exports = {
    REMEDIATION_STATES,
    RISK_LEVELS,
    EXECUTION_MODES
};
