/**
 * RuntimeSession Model
 * Tracks operational sessions for live running agents and systems.
 * Purely generic - no business domain logic.
 */

const SENSITIVE_KEYS = ['apiKey', 'password', 'secret', 'token', 'authorization', 'secretKey', 'privateKey', 'access_token'];

class RuntimeSession {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.sessionId = raw.sessionId ? String(raw.sessionId).trim() : `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.systemId = raw.systemId ? String(raw.systemId).trim() : '';
        this.agentId = raw.agentId ? String(raw.agentId).trim() : this.systemId;
        this.startedAt = raw.startedAt || now;
        this.stoppedAt = raw.stoppedAt || null;
        this.state = raw.state || 'RUNNING';
        this.requestedBy = raw.requestedBy || 'system';
        this.executionMode = raw.executionMode || 'AUTOMATIC';
        this.capabilitiesUsed = Array.isArray(raw.capabilitiesUsed) ? raw.capabilitiesUsed : [];
        this.lastHeartbeat = raw.lastHeartbeat || now;
        this.metrics = (typeof raw.metrics === 'object' && raw.metrics !== null) ? raw.metrics : { totalOperations: 0, failedOperations: 0, uptimeMs: 0 };
        this.error = raw.error || null;
        this.correlationId = raw.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    updateHeartbeat() {
        this.lastHeartbeat = new Date().toISOString();
        const start = new Date(this.startedAt).getTime();
        this.metrics.uptimeMs = Date.now() - start;
    }

    recordOperation(opName, success = true) {
        if (!this.capabilitiesUsed.includes(opName)) {
            this.capabilitiesUsed.push(opName);
        }
        this.metrics.totalOperations = (this.metrics.totalOperations || 0) + 1;
        if (!success) {
            this.metrics.failedOperations = (this.metrics.failedOperations || 0) + 1;
        }
        this.updateHeartbeat();
    }

    stop(reason = 'Operator stopped session') {
        this.state = 'STOPPED';
        this.stoppedAt = new Date().toISOString();
        this.updateHeartbeat();
    }

    toJSON() {
        return {
            sessionId: this.sessionId,
            systemId: this.systemId,
            agentId: this.agentId,
            startedAt: this.startedAt,
            stoppedAt: this.stoppedAt,
            state: this.state,
            requestedBy: this.requestedBy,
            executionMode: this.executionMode,
            capabilitiesUsed: this.capabilitiesUsed,
            lastHeartbeat: this.lastHeartbeat,
            metrics: this.metrics,
            error: this.error,
            correlationId: this.correlationId
        };
    }

    static sanitize(data) {
        if (!data || typeof data !== 'object') return data;
        const copy = JSON.parse(JSON.stringify(data));

        function sanitizeObj(obj) {
            if (!obj || typeof obj !== 'object') return;
            for (const key of Object.keys(obj)) {
                if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitizeObj(obj[key]);
                }
            }
        }

        sanitizeObj(copy);
        return copy;
    }
}

module.exports = RuntimeSession;
