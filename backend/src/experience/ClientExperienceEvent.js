/**
 * Client Experience Event Data Model
 * Generic data model for client experience signals and timeline events.
 * Purely domain-agnostic with built-in secret sanitization.
 */

const crypto = require('crypto');

const EXPERIENCE_EVENT_TYPES = Object.freeze({
    FEEDBACK: 'FEEDBACK',
    RATING: 'RATING',
    ISSUE_REPORTED: 'ISSUE_REPORTED',
    ISSUE_UPDATED: 'ISSUE_UPDATED',
    ISSUE_RESOLVED: 'ISSUE_RESOLVED',
    COMMENT: 'COMMENT',
    SURVEY_RESPONSE: 'SURVEY_RESPONSE'
});

const SENSITIVE_KEYS = new Set([
    'authorization', 'auth', 'bearer', 'token', 'apikey', 'api_key', 'secret',
    'password', 'passwd', 'cookie', 'set-cookie', 'privatekey', 'private_key'
]);

class ClientExperienceEvent {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.eventId = raw.eventId ? String(raw.eventId).trim() : `exp_evt_${crypto.randomBytes(8).toString('hex')}`;
        this.systemId = raw.systemId ? String(raw.systemId).trim() : 'unknown-system';
        this.clientId = raw.clientId ? String(raw.clientId).trim() : null;
        this.actorId = raw.actorId ? String(raw.actorId).trim() : (this.clientId || 'anonymous');

        this.eventType = Object.values(EXPERIENCE_EVENT_TYPES).includes(raw.eventType)
            ? raw.eventType
            : EXPERIENCE_EVENT_TYPES.FEEDBACK;

        this.timestamp = raw.timestamp || now;
        this.source = raw.source ? String(raw.source).trim().toLowerCase() : 'user';

        this.rating = raw.rating !== undefined && raw.rating !== null ? raw.rating : null;
        this.comment = raw.comment ? String(raw.comment).trim() : '';
        this.category = raw.category ? String(raw.category).trim().toLowerCase() : 'general';
        this.severity = raw.severity ? String(raw.severity).trim().toUpperCase() : 'INFO';
        this.status = raw.status ? String(raw.status).trim().toUpperCase() : 'RECORDED';

        this.issueId = raw.issueId ? String(raw.issueId).trim() : null;
        this.resolution = raw.resolution ? String(raw.resolution).trim() : null;
        this.resolvedAt = raw.resolvedAt || null;
        this.assignedTo = raw.assignedTo ? String(raw.assignedTo).trim() : null;
        this.tags = Array.isArray(raw.tags) ? raw.tags.map(t => String(t).trim().toLowerCase()) : [];

        this.metadata = ClientExperienceEvent.sanitizeMetadata(raw.metadata);
    }

    /**
     * Recursively sanitize metadata object to prevent credential or secret leakage.
     */
    static sanitizeMetadata(input) {
        if (!input || typeof input !== 'object') {
            return {};
        }

        if (Array.isArray(input)) {
            return input.map(item => this.sanitizeMetadata(item));
        }

        const sanitized = {};
        for (const [key, val] of Object.entries(input)) {
            const lowerKey = String(key).toLowerCase();
            const isSensitive = SENSITIVE_KEYS.has(lowerKey) || Array.from(SENSITIVE_KEYS).some(s => lowerKey.includes(s));
            if (!key || isSensitive) {
                sanitized[key] = '[REDACTED]';
            } else if (val && typeof val === 'object') {
                sanitized[key] = this.sanitizeMetadata(val);
            } else {
                sanitized[key] = val;
            }
        }
        return sanitized;
    }

    static validate(raw) {
        const errors = [];

        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                valid: false,
                errors: [{ field: 'root', code: 'INVALID_PAYLOAD', message: 'Experience event payload must be a non-null object' }]
            };
        }

        if (!raw.systemId || typeof raw.systemId !== 'string' || !raw.systemId.trim()) {
            errors.push({ field: 'systemId', code: 'MISSING_REQUIRED_FIELD', message: 'systemId is required' });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    toJSON() {
        return {
            eventId: this.eventId,
            systemId: this.systemId,
            clientId: this.clientId,
            actorId: this.actorId,
            eventType: this.eventType,
            timestamp: this.timestamp,
            source: this.source,
            rating: this.rating,
            comment: this.comment,
            category: this.category,
            severity: this.severity,
            status: this.status,
            issueId: this.issueId,
            resolution: this.resolution,
            resolvedAt: this.resolvedAt,
            assignedTo: this.assignedTo,
            tags: this.tags,
            metadata: this.metadata
        };
    }
}

module.exports = {
    EXPERIENCE_EVENT_TYPES,
    ClientExperienceEvent
};
