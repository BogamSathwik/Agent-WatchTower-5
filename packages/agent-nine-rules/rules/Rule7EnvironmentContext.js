const BaseRule = require('./BaseRule');

/**
 * Rule 7: Environment / Context (Core)
 * The agent must perceive environment variables, state, session context, or memory.
 */
class Rule7EnvironmentContext extends BaseRule {
    constructor() {
        super({
            id: 'environment_context',
            ruleNumber: 7,
            name: 'Environment / Context',
            category: 'Core',
            weight: 10,
            importance: 'CORE',
            description: 'Agent ingests environment perception, context variables, conversation history, or state.',
            remediation: 'Configure environment variables, memory state, system prompt context, or connection profiles.'
        });
    }

    /**
     * @override
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        const explicit = this.checkExplicitCompliance(contract);
        if (explicit) return explicit;

        if (this.isIndeterminateValue(contract.environment) || this.isIndeterminateValue(contract.tenantId)) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: environment/context profile is marked unknown or unverified'
            };
        }

        if (contract.stateless === true || contract.environment === false) {
            return {
                followed: false,
                status: 'FAIL',
                evidence: 'Agent is explicitly declared completely stateless with zero environment ingestion'
            };
        }

        if (contract.unprobed === true && !contract.connection && !contract.environment && !contract.authentication && !contract.tenantId && !codeText) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: cannot verify environment perception on unprobed candidate'
            };
        }

        if (contract.connection || contract.authentication || contract.environment || contract.tenantId) {
            return {
                followed: true,
                status: 'PASS',
                evidence: 'Environment connection and authentication configuration profile established.'
            };
        }

        const haystack = this.extractHaystack(contract, codeText);
        if (/context|environment|process\.env|localstorage|session|state|memory|history|tenant|profile|workspace|chathistory|messages:\s*\[/i.test(haystack)) {
            return {
                followed: true,
                status: 'PASS',
                evidence: 'State management, environment context, or session memory detected.'
            };
        }

        return {
            followed: false,
            status: 'FAIL',
            evidence: 'No environment variables, context profile, or memory state found.'
        };
    }
}

module.exports = Rule7EnvironmentContext;
