/**
 * AgentExecutionMonitor
 * Monitors agent execution invocations, records structured telemetry,
 * ensures strict secret redaction, and categorizes status cleanly.
 */

const SENSITIVE_KEYS = ['apikey', 'token', 'password', 'secret', 'authorization', 'bearertoken', 'privatekey', 'credentials', 'auth'];

class AgentExecutionMonitor {
    static sanitizePayload(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => AgentExecutionMonitor.sanitizePayload(item));

        const sanitized = {};
        for (const [key, val] of Object.entries(obj)) {
            const lowerKey = key.toLowerCase();
            if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
                sanitized[key] = '***REDACTED***';
            } else if (val && typeof val === 'object') {
                sanitized[key] = AgentExecutionMonitor.sanitizePayload(val);
            } else {
                sanitized[key] = val;
            }
        }
        return sanitized;
    }

    static recordExecution(params = {}) {
        const executionId = params.executionId || `exec_${Date.now()}`;
        const agentId = params.agentId || 'UNKNOWN_AGENT';
        const taskType = params.taskType || 'EXECUTION';
        const startTime = params.startTime || new Date().toISOString();
        const endTime = params.endTime || new Date().toISOString();
        const duration = Number(params.duration || params.durationMs || 0);

        // Status Categorization: SUCCESS, FAILED, TIMEOUT, REJECTED, UNSUPPORTED, NOT_EXECUTABLE
        let status = params.status || 'SUCCESS';
        if (params.unsupported || params.supported === false) {
            status = 'UNSUPPORTED';
        } else if (params.notExecutable) {
            status = 'NOT_EXECUTABLE';
        }

        const sanitizedRequest = AgentExecutionMonitor.sanitizePayload(params.request || {});
        const sanitizedResponse = AgentExecutionMonitor.sanitizePayload(params.response || {});

        return {
            executionId,
            agentId,
            taskType,
            request: sanitizedRequest,
            response: sanitizedResponse,
            startTime,
            endTime,
            durationMs: duration,
            status,
            error: params.error ? { message: params.error.message || String(params.error) } : null,
            correlationId: params.correlationId || `corr_exec_${Date.now()}`
        };
    }
}

module.exports = { AgentExecutionMonitor };
