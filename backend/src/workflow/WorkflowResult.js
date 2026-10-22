/**
 * WorkflowResult Model
 * Represents normalized execution results of a workflow run.
 */

class WorkflowResult {
    constructor(raw = {}) {
        this.executionId = raw.executionId || '';
        this.workflowId = raw.workflowId || '';
        this.workflowName = raw.workflowName || '';
        this.status = raw.status || 'COMPLETED'; // COMPLETED, FAILED, CANCELLED, PARTIAL_SUCCESS
        this.startedAt = raw.startedAt || new Date().toISOString();
        this.completedAt = raw.completedAt || new Date().toISOString();
        this.durationMs = Number(raw.durationMs) || 0;
        this.stepResults = Array.isArray(raw.stepResults) ? raw.stepResults : [];
        this.outputs = typeof raw.outputs === 'object' && raw.outputs !== null ? raw.outputs : {};
        this.error = raw.error || null;
        this.summary = raw.summary || '';
        this.metadata = typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
    }

    toJSON() {
        return {
            executionId: this.executionId,
            workflowId: this.workflowId,
            workflowName: this.workflowName,
            status: this.status,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            durationMs: this.durationMs,
            stepResults: this.stepResults,
            outputs: this.outputs,
            error: this.error,
            summary: this.summary,
            metadata: this.metadata
        };
    }
}

module.exports = { WorkflowResult };
