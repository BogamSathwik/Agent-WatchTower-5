const BaseRule = require('./BaseRule');

/**
 * Rule 8: Observation of Results (Core)
 * The agent must observe its actions, evaluate feedback, inspect responses, or monitor health.
 */
class Rule8ObservationResults extends BaseRule {
    constructor() {
        super({
            id: 'observation_results',
            ruleNumber: 8,
            name: 'Observation of Results',
            category: 'Core',
            weight: 12,
            importance: 'CORE',
            description: 'Agent observes output, inspects responses, and evaluates feedback after action.',
            remediation: 'Include observation hooks, response validation, health checks, or telemetry feedback listeners.'
        });
    }

    /**
     * @override
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        const explicit = this.checkExplicitCompliance(contract);
        if (explicit) return explicit;

        // Check for runtime health degradation or inconclusive health status
        const rHealth = runtimeContext && (runtimeContext.health || (runtimeContext.status ? runtimeContext : null));
        if (rHealth) {
            const hs = String(rHealth.status || rHealth.healthStatus || '').toUpperCase();
            if (hs === 'UNKNOWN' || hs === 'INDETERMINATE' || hs === 'UNPROBED' || hs === 'PENDING') {
                return {
                    followed: false,
                    status: 'UNKNOWN',
                    evidence: `Insufficient evidence: runtime health observation status is inconclusive (${hs})`
                };
            }
            if (hs === 'OFFLINE' || hs === 'UNHEALTHY') {
                return {
                    followed: false,
                    status: 'FAIL',
                    evidence: `Runtime health probe failed (${hs}): ${rHealth.reason || 'Agent is unreachable or failing observation probes'}`
                };
            }
        }

        if (contract.observation === false) {
            return {
                followed: false,
                status: 'FAIL',
                evidence: 'Feedback observation and result inspection explicitly disabled'
            };
        }

        if (contract.unprobed === true && !contract.connection?.healthEndpoint && !contract.monitoring && !codeText) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: cannot verify feedback observation without telemetry on unprobed candidate'
            };
        }

        if (contract.connection && contract.connection.healthEndpoint) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Dedicated observation health endpoint configured: ${contract.connection.healthEndpoint}`
            };
        }

        if (contract.monitoring && contract.monitoring.qualityTestingEnabled) {
            return {
                followed: true,
                status: 'PASS',
                evidence: 'Continuous quality observation & automated evaluation testing enabled.'
            };
        }

        const haystack = this.extractHaystack(contract, codeText);
        if (/observe|observation|feedback|telemetry|result|validate|verify|inspect|healthcheck|monitor|res\.json|response\.status|assert/i.test(haystack)) {
            return {
                followed: true,
                status: 'PASS',
                evidence: 'Response evaluation, telemetry observation, or result validation logic present.'
            };
        }

        return {
            followed: false,
            status: 'FAIL',
            evidence: 'No feedback observation listeners, health telemetry, or response inspection configured.'
        };
    }
}

module.exports = Rule8ObservationResults;
