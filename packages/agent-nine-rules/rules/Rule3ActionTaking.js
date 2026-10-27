const BaseRule = require('./BaseRule');

/**
 * Rule 3: Ability to Take Actions (Core)
 * The agent must be capable of executing actions, mutating state, or calling external APIs.
 */
class Rule3ActionTaking extends BaseRule {
    constructor() {
        super({
            id: 'action_taking',
            ruleNumber: 3,
            name: 'Ability to Take Actions',
            category: 'Core',
            weight: 12,
            importance: 'CORE',
            description: 'Agent can execute operations, mutate state, invoke APIs, or trigger changes.',
            remediation: 'Attach executable endpoints, runner actions, or state mutation operations (e.g., HTTP POST, command execution, or action capabilities).'
        });
    }

    /**
     * @override
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        const explicit = this.checkExplicitCompliance(contract);
        if (explicit) return explicit;

        if (contract.runner === false || contract.actionTaking === false) {
            return {
                followed: false,
                status: 'FAIL',
                evidence: 'Action execution runner explicitly disabled'
            };
        }

        if (this.isIndeterminateValue(contract.endpoint) || this.isIndeterminateValue(contract.runner)) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: action runner endpoint is indeterminate or unverified'
            };
        }

        if (contract.unprobed === true && !contract.endpoint && !contract.runner && !codeText) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: unprobed candidate without action runner or endpoint'
            };
        }

        if (contract.runner && (contract.runner.endpoint || contract.runner.type === 'script_file' || contract.runner.type === 'http')) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Configured executable runner (${contract.runner.type}): ${contract.runner.endpoint || 'local file script'}`
            };
        }

        if (contract.endpoint || (contract.connection && contract.connection.endpoint)) {
            const ep = contract.endpoint || contract.connection.endpoint;
            return {
                followed: true,
                status: 'PASS',
                evidence: `Live action endpoint declared: ${ep}`
            };
        }

        const caps = Array.isArray(contract.capabilities) ? contract.capabilities : [];
        const actionCap = caps.find(c => {
            const ops = Array.isArray(c.operations) ? c.operations : [c.id || c.name || ''];
            return ops.some(op => /action|execute|run|mutate|post|put|trigger|send|write|process|delete/i.test(String(op)));
        });
        if (actionCap) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Action capability registered: ${actionCap.id || actionCap.name}`
            };
        }

        if (codeText && /fetch\(|axios\.|http\.request|post\(|put\(|fs\.write|exec\(|spawn\(|<form|<button|window\.fetch/i.test(codeText)) {
            return {
                followed: true,
                status: 'PASS',
                evidence: 'Action execution methods detected in uploaded script/code.'
            };
        }

        return {
            followed: false,
            status: 'FAIL',
            evidence: 'No executable action endpoint, runner, or state mutation capability attached.'
        };
    }
}

module.exports = Rule3ActionTaking;
