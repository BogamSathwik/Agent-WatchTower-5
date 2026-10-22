/**
 * AgentExecutionContext Model
 * Tracks runtime state, tool call history, parameters, and results of an individual execution run.
 */

class AgentExecutionContext {
    constructor(raw = {}) {
        this.executionId = raw.executionId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.agentId = raw.agentId || 'unknown';
        this.operation = raw.operation || 'task_execution';
        this.parameters = typeof raw.parameters === 'object' && raw.parameters !== null ? raw.parameters : {};
        this.startedAt = raw.startedAt || new Date().toISOString();
        this.completedAt = null;
        this.status = raw.status || 'RUNNING'; // RUNNING, SUCCESS, FAILED, TIMEOUT
        this.result = null;
        this.error = null;
        this.logs = [];
        this.toolCalls = [];
    }

    addLog(message, level = 'info') {
        this.logs.push({
            timestamp: new Date().toISOString(),
            message: String(message),
            level
        });
    }

    recordToolCall(toolName, input, output, durationMs = 0) {
        this.toolCalls.push({
            toolName,
            input,
            output,
            durationMs,
            timestamp: new Date().toISOString()
        });
    }

    complete(result) {
        this.status = 'SUCCESS';
        this.result = result;
        this.completedAt = new Date().toISOString();
    }

    fail(err) {
        this.status = 'FAILED';
        this.error = typeof err === 'string' ? err : (err ? err.message : 'Unknown execution error');
        this.completedAt = new Date().toISOString();
    }

    toJSON() {
        return {
            executionId: this.executionId,
            agentId: this.agentId,
            operation: this.operation,
            parameters: this.parameters,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            status: this.status,
            result: this.result,
            error: this.error,
            logs: this.logs,
            toolCalls: this.toolCalls
        };
    }
}

module.exports = { AgentExecutionContext };
