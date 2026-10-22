/**
 * Remediation Execution Engine
 * Core runner executing the full remediation pipeline:
 * RESOLVE -> SAFETY CHECK -> POLICY -> APPROVAL -> EXECUTION -> VERIFICATION -> ROLLBACK -> AUDIT
 */

const { REMEDIATION_STATES } = require('./RemediationStates');
const { RemediationSafetyEngine } = require('./RemediationSafetyEngine');
const { RemediationVerificationEngine } = require('./RemediationVerificationEngine');
const { RemediationRollbackEngine } = require('./RemediationRollbackEngine');
const { RemediationApprovalWorkflow } = require('./RemediationApprovalWorkflow');

class RemediationExecutionEngine {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.agentRegistry = options.agentRegistry || null;
        this.executionService = options.executionService || null;
        this.healthEngine = options.healthEngine || null;
        this.qualityRunner = options.qualityRunner || null;
        this.remediationStore = options.remediationStore || null;
        this.alertingService = options.alertingService || null;

        this.safetyEngine = new RemediationSafetyEngine({
            systemRegistry: this.systemRegistry,
            allowLocalhost: Boolean(options.allowLocalhost)
        });

        this.verificationEngine = new RemediationVerificationEngine({
            healthEngine: this.healthEngine,
            qualityRunner: this.qualityRunner,
            executionService: this.executionService
        });

        this.rollbackEngine = new RemediationRollbackEngine({
            executionService: this.executionService
        });

        this.approvalWorkflow = new RemediationApprovalWorkflow();
    }

    /**
     * Execute or Dry-Run a Remediation Action.
     */
    async execute(action, systemId, options = {}) {
        const executionId = `rem_exec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const startTime = new Date();
        const isDryRun = Boolean(options.dryRun);
        const actor = options.actor || 'system';
        const userRole = options.userRole || 'operator';

        // 1. System Resolution
        let targetSystem = null;
        const sysId = systemId || (action ? action.targetSystemId : 'unknown');

        if (this.systemRegistry && typeof this.systemRegistry.getSystem === 'function') {
            try { targetSystem = this.systemRegistry.getSystem(sysId); } catch (e) {}
        }
        if (!targetSystem && this.agentRegistry && typeof this.agentRegistry.getAgent === 'function') {
            targetSystem = this.agentRegistry.getAgent(sysId);
        }

        const record = {
            executionId,
            remediationId: executionId,
            actionId: action ? action.actionId : 'unknown',
            actionName: action ? action.name : 'Unknown Action',
            systemId: sysId,
            dryRun: isDryRun,
            sideEffectExecuted: false,
            actor,
            userRole,
            requestedBy: actor,
            triggerSource: options.triggerSource || 'manual',
            status: REMEDIATION_STATES.PLANNED,
            startTime: startTime.toISOString(),
            endTime: null,
            durationMs: 0,
            safetyValidation: null,
            policyEvaluation: null,
            approvalId: options.approvalId || null,
            executionPlan: null,
            executionResult: null,
            verificationResult: null,
            rollbackResult: null,
            error: null
        };

        if (!action) {
            record.status = REMEDIATION_STATES.FAILED;
            record.error = 'No remediation action defined';
            return this._finalizeRecord(record);
        }

        if (!targetSystem) {
            record.status = REMEDIATION_STATES.BLOCKED;
            record.error = `Target system '${sysId}' not registered or found`;
            return this._finalizeRecord(record);
        }

        // Validate target capability
        if (targetSystem && action && action.capability) {
            const systemCapabilities = (targetSystem.capabilities || []).map(c => 
                (typeof c === 'object' && c !== null ? (c.type || c.name || c.capability || '') : String(c)).toUpperCase()
            );
            const requiredCap = String(action.capability).toUpperCase();
            if (systemCapabilities.length > 0 && !systemCapabilities.includes(requiredCap) && !systemCapabilities.includes('EXECUTE')) {
                record.status = REMEDIATION_STATES.BLOCKED;
                record.error = `Target system '${sysId}' does not support requested capability '${action.capability}'`;
                return this._finalizeRecord(record);
            }
        }

        // 2. Safety Validation
        const safety = this.safetyEngine.validateSafety(action, targetSystem, {
            allowLocalhost: Boolean(options.allowLocalhost),
            cooldownMs: options.cooldownMs
        });
        record.safetyValidation = safety;

        if (!safety.safe) {
            record.status = REMEDIATION_STATES.BLOCKED;
            record.error = `Safety check failed: ${safety.reason} (${(safety.errors || []).join('; ')})`;
            return this._finalizeRecord(record);
        }

        // 3. Policy & Approval Evaluation
        const policy = this.remediationStore ? this.remediationStore.getPolicy() : new (require('./RemediationPolicy').RemediationPolicy)();
        const policyEval = policy.evaluateExecutionMode(action, userRole);
        record.policyEvaluation = policyEval;

        if (!policyEval.canExecute) {
            record.status = REMEDIATION_STATES.BLOCKED;
            record.error = policyEval.reason;
            return this._finalizeRecord(record);
        }

        if (policyEval.requiresApproval && !options.approvalId && !isDryRun) {
            const approvalReq = this.approvalWorkflow.createApprovalRequest({
                action,
                systemId: sysId,
                triggerReason: options.triggerReason || policyEval.reason,
                requester: actor
            });
            record.status = REMEDIATION_STATES.AWAITING_APPROVAL;
            record.approvalId = approvalReq.approvalId;
            return this._finalizeRecord(record);
        }

        if (record.approvalId && !isDryRun) {
            const appr = this.approvalWorkflow.getApproval(record.approvalId);
            if (!appr || appr.status !== 'APPROVED') {
                record.status = REMEDIATION_STATES.BLOCKED;
                record.error = `Approval request '${record.approvalId}' is not approved (status: ${appr ? appr.status : 'NOT_FOUND'})`;
                return this._finalizeRecord(record);
            }
        }

        // 4. DRY RUN EXECUTION
        if (isDryRun) {
            record.status = REMEDIATION_STATES.PLANNED;
            record.executionPlan = {
                actionId: action.actionId,
                targetSystemId: sysId,
                capability: action.capability,
                operation: action.operation,
                parameters: action.toJSON().parameters,
                expectedOutcome: 'Safety and policy validation passed cleanly'
            };
            record.executionResult = {
                dryRun: true,
                targetSystemId: sysId,
                capability: action.capability,
                operation: action.operation,
                parameters: action.toJSON().parameters,
                expectedOutcome: 'Action validation and safety checks passed cleanly'
            };
            record.verificationResult = { verified: true, strategyType: action.verificationStrategy.type, expected: action.verificationStrategy.expectedValue, actual: 'dry_run_pass' };
            return this._finalizeRecord(record);
        }

        // 5. REAL EXECUTION WITH RETRY POLICY
        const lockAcquired = this.safetyEngine.acquireLock(action.actionId, sysId);
        if (!lockAcquired) {
            record.status = REMEDIATION_STATES.BLOCKED;
            record.error = `Concurrent execution lock active for '${sysId}:${action.actionId}'`;
            return this._finalizeRecord(record);
        }

        record.status = REMEDIATION_STATES.EXECUTING;
        record.sideEffectExecuted = true;
        let execSuccess = false;
        const maxAttempts = (action.retryPolicy && action.retryPolicy.maxAttempts) ? action.retryPolicy.maxAttempts : 1;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                if (typeof this.executeAdapterAction === 'function') {
                    record.executionResult = await this.executeAdapterAction(action, sysId);
                    execSuccess = record.executionResult.success !== false;
                } else if (this.executionService && typeof this.executionService.executeOperation === 'function') {
                    record.executionResult = await this.executionService.executeOperation(
                        sysId,
                        action.operation || action.capability,
                        action.parameters || {},
                        { source: 'remediation_engine', actor }
                    );
                    execSuccess = record.executionResult.success !== false;
                } else {
                    record.executionResult = {
                        success: true,
                        systemId: sysId,
                        operation: action.operation,
                        output: { status: 'remediated' }
                    };
                    execSuccess = true;
                }
                if (execSuccess) break;
            } catch (err) {
                execSuccess = false;
                record.error = err.message;
                record.executionResult = { success: false, error: err.message };
            }
        }

        this.safetyEngine.recordExecution(safety.fingerprint, execSuccess);

        if (!execSuccess) {
            record.status = REMEDIATION_STATES.FAILED;
            
            if (action.rollbackStrategy && action.rollbackStrategy.available) {
                record.status = REMEDIATION_STATES.ROLLING_BACK;
                record.rollbackResult = await this.rollbackEngine.rollback(action, sysId);
            } else {
                record.rollbackResult = { status: 'ROLLBACK_UNAVAILABLE', reason: 'No rollback strategy configured' };
            }

            this.safetyEngine.releaseLock(action.actionId, sysId);
            return this._finalizeRecord(record);
        }

        record.status = REMEDIATION_STATES.SUCCEEDED;

        // 6. POST-REMEDIATION VERIFICATION
        if (action.verificationStrategy && action.verificationStrategy.type && action.verificationStrategy.type !== 'none') {
            record.status = REMEDIATION_STATES.VERIFYING;
            this.verificationEngine.healthEngine = this.healthEngine;
            this.verificationEngine.qualityRunner = this.qualityRunner;
            this.verificationEngine.systemExecutionService = this.executionService;
            const verification = await this.verificationEngine.verify(sysId, action.verificationStrategy);
            record.verificationResult = verification;

            if (verification.verified) {
                record.status = REMEDIATION_STATES.VERIFIED;
            } else {
                record.status = REMEDIATION_STATES.FAILED;
                record.error = `Post-remediation verification failed (expected '${verification.expected}', got '${verification.actual}')`;

                if (action.rollbackStrategy && action.rollbackStrategy.available) {
                    record.status = REMEDIATION_STATES.ROLLING_BACK;
                    record.rollbackResult = await this.rollbackEngine.rollback(action, sysId);
                } else {
                    record.rollbackResult = { status: 'ROLLBACK_UNAVAILABLE', reason: 'No rollback strategy configured' };
                }
            }
        }

        this.safetyEngine.releaseLock(action.actionId, sysId);
        return this._finalizeRecord(record);
    }

    _finalizeRecord(record) {
        record.endTime = new Date().toISOString();
        record.durationMs = new Date(record.endTime).getTime() - new Date(record.startTime).getTime();

        if (this.remediationStore) {
            this.remediationStore.saveExecution(record);
            this.remediationStore.addAuditLog({
                executionId: record.executionId,
                remediationId: record.remediationId,
                actionId: record.actionId,
                systemId: record.systemId,
                requestedBy: record.actor,
                dryRun: record.dryRun,
                status: record.status,
                durationMs: record.durationMs,
                error: record.error
            });
        }

        return record;
    }
}

module.exports = {
    RemediationExecutionEngine
};
