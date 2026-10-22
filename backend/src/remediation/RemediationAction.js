/**
 * Remediation Action Model
 * Defines standardized, configurable remediation actions that can be executed on targets.
 * Purely generic - zero business-specific hardcoding.
 */

const { RISK_LEVELS } = require('./RemediationStates');

class RemediationAction {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.actionId = raw.actionId ? String(raw.actionId).trim() : (raw.id ? String(raw.id).trim() : '');
        this.name = raw.name ? String(raw.name).trim() : '';
        this.description = raw.description ? String(raw.description).trim() : '';
        this.version = raw.version ? String(raw.version).trim() : '1.0.0';
        this.category = raw.category ? String(raw.category).trim().toLowerCase() : 'remediation';

        this.targetSystemId = raw.targetSystemId ? String(raw.targetSystemId).trim() : '';
        this.capability = raw.capability ? String(raw.capability).trim().toUpperCase() : 'EXECUTE';
        this.operation = raw.operation ? String(raw.operation).trim() : 'remediate';

        this.parameters = (typeof raw.parameters === 'object' && raw.parameters !== null && !Array.isArray(raw.parameters))
            ? raw.parameters
            : {};

        this.timeoutMs = Number(raw.timeoutMs) || 10000;
        
        this.retryPolicy = (typeof raw.retryPolicy === 'object' && raw.retryPolicy !== null)
            ? {
                maxAttempts: Number(raw.retryPolicy.maxAttempts) || 3,
                backoffMs: Number(raw.retryPolicy.backoffMs) || 2000
            }
            : { maxAttempts: 3, backoffMs: 2000 };

        this.riskLevel = raw.riskLevel && Object.values(RISK_LEVELS).includes(raw.riskLevel.toUpperCase())
            ? raw.riskLevel.toUpperCase()
            : RISK_LEVELS.MEDIUM;

        this.requiredRole = raw.requiredRole ? String(raw.requiredRole).trim().toLowerCase() : 'operator';
        
        // Verification strategy configuration
        this.verificationStrategy = (typeof raw.verificationStrategy === 'object' && raw.verificationStrategy !== null)
            ? {
                type: raw.verificationStrategy.type || 'health',
                targetMetric: raw.verificationStrategy.targetMetric || 'healthScore',
                expectedValue: raw.verificationStrategy.expectedValue ?? 'healthy',
                timeoutMs: Number(raw.verificationStrategy.timeoutMs) || 10000
            }
            : { type: 'health', targetMetric: 'healthScore', expectedValue: 'healthy', timeoutMs: 10000 };

        // Rollback strategy configuration
        this.rollbackStrategy = (typeof raw.rollbackStrategy === 'object' && raw.rollbackStrategy !== null)
            ? {
                available: Boolean(raw.rollbackStrategy.available ?? true),
                actionId: raw.rollbackStrategy.actionId || null,
                capability: raw.rollbackStrategy.capability || null,
                operation: raw.rollbackStrategy.operation || null,
                parameters: raw.rollbackStrategy.parameters || {}
            }
            : { available: false, actionId: null, capability: null, operation: null, parameters: {} };

        this.enabled = Boolean(raw.enabled ?? true);
        this.supportsDryRun = Boolean(raw.supportsDryRun ?? true);
        this.approvalRequired = Boolean(raw.approvalRequired ?? (this.riskLevel === RISK_LEVELS.HIGH || this.riskLevel === RISK_LEVELS.CRITICAL));

        this.metadata = (typeof raw.metadata === 'object' && raw.metadata !== null && !Array.isArray(raw.metadata))
            ? raw.metadata
            : {};

        this.createdAt = raw.createdAt || now;
        this.updatedAt = raw.updatedAt || now;
    }

    sanitize() {
        const json = this.toJSON();
        if (json.parameters) {
            const params = { ...json.parameters };
            for (const k of Object.keys(params)) {
                if (k.toLowerCase().includes('token') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('password') || k.toLowerCase().includes('key')) {
                    params[k] = '[REDACTED]';
                }
            }
            json.parameters = params;
        }
        return json;
    }

    toJSON() {
        const params = { ...this.parameters };
        for (const k of Object.keys(params)) {
            if (k.toLowerCase().includes('token') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('password') || k.toLowerCase().includes('key')) {
                params[k] = '[REDACTED]';
            }
        }

        return {
            actionId: this.actionId,
            name: this.name,
            description: this.description,
            version: this.version,
            category: this.category,
            targetSystemId: this.targetSystemId,
            capability: this.capability,
            operation: this.operation,
            parameters: params,
            timeoutMs: this.timeoutMs,
            retryPolicy: this.retryPolicy,
            riskLevel: this.riskLevel,
            requiredRole: this.requiredRole,
            verificationStrategy: this.verificationStrategy,
            rollbackStrategy: this.rollbackStrategy,
            enabled: this.enabled,
            supportsDryRun: this.supportsDryRun,
            approvalRequired: this.approvalRequired,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = {
    RemediationAction
};
