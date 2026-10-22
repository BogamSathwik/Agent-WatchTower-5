/**
 * Universal Intelligence Insight Data Model
 * Structure representing a correlated evidence-first insight with lifecycle state management.
 * Purely domain-agnostic.
 */

const crypto = require('crypto');
const { InsightEvidence } = require('./InsightEvidence');
const { ClientExperienceEvent } = require('../experience/ClientExperienceEvent');

const INSIGHT_STATUSES = Object.freeze({
    NEW: 'NEW',
    ACTIVE: 'ACTIVE',
    RESOLVED: 'RESOLVED',
    DISMISSED: 'DISMISSED'
});

const INSIGHT_SEVERITY = Object.freeze({
    INFO: 'INFO',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
});

const INSIGHT_TYPES = Object.freeze({
    CORRELATION: 'CORRELATION',
    ANOMALY: 'ANOMALY',
    TREND: 'TREND'
});

class Insight {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.insightId = raw.insightId ? String(raw.insightId).trim() : `insight_${crypto.randomBytes(8).toString('hex')}`;
        this.systemId = raw.systemId ? String(raw.systemId).trim() : 'unknown-system';
        this.ruleId = raw.ruleId ? String(raw.ruleId).trim() : 'rule_custom';

        this.type = Object.values(INSIGHT_TYPES).includes(raw.type) ? raw.type : INSIGHT_TYPES.CORRELATION;
        this.title = raw.title ? String(raw.title).trim() : 'Correlated System Observation';
        this.description = raw.description ? String(raw.description).trim() : '';

        this.severity = Object.values(INSIGHT_SEVERITY).includes(raw.severity)
            ? raw.severity
            : INSIGHT_SEVERITY.INFO;

        this.confidence = raw.confidence !== undefined ? Number(Math.min(1.0, Math.max(0.0, Number(raw.confidence))).toFixed(2)) : 1.0;

        this.status = Object.values(INSIGHT_STATUSES).includes(raw.status)
            ? raw.status
            : INSIGHT_STATUSES.NEW;

        this.window = raw.window ? String(raw.window).trim() : '24h';
        this.createdAt = raw.createdAt || now;
        this.updatedAt = raw.updatedAt || now;
        this.resolvedAt = raw.resolvedAt || null;
        this.dismissedAt = raw.dismissedAt || null;

        // Generate or accept deterministic fingerprint for deduplication
        this.fingerprint = raw.fingerprint ? String(raw.fingerprint).trim() : Insight.generateFingerprint(this.systemId, this.ruleId, this.window);

        // Process evidence list
        this.evidence = Array.isArray(raw.evidence)
            ? raw.evidence.map(e => (e instanceof InsightEvidence ? e : new InsightEvidence(e)))
            : [];

        this.metadata = ClientExperienceEvent.sanitizeMetadata(raw.metadata);
    }

    /**
     * Compute deterministic correlation fingerprint for duplicate insight prevention.
     */
    static generateFingerprint(systemId, ruleId, window) {
        const payload = `${String(systemId).trim()}:${String(ruleId).trim()}:${String(window).trim()}`;
        return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 16);
    }

    /**
     * Resolve insight.
     */
    resolve(notes = null) {
        this.status = INSIGHT_STATUSES.RESOLVED;
        this.resolvedAt = new Date().toISOString();
        this.updatedAt = this.resolvedAt;
        if (notes) {
            this.metadata.resolutionNotes = String(notes).trim();
        }
        return this;
    }

    /**
     * Dismiss insight.
     */
    dismiss(reason = null) {
        this.status = INSIGHT_STATUSES.DISMISSED;
        this.dismissedAt = new Date().toISOString();
        this.updatedAt = this.dismissedAt;
        if (reason) {
            this.metadata.dismissReason = String(reason).trim();
        }
        return this;
    }

    toJSON() {
        return {
            insightId: this.insightId,
            fingerprint: this.fingerprint,
            systemId: this.systemId,
            ruleId: this.ruleId,
            type: this.type,
            title: this.title,
            description: this.description,
            severity: this.severity,
            confidence: this.confidence,
            status: this.status,
            window: this.window,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            resolvedAt: this.resolvedAt,
            dismissedAt: this.dismissedAt,
            evidence: this.evidence.map(e => e.toJSON()),
            metadata: this.metadata
        };
    }
}

module.exports = {
    INSIGHT_STATUSES,
    INSIGHT_SEVERITY,
    INSIGHT_TYPES,
    Insight
};
