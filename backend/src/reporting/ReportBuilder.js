/**
 * Universal Report Builder
 * Aggregates data from all 8 underlying engines into structured SystemReports with traceable evidence.
 * Purely domain-agnostic.
 */

const ReportMetric = require('./ReportMetric');
const ReportSection = require('./ReportSection');
const SystemReport = require('./SystemReport');
const { ReportPeriod } = require('./ReportPeriod');
const { ReportStatusEvaluator } = require('./ReportStatusEvaluator');

class ReportBuilder {
    constructor({
        systemRegistry = null,
        healthEngine = null,
        qualityRunner = null,
        usageCollector = null,
        experienceStore = null,
        intelligenceService = null,
        alertingService = null
    } = {}) {
        this.systemRegistry = systemRegistry;
        this.healthEngine = healthEngine;
        this.qualityRunner = qualityRunner;
        this.usageCollector = usageCollector;
        this.experienceStore = experienceStore;
        this.intelligenceService = intelligenceService;
        this.alertingService = alertingService;
    }

    async buildReport(systemId, window = '24h') {
        if (!systemId) throw new Error('ReportBuilder requires a systemId');

        let system = null;
        if (this.systemRegistry) {
            try {
                system = this.systemRegistry.getSystem(systemId);
            } catch (e) {
                system = null;
            }
        }
        const systemName = system ? system.name : systemId;
        const period = ReportPeriod.parseWindow(window);

        // 1. Health Section
        const healthSection = await this.buildHealthSection(systemId);

        // 2. Quality Section
        const qualitySection = await this.buildQualitySection(systemId);

        // 3. Usage Section
        const usageSection = await this.buildUsageSection(systemId);

        // 4. Experience Section
        const experienceSection = await this.buildExperienceSection(systemId);

        // 5. Intelligence Section
        const intelligenceSection = await this.buildIntelligenceSection(systemId, window);

        // 6. Alerts Section
        const alertsSection = await this.buildAlertsSection(systemId);

        const sectionsMap = {
            health: healthSection,
            quality: qualitySection,
            usage: usageSection,
            experience: experienceSection,
            intelligence: intelligenceSection,
            alerts: alertsSection
        };

        // Evaluate overall status & evidence reasons
        const { status: overallStatus, reasons: statusReasons } = ReportStatusEvaluator.evaluateStatus(sectionsMap);

        // Compile empirical evidence list
        const evidence = this.collectEvidence(sectionsMap);

        // Compile attention items
        const attentionItems = this.collectAttentionItems(sectionsMap, statusReasons);

        // Summary counts & metadata
        const summary = {
            availableSignalsCount: Object.values(sectionsMap).filter(s => s.available).length,
            totalSignalsCount: 6,
            systemCategory: system ? system.category : 'unknown',
            capabilities: system ? system.capabilities : []
        };

        return new SystemReport({
            systemId,
            systemName,
            window: period.window,
            overallStatus,
            statusReasons,
            summary,
            health: healthSection.toJSON ? healthSection.toJSON() : healthSection,
            quality: qualitySection.toJSON ? qualitySection.toJSON() : qualitySection,
            usage: usageSection.toJSON ? usageSection.toJSON() : usageSection,
            experience: experienceSection.toJSON ? experienceSection.toJSON() : experienceSection,
            intelligence: intelligenceSection.toJSON ? intelligenceSection.toJSON() : intelligenceSection,
            alerts: alertsSection.toJSON ? alertsSection.toJSON() : alertsSection,
            evidence,
            attentionItems
        });
    }

    async buildHealthSection(systemId) {
        if (!this.healthEngine || !this.healthEngine.healthStore) {
            return new ReportSection({ title: 'Health Engine', source: 'HEALTH', available: false, reason: 'ENGINE_NOT_WIRED' });
        }

        const metricsStore = this.healthEngine.healthStore;
        const systemState = metricsStore.getSystemState ? metricsStore.getSystemState(systemId) : null;
        const latest = metricsStore.getLatestMeasurement ? metricsStore.getLatestMeasurement(systemId) : null;
        const history = metricsStore.getHistory ? metricsStore.getHistory(systemId, { limit: 100 }) : [];

        if (!latest && history.length === 0 && (!systemState || systemState.status === 'UNKNOWN')) {
            return new ReportSection({ title: 'Health Engine', source: 'HEALTH', available: false, reason: 'NO_DATA' });
        }

        const status = systemState ? systemState.status : (latest ? latest.status : 'UNKNOWN');
        const availability = systemState && systemState.availabilityPercent !== undefined ? systemState.availabilityPercent : 100;
        const responseTimeMs = latest ? (latest.responseTimeMs !== undefined ? latest.responseTimeMs : null) : null;
        const consecutiveSuccesses = systemState ? (systemState.consecutiveSuccesses || 0) : 0;
        const consecutiveFailures = systemState ? (systemState.consecutiveFailures || 0) : 0;

        const metrics = [
            new ReportMetric({ name: 'availability', value: availability, unit: 'percent', source: 'HEALTH' }),
            new ReportMetric({ name: 'responseTimeMs', value: responseTimeMs, unit: 'ms', source: 'HEALTH' }),
            new ReportMetric({ name: 'consecutiveSuccesses', value: consecutiveSuccesses, unit: 'count', source: 'HEALTH' }),
            new ReportMetric({ name: 'consecutiveFailures', value: consecutiveFailures, unit: 'count', source: 'HEALTH' })
        ];

        return new ReportSection({
            title: 'Health Engine',
            source: 'HEALTH',
            status,
            available: true,
            metrics,
            summary: `System health is ${status} with ${availability}% availability`
        });
    }

    async buildQualitySection(systemId) {
        if (!this.qualityRunner || !this.qualityRunner.qualityStore) {
            return new ReportSection({ title: 'Quality Engine', source: 'QUALITY', available: false, reason: 'ENGINE_NOT_WIRED' });
        }

        const store = this.qualityRunner.qualityStore;
        const summaryMetrics = store.getQualitySummaryMetrics ? store.getQualitySummaryMetrics(systemId) : null;

        if (!summaryMetrics || summaryMetrics.totalTests === 0) {
            return new ReportSection({ title: 'Quality Engine', source: 'QUALITY', available: false, reason: 'NO_DATA' });
        }

        const metrics = [
            new ReportMetric({ name: 'passRate', value: summaryMetrics.passRate || 100, unit: 'percent', source: 'QUALITY' }),
            new ReportMetric({ name: 'totalTests', value: summaryMetrics.totalTests || 0, unit: 'count', source: 'QUALITY' }),
            new ReportMetric({ name: 'passedTests', value: summaryMetrics.passedTests || 0, unit: 'count', source: 'QUALITY' }),
            new ReportMetric({ name: 'failedTests', value: summaryMetrics.failedTests || 0, unit: 'count', source: 'QUALITY' })
        ];

        return new ReportSection({
            title: 'Quality Engine',
            source: 'QUALITY',
            status: summaryMetrics.passRate >= 90 ? 'HEALTHY' : (summaryMetrics.passRate >= 75 ? 'DEGRADED' : 'CRITICAL'),
            available: true,
            metrics,
            summary: `Quality test pass rate is ${summaryMetrics.passRate}% across ${summaryMetrics.totalTests} tests`
        });
    }

    async buildUsageSection(systemId) {
        if (!this.usageCollector || !this.usageCollector.usageStore) {
            return new ReportSection({ title: 'Usage Analytics Engine', source: 'USAGE', available: false, reason: 'ENGINE_NOT_WIRED' });
        }

        const store = this.usageCollector.usageStore;
        const events = store.getEventsBySystem ? store.getEventsBySystem(systemId) : [];

        if (!events || events.length === 0) {
            return new ReportSection({ title: 'Usage Analytics Engine', source: 'USAGE', available: false, reason: 'NO_DATA' });
        }

        const successCount = events.filter(e => e.status === 'SUCCESS').length;
        const successRate = Math.round((successCount / events.length) * 100);

        const metrics = [
            new ReportMetric({ name: 'totalEvents', value: events.length, unit: 'count', source: 'USAGE' }),
            new ReportMetric({ name: 'successRate', value: successRate, unit: 'percent', source: 'USAGE' }),
            new ReportMetric({ name: 'lastActivityAt', value: events[0] ? events[0].timestamp : null, unit: 'timestamp', source: 'USAGE' })
        ];

        return new ReportSection({
            title: 'Usage Analytics Engine',
            source: 'USAGE',
            status: 'HEALTHY',
            available: true,
            metrics,
            summary: `Recorded ${events.length} usage events with ${successRate}% success rate`
        });
    }

    async buildExperienceSection(systemId) {
        if (!this.experienceStore) {
            return new ReportSection({ title: 'Client Experience Engine', source: 'EXPERIENCE', available: false, reason: 'ENGINE_NOT_WIRED' });
        }

        const feedbackList = this.experienceStore.getFeedbackBySystem ? this.experienceStore.getFeedbackBySystem(systemId) : [];
        const issuesList = this.experienceStore.getIssuesBySystem ? this.experienceStore.getIssuesBySystem(systemId) : [];

        if (feedbackList.length === 0 && issuesList.length === 0) {
            return new ReportSection({ title: 'Client Experience Engine', source: 'EXPERIENCE', available: false, reason: 'NO_DATA' });
        }

        const openIssues = issuesList.filter(i => i.status !== 'RESOLVED' && i.status !== 'CLOSED').length;
        const criticalIssues = issuesList.filter(i => i.severity === 'CRITICAL' && (i.status !== 'RESOLVED' && i.status !== 'CLOSED')).length;

        const ratings = feedbackList.filter(f => f.rating && typeof f.rating.value === 'number').map(f => f.rating.value);
        const avgRating = ratings.length > 0 ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : null;

        const metrics = [
            new ReportMetric({ name: 'totalRatings', value: ratings.length, unit: 'count', source: 'EXPERIENCE' }),
            new ReportMetric({ name: 'averageRating', value: avgRating, unit: 'score', source: 'EXPERIENCE' }),
            new ReportMetric({ name: 'openIssues', value: openIssues, unit: 'count', source: 'EXPERIENCE' }),
            new ReportMetric({ name: 'criticalIssues', value: criticalIssues, unit: 'count', source: 'EXPERIENCE' })
        ];

        return new ReportSection({
            title: 'Client Experience Engine',
            source: 'EXPERIENCE',
            status: openIssues === 0 ? 'HEALTHY' : 'ATTENTION_REQUIRED',
            available: true,
            metrics,
            summary: `Average client rating ${avgRating !== null ? avgRating : 'N/A'} with ${openIssues} open issues`
        });
    }

    async buildIntelligenceSection(systemId, window) {
        if (!this.intelligenceService) {
            return new ReportSection({ title: 'Intelligence Engine', source: 'INTELLIGENCE', available: false, reason: 'ENGINE_NOT_WIRED' });
        }

        const store = this.intelligenceService ? this.intelligenceService.insightStore : null;
        const insights = (store && typeof store.listInsights === 'function') ? store.listInsights({ systemId }) : [];

        const activeInsights = insights.filter(i => i.status === 'NEW' || i.status === 'ACTIVE');

        const metrics = [
            new ReportMetric({ name: 'activeInsightsCount', value: activeInsights.length, unit: 'count', source: 'INTELLIGENCE' }),
            new ReportMetric({ name: 'totalInsightsCount', value: insights.length, unit: 'count', source: 'INTELLIGENCE' })
        ];

        return new ReportSection({
            title: 'Intelligence Engine',
            source: 'INTELLIGENCE',
            status: activeInsights.length === 0 ? 'HEALTHY' : 'ATTENTION_REQUIRED',
            available: true,
            metrics,
            summary: `${activeInsights.length} active correlated insights detected`
        });
    }

    async buildAlertsSection(systemId) {
        if (!this.alertingService) {
            return new ReportSection({ title: 'Alerting Engine', source: 'ALERTS', available: false, reason: 'ENGINE_NOT_WIRED' });
        }

        const alerts = this.alertingService.listAlerts({ systemId });
        const activeAlerts = alerts.filter(a => ['NEW', 'ACTIVE', 'ACKNOWLEDGED'].includes(a.status));
        const criticalAlerts = activeAlerts.filter(a => a.severity === 'CRITICAL');
        const highAlerts = activeAlerts.filter(a => a.severity === 'HIGH');

        const metrics = [
            new ReportMetric({ name: 'activeAlertsCount', value: activeAlerts.length, unit: 'count', source: 'ALERTS' }),
            new ReportMetric({ name: 'criticalAlertsCount', value: criticalAlerts.length, unit: 'count', source: 'ALERTS' }),
            new ReportMetric({ name: 'highAlertsCount', value: highAlerts.length, unit: 'count', source: 'ALERTS' })
        ];

        return new ReportSection({
            title: 'Alerting Engine',
            source: 'ALERTS',
            status: criticalAlerts.length > 0 ? 'CRITICAL' : (highAlerts.length > 0 ? 'DEGRADED' : (activeAlerts.length > 0 ? 'ATTENTION_REQUIRED' : 'HEALTHY')),
            available: true,
            metrics,
            summary: `${activeAlerts.length} active alerts (${criticalAlerts.length} Critical, ${highAlerts.length} High)`
        });
    }

    collectEvidence(sectionsMap) {
        const list = [];
        for (const [secKey, sec] of Object.entries(sectionsMap)) {
            if (sec && sec.available && Array.isArray(sec.metrics)) {
                sec.metrics.forEach(m => {
                    if (m && m.value !== null && m.value !== undefined) {
                        list.push({
                            source: m.source || secKey.toUpperCase(),
                            metric: m.name,
                            value: m.value,
                            unit: m.unit,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            }
        }
        return list;
    }

    collectAttentionItems(sectionsMap, statusReasons) {
        const items = [];
        if (Array.isArray(statusReasons)) {
            statusReasons.forEach(r => {
                items.push({
                    priority: r.source === 'ALERTS' || r.source === 'HEALTH' ? 'HIGH' : 'MEDIUM',
                    source: r.source,
                    detail: r.detail || `Threshold violation on ${r.metric}`
                });
            });
        }
        return items;
    }
}

module.exports = ReportBuilder;
