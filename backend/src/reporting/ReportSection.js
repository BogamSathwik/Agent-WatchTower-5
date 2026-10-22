/**
 * Universal Report Section Model
 * Container for grouping metrics and status for a specific monitoring dimension.
 * Purely domain-agnostic.
 */

class ReportSection {
    constructor({
        title,
        source,
        status = 'HEALTHY',
        available = true,
        reason = null,
        metrics = [],
        summary = '',
        metadata = {}
    }) {
        if (!title) throw new Error('ReportSection title is required');

        this.title = String(title);
        this.source = String(source || title).toUpperCase();
        this.status = String(status).toUpperCase();
        this.available = Boolean(available);
        this.reason = reason ? String(reason) : (this.available ? null : 'NO_DATA');
        this.metrics = Array.isArray(metrics) ? metrics : [];
        this.summary = String(summary);
        this.metadata = metadata || {};
    }

    toJSON() {
        return {
            title: this.title,
            source: this.source,
            status: this.status,
            available: this.available,
            reason: this.reason,
            metrics: this.metrics.map(m => (m && typeof m.toJSON === 'function' ? m.toJSON() : m)),
            summary: this.summary,
            metadata: this.metadata
        };
    }
}

module.exports = ReportSection;
