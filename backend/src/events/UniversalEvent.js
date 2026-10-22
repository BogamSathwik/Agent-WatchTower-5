/**
 * Phase 14 — Universal Event Model
 * Represents a domain-neutral, normalized event with fingerprinting and payload sanitization.
 */

const crypto = require('crypto');
const { EVENT_SEVERITIES, EVENT_CATEGORIES, EVENT_TYPES } = require('./EventStates');

class UniversalEvent {
    constructor(data = {}) {
        this.id = data.id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.eventId = data.eventId || this.id;
        this.source = data.source || 'system';
        this.sourceType = data.sourceType || EVENT_CATEGORIES.SYSTEM;
        this.systemId = data.systemId || null;
        this.eventType = data.eventType || EVENT_TYPES.CUSTOM;
        this.category = data.category || EVENT_CATEGORIES.SYSTEM;
        this.severity = data.severity || EVENT_SEVERITIES.INFO;
        this.timestamp = data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString();
        this.correlationId = data.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.causationId = data.causationId || null;
        this.payload = UniversalEvent.sanitizePayload(data.payload || {});
        this.metadata = data.metadata || {};
        this.fingerprint = data.fingerprint || this.computeFingerprint();
    }

    computeFingerprint() {
        const key = `${this.systemId || 'nosys'}:${this.source}:${this.eventType}:${JSON.stringify(this.payload)}`;
        return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
    }

    static sanitizePayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        if (Array.isArray(payload)) {
            return payload.map(item => UniversalEvent.sanitizePayload(item));
        }

        const sensitiveKeys = ['password', 'secret', 'token', 'apikey', 'api_key', 'authorization', 'credential', 'privatekey'];
        const sanitized = {};

        for (const [key, val] of Object.entries(payload)) {
            if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
                sanitized[key] = '[REDACTED]';
            } else if (val && typeof val === 'object') {
                sanitized[key] = UniversalEvent.sanitizePayload(val);
            } else {
                sanitized[key] = val;
            }
        }

        return sanitized;
    }

    toJSON() {
        return {
            id: this.id,
            eventId: this.eventId,
            source: this.source,
            sourceType: this.sourceType,
            systemId: this.systemId,
            eventType: this.eventType,
            category: this.category,
            severity: this.severity,
            timestamp: this.timestamp,
            correlationId: this.correlationId,
            causationId: this.causationId,
            payload: this.payload,
            metadata: this.metadata,
            fingerprint: this.fingerprint
        };
    }
}

module.exports = UniversalEvent;
