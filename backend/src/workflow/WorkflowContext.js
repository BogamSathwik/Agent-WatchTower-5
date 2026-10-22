/**
 * WorkflowContext Model
 * Tracks runtime state, step outputs, correlation IDs, and input data across workflow step execution.
 */

class WorkflowContext {
    constructor(raw = {}) {
        this.workflowId = raw.workflowId || 'unknown_wf';
        this.executionId = raw.executionId || `wf_exec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.tenantId = raw.tenantId || 'global';
        this.correlationId = raw.correlationId || `corr_wf_${Date.now()}`;
        this.actor = raw.actor || 'system';
        this.inputs = typeof raw.inputs === 'object' && raw.inputs !== null ? { ...raw.inputs } : {};
        this.variables = typeof raw.variables === 'object' && raw.variables !== null ? { ...raw.variables } : {};
        this.stepOutputs = new Map();
        this.startedAt = raw.startedAt || new Date().toISOString();
        this.metadata = typeof raw.metadata === 'object' && raw.metadata !== null ? { ...raw.metadata } : {};
    }

    setStepOutput(stepId, output) {
        this.stepOutputs.set(stepId, output);
    }

    getStepOutput(stepId) {
        return this.stepOutputs.get(stepId);
    }

    setVariable(key, value) {
        this.variables[key] = value;
    }

    getVariable(key, defaultValue = undefined) {
        return key in this.variables ? this.variables[key] : defaultValue;
    }

    toJSON() {
        const outputsObj = {};
        for (const [k, v] of this.stepOutputs.entries()) {
            outputsObj[k] = v;
        }
        return {
            workflowId: this.workflowId,
            executionId: this.executionId,
            tenantId: this.tenantId,
            correlationId: this.correlationId,
            actor: this.actor,
            inputs: this.inputs,
            variables: this.variables,
            stepOutputs: outputsObj,
            startedAt: this.startedAt,
            metadata: this.metadata
        };
    }
}

module.exports = { WorkflowContext };
