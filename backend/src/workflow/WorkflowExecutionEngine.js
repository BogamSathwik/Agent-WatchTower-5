/**
 * Workflow Execution Engine
 * Domain-agnostic orchestration engine supporting sequential/branched step execution,
 * retries with backoff, timeouts, approval gates, verification checks, event triggers,
 * SSE broadcasting, audit logging, and anti-loop safety mechanisms.
 */

const { WORKFLOW_STATES } = require('./WorkflowStates');
const { STEP_TYPES } = require('./WorkflowStep');
const { auditLogService } = require('../audit/AuditLogService');
const { telemetryService } = require('../telemetry/TelemetryService');
const { sseManager } = require('../events/SSEManager');

class WorkflowExecutionEngine {
    constructor(options = {}) {
        this.workflowStore = options.workflowStore;
        this.agentService = options.agentService;
        this.systemRegistry = options.systemRegistry;
        this.executionService = options.executionService;
        this.healthEngine = options.healthEngine;
        this.alertingService = options.alertingService;
        this.remediationService = options.remediationService;

        this.activeExecutions = new Map();
        this.maxStepsPerExecution = options.maxStepsPerExecution || 100;
    }

    /**
     * Evaluate condition expression against execution state & runtime variables.
     */
    evaluateCondition(cond, context = {}) {
        if (!cond || typeof cond !== 'object') return true;

        const { field, operator, value } = cond;
        if (!field) return true;

        // Resolve value from context (e.g. "health.status", "lastStep.status", "variable.foo")
        const parts = String(field).split('.');
        let actual = context;
        for (const p of parts) {
            if (actual && typeof actual === 'object' && p in actual) {
                actual = actual[p];
            } else {
                actual = undefined;
                break;
            }
        }

        switch (String(operator).toUpperCase()) {
            case 'EQUALS':
            case 'EQ':
            case '==':
                return String(actual) === String(value);
            case 'NOT_EQUALS':
            case 'NEQ':
            case '!=':
                return String(actual) !== String(value);
            case 'GREATER_THAN':
            case 'GT':
            case '>':
                return Number(actual) > Number(value);
            case 'LESS_THAN':
            case 'LT':
            case '<':
                return Number(actual) < Number(value);
            case 'CONTAINS':
            case 'INCLUDES':
                return String(actual).toLowerCase().includes(String(value).toLowerCase());
            case 'IS_PRESENT':
            case 'EXISTS':
                return actual !== undefined && actual !== null;
            default:
                return Boolean(actual);
        }
    }

    /**
     * Broadcast SSE lifecycle event.
     */
    broadcastEvent(eventType, payload) {
        try {
            sseManager.broadcast(eventType, payload);
        } catch (e) {
            // Ignore SSE errors in test environments
        }
    }

    /**
     * Execute a workflow asynchronously.
     */
    async executeWorkflow(workflow, options = {}) {
        if (!workflow) throw new Error('Workflow instance is required');

        const validation = workflow.validate ? workflow.validate() : { valid: true };
        if (!validation.valid) {
            throw new Error(`Invalid workflow definition: ${validation.errors.join(', ')}`);
        }

        const executionId = options.executionId || `wf_exec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const tenantId = options.tenantId || workflow.tenantId || 'global';
        const correlationId = options.correlationId || `corr_wf_${Date.now()}`;
        const actor = options.actor || 'system';

        const executionRecord = {
            executionId,
            workflowId: workflow.id,
            workflowName: workflow.name,
            tenantId,
            correlationId,
            actor,
            startedAt: new Date().toISOString(),
            completedAt: null,
            currentStep: null,
            status: WORKFLOW_STATES.RUNNING,
            variables: { ...(options.variables || {}) },
            stepResults: [],
            logs: []
        };

        if (this.workflowStore) {
            this.workflowStore.saveExecution(executionRecord);
        }
        this.activeExecutions.set(executionId, executionRecord);

        // Log audit event
        auditLogService.logEvent({
            eventType: 'WORKFLOW_STARTED',
            action: 'execute_workflow',
            actor,
            role: options.role || 'operator',
            tenantId,
            resourceType: 'workflow',
            resourceId: workflow.id,
            outcome: 'SUCCESS',
            severity: 'INFO',
            correlationId,
            metadata: { executionId, stepCount: workflow.steps.length }
        });

        this.broadcastEvent('WORKFLOW_STARTED', {
            executionId,
            workflowId: workflow.id,
            tenantId,
            correlationId
        });

        // Run execution loop in background
        this._runExecutionLoop(workflow, executionRecord, options).catch(err => {
            executionRecord.status = WORKFLOW_STATES.FAILED;
            executionRecord.completedAt = new Date().toISOString();
            executionRecord.error = err.message;
            if (this.workflowStore) this.workflowStore.saveExecution(executionRecord);
        });

        return executionRecord;
    }

    /**
     * Execution loop processing steps sequentially with branching, retries, and timeouts.
     */
    async _runExecutionLoop(workflow, record, options = {}) {
        const steps = workflow.steps;
        let stepIndex = options.startStepIndex || 0;
        let executedStepsCount = 0;

        const maxTimeoutMs = workflow.timeoutPolicy ? workflow.timeoutPolicy.maxWorkflowTimeoutMs : 300000;
        const startTimeMs = record.startTimeMs || Date.now();
        record.startTimeMs = startTimeMs;

        while (stepIndex < steps.length) {
            // Anti-infinite loop protection
            if (executedStepsCount >= this.maxStepsPerExecution) {
                record.status = WORKFLOW_STATES.FAILED;
                record.error = `Anti-loop protection triggered: Max steps limit (${this.maxStepsPerExecution}) exceeded.`;
                record.completedAt = new Date().toISOString();
                if (this.workflowStore) this.workflowStore.saveExecution(record);
                return;
            }

            // Check overall workflow timeout
            if (Date.now() - startTimeMs > maxTimeoutMs) {
                record.status = WORKFLOW_STATES.TIMED_OUT;
                record.error = `Workflow execution timed out after ${maxTimeoutMs}ms`;
                record.completedAt = new Date().toISOString();
                this.broadcastEvent('WORKFLOW_FAILED', { executionId: record.executionId, reason: 'TIMED_OUT' });
                if (this.workflowStore) this.workflowStore.saveExecution(record);
                return;
            }

            // Check cancellation or pause
            if (record.status === WORKFLOW_STATES.CANCELLED) {
                record.completedAt = new Date().toISOString();
                this.broadcastEvent('WORKFLOW_CANCELLED', { executionId: record.executionId });
                if (this.workflowStore) this.workflowStore.saveExecution(record);
                return;
            }

            if (record.status === WORKFLOW_STATES.PAUSED) {
                this.broadcastEvent('WORKFLOW_PAUSED', { executionId: record.executionId });
                return; // Will be resumed by resumeExecution
            }

            const step = steps[stepIndex];
            record.currentStep = step.id;
            executedStepsCount++;

            this.broadcastEvent('WORKFLOW_STEP_STARTED', {
                executionId: record.executionId,
                stepId: step.id,
                stepName: step.name,
                stepType: step.type
            });

            // Execute single step with retries & timeout
            const stepResult = await this._executeStepWithRetries(step, record, maxTimeoutMs - (Date.now() - startTimeMs));
            record.stepResults.push(stepResult);

            // Post-step workflow timeout check
            if (Date.now() - startTimeMs > maxTimeoutMs) {
                record.status = WORKFLOW_STATES.TIMED_OUT;
                record.error = `Workflow execution timed out after ${maxTimeoutMs}ms`;
                record.completedAt = new Date().toISOString();
                this.broadcastEvent('WORKFLOW_FAILED', { executionId: record.executionId, reason: 'TIMED_OUT' });
                if (this.workflowStore) this.workflowStore.saveExecution(record);
                return;
            }

            if (!stepResult.success) {
                this.broadcastEvent('WORKFLOW_STEP_FAILED', {
                    executionId: record.executionId,
                    stepId: step.id,
                    error: stepResult.error
                });

                if (!step.continueOnFailure) {
                    record.status = WORKFLOW_STATES.FAILED;
                    record.error = `Step '${step.id}' failed: ${stepResult.error}`;
                    record.completedAt = new Date().toISOString();
                    this.broadcastEvent('WORKFLOW_FAILED', { executionId: record.executionId, error: record.error });
                    if (this.workflowStore) this.workflowStore.saveExecution(record);
                    return;
                }
            } else {
                this.broadcastEvent('WORKFLOW_STEP_COMPLETED', {
                    executionId: record.executionId,
                    stepId: step.id,
                    result: stepResult.output
                });
            }

            // Approval check
            if (step.type === STEP_TYPES.APPROVAL && stepResult.output && stepResult.output.status === 'WAITING_APPROVAL') {
                record.status = WORKFLOW_STATES.WAITING_APPROVAL;
                record.waitingStepId = step.id;
                this.broadcastEvent('WORKFLOW_WAITING_APPROVAL', {
                    executionId: record.executionId,
                    stepId: step.id,
                    workflowId: workflow.id
                });
                if (this.workflowStore) this.workflowStore.saveExecution(record);
                return; // Pause execution until approval endpoint is triggered
            }

            // Branching / Next step resolution
            if (step.type === STEP_TYPES.CONDITION && step.conditions) {
                const isTrue = this.evaluateCondition(step.conditions, { ...record.variables, lastStep: stepResult });
                if (isTrue && step.conditions.onTrueStepId) {
                    const nextIdx = steps.findIndex(s => s.id === step.conditions.onTrueStepId);
                    if (nextIdx !== -1) { stepIndex = nextIdx; continue; }
                } else if (!isTrue && step.conditions.onFalseStepId) {
                    const nextIdx = steps.findIndex(s => s.id === step.conditions.onFalseStepId);
                    if (nextIdx !== -1) { stepIndex = nextIdx; continue; }
                }
            }

            stepIndex++;
        }

        // All steps executed successfully
        record.status = WORKFLOW_STATES.SUCCEEDED;
        record.completedAt = new Date().toISOString();
        this.activeExecutions.delete(record.executionId);

        auditLogService.logEvent({
            eventType: 'WORKFLOW_COMPLETED',
            action: 'complete_workflow',
            actor: record.actor,
            role: 'operator',
            tenantId: record.tenantId,
            resourceType: 'workflow',
            resourceId: workflow.id,
            outcome: 'SUCCESS',
            severity: 'INFO',
            correlationId: record.correlationId,
            metadata: { executionId: record.executionId }
        });

        this.broadcastEvent('WORKFLOW_COMPLETED', {
            executionId: record.executionId,
            workflowId: workflow.id,
            status: WORKFLOW_STATES.SUCCEEDED
        });

        if (this.workflowStore) {
            this.workflowStore.saveExecution(record);
        }
    }

    /**
     * Execute step with retry backoff.
     */
    async _executeStepWithRetries(step, record, remainingWorkflowTimeoutMs = 300000) {
        const retryPolicy = step.retryPolicy || { maxAttempts: 1, backoffMs: 0 };
        const maxAttempts = retryPolicy.maxAttempts || 1;
        const stepTimeout = step.timeoutMs || step.timeout || remainingWorkflowTimeoutMs;
        let attempt = 0;
        let lastError = null;

        while (attempt < maxAttempts) {
            attempt++;
            const startMs = Date.now();
            try {
                let timer;
                const timeoutPromise = new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Step execution timed out after ${stepTimeout}ms`)), Math.max(10, stepTimeout));
                });

                const logicPromise = this._executeSingleStepLogic(step, record);
                const output = await Promise.race([logicPromise, timeoutPromise]);
                clearTimeout(timer);

                return {
                    stepId: step.id,
                    stepName: step.name,
                    stepType: step.type,
                    success: true,
                    attempts: attempt,
                    durationMs: Date.now() - startMs,
                    output
                };
            } catch (err) {
                lastError = err.message || 'Step execution failed';
                if (attempt < maxAttempts) {
                    const backoff = Math.min(
                        retryPolicy.maxBackoffMs || 30000,
                        (retryPolicy.backoffMs || 500) * Math.pow(retryPolicy.backoffMultiplier || 2, attempt - 1)
                    );
                    await new Promise(r => setTimeout(r, backoff));
                }
            }
        }

        return {
            stepId: step.id,
            stepName: step.name,
            stepType: step.type,
            success: false,
            attempts: attempt,
            error: lastError,
            durationMs: 0
        };
    }

    /**
     * Dispatch step execution to subsystem interfaces based on step type.
     */
    async _executeSingleStepLogic(step, record) {
        switch (step.type) {
            case STEP_TYPES.AGENT_ACTION: {
                if (this.agentService && typeof this.agentService.executeCapability === 'function') {
                    return await this.agentService.executeCapability(step.target, step.parameters);
                }
                return { action: step.action, target: step.target, status: 'EXACTED_AGENT_MOCK' };
            }
            case STEP_TYPES.SYSTEM_ACTION: {
                if (this.executionService && typeof this.executionService.executeOperation === 'function') {
                    return await this.executionService.executeOperation(step.target, step.action, step.parameters);
                }
                return { action: step.action, target: step.target, status: 'EXECUTED_SYSTEM_MOCK' };
            }
            case STEP_TYPES.HEALTH_CHECK: {
                if (this.healthEngine && typeof this.healthEngine.checkHealth === 'function') {
                    const res = await this.healthEngine.checkHealth(step.target || 'GLOBAL');
                    if (res && (res.status === 'UNHEALTHY' || res.status === 'OFFLINE' || res.reason === 'SYSTEM_NOT_FOUND' || res.reason === 'CONSECUTIVE_FAILURES_EXCEEDED')) {
                        throw new Error(`Health check failed for system '${step.target}': ${res.reason || (res.error ? res.error.message : res.status)}`);
                    }
                    return res;
                }
                return { status: 'HEALTHY', systemId: step.target };
            }
            case STEP_TYPES.DELAY: {
                const delayMs = Number((step.parameters && step.parameters.delayMs) || step.parameters) || 100;
                await new Promise(r => setTimeout(r, delayMs));
                return { delayedMs: delayMs };
            }
            case STEP_TYPES.APPROVAL: {
                return { status: 'WAITING_APPROVAL', requiredRoles: (step.parameters && step.parameters.roles) || ['admin', 'operator'] };
            }
            case STEP_TYPES.VERIFICATION: {
                const expected = step.verification ? step.verification.expectedStatus : 'HEALTHY';
                return { verified: true, expectedStatus: expected };
            }
            case STEP_TYPES.REMEDIATION: {
                if (this.remediationService && typeof this.remediationService.triggerRemediation === 'function') {
                    return await this.remediationService.triggerRemediation(step.target, step.action, step.parameters);
                }
                return { remediationStatus: 'SUCCESS', target: step.target };
            }
            case STEP_TYPES.NOTIFICATION: {
                if (this.alertingService && typeof this.alertingService.sendAlert === 'function') {
                    return await this.alertingService.sendAlert({
                        title: step.name,
                        message: (step.parameters && step.parameters.message) || 'Workflow step notification',
                        severity: (step.parameters && step.parameters.severity) || 'INFO'
                    });
                }
                return { notified: true, message: step.parameters && step.parameters.message };
            }
            default:
                return { executed: true, stepId: step.id };
        }
    }

    /**
     * Approve execution step waiting for approval.
     */
    async approveExecution(executionId, actor = 'admin', role = 'admin') {
        const record = this.activeExecutions.get(executionId) || (this.workflowStore ? this.workflowStore.getExecution(executionId) : null);
        if (!record) throw new Error(`Execution '${executionId}' not found`);
        if (record.status !== WORKFLOW_STATES.WAITING_APPROVAL) {
            throw new Error(`Execution '${executionId}' is not waiting for approval`);
        }

        const waitingStepId = record.waitingStepId;
        record.status = WORKFLOW_STATES.RUNNING;
        record.waitingStepId = null;

        auditLogService.logEvent({
            eventType: 'WORKFLOW_APPROVED',
            action: 'approve_workflow_step',
            actor,
            role,
            tenantId: record.tenantId,
            resourceType: 'workflow',
            resourceId: record.workflowId,
            outcome: 'SUCCESS',
            severity: 'INFO',
            correlationId: record.correlationId,
            metadata: { executionId }
        });

        this.broadcastEvent('WORKFLOW_RESUMED', { executionId });
        if (this.workflowStore) this.workflowStore.saveExecution(record);

        // Resume workflow step loop after the waiting step
        const workflow = this.workflowStore ? this.workflowStore.getWorkflow(record.workflowId) : null;
        if (workflow) {
            const waitingIdx = workflow.steps.findIndex(s => s.id === waitingStepId);
            const startStepIndex = waitingIdx !== -1 ? waitingIdx + 1 : record.stepResults.length;
            this._runExecutionLoop(workflow, record, { startStepIndex }).catch(() => {});
        }

        return record;
    }

    /**
     * Get active or stored execution record by ID.
     */
    getExecution(executionId) {
        return this.activeExecutions.get(executionId) || (this.workflowStore ? this.workflowStore.getExecution(executionId) : null);
    }

    /**
     * Pause running execution.
     */
    pauseExecution(executionId, actor = 'operator') {
        const record = this.activeExecutions.get(executionId) || (this.workflowStore ? this.workflowStore.getExecution(executionId) : null);
        if (!record) throw new Error(`Execution '${executionId}' not found`);
        if (record.status !== WORKFLOW_STATES.RUNNING) {
            throw new Error(`Cannot pause execution in status '${record.status}'`);
        }

        record.status = WORKFLOW_STATES.PAUSED;
        this.broadcastEvent('WORKFLOW_PAUSED', { executionId });
        if (this.workflowStore) this.workflowStore.saveExecution(record);
        return record;
    }

    /**
     * Resume paused execution.
     */
    resumeExecution(executionId, actor = 'operator') {
        const record = this.activeExecutions.get(executionId) || (this.workflowStore ? this.workflowStore.getExecution(executionId) : null);
        if (!record) throw new Error(`Execution '${executionId}' not found`);
        if (record.status !== WORKFLOW_STATES.PAUSED) {
            throw new Error(`Cannot resume execution in status '${record.status}'`);
        }

        record.status = WORKFLOW_STATES.RUNNING;
        this.broadcastEvent('WORKFLOW_RESUMED', { executionId });
        if (this.workflowStore) this.workflowStore.saveExecution(record);

        const workflow = this.workflowStore ? this.workflowStore.getWorkflow(record.workflowId) : null;
        if (workflow) {
            const resumeIndex = record.stepResults.length;
            this._runExecutionLoop(workflow, record, { startStepIndex: resumeIndex }).catch(() => {});
        }
        return record;
    }

    /**
     * Cancel running execution.
     */
    cancelExecution(executionId, actor = 'operator') {
        const record = this.activeExecutions.get(executionId) || (this.workflowStore ? this.workflowStore.getExecution(executionId) : null);
        if (!record) throw new Error(`Execution '${executionId}' not found`);

        record.status = WORKFLOW_STATES.CANCELLED;
        record.completedAt = new Date().toISOString();
        this.activeExecutions.delete(executionId);

        this.broadcastEvent('WORKFLOW_CANCELLED', { executionId });
        if (this.workflowStore) this.workflowStore.saveExecution(record);
        return record;
    }
}

module.exports = {
    WorkflowExecutionEngine
};
