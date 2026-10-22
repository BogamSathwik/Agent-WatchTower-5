/**
 * Universal Alert Evaluator
 * Evaluates AlertRules against normalized observations from all 4 dimensions & correlation insights.
 * Performs deterministic condition matching and automatic recovery detection.
 * Purely domain-agnostic.
 */

const { CorrelationOperators } = require('../intelligence/CorrelationOperators');
const { Alert, ALERT_STATUS } = require('./Alert');

class AlertEvaluator {

    /**
     * Evaluate alert rules against normalized observations for a system.
     * @param {Array<AlertRule>} rules 
     * @param {Array<NormalizedObservation>} observations 
     * @param {Array<Alert>} activeAlerts 
     * @returns {Object} { triggered: Array<Object>, recovered: Array<Alert> }
     */
    static evaluateSystemRules(rules, observations, activeAlerts = []) {
        const triggered = [];
        const recovered = [];

        if (!Array.isArray(rules) || rules.length === 0) {
            return { triggered, recovered };
        }
        if (!Array.isArray(observations)) {
            observations = [];
        }

        const activeAlertsMap = new Map();
        activeAlerts.forEach(a => {
            if ([ALERT_STATUS.NEW, ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED].includes(a.status)) {
                activeAlertsMap.set(a.fingerprint, a);
            }
        });

        // 1. Evaluate rules against observations
        for (const rule of rules) {
            if (!rule.enabled) continue;

            // Find matching observations for this rule's source & metric
            const matchingObs = observations.filter(obs => {
                if (!obs.available) return false;
                const sourceMatch = !rule.source || rule.source === '*' || String(obs.source).toUpperCase() === String(rule.source).toUpperCase();
                const metricMatch = !rule.metric || rule.metric === '*' || String(obs.metric) === String(rule.metric);
                return sourceMatch && metricMatch;
            });

            if (matchingObs.length === 0) continue;

            for (const obs of matchingObs) {
                const match = CorrelationOperators.evaluate(rule.operator, obs.value, rule.value);

                const fingerprint = Alert.generateFingerprint(obs.systemId, rule.id, {
                    metric: rule.metric,
                    operator: rule.operator,
                    value: rule.value
                });

                if (match) {
                    triggered.push({
                        rule,
                        observation: obs,
                        systemId: obs.systemId,
                        fingerprint,
                        title: `Alert Triggered: ${rule.name}`,
                        description: `Metric ${obs.metric} (${obs.value}) evaluated true for ${rule.operator} ${JSON.stringify(rule.value)}`,
                        evidence: [{
                            source: obs.source,
                            metric: obs.metric,
                            value: obs.value,
                            threshold: rule.value,
                            timestamp: obs.timestamp
                        }]
                    });
                } else {
                    // Check if an active alert for this rule & system is now recovering
                    const activeAlert = activeAlertsMap.get(fingerprint);
                    if (activeAlert) {
                        recovered.push({
                            alert: activeAlert,
                            rule,
                            observation: obs,
                            recoveryEvidence: {
                                metric: obs.metric,
                                value: obs.value,
                                timestamp: obs.timestamp,
                                reason: 'Condition no longer matches alert rule threshold'
                            }
                        });
                    }
                }
            }
        }

        return { triggered, recovered };
    }
}

module.exports = AlertEvaluator;
