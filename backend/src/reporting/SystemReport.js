/**
 * Universal System Report Entity Model
 * Master entity containing aggregated sections from all 8 monitoring dimensions.
 * Purely domain-agnostic.
 */

class SystemReport {
    constructor({
        reportId,
        systemId,
        systemName = '',
        generatedAt = new Date().toISOString(),
        window = '24h',
        overallStatus = 'HEALTHY',
        statusReasons = [],
        summary = {},
        health = {},
        quality = {},
        usage = {},
        experience = {},
        intelligence = {},
        alerts = {},
        trends = [],
        periodComparison = {},
        evidence = [],
        attentionItems = [],
        metadata = {}
    }) {
        if (!systemId) throw new Error('SystemReport systemId is required');

        this.reportId = reportId || `rpt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.systemId = String(systemId);
        this.systemName = String(systemName || systemId);
        this.generatedAt = generatedAt;
        this.window = String(window);
        this.overallStatus = String(overallStatus).toUpperCase();
        this.statusReasons = Array.isArray(statusReasons) ? statusReasons : [];
        this.summary = summary || {};
        this.health = health || {};
        this.quality = quality || {};
        this.usage = usage || {};
        this.experience = experience || {};
        this.intelligence = intelligence || {};
        this.alerts = alerts || {};
        this.trends = Array.isArray(trends) ? trends : [];
        this.periodComparison = periodComparison || {};
        this.evidence = Array.isArray(evidence) ? evidence : [];
        this.attentionItems = Array.isArray(attentionItems) ? attentionItems : [];
        this.metadata = metadata || {};
    }

    toJSON() {
        return {
            reportId: this.reportId,
            systemId: this.systemId,
            systemName: this.systemName,
            generatedAt: this.generatedAt,
            window: this.window,
            overallStatus: this.overallStatus,
            statusReasons: this.statusReasons,
            summary: this.summary,
            health: this.health,
            quality: this.quality,
            usage: this.usage,
            experience: this.experience,
            intelligence: this.intelligence,
            alerts: this.alerts,
            trends: this.trends,
            periodComparison: this.periodComparison,
            evidence: this.evidence,
            attentionItems: this.attentionItems,
            metadata: this.metadata
        };
    }
}

module.exports = SystemReport;
