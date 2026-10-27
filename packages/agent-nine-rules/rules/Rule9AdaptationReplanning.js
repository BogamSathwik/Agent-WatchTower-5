const BaseRule = require('./BaseRule');

/**
 * Rule 9: Adaptation / Re-planning (Strongly characteristic)
 * The agent must adapt dynamically, handle retries, fallbacks, or re-plan when facing errors.
 */
class Rule9AdaptationReplanning extends BaseRule {
    constructor() {
        super({
            id: 'adaptation_replanning',
            ruleNumber: 9,
            name: 'Adaptation / Re-planning',
            category: 'Strongly characteristic',
            weight: 10,
            importance: 'STRONGLY_CHARACTERISTIC',
            description: 'Agent dynamically adjusts strategy, retries on failure, or replans when encountering errors.',
            remediation: 'Configure retry policies (connection.retries > 0), error fallbacks, backoff strategies, or adaptive remediation.'
        });
    }

    /**
     * @override
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        const explicit = this.checkExplicitCompliance(contract);
        if (explicit) return explicit;

        const rExec = runtimeContext && runtimeContext.lastExecution;
        if (rExec) {
            if (rExec.retried) {
                return {
                    followed: true,
                    status: 'PASS',
                    evidence: `Runtime adaptation verified: recovered via automated retry policy (${rExec.retryCount || 1} retries)`
                };
            }
            if (rExec.adaptationStatus === 'UNKNOWN' || rExec.recoveryStatus === 'UNKNOWN') {
                return {
                    followed: false,
                    status: 'UNKNOWN',
                    evidence: 'Insufficient evidence: runtime adaptation and recovery telemetry is inconclusive'
                };
            }
        }

        if (contract.connection && contract.connection.retries === 0 || contract.allowRetries === false || contract.retryPolicy === false) {
            return {
                followed: false,
                status: 'FAIL',
                evidence: 'Retry and error adaptation policies are explicitly disabled (retries: 0)'
            };
        }

        if ((contract.connection && this.isIndeterminateValue(contract.connection.retries)) || this.isIndeterminateValue(contract.retryPolicy)) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: retry/adaptation policy is marked unknown or unverified'
            };
        }

        if (contract.unprobed === true && !contract.connection?.retries && !contract.retryPolicy && !codeText) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: cannot verify adaptation and replanning without telemetry on unprobed candidate'
            };
        }

        const hasRetries = contract.connection && Number(contract.connection.retries) > 0;
        if (hasRetries) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Automated retry & adaptation policy enabled (${contract.connection.retries} retries)`
            };
        }

        if (contract.retryPolicy || contract.fallbackPlan || (contract.metadata && contract.metadata.retryPolicy)) {
            return {
                followed: true,
                status: 'PASS',
                evidence: 'Configured retry policy or fallback contingency strategy detected.'
            };
        }

        const haystack = this.extractHaystack(contract, codeText);
        if (/retry|fallback|replan|adapt|recover|self-healing|remediation|backoff|catch\s*\(|exponentialbackoff/i.test(haystack)) {
            return {
                followed: true,
                status: 'PASS',
                evidence: 'Error adaptation, retry mechanism, or fallback re-planning detected.'
            };
        }

        return {
            followed: false,
            status: 'FAIL',
            evidence: 'No retry policy, fallback strategy, or error adaptation logic attached.'
        };
    }
}

module.exports = Rule9AdaptationReplanning;
