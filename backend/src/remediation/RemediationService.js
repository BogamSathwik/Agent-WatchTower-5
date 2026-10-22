/**
 * Remediation Service
 * High-level orchestration facade uniting Remediation Actions, Rules, Policies,
 * Approval Workflows, Execution Engine, Safety Engine, Audit Trail, and Metrics.
 * Purely domain-agnostic.
 */

const RemediationStore = require('./RemediationStore');
const { RemediationExecutionEngine } = require('./RemediationExecutionEngine');
const { RemediationAction } = require('./RemediationAction');
const { RemediationRule } = require('./RemediationRule');
const { RemediationPolicy } = require('./RemediationPolicy');

class RemediationService {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.agentRegistry = options.agentRegistry || null;
        this.executionService = options.executionService || null;
        this.healthEngine = options.healthEngine || null;
        this.qualityRunner = options.qualityRunner || null;
        this.intelligenceService = options.intelligenceService || null;
        this.alertingService = options.alertingService || null;

        this.store = options.remediationStore || new RemediationStore();

        this.executionEngine = new RemediationExecutionEngine({
            systemRegistry: this.systemRegistry,
            agentRegistry: this.agentRegistry,
            executionService: this.executionService,
            healthEngine: this.healthEngine,
            qualityRunner: this.qualityRunner,
            remediationStore: this.store,
            alertingService: this.alertingService,
            allowLocalhost: Boolean(options.allowLocalhost)
        });
    }

    // --- Action Operations ---

    createAction(actionData) {
        const action = actionData instanceof RemediationAction ? actionData : new RemediationAction(actionData);
        if (!action.actionId || !action.name || !action.targetSystemId) {
            const err = new Error('Invalid action definition: actionId, name, and targetSystemId are required');
            err.statusCode = 400;
            throw err;
        }
        return this.store.saveAction(action);
    }

    getAction(actionId) {
        return this.store.getAction(actionId);
    }

    listActions(filters = {}) {
        return this.store.listActions(filters);
    }

    updateAction(actionId, updates = {}) {
        const existing = this.getAction(actionId);
        if (!existing) {
            const err = new Error(`Action '${actionId}' not found`);
            err.statusCode = 404;
            throw err;
        }
        const updated = new RemediationAction({
            ...existing.toJSON(),
            ...updates,
            actionId
        });
        return this.store.saveAction(updated);
    }

    deleteAction(actionId) {
        return this.store.deleteAction(actionId);
    }

    // --- Rule Operations ---

    createRule(ruleData) {
        const rule = ruleData instanceof RemediationRule ? ruleData : new RemediationRule(ruleData);
        if (!rule.ruleId || !rule.name || !rule.remediationActionId) {
            const err = new Error('Invalid rule definition: ruleId, name, and remediationActionId are required');
            err.statusCode = 400;
            throw err;
        }
        return this.store.saveRule(rule);
    }

    getRule(ruleId) {
        return this.store.getRule(ruleId);
    }

    listRules(filters = {}) {
        return this.store.listRules(filters);
    }

    updateRule(ruleId, updates = {}) {
        const existing = this.getRule(ruleId);
        if (!existing) {
            const err = new Error(`Rule '${ruleId}' not found`);
            err.statusCode = 404;
            throw err;
        }
        const updated = new RemediationRule({
            ...existing.toJSON(),
            ...updates,
            ruleId
        });
        return this.store.saveRule(updated);
    }

    deleteRule(ruleId) {
        return this.store.deleteRule(ruleId);
    }

    // --- Policy Operations ---

    setPolicy(policyData) {
        return this.store.setPolicy(policyData);
    }

    getPolicy() {
        return this.store.getPolicy();
    }

    // --- Remediation Execution & Triggering ---

    async executeRemediation(actionId, systemId, options = {}) {
        const action = this.getAction(actionId);
        if (!action) {
            const err = new Error(`Remediation action '${actionId}' not found`);
            err.statusCode = 404;
            throw err;
        }

        return await this.executionEngine.execute(action, systemId || action.targetSystemId, options);
    }

    async runDryRun(actionId, systemId, options = {}) {
        return await this.executeRemediation(actionId, systemId, { ...options, dryRun: true });
    }

    async rollbackExecution(remediationId) {
        const execution = this.getExecution(remediationId);
        if (!execution) {
            const err = new Error(`Remediation execution '${remediationId}' not found`);
            err.statusCode = 404;
            throw err;
        }
        const action = this.getAction(execution.actionId);
        const rollbackRes = await this.executionEngine.rollbackEngine.rollback(action, execution.systemId);

        execution.status = rollbackRes.status;
        execution.rollbackResult = rollbackRes;
        if (!rollbackRes.success) {
            execution.error = rollbackRes.reason || rollbackRes.error || 'Rollback failed';
        }
        this.store.saveExecution(execution);
        return execution;
    }

    /**
     * Evaluate incoming operational observation or alert event against remediation rules.
     */
    async evaluateEventTriggers(event = {}) {
        const rules = this.listRules({ enabled: true });
        const triggeredExecutions = [];

        for (const rule of rules) {
            if (rule.matchesTrigger(event)) {
                const action = this.getAction(rule.remediationActionId);
                if (action && action.enabled) {
                    const execRes = await this.executionEngine.execute(action, rule.targetSystemId || event.systemId, {
                        triggerSource: rule.triggerSource,
                        triggerReason: `Matched rule '${rule.name}' for metric '${rule.condition.metric}'`,
                        cooldownMs: rule.cooldownMs
                    });
                    triggeredExecutions.push(execRes);
                }
            }
        }

        return triggeredExecutions;
    }

    // --- Approval Workflow Operations ---

    listApprovals(filters = {}) {
        return this.executionEngine.approvalWorkflow.listApprovals(filters);
    }

    getApproval(approvalId) {
        return this.executionEngine.approvalWorkflow.getApproval(approvalId);
    }

    async approveRequest(approvalId, approver = 'admin', reason = '') {
        const approval = this.executionEngine.approvalWorkflow.approve(approvalId, approver, reason);
        const execution = this.store.listExecutions().find(e => e.approvalId === approvalId);
        
        if (execution && (execution.status === 'AWAITING_APPROVAL' || execution.status === 'BLOCKED')) {
            const action = this.getAction(execution.actionId);
            if (action) {
                return await this.executionEngine.execute(action, execution.systemId, {
                    approvalId: approval.approvalId,
                    actor: approver
                });
            }
        }

        return approval;
    }

    rejectRequest(approvalId, approver = 'admin', reason = '') {
        const approval = this.executionEngine.approvalWorkflow.reject(approvalId, approver, reason);
        const execution = this.store.listExecutions().find(e => e.approvalId === approvalId);
        
        if (execution && execution.status === 'AWAITING_APPROVAL') {
            execution.status = 'CANCELLED';
            execution.error = `Approval request rejected by ${approver}: ${reason}`;
            this.store.saveExecution(execution);
        }

        return approval;
    }

    // --- History & Audit ---

    getExecution(executionId) {
        return this.store.getExecution(executionId);
    }

    listExecutions(filters = {}) {
        return this.store.listExecutions(filters);
    }

    listAuditLogs(filters = {}) {
        return this.store.listAuditLogs(filters);
    }

    // --- Metrics & Overview ---

    getMetrics(timeWindowMs = 86400000) {
        const executions = this.listExecutions();
        const totalAttempts = executions.length;
        const successfulRemediations = executions.filter(e => e.status === 'SUCCEEDED' || e.status === 'VERIFIED').length;
        const failedRemediations = executions.filter(e => e.status === 'FAILED').length;
        const verifiedRemediations = executions.filter(e => e.status === 'VERIFIED').length;
        const rollbackCount = executions.filter(e => e.status === 'ROLLED_BACK').length;
        const rollbackFailures = executions.filter(e => e.status === 'ROLLBACK_FAILED').length;
        const blockedActions = executions.filter(e => e.status === 'BLOCKED').length;
        const dryRunCount = executions.filter(e => e.dryRun).length;
        const remediationSuccessRate = totalAttempts > 0 ? Math.round((successfulRemediations / totalAttempts) * 100) : 100;
        const verificationSuccessRate = successfulRemediations > 0 ? Math.round((verifiedRemediations / successfulRemediations) * 100) : 100;

        return {
            totalAttempts,
            successfulRemediations,
            failedRemediations,
            verifiedRemediations,
            rollbackCount,
            rollbackFailures,
            blockedActions,
            dryRunCount,
            remediationSuccessRate,
            verificationSuccessRate
        };
    }

    getOverview() {
        const actions = this.listActions();
        const rules = this.listRules();
        const executions = this.listExecutions();
        const approvals = this.listApprovals();
        const policy = this.getPolicy();
        const metrics = this.getMetrics();

        return {
            totalActions: actions.length,
            totalRules: rules.length,
            policyMode: policy ? policy.mode : 'MANUAL',
            pendingApprovalsCount: approvals.filter(a => a.status === 'REQUESTED').length,
            metrics
        };
    }
}

module.exports = RemediationService;
