/**
 * Usage Event Data Model
 * Generic schema and validator for platform usage and activity events.
 * Purely domain-agnostic with built-in credential sanitization.
 */

const crypto = require('crypto');
const { ACTIVITY_CATEGORIES, EVENT_SOURCES, EXECUTION_STATUSES } = require('./ActivityCategories');

const SENSITIVE_KEYS = new Set([
    'authorization', 'auth', 'bearer', 'token', 'apikey', 'api_key', 'secret',
    'password', 'passwd', 'cookie', 'set-cookie', 'privatekey', 'private_key'
]);

class UsageEvent {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.eventId = raw.eventId ? String(raw.eventId).trim() : `evt_${crypto.randomBytes(8).toString('hex')}`;
        this.systemId = raw.systemId ? String(raw.systemId).trim() : 'unknown-system';
        this.capability = raw.capability ? String(raw.capability).trim().toLowerCase() : 'execute';
        this.operation = raw.operation ? String(raw.operation).trim().toLowerCase() : (this.capability || 'execute');

        this.timestamp = raw.timestamp || now;
        this.status = Object.values(EXECUTION_STATUSES).includes(raw.status)
            ? raw.status
            : EXECUTION_STATUSES.SUCCESS;

        this.durationMs = Math.max(Number(raw.durationMs) || 0, 0);

        this.source = Object.values(EVENT_SOURCES).includes(raw.source)
            ? raw.source
            : EVENT_SOURCES.SYSTEM;

        this.actor = raw.actor ? String(raw.actor).trim() : 'system';
        this.executionId = raw.executionId ? String(raw.executionId).trim() : `exec_${crypto.randomBytes(6).toString('hex')}`;

        this.category = Object.values(ACTIVITY_CATEGORIES).includes(raw.category)
            ? raw.category
            : ACTIVITY_CATEGORIES.EXECUTION;

        this.metadata = UsageEvent.sanitizeMetadata(raw.metadata);
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
            if (!key || SENSITIVE_KEYS.has(String(key).toLowerCase())) {
                sanitized[key] = '[REDACTED]';
            } else if (val && typeof val === 'object') {
                sanitized[key] = this.sanitizeMetadata(val);
            } else {
                sanitized[key] = val;
            }
        }
        return sanitized;
    }

    /**
     * Validate raw usage event payload.
     */
    static validate(raw) {
        const errors = [];

        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                valid: false,
                errors: [{ field: 'root', code: 'INVALID_PAYLOAD', message: 'Usage event payload must be a non-null object' }]
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
            capability: this.capability,
            operation: this.operation,
            timestamp: this.timestamp,
            status: this.status,
            durationMs: this.durationMs,
            source: this.source,
            actor: this.actor,
            executionId: this.executionId,
            category: this.category,
            metadata: this.metadata
        };
    }
}

module.exports = {
    UsageEvent
};
