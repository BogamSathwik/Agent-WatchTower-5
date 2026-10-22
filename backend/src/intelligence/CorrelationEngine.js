/**
 * Universal Correlation Engine
 * Evaluates correlation rules against normalized observations across Health, Quality, Usage, and Experience dimensions.
 * Computes transparent confidence, extracts explicit empirical evidence, and generates correlated insights.
 * Purely domain-agnostic.
 */

const { NormalizedObservation, OBSERVATION_SOURCES } = require('./NormalizedObservation');
const { CorrelationOperators, OPERATORS } = require('./CorrelationOperators');
const { InsightEvidence } = require('./InsightEvidence');
const { Insight, INSIGHT_STATUSES, INSIGHT_TYPES } = require('./Insight');

class CorrelationEngine {
    constructor(options = {}) {
        this.insightStore = options.insightStore || null;
    }

    /**
     * Evaluate active rules against a collection of normalized observations for a system.
     * @param {string} systemId
     * @param {NormalizedObservation[]} observations
     * @param {CorrelationRule[]} rules
     * @param {Object} options
     * @returns {Insight[]} List of generated / updated insights
     */
    evaluateRules(systemId, observations = [], rules = [], options = {}) {
        const generatedInsights = [];

        // Build observation map: source -> metric -> NormalizedObservation
        const obsMap = new Map();
        for (const obs of observations) {
            const key = `${obs.source}:${obs.metric}`;
            obsMap.set(key, obs);
        }

        for (const rule of rules) {
            if (!rule.enabled) continue;

            const conditionResults = [];
            const collectedEvidence = [];
            let totalAvailableConditions = 0;

            for (const cond of rule.conditions) {
                const key = `${cond.source}:${cond.metric}`;
                const obs = obsMap.get(key);

                if (!obs || !obs.available) {
                    conditionResults.push(false);
                    continue;
                }

                totalAvailableConditions++;

                let matched = false;
                let actualVal = obs.value;

                // Handle trend or delta matching
                if (cond.operator === OPERATORS.TREND_UP || cond.operator === OPERATORS.TREND_DOWN || cond.operator === OPERATORS.STABLE) {
                    actualVal = obs.metadata && obs.metadata.trendState ? obs.metadata.trendState : obs.value;
                }

                matched = CorrelationOperators.evaluate(cond.operator, actualVal, cond.value);
                conditionResults.push(matched);

                if (matched) {
                    const ev = new InsightEvidence({
                        source: obs.source,
                        metric: obs.metric,
                        value: obs.value,
                        unit: obs.unit,
                        timestamp: obs.timestamp,
                        before: obs.metadata ? obs.metadata.before : undefined,
                        after: obs.metadata ? obs.metadata.after : undefined,
                        changePercent: obs.metadata ? obs.metadata.changePercent : undefined,
                        description: `Observed ${obs.source} ${obs.metric} value '${obs.value}' matched rule condition '${cond.operator} ${cond.value}'`
                    });
                    collectedEvidence.push(ev);
                }
            }

            const ruleMatched = CorrelationOperators.combine(conditionResults, rule.logic);

            if (ruleMatched && collectedEvidence.length > 0) {
                // Transparent confidence calculation: baseConfidence * (availableRatio)
                const availableRatio = rule.conditions.length > 0 ? (totalAvailableConditions / rule.conditions.length) : 1;
                const confidence = Number((rule.baseConfidence * availableRatio).toFixed(2));

                const insight = new Insight({
                    systemId,
                    ruleId: rule.ruleId,
                    type: INSIGHT_TYPES.CORRELATION,
                    title: rule.titleTemplate || rule.name,
                    description: rule.descriptionTemplate || `Correlated observation matched rule ${rule.name}`,
                    severity: rule.severity,
                    confidence,
                    status: INSIGHT_STATUSES.NEW,
                    window: rule.window || options.window || '24h',
                    evidence: collectedEvidence
                });

                if (this.insightStore) {
                    const saved = this.insightStore.saveInsight(insight);
                    generatedInsights.push(saved);
                } else {
                    generatedInsights.push(insight);
                }
            }
        }

        return generatedInsights;
    }
}

module.exports = {
    CorrelationEngine
};
