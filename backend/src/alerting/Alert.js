/**
 * Universal Alert Model
 * Entity representing an observed alert state with deterministic fingerprinting and lifecycle transitions.
 * Purely domain-agnostic.
 */

const crypto = require('crypto');

const ALERT_SEVERITY = Object.freeze({
    INFO: 'INFO',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
});

const ALERT_STATUS = Object.freeze({
    NEW: 'NEW',
    ACTIVE: 'ACTIVE',
    ACKNOWLEDGED: 'ACKNOWLEDGED',
    RESOLVED: 'RESOLVED',
    DISMISSED: 'DISMISSED'
});

const ALERT_CATEGORY = Object.freeze({
    AVAILABILITY: 'AVAILABILITY',
    QUALITY: 'QUALITY',
    USAGE: 'USAGE',
    EXPERIENCE: 'EXPERIENCE',
    INTELLIGENCE: 'INTELLIGENCE',
    SECURITY: 'SECURITY',
    SYSTEM: 'SYSTEM',
    CUSTOM: 'CUSTOM'
});

class Alert {
    constructor({
        id,
        systemId,
        source = 'SYSTEM',
        ruleId = null,
        title,
        description = '',
        severity = ALERT_SEVERITY.MEDIUM,
        status = ALERT_STATUS.NEW,
        category = ALERT_CATEGORY.SYSTEM,
        condition = {},
        evidence = [],
        firstDetectedAt = new Date().toISOString(),
        lastDetectedAt = new Date().toISOString(),
        acknowledgedAt = null,
        acknowledgedBy = null,
        resolvedAt = null,
        dismissedAt = null,
        dismissedBy = null,
        notificationStatus = 'PENDING',
        occurrenceCount = 1,
        fingerprint = null,
        escalationLevel = 1,
        isEscalated = false,
        metadata = {}
    }) {
        if (!systemId) throw new Error('Alert systemId is required');
        if (!title) throw new Error('Alert title is required');

        this.id = id || `alt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.systemId = String(systemId);
        this.source = String(source).toUpperCase();
        this.ruleId = ruleId;
        this.title = String(title);
        this.description = String(description);
        this.severity = Object.values(ALERT_SEVERITY).includes(severity) ? severity : ALERT_SEVERITY.MEDIUM;
        this.status = Object.values(ALERT_STATUS).includes(status) ? status : ALERT_STATUS.NEW;
        this.category = Object.values(ALERT_CATEGORY).includes(category) ? category : ALERT_CATEGORY.SYSTEM;
        this.condition = condition || {};
        this.evidence = Array.isArray(evidence) ? evidence : [];
        this.firstDetectedAt = firstDetectedAt;
        this.lastDetectedAt = lastDetectedAt;
        this.acknowledgedAt = acknowledgedAt;
        this.acknowledgedBy = acknowledgedBy;
        this.resolvedAt = resolvedAt;
        this.dismissedAt = dismissedAt;
        this.dismissedBy = dismissedBy;
        this.notificationStatus = notificationStatus;
        this.occurrenceCount = Number(occurrenceCount) || 1;
        this.fingerprint = fingerprint || Alert.generateFingerprint(this.systemId, this.ruleId, this.condition);
        this.escalationLevel = Number(escalationLevel) || 1;
        this.isEscalated = Boolean(isEscalated);
        this.metadata = metadata || {};
    }

    /**
     * Generate deterministic fingerprint for deduplication.
     */
    static generateFingerprint(systemId, ruleId, condition) {
        const raw = `${systemId}:${ruleId || 'manual'}:${JSON.stringify(condition || {})}`;
        return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
    }

    /**
     * Record repeated occurrence during deduplication.
     */
    recordOccurrence(evidence = []) {
        this.occurrenceCount += 1;
        this.lastDetectedAt = new Date().toISOString();
        if (this.status === ALERT_STATUS.NEW) {
            this.status = ALERT_STATUS.ACTIVE;
        }
        if (Array.isArray(evidence) && evidence.length > 0) {
            this.evidence = [...this.evidence, ...evidence];
        }
    }

    /**
     * Transition to ACKNOWLEDGED state.
     */
    acknowledge(actor = 'operator', reason = '') {
        if (this.status === ALERT_STATUS.RESOLVED || this.status === ALERT_STATUS.DISMISSED) {
            throw new Error(`Cannot acknowledge alert in ${this.status} state`);
        }
        this.status = ALERT_STATUS.ACKNOWLEDGED;
        this.acknowledgedAt = new Date().toISOString();
        this.acknowledgedBy = String(actor);
        if (reason) {
            this.metadata.ackReason = String(reason);
        }
        return this;
    }

    /**
     * Transition to RESOLVED state.
     */
    resolve(recoveryEvidence = []) {
        if (this.status === ALERT_STATUS.DISMISSED) {
            throw new Error('Cannot resolve a dismissed alert without reopening');
        }
        this.status = ALERT_STATUS.RESOLVED;
        this.resolvedAt = new Date().toISOString();
        if (Array.isArray(recoveryEvidence) && recoveryEvidence.length > 0) {
            this.evidence.push({
                type: 'RECOVERY',
                timestamp: this.resolvedAt,
                details: recoveryEvidence
            });
        }
        return this;
    }

    /**
     * Transition to DISMISSED state.
     */
    dismiss(actor = 'operator', reason = '') {
        this.status = ALERT_STATUS.DISMISSED;
        this.dismissedAt = new Date().toISOString();
        this.dismissedBy = String(actor);
        if (reason) {
            this.metadata.dismissReason = String(reason);
        }
        return this;
    }

    /**
     * Reopen a resolved or dismissed alert.
     */
    reopen(reason = 'Condition re-triggered') {
        this.status = ALERT_STATUS.ACTIVE;
        this.resolvedAt = null;
        this.dismissedAt = null;
        this.dismissedBy = null;
        this.lastDetectedAt = new Date().toISOString();
        this.occurrenceCount += 1;
        this.metadata.reopenReason = String(reason);
        return this;
    }

    toJSON() {
        return {
            id: this.id,
            systemId: this.systemId,
            source: this.source,
            ruleId: this.ruleId,
            title: this.title,
            description: this.description,
            severity: this.severity,
            status: this.status,
            category: this.category,
            condition: this.condition,
            evidence: this.evidence,
            firstDetectedAt: this.firstDetectedAt,
            lastDetectedAt: this.lastDetectedAt,
            acknowledgedAt: this.acknowledgedAt,
            acknowledgedBy: this.acknowledgedBy,
            resolvedAt: this.resolvedAt,
            dismissedAt: this.dismissedAt,
            dismissedBy: this.dismissedBy,
            notificationStatus: this.notificationStatus,
            occurrenceCount: this.occurrenceCount,
            fingerprint: this.fingerprint,
            escalationLevel: this.escalationLevel,
            isEscalated: this.isEscalated,
            metadata: this.metadata
        };
    }
}

module.exports = {
    Alert,
    ALERT_SEVERITY,
    ALERT_STATUS,
    ALERT_CATEGORY
};
