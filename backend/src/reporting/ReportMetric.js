/**
 * Universal Report Metric Model
 * Standardized data model for individual metrics presented in system reports.
 * Purely domain-agnostic.
 */

class ReportMetric {
    constructor({
        name,
        value = null,
        unit = 'count',
        source = 'SYSTEM',
        status = 'NORMAL',
        available = true,
        reason = null,
        evidence = null,
        metadata = {}
    }) {
        if (!name) throw new Error('ReportMetric name is required');

        this.name = String(name);
        this.value = value;
        this.unit = String(unit);
        this.source = String(source).toUpperCase();
        this.status = String(status).toUpperCase();
        this.available = Boolean(available);
        this.reason = reason ? String(reason) : (this.available ? null : 'NO_DATA');
        this.evidence = evidence || null;
        this.metadata = metadata || {};
    }

    static missing(name, source = 'SYSTEM', reason = 'NO_DATA') {
        return new ReportMetric({
            name,
            source,
            value: null,
            available: false,
            reason
        });
    }

    toJSON() {
        return {
            name: this.name,
            value: this.value,
            unit: this.unit,
            source: this.source,
            status: this.status,
            available: this.available,
            reason: this.reason,
            evidence: this.evidence,
            metadata: this.metadata
        };
    }
}

module.exports = ReportMetric;
