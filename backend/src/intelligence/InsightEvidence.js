/**
 * Universal Insight Evidence Data Model
 * Structure representing explicit empirical evidence attached to an insight.
 * Purely domain-agnostic.
 */

class InsightEvidence {
    constructor(raw = {}) {
        this.source = raw.source ? String(raw.source).trim().toUpperCase() : 'UNKNOWN';
        this.metric = raw.metric ? String(raw.metric).trim() : 'metric';
        this.value = raw.value !== undefined ? raw.value : null;
        this.before = raw.before !== undefined ? raw.before : null;
        this.after = raw.after !== undefined ? raw.after : null;
        this.changePercent = raw.changePercent !== undefined ? Number(raw.changePercent) : null;
        this.unit = raw.unit ? String(raw.unit).trim() : 'count';
        this.timestamp = raw.timestamp || new Date().toISOString();
        this.description = raw.description ? String(raw.description).trim() : '';
    }

    toJSON() {
        const obj = {
            source: this.source,
            metric: this.metric,
            value: this.value,
            unit: this.unit,
            timestamp: this.timestamp
        };

        if (this.before !== null) obj.before = this.before;
        if (this.after !== null) obj.after = this.after;
        if (this.changePercent !== null) obj.changePercent = this.changePercent;
        if (this.description) obj.description = this.description;

        return obj;
    }
}

module.exports = {
    InsightEvidence
};
