/**
 * ReasoningTrace Model
 * Sanitized, secret-free trace of a reasoning evaluation run.
 */

const SECRET_PATTERNS = [/password/i, /token/i, /apikey/i, /secret/i, /privatekey/i, /bearertoken/i, /credentials/i];

function redactObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => redactObject(item));
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SECRET_PATTERNS.some(pat => pat.test(key))) {
            sanitized[key] = '***REDACTED***';
        } else if (value && typeof value === 'object') {
            sanitized[key] = redactObject(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

class ReasoningTrace {
    constructor(raw = {}) {
        this.traceId = raw.traceId || `rtrace_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.agentId = raw.agentId || 'global';
        this.status = raw.status || 'COMPLETED';
        this.steps = Array.isArray(raw.steps) ? redactObject(raw.steps) : [];
        this.decision = raw.decision ? redactObject(raw.decision) : null;
        this.startedAt = raw.startedAt || new Date().toISOString();
        this.completedAt = raw.completedAt || new Date().toISOString();
    }

    toJSON() {
        return {
            traceId: this.traceId,
            agentId: this.agentId,
            status: this.status,
            steps: this.steps,
            decision: this.decision,
            startedAt: this.startedAt,
            completedAt: this.completedAt
        };
    }
}

module.exports = { ReasoningTrace, redactObject };
