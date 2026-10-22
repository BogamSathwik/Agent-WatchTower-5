/**
 * Client Feedback Data Model
 * Model for explicit feedback submissions, comments, and configurable rating scales.
 * Purely domain-agnostic.
 */

const crypto = require('crypto');
const { ClientExperienceEvent } = require('./ClientExperienceEvent');

class ClientFeedback {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.feedbackId = raw.feedbackId ? String(raw.feedbackId).trim() : `fb_${crypto.randomBytes(8).toString('hex')}`;
        this.systemId = raw.systemId ? String(raw.systemId).trim() : 'unknown-system';
        this.clientId = raw.clientId ? String(raw.clientId).trim() : null;
        this.actorId = raw.actorId ? String(raw.actorId).trim() : (this.clientId || 'anonymous');
        this.timestamp = raw.timestamp || now;
        this.source = raw.source ? String(raw.source).trim().toLowerCase() : 'user';

        // Rating processing
        this.rating = ClientFeedback.processRating(raw.rating);

        this.comment = raw.comment ? String(raw.comment).trim() : '';
        this.category = raw.category ? String(raw.category).trim().toLowerCase() : 'general';
        this.tags = Array.isArray(raw.tags) ? raw.tags.map(t => String(t).trim().toLowerCase()) : [];
        this.metadata = ClientExperienceEvent.sanitizeMetadata(raw.metadata);
    }

    /**
     * Process rating with scale validation and normalization.
     */
    static processRating(rawRating) {
        if (rawRating === undefined || rawRating === null) {
            return null;
        }

        let value, scaleMin, scaleMax;

        if (typeof rawRating === 'number') {
            value = Number(rawRating);
            scaleMin = 1;
            scaleMax = 5;
        } else if (typeof rawRating === 'object') {
            value = Number(rawRating.value);
            scaleMin = rawRating.scaleMin !== undefined ? Number(rawRating.scaleMin) : 1;
            scaleMax = rawRating.scaleMax !== undefined ? Number(rawRating.scaleMax) : 5;
        } else {
            return null;
        }

        if (isNaN(value) || isNaN(scaleMin) || isNaN(scaleMax) || scaleMax <= scaleMin) {
            return null;
        }

        // Clamp value or validate
        if (value < scaleMin || value > scaleMax) {
            return {
                value,
                scaleMin,
                scaleMax,
                normalizedScore: null,
                valid: false,
                error: `Rating value ${value} is outside scale [${scaleMin}, ${scaleMax}]`
            };
        }

        const normalizedScore = Number((((value - scaleMin) / (scaleMax - scaleMin)) * 100).toFixed(2));

        return {
            value,
            scaleMin,
            scaleMax,
            normalizedScore,
            valid: true
        };
    }

    /**
     * Validate raw feedback payload.
     */
    static validate(raw) {
        const errors = [];

        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                valid: false,
                errors: [{ field: 'root', code: 'INVALID_PAYLOAD', message: 'Feedback payload must be a non-null object' }]
            };
        }

        if (!raw.systemId || typeof raw.systemId !== 'string' || !raw.systemId.trim()) {
            errors.push({ field: 'systemId', code: 'MISSING_REQUIRED_FIELD', message: 'systemId is required' });
        }

        if (raw.rating !== undefined && raw.rating !== null) {
            const processed = this.processRating(raw.rating);
            if (!processed || !processed.valid) {
                errors.push({ field: 'rating', code: 'INVALID_RATING_VALUE', message: processed ? processed.error : 'Rating scale or value is invalid' });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    toJSON() {
        return {
            feedbackId: this.feedbackId,
            systemId: this.systemId,
            clientId: this.clientId,
            actorId: this.actorId,
            timestamp: this.timestamp,
            source: this.source,
            rating: this.rating,
            comment: this.comment,
            category: this.category,
            tags: this.tags,
            metadata: this.metadata
        };
    }
}

module.exports = {
    ClientFeedback
};
