/**
 * Universal Telemetry Contract
 * Domain-agnostic event contract and validator for external and internal agent telemetry.
 * Strictly validates incoming events and sanitizes sensitive credentials.
 */

const TELEMETRY_EVENT_TYPES = Object.freeze({
    AGENT_STARTED: 'AGENT_STARTED',
    AGENT_HEALTH: 'AGENT_HEALTH',
    HEALTH_CHECK_RESULT: 'HEALTH_CHECK_RESULT',
    LATENCY_MEASUREMENT: 'LATENCY_MEASUREMENT',
    STATE_TRANSITION: 'STATE_TRANSITION',
    SYSTEM_ALERT_EMITTED: 'SYSTEM_ALERT_EMITTED',
    EXECUTION_STARTED: 'EXECUTION_STARTED',
    EXECUTION_PROGRESS: 'EXECUTION_PROGRESS',
    EXECUTION_COMPLETED: 'EXECUTION_COMPLETED',
    EXECUTION_FAILED: 'EXECUTION_FAILED',
    WORKFLOW_STARTED: 'WORKFLOW_STARTED',
    WORKFLOW_STEP_STARTED: 'WORKFLOW_STEP_STARTED',
    WORKFLOW_STEP_COMPLETED: 'WORKFLOW_STEP_COMPLETED',
    WORKFLOW_STEP_FAILED: 'WORKFLOW_STEP_FAILED',
    TOOL_STARTED: 'TOOL_STARTED',
    TOOL_COMPLETED: 'TOOL_COMPLETED',
    TOOL_FAILED: 'TOOL_FAILED',
    AGENT_STOPPED: 'AGENT_STOPPED'
});

const SECRET_PATTERNS = [/password/i, /token/i, /apikey/i, /secret/i, /privatekey/i, /bearertoken/i, /credentials/i, /auth/i];

class UniversalTelemetryContract {
    static sanitizeSecrets(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => UniversalTelemetryContract.sanitizeSecrets(item));

        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            if (SECRET_PATTERNS.some(p => p.test(key))) {
                sanitized[key] = '***REDACTED***';
            } else if (value && typeof value === 'object') {
                sanitized[key] = UniversalTelemetryContract.sanitizeSecrets(value);
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    static validateAndNormalize(payload = {}) {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Telemetry payload must be a valid JSON object');
        }

        const agentId = String(payload.agentId || payload.systemId || '').trim();
        if (!agentId) {
            throw new Error('Telemetry event requires a non-empty agentId');
        }

        const rawType = String(payload.eventType || '').toUpperCase();
        if (!Object.values(TELEMETRY_EVENT_TYPES).includes(rawType)) {
            throw new Error(`Invalid telemetry eventType '${payload.eventType}'. Must be one of: ${Object.keys(TELEMETRY_EVENT_TYPES).join(', ')}`);
        }

        const eventId = String(payload.eventId || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);
        const timestamp = payload.timestamp || new Date().toISOString();
        const executionId = payload.executionId ? String(payload.executionId) : null;
        const workflowId = payload.workflowId ? String(payload.workflowId) : null;
        const status = payload.status ? String(payload.status).toUpperCase() : 'OK';
        const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : 0;
        const stepName = payload.stepName ? String(payload.stepName) : null;
        const stepIndex = typeof payload.stepIndex === 'number' ? payload.stepIndex : null;
        const message = payload.message ? String(payload.message) : '';

        const metrics = UniversalTelemetryContract.sanitizeSecrets(payload.metrics || {});
        const metadata = UniversalTelemetryContract.sanitizeSecrets(payload.metadata || {});

        return {
            eventId,
            eventType: rawType,
            agentId,
            executionId,
            workflowId,
            timestamp,
            status,
            durationMs,
            stepName,
            stepIndex,
            message,
            metrics,
            metadata,
            correlationId: payload.correlationId || `corr_telemetry_${Date.now()}`
        };
    }
}

module.exports = {
    TELEMETRY_EVENT_TYPES,
    UniversalTelemetryContract
};
