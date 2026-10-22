/**
 * In-Memory & Persisted Workflow Store
 * Stores workflow definitions, versions, and execution histories with tenant isolation.
 * Purely domain-agnostic.
 */

class WorkflowStore {
    constructor(options = {}) {
        this.maxExecutionsPerWorkflow = options.maxExecutionsPerWorkflow || 100;
        this.workflows = new Map();
        this.executions = new Map();
    }

    saveWorkflow(workflow) {
        if (!workflow || !workflow.id) throw new Error('Valid workflow instance with ID is required');
        workflow.updatedAt = new Date().toISOString();
        this.workflows.set(workflow.id, workflow);
        return workflow;
    }

    getWorkflow(id, tenantId = null) {
        const wf = this.workflows.get(id);
        if (!wf) return null;
        if (tenantId && tenantId !== 'global' && wf.tenantId !== tenantId && wf.tenantId !== 'global') {
            return null;
        }
        return wf;
    }

    listWorkflows(filters = {}) {
        let list = Array.from(this.workflows.values());

        if (filters.tenantId && filters.tenantId !== 'global') {
            list = list.filter(w => w.tenantId === filters.tenantId || w.tenantId === 'global');
        }
        if (filters.status) {
            list = list.filter(w => w.status === filters.status);
        }
        if (filters.search) {
            const q = filters.search.toLowerCase();
            list = list.filter(w => w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q));
        }

        return list;
    }

    deleteWorkflow(id, tenantId = null) {
        const wf = this.getWorkflow(id, tenantId);
        if (!wf) return false;
        this.workflows.delete(id);
        return true;
    }

    saveExecution(execution) {
        if (!execution || !execution.executionId) throw new Error('Valid execution record with executionId is required');
        this.executions.set(execution.executionId, execution);
        return execution;
    }

    getExecution(id, tenantId = null) {
        const ex = this.executions.get(id);
        if (!ex) return null;
        if (tenantId && tenantId !== 'global' && ex.tenantId !== tenantId && ex.tenantId !== 'global') {
            return null;
        }
        return ex;
    }

    listExecutions(filters = {}) {
        let list = Array.from(this.executions.values());

        if (filters.workflowId) {
            list = list.filter(e => e.workflowId === filters.workflowId);
        }
        if (filters.tenantId && filters.tenantId !== 'global') {
            list = list.filter(e => e.tenantId === filters.tenantId || e.tenantId === 'global');
        }
        if (filters.status) {
            list = list.filter(e => e.status === filters.status);
        }

        // Sort descending by startedAt
        list.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));

        const limit = Number(filters.limit) || 100;
        return list.slice(0, limit);
    }

    getOverview(tenantId = null) {
        const workflows = this.listWorkflows({ tenantId });
        const executions = this.listExecutions({ tenantId, limit: 1000 });

        const totalWorkflows = workflows.length;
        const activeWorkflows = workflows.filter(w => w.status === 'READY' || w.status === 'SCHEDULED' || w.status === 'RUNNING').length;
        const totalExecutions = executions.length;
        const succeededExecutions = executions.filter(e => e.status === 'SUCCEEDED').length;
        const failedExecutions = executions.filter(e => e.status === 'FAILED' || e.status === 'TIMED_OUT').length;
        const runningExecutions = executions.filter(e => e.status === 'RUNNING' || e.status === 'WAITING' || e.status === 'WAITING_APPROVAL').length;
        const waitingApprovalExecutions = executions.filter(e => e.status === 'WAITING_APPROVAL').length;

        return {
            totalWorkflows,
            activeWorkflows,
            totalExecutions,
            succeededExecutions,
            failedExecutions,
            runningExecutions,
            waitingApprovalExecutions,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = {
    WorkflowStore
};
