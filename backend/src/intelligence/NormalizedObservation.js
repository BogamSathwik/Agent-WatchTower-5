/**
 * Universal Normalized Observation Model
 * Standardized data model for observations ingested across Health, Quality, Usage, and Experience engines.
 * Purely domain-agnostic.
 */

const crypto = require('crypto');
const { ClientExperienceEvent } = require('../experience/ClientExperienceEvent');

const OBSERVATION_SOURCES = Object.freeze({
    HEALTH: 'HEALTH',
    QUALITY: 'QUALITY',
    USAGE: 'USAGE',
    EXPERIENCE: 'EXPERIENCE'
});

class NormalizedObservation {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.id = raw.id ? String(raw.id).trim() : `obs_${crypto.randomBytes(8).toString('hex')}`;
        this.systemId = raw.systemId ? String(raw.systemId).trim() : 'unknown-system';

        this.source = Object.values(OBSERVATION_SOURCES).includes(raw.source)
            ? raw.source
            : OBSERVATION_SOURCES.HEALTH;

        this.metric = raw.metric ? String(raw.metric).trim() : 'unspecified_metric';
        this.value = raw.value !== undefined ? raw.value : null;
        this.unit = raw.unit ? String(raw.unit).trim() : 'count';
        this.timestamp = raw.timestamp || now;
        this.window = raw.window ? String(raw.window).trim() : '24h';

        this.available = raw.available !== undefined ? Boolean(raw.available) : (this.value !== null);
        this.reason = raw.reason ? String(raw.reason).trim() : (this.available ? null : 'NO_DATA');
        this.metadata = ClientExperienceEvent.sanitizeMetadata(raw.metadata);
    }

    /**
     * Create an explicit missing data observation instance.
     */
    static createMissing(systemId, source, metric, window = '24h', reason = 'NO_DATA') {
        return new NormalizedObservation({
            systemId,
            source,
            metric,
            value: null,
            window,
            available: false,
            reason
        });
    }

    toJSON() {
        return {
            id: this.id,
            systemId: this.systemId,
            source: this.source,
            metric: this.metric,
            value: this.value,
            unit: this.unit,
            timestamp: this.timestamp,
            window: this.window,
            available: this.available,
            reason: this.reason,
            metadata: this.metadata
        };
    }
}

module.exports = {
    OBSERVATION_SOURCES,
    NormalizedObservation
};
