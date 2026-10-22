/**
 * Universal Insight Store
 * In-memory persistence store for correlation rules and correlated evidence insights.
 * Supports fingerprint deduplication, status filtering, multi-parameter search, and default correlation rules.
 * Purely domain-agnostic.
 */

const { Insight, INSIGHT_STATUSES, INSIGHT_SEVERITY, INSIGHT_TYPES } = require('./Insight');
const { CorrelationRule } = require('./CorrelationRule');
const { OPERATORS } = require('./CorrelationOperators');

class InsightStore {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;

        /** @type {Map<string, CorrelationRule>} */
        this.rulesMap = new Map();

        /** @type {Map<string, Insight>} */
        this.insightsMap = new Map();

        // Seed default generic correlation rules
        this._seedDefaultRules();
    }

    /**
     * Seed universal default correlation rules.
     */
    _seedDefaultRules() {
        const defaultRules = [
            new CorrelationRule({
                ruleId: 'rule_usage_decline_stable_health',
                name: 'Usage decline with stable health',
                severity: INSIGHT_SEVERITY.MEDIUM,
                baseConfidence: 0.85,
                logic: 'AND',
                conditions: [
                    { source: 'USAGE', metric: 'activity', operator: OPERATORS.TREND_DOWN, value: 'DECREASING' },
                    { source: 'HEALTH', metric: 'availability', operator: OPERATORS.GREATER_THAN_OR_EQUAL, value: 95.0 }
                ],
                titleTemplate: 'Usage activity decreased while system health remained stable',
                descriptionTemplate: 'Observed usage activity reduction during specified window while system availability remained high.'
            }),
            new CorrelationRule({
                ruleId: 'rule_quality_failures_stable_health',
                name: 'Quality failures with stable health',
                severity: INSIGHT_SEVERITY.MEDIUM,
                baseConfidence: 0.90,
                logic: 'AND',
                conditions: [
                    { source: 'QUALITY', metric: 'failRate', operator: OPERATORS.GREATER_THAN, value: 0 },
                    { source: 'HEALTH', metric: 'status', operator: OPERATORS.EQUALS, value: 'HEALTHY' }
                ],
                titleTemplate: 'Quality test failures detected while system status is healthy',
                descriptionTemplate: 'Behavioral quality assertions failed despite endpoint health check passing.'
            }),
            new CorrelationRule({
                ruleId: 'rule_degraded_health_quality_failures',
                name: 'Degraded health coincides with quality failures',
                severity: INSIGHT_SEVERITY.HIGH,
                baseConfidence: 0.95,
                logic: 'AND',
                conditions: [
                    { source: 'HEALTH', metric: 'status', operator: OPERATORS.NOT_EQUALS, value: 'HEALTHY' },
                    { source: 'QUALITY', metric: 'failRate', operator: OPERATORS.GREATER_THAN, value: 10.0 }
                ],
                titleTemplate: 'Quality degradation coincides with degraded system health',
                descriptionTemplate: 'Concurrent health status degradation and behavioral quality test failures observed.'
            }),
            new CorrelationRule({
                ruleId: 'rule_issues_with_usage_reduction',
                name: 'Operational issues coincide with usage reduction',
                severity: INSIGHT_SEVERITY.HIGH,
                baseConfidence: 0.88,
                logic: 'AND',
                conditions: [
                    { source: 'EXPERIENCE', metric: 'openIssues', operator: OPERATORS.GREATER_THAN, value: 0 },
                    { source: 'USAGE', metric: 'activity', operator: OPERATORS.TREND_DOWN, value: 'DECREASING' }
                ],
                titleTemplate: 'Reduced usage activity coincides with open operational issues',
                descriptionTemplate: 'Recorded operational issues align temporally with declining client usage volume.'
            }),
            new CorrelationRule({
                ruleId: 'rule_offline_usage_inactivity',
                name: 'Offline health status coincides with zero usage',
                severity: INSIGHT_SEVERITY.CRITICAL,
                baseConfidence: 0.98,
                logic: 'AND',
                conditions: [
                    { source: 'HEALTH', metric: 'status', operator: OPERATORS.EQUALS, value: 'OFFLINE' },
                    { source: 'USAGE', metric: 'eventCount', operator: OPERATORS.EQUALS, value: 0 }
                ],
                titleTemplate: 'System offline status coincides with total usage inactivity',
                descriptionTemplate: 'System endpoints recorded OFFLINE state concurrently with zero usage traffic.'
            })
        ];

        for (const rule of defaultRules) {
            this.rulesMap.set(rule.ruleId, rule);
        }
    }

    // ==================================================
    // CORRELATION RULE MANAGEMENT
    // ==================================================

    saveRule(rulePayload) {
        const rule = rulePayload instanceof CorrelationRule ? rulePayload : new CorrelationRule(rulePayload);
        this.rulesMap.set(rule.ruleId, rule);
        return rule;
    }

    getRule(ruleId) {
        return this.rulesMap.get(String(ruleId).trim()) || null;
    }

    listRules(options = {}) {
        let rules = Array.from(this.rulesMap.values());

        if (options.enabled !== undefined && options.enabled !== null) {
            const isEnabled = String(options.enabled) === 'true' || options.enabled === true;
            rules = rules.filter(r => r.enabled === isEnabled);
        }

        if (options.severity) {
            const sev = String(options.severity).toUpperCase();
            rules = rules.filter(r => r.severity === sev);
        }

        return rules;
    }

    updateRule(ruleId, patchPayload) {
        const existing = this.getRule(ruleId);
        if (!existing) return null;

        const updated = new CorrelationRule({
            ...existing.toJSON(),
            ...patchPayload,
            ruleId: existing.ruleId,
            updatedAt: new Date().toISOString()
        });

        this.rulesMap.set(existing.ruleId, updated);
        return updated;
    }

    deleteRule(ruleId) {
        const key = String(ruleId).trim();
        if (this.rulesMap.has(key)) {
            this.rulesMap.delete(key);
            return true;
        }
        return false;
    }

    // ==================================================
    // INSIGHT MANAGEMENT & DEDUPLICATION
    // ==================================================

    saveInsight(insightPayload) {
        const insight = insightPayload instanceof Insight ? insightPayload : new Insight(insightPayload);

        // Check for existing active insight with same fingerprint to prevent duplication
        const existing = this.getInsightByFingerprint(insight.fingerprint, insight.systemId);

        if (existing && (existing.status === INSIGHT_STATUSES.NEW || existing.status === INSIGHT_STATUSES.ACTIVE)) {
            // Update existing active insight instead of creating a duplicate
            existing.evidence = insight.evidence;
            existing.confidence = insight.confidence;
            existing.severity = insight.severity;
            existing.title = insight.title;
            existing.description = insight.description;
            existing.updatedAt = new Date().toISOString();
            this.insightsMap.set(existing.insightId, existing);
            return existing;
        }

        this.insightsMap.set(insight.insightId, insight);
        return insight;
    }

    getInsight(insightId) {
        return this.insightsMap.get(String(insightId).trim()) || null;
    }

    getInsightByFingerprint(fingerprint, systemId = null) {
        for (const insight of this.insightsMap.values()) {
            if (insight.fingerprint === fingerprint) {
                if (!systemId || insight.systemId === systemId) {
                    return insight;
                }
            }
        }
        return null;
    }

    listInsights(options = {}) {
        let insights = Array.from(this.insightsMap.values());

        if (options.systemId) {
            const sid = String(options.systemId).trim();
            insights = insights.filter(i => i.systemId === sid);
        }

        if (options.status) {
            const statusStr = String(options.status).toUpperCase();
            insights = insights.filter(i => i.status === statusStr);
        }

        if (options.severity) {
            const sev = String(options.severity).toUpperCase();
            insights = insights.filter(i => i.severity === sev);
        }

        if (options.type) {
            const typeStr = String(options.type).toUpperCase();
            insights = insights.filter(i => i.type === typeStr);
        }

        if (options.ruleId) {
            const rid = String(options.ruleId).trim();
            insights = insights.filter(i => i.ruleId === rid);
        }

        if (options.window) {
            const win = String(options.window).trim();
            insights = insights.filter(i => i.window === win);
        }

        if (options.source) {
            const src = String(options.source).toUpperCase();
            insights = insights.filter(i => i.evidence.some(e => e.source === src));
        }

        // Sort by creation / update timestamp descending
        insights.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        if (options.limit && !isNaN(Number(options.limit))) {
            return insights.slice(0, Number(options.limit));
        }

        return insights;
    }

    updateInsightStatus(insightId, status, meta = {}) {
        const insight = this.getInsight(insightId);
        if (!insight) return null;

        const statusStr = String(status).toUpperCase();
        if (statusStr === INSIGHT_STATUSES.RESOLVED) {
            insight.resolve(meta.notes);
        } else if (statusStr === INSIGHT_STATUSES.DISMISSED) {
            insight.dismiss(meta.reason);
        } else if (Object.values(INSIGHT_STATUSES).includes(statusStr)) {
            insight.status = statusStr;
            insight.updatedAt = new Date().toISOString();
        }

        this.insightsMap.set(insight.insightId, insight);
        return insight;
    }
}

module.exports = {
    InsightStore
};
