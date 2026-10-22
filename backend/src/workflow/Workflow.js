/**
 * Universal Workflow Model
 * Represents an automated, multi-step orchestration workflow.
 * Purely domain-agnostic.
 */

const { WORKFLOW_STATES, isValidWorkflowState } = require('./WorkflowStates');
const { WorkflowStep } = require('./WorkflowStep');

class Workflow {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.id = raw.id || raw.workflowId ? String(raw.id || raw.workflowId).trim() : `wf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.workflowId = this.id;
        this.name = raw.name ? String(raw.name).trim() : this.id;
        this.description = raw.description ? String(raw.description).trim() : '';
        this.version = raw.version ? String(raw.version).trim() : '1.0.0';
        this.status = raw.status && isValidWorkflowState(raw.status) ? raw.status : WORKFLOW_STATES.DRAFT;
        this.tenantId = raw.tenantId ? String(raw.tenantId).trim() : 'global';
        this.agentId = raw.agentId ? String(raw.agentId).trim() : null;
        this.enabled = Boolean(raw.enabled ?? true);
        this.inputSchema = typeof raw.inputSchema === 'object' && raw.inputSchema !== null ? raw.inputSchema : {};
        this.outputMapping = typeof raw.outputMapping === 'object' && raw.outputMapping !== null ? raw.outputMapping : {};
        this.failurePolicy = raw.failurePolicy ? String(raw.failurePolicy).toUpperCase() : 'CONTINUE_AND_MARK_PARTIAL';

        // Trigger configuration
        this.trigger = (typeof raw.trigger === 'object' && raw.trigger !== null)
            ? {
                type: raw.trigger.type ? String(raw.trigger.type).toUpperCase() : 'MANUAL',
                eventType: raw.trigger.eventType ? String(raw.trigger.eventType) : null,
                systemId: raw.trigger.systemId ? String(raw.trigger.systemId) : null,
                agentId: raw.trigger.agentId ? String(raw.trigger.agentId) : this.agentId,
                intervalMs: Number(raw.trigger.intervalMs) || null,
                enabled: Boolean(raw.trigger.enabled ?? true)
            }
            : { type: 'MANUAL', enabled: true, agentId: this.agentId };

        // Pre-execution workflow conditions
        this.conditions = (typeof raw.conditions === 'object' && raw.conditions !== null) ? raw.conditions : [];

        // Steps list
        const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
        this.steps = rawSteps.map(s => (s instanceof WorkflowStep ? s : new WorkflowStep(s)));

        // Global retry policy
        const retry = (typeof raw.retryPolicy === 'object' && raw.retryPolicy !== null) ? raw.retryPolicy : {};
        this.retryPolicy = {
            maxAttempts: Math.max(1, Math.min(Number(retry.maxAttempts) || 3, 10)),
            backoffMs: Math.max(0, Number(retry.backoffMs) || 1000),
            backoffMultiplier: Math.max(1, Number(retry.backoffMultiplier) || 2),
            maxBackoffMs: Math.max(1000, Number(retry.maxBackoffMs) || 60000)
        };

        // Timeout policy
        const timeout = (typeof raw.timeoutPolicy === 'object' && raw.timeoutPolicy !== null) ? raw.timeoutPolicy : {};
        this.timeoutPolicy = {
            maxWorkflowTimeoutMs: Math.max(1, Number(timeout.maxWorkflowTimeoutMs || raw.timeout || raw.timeoutMs) || 300000)
        };
        this.timeout = this.timeoutPolicy.maxWorkflowTimeoutMs;

        // Approval policy
        const approval = (typeof raw.approvalPolicy === 'object' && raw.approvalPolicy !== null) ? raw.approvalPolicy : {};
        this.approvalPolicy = {
            required: Boolean(approval.required ?? false),
            allowedRoles: Array.isArray(approval.allowedRoles) ? approval.allowedRoles : ['admin', 'operator'],
            timeoutMs: Number(approval.timeoutMs) || 86400000
        };

        this.createdAt = raw.createdAt || now;
        this.updatedAt = raw.updatedAt || now;
        this.metadata = (typeof raw.metadata === 'object' && raw.metadata !== null) ? raw.metadata : {};
    }

    validate() {
        const errors = [];
        if (!this.id) errors.push('Workflow ID is required');
        if (!this.name) errors.push('Workflow name is required');
        if (this.steps.length === 0) errors.push('Workflow must contain at least one step');

        // Validate steps
        const stepIds = new Set();
        this.steps.forEach((step, idx) => {
            if (!step.id) errors.push(`Step at index ${idx} is missing an ID`);
            if (stepIds.has(step.id)) errors.push(`Duplicate step ID '${step.id}' detected`);
            stepIds.add(step.id);
        });

        return {
            valid: errors.length === 0,
            errors
        };
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            version: this.version,
            status: this.status,
            tenantId: this.tenantId,
            trigger: this.trigger,
            conditions: this.conditions,
            steps: this.steps.map(s => s.toJSON()),
            retryPolicy: this.retryPolicy,
            timeoutPolicy: this.timeoutPolicy,
            approvalPolicy: this.approvalPolicy,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            metadata: this.metadata
        };
    }
}

module.exports = {
    Workflow
};
