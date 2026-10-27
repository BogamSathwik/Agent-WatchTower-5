const BaseRule = require('./BaseRule');

/**
 * Rule 6: Execution / Agent Loop (Core)
 * The agent must run an execution cycle or multi-step loop (e.g. Plan -> Act -> Observe -> Iterate).
 */
class Rule6ExecutionLoop extends BaseRule {
    constructor() {
        super({
            id: 'execution_loop',
            ruleNumber: 6,
            name: 'Execution / Agent Loop',
            category: 'Core',
            weight: 12,
            importance: 'CORE',
            description: 'Agent runs a cognitive or execution loop (e.g. Plan -> Act -> Observe -> Iterate).',
            remediation: 'Define execution steps, recurring polling intervals, or a multi-step agent runtime loop.'
        });
    }

    /**
     * @override
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        const explicit = this.checkExplicitCompliance(contract);
        if (explicit) return explicit;

        if (this.isIndeterminateValue(contract.schedule) || this.isIndeterminateValue(contract.cron) || this.isIndeterminateValue(contract.loopInterval)) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: execution loop schedule is unknown or indeterminate'
            };
        }

        if (contract.loop === false || contract.singleExecution === true) {
            return {
                followed: false,
                status: 'FAIL',
                evidence: 'Agent is configured for one-off single execution without an execution loop'
            };
        }

        if (contract.unprobed === true && !contract.monitoring && !contract.schedule && !contract.cron && !contract.loopInterval && !codeText) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: cannot verify execution loop on unprobed candidate'
            };
        }

        if (contract.monitoring && contract.monitoring.healthCheckIntervalMs > 0) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Scheduled execution loop configured (interval: ${contract.monitoring.healthCheckIntervalMs}ms)`
            };
        }

        if (contract.schedule || contract.cron || contract.loopInterval) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Automated schedule or recurring loop declared: ${contract.schedule || contract.cron || contract.loopInterval}`
            };
        }

        const haystack = this.extractHaystack(contract, codeText);
        if (/loop|cycle|step|iteration|plan|continuous|polling|interval|workflow|while\s*\(|setinterval|for\s*\(const\s*step|do\s*\{/i.test(haystack)) {
            return {
                followed: true,
                status: 'PASS',
                evidence: 'Execution loop / cycle pattern detected in runtime definition or code.'
            };
        }

        return {
            followed: false,
            status: 'FAIL',
            evidence: 'No execution loop, recurring cycle, or multi-step workflow defined.'
        };
    }
}

module.exports = Rule6ExecutionLoop;
