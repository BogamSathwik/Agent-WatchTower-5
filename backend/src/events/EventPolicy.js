/**
 * Phase 14 — Event Automation Policy Model
 * Defines policy constraints, execution modes, risk levels, cooldowns, and approval requirements.
 */

const { POLICY_MODES } = require('./EventStates');

class EventPolicy {
    constructor(data = {}) {
        this.id = data.id || `pol_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        this.name = data.name || 'Default Automation Policy';
        this.description = data.description || '';
        this.mode = data.mode || POLICY_MODES.AUTOMATIC;
        this.riskLevel = data.riskLevel || 'LOW'; // LOW, MEDIUM, HIGH, CRITICAL
        this.cooldownMs = Number(data.cooldownMs) || 5000;
        this.maxExecutionsPerWindow = Number(data.maxExecutionsPerWindow) || 10;
        this.windowSizeMs = Number(data.windowSizeMs) || 60000;
        this.concurrencyLimit = Number(data.concurrencyLimit) || 3;
        this.allowedActions = Array.isArray(data.allowedActions) ? data.allowedActions : [];
        this.blockedActions = Array.isArray(data.blockedActions) ? data.blockedActions : [];
        this.approvalTimeoutMs = Number(data.approvalTimeoutMs) || 86400000; // 24h default
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    isActionAllowed(actionType) {
        if (this.mode === POLICY_MODES.DISABLED) return false;
        if (this.blockedActions.includes(actionType)) return false;
        if (this.allowedActions.length > 0 && !this.allowedActions.includes(actionType)) return false;
        return true;
    }

    requiresApproval(actionType, riskLevel = 'LOW') {
        if (this.mode === POLICY_MODES.APPROVAL_REQUIRED) return true;
        if (this.mode === POLICY_MODES.MANUAL) return true;
        if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') return true;
        return false;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            mode: this.mode,
            riskLevel: this.riskLevel,
            cooldownMs: this.cooldownMs,
            maxExecutionsPerWindow: this.maxExecutionsPerWindow,
            windowSizeMs: this.windowSizeMs,
            concurrencyLimit: this.concurrencyLimit,
            allowedActions: this.allowedActions,
            blockedActions: this.blockedActions,
            approvalTimeoutMs: this.approvalTimeoutMs,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = EventPolicy;
