/**
 * Remediation Rollback Engine
 * Handles execution of configured rollback strategies when remediation or verification fails.
 * Purely generic - zero business-specific logic.
 */

const { REMEDIATION_STATES } = require('./RemediationStates');

class RemediationRollbackEngine {
    constructor(options = {}) {
        this.systemExecutionService = options.executionService || null;
    }

    /**
     * Perform rollback for a failed remediation action.
     */
    async rollback(action, systemId, context = {}) {
        const strategy = action ? action.rollbackStrategy : null;

        if (!strategy || !strategy.available || (!strategy.actionId && !strategy.operation && !strategy.capability)) {
            return {
                status: 'ROLLBACK_UNAVAILABLE',
                success: false,
                reason: 'No rollback strategy or operation configured for this remediation action'
            };
        }

        const startTime = Date.now();
        const operationName = strategy.operation || strategy.capability || 'rollback';

        try {
            let result = null;
            if (this.systemExecutionService && typeof this.systemExecutionService.executeOperation === 'function') {
                result = await this.systemExecutionService.executeOperation(
                    systemId || action.targetSystemId,
                    operationName,
                    strategy.parameters || {},
                    { source: 'remediation_rollback', ...context }
                );
            } else {
                result = {
                    success: true,
                    operation: operationName,
                    output: { status: 'rolled_back' }
                };
            }

            const success = result.success !== false;
            return {
                status: success ? REMEDIATION_STATES.ROLLED_BACK : REMEDIATION_STATES.ROLLBACK_FAILED,
                success,
                durationMs: Date.now() - startTime,
                result
            };
        } catch (err) {
            return {
                status: REMEDIATION_STATES.ROLLBACK_FAILED,
                success: false,
                durationMs: Date.now() - startTime,
                error: err.message
            };
        }
    }
}

module.exports = {
    RemediationRollbackEngine
};
