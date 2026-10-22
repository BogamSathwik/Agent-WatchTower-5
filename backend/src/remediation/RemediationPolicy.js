/**
 * Remediation Policy Engine
 * Controls authorization, risk evaluation, execution modes, cooldown windows, and rate limits.
 * Purely domain-agnostic.
 */

const { EXECUTION_MODES, RISK_LEVELS } = require('./RemediationStates');

class RemediationPolicy {
    constructor(raw = {}) {
        this.policyId = raw.policyId ? String(raw.policyId).trim() : (raw.id ? String(raw.id).trim() : 'default-policy');
        this.name = raw.name ? String(raw.name).trim() : 'Default Self-Healing Policy';
        this.mode = raw.mode && Object.values(EXECUTION_MODES).includes(raw.mode.toUpperCase())
            ? raw.mode.toUpperCase()
            : EXECUTION_MODES.APPROVAL_REQUIRED;

        this.maxRiskLevelAuto = raw.maxRiskLevelAuto && Object.values(RISK_LEVELS).includes(raw.maxRiskLevelAuto.toUpperCase())
            ? raw.maxRiskLevelAuto.toUpperCase()
            : RISK_LEVELS.MEDIUM;

        this.cooldownMs = Number(raw.cooldownMs) || 60000;
        this.maxConcurrentExecutions = Number(raw.maxConcurrentExecutions) || 5;
        this.maxExecutionCountPerHour = Number(raw.maxExecutionCountPerHour) || 20;
        this.circuitBreakerThreshold = Number(raw.circuitBreakerThreshold) || 5; // trip if 5 consecutive failures

        this.maintenanceWindow = (typeof raw.maintenanceWindow === 'object' && raw.maintenanceWindow !== null)
            ? {
                enabled: Boolean(raw.maintenanceWindow.enabled ?? false),
                startHour: Number(raw.maintenanceWindow.startHour) || 0,
                endHour: Number(raw.maintenanceWindow.endHour) || 6
            }
            : { enabled: false, startHour: 0, endHour: 6 };
    }

    /**
     * Determines whether an action requires human approval or can execute automatically.
     */
    evaluateExecutionMode(action = {}, userRole = 'operator') {
        if (this.mode === EXECUTION_MODES.DISABLED || action.enabled === false) {
            return {
                canExecute: false,
                requiresApproval: false,
                mode: EXECUTION_MODES.DISABLED,
                reason: 'Remediation is disabled by policy or action configuration'
            };
        }

        if (this.mode === EXECUTION_MODES.MANUAL) {
            return {
                canExecute: true,
                requiresApproval: false,
                mode: EXECUTION_MODES.MANUAL,
                reason: 'Manual execution mode'
            };
        }

        // If action specifically requires approval or risk level exceeds automatic limit
        const riskOrder = { [RISK_LEVELS.LOW]: 1, [RISK_LEVELS.MEDIUM]: 2, [RISK_LEVELS.HIGH]: 3, [RISK_LEVELS.CRITICAL]: 4 };
        const actionRisk = riskOrder[action.riskLevel] || 2;
        const maxAutoRisk = riskOrder[this.maxRiskLevelAuto] || 2;

        if (action.approvalRequired || actionRisk > maxAutoRisk || this.mode === EXECUTION_MODES.APPROVAL_REQUIRED) {
            return {
                canExecute: true,
                requiresApproval: true,
                mode: EXECUTION_MODES.APPROVAL_REQUIRED,
                reason: `Approval required due to risk level '${action.riskLevel}' or policy setting`
            };
        }

        return {
            canExecute: true,
            requiresApproval: false,
            mode: EXECUTION_MODES.AUTOMATIC,
            reason: 'Automatic execution permitted by policy'
        };
    }

    /**
     * Helper to check if execution is permitted for an action.
     */
    isExecutionAllowed(action = {}) {
        const evalRes = this.evaluateExecutionMode(action);
        return evalRes.canExecute;
    }

    toJSON() {
        return {
            policyId: this.policyId,
            name: this.name,
            mode: this.mode,
            maxRiskLevelAuto: this.maxRiskLevelAuto,
            cooldownMs: this.cooldownMs,
            maxConcurrentExecutions: this.maxConcurrentExecutions,
            maxExecutionCountPerHour: this.maxExecutionCountPerHour,
            circuitBreakerThreshold: this.circuitBreakerThreshold,
            maintenanceWindow: this.maintenanceWindow
        };
    }
}

module.exports = {
    RemediationPolicy
};
