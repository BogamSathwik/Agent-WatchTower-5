/**
 * Client Issue Data Model & Lifecycle State Machine
 * Generic operational issue tracking with state transition guards and resolution metrics.
 * Purely domain-agnostic.
 */

const crypto = require('crypto');
const { ClientExperienceEvent } = require('./ClientExperienceEvent');

const ISSUE_STATUSES = Object.freeze({
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    RESOLVED: 'RESOLVED',
    CLOSED: 'CLOSED',
    REOPENED: 'REOPENED'
});

const ISSUE_SEVERITIES = Object.freeze({
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
});

const ALLOWED_TRANSITIONS = Object.freeze({
    [ISSUE_STATUSES.OPEN]: [ISSUE_STATUSES.IN_PROGRESS, ISSUE_STATUSES.RESOLVED, ISSUE_STATUSES.CLOSED],
    [ISSUE_STATUSES.IN_PROGRESS]: [ISSUE_STATUSES.RESOLVED, ISSUE_STATUSES.CLOSED, ISSUE_STATUSES.OPEN],
    [ISSUE_STATUSES.RESOLVED]: [ISSUE_STATUSES.CLOSED, ISSUE_STATUSES.REOPENED],
    [ISSUE_STATUSES.CLOSED]: [ISSUE_STATUSES.REOPENED],
    [ISSUE_STATUSES.REOPENED]: [ISSUE_STATUSES.IN_PROGRESS, ISSUE_STATUSES.RESOLVED, ISSUE_STATUSES.CLOSED]
});

class ClientIssue {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.issueId = raw.issueId ? String(raw.issueId).trim() : `iss_${crypto.randomBytes(8).toString('hex')}`;
        this.systemId = raw.systemId ? String(raw.systemId).trim() : 'unknown-system';
        this.clientId = raw.clientId ? String(raw.clientId).trim() : null;

        this.reportedAt = raw.reportedAt || now;
        this.updatedAt = raw.updatedAt || now;
        this.resolvedAt = raw.resolvedAt || null;

        this.status = Object.values(ISSUE_STATUSES).includes(raw.status)
            ? raw.status
            : ISSUE_STATUSES.OPEN;

        this.severity = Object.values(ISSUE_SEVERITIES).includes(raw.severity)
            ? raw.severity
            : ISSUE_SEVERITIES.MEDIUM;

        this.category = raw.category ? String(raw.category).trim().toLowerCase() : 'general';
        this.description = raw.description ? String(raw.description).trim() : 'Unspecified issue';
        this.source = raw.source ? String(raw.source).trim().toLowerCase() : 'user';
        this.reporter = raw.reporter ? String(raw.reporter).trim() : (this.clientId || 'anonymous');
        this.assignee = raw.assignee ? String(raw.assignee).trim() : null;
        this.resolution = raw.resolution ? String(raw.resolution).trim() : null;

        this.timeToResolutionMs = raw.timeToResolutionMs !== undefined ? Number(raw.timeToResolutionMs) : null;
        this.metadata = ClientExperienceEvent.sanitizeMetadata(raw.metadata);

        // Calculate normalized signature for repeated issue grouping
        this.signature = ClientIssue.generateSignature(this.systemId, this.category, this.description);

        if (this.status === ISSUE_STATUSES.RESOLVED || this.status === ISSUE_STATUSES.CLOSED) {
            if (!this.resolvedAt) {
                this.resolvedAt = now;
            }
            this.calculateTimeToResolution();
        }
    }

    /**
     * Generate deterministic signature string for repeated issue grouping.
     */
    static generateSignature(systemId, category, description) {
        const sys = String(systemId || '').trim().toLowerCase();
        const cat = String(category || '').trim().toLowerCase();
        const descNorm = String(description || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        return `${sys}:${cat}:${descNorm.substring(0, 50)}`;
    }

    /**
     * Verify if transition to target status is valid.
     */
    canTransitionTo(targetStatus) {
        if (!targetStatus || !Object.values(ISSUE_STATUSES).includes(targetStatus)) {
            return false;
        }
        if (targetStatus === this.status) {
            return true; // No-op transition
        }
        const allowed = ALLOWED_TRANSITIONS[this.status] || [];
        return allowed.includes(targetStatus);
    }

    /**
     * Transition status safely and compute resolution metrics.
     */
    transitionTo(targetStatus, updates = {}) {
        if (!this.canTransitionTo(targetStatus)) {
            throw new Error(`Invalid issue lifecycle transition from '${this.status}' to '${targetStatus}'`);
        }

        const now = new Date().toISOString();
        this.status = targetStatus;
        this.updatedAt = now;

        if (updates.resolution) this.resolution = String(updates.resolution).trim();
        if (updates.assignee) this.assignee = String(updates.assignee).trim();
        if (updates.metadata) Object.assign(this.metadata, ClientExperienceEvent.sanitizeMetadata(updates.metadata));

        if (targetStatus === ISSUE_STATUSES.RESOLVED || targetStatus === ISSUE_STATUSES.CLOSED) {
            if (!this.resolvedAt) {
                this.resolvedAt = now;
            }
            this.calculateTimeToResolution();
        } else if (targetStatus === ISSUE_STATUSES.REOPENED) {
            this.resolvedAt = null;
            this.timeToResolutionMs = null;
        }

        return this;
    }

    calculateTimeToResolution() {
        if (this.reportedAt && this.resolvedAt) {
            const startMs = new Date(this.reportedAt).getTime();
            const endMs = new Date(this.resolvedAt).getTime();
            this.timeToResolutionMs = Math.max(0, endMs - startMs);
        }
    }

    static validate(raw) {
        const errors = [];

        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                valid: false,
                errors: [{ field: 'root', code: 'INVALID_PAYLOAD', message: 'Issue payload must be a non-null object' }]
            };
        }

        if (!raw.systemId || typeof raw.systemId !== 'string' || !raw.systemId.trim()) {
            errors.push({ field: 'systemId', code: 'MISSING_REQUIRED_FIELD', message: 'systemId is required' });
        }

        if (!raw.description || typeof raw.description !== 'string' || !raw.description.trim()) {
            errors.push({ field: 'description', code: 'MISSING_REQUIRED_FIELD', message: 'Issue description is required' });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    toJSON() {
        return {
            issueId: this.issueId,
            systemId: this.systemId,
            clientId: this.clientId,
            reportedAt: this.reportedAt,
            updatedAt: this.updatedAt,
            resolvedAt: this.resolvedAt,
            status: this.status,
            severity: this.severity,
            category: this.category,
            description: this.description,
            source: this.source,
            reporter: this.reporter,
            assignee: this.assignee,
            resolution: this.resolution,
            timeToResolutionMs: this.timeToResolutionMs,
            signature: this.signature,
            metadata: this.metadata
        };
    }
}

module.exports = {
    ISSUE_STATUSES,
    ISSUE_SEVERITIES,
    ClientIssue
};
