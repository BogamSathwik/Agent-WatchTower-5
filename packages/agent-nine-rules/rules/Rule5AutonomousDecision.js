const BaseRule = require('./BaseRule');

/**
 * Rule 5: Autonomous Decision Making (Core)
 * The agent must evaluate conditions and decide actions dynamically without human-in-the-loop puppeteering.
 */
class Rule5AutonomousDecision extends BaseRule {
    constructor() {
        super({
            id: 'autonomous_decision',
            ruleNumber: 5,
            name: 'Autonomous Decision Making',
            category: 'Core',
            weight: 12,
            importance: 'CORE',
            description: 'Agent evaluates conditions and decides actions without continuous human puppeteering.',
            remediation: 'Provide conditional routing policies, autonomous thresholds, or rule-based decision trees.'
        });
    }

    /**
     * @override
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        const explicit = this.checkExplicitCompliance(contract);
        if (explicit) return explicit;

        if (this.isIndeterminateValue(contract.decisionPolicy) || this.isIndeterminateValue(contract.policy)) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: decision policy is marked as unknown or indeterminate'
            };
        }

        if (contract.autonomous === false || contract.requiresHumanApproval === 'always') {
            return {
                followed: false,
                status: 'FAIL',
                evidence: 'Agent operates under strict manual human-in-the-loop puppeteering without autonomy'
            };
        }

        if (contract.unprobed === true && !contract.category && !contract.decisionPolicy && !contract.policy && !codeText) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: cannot verify autonomous decision policies on unprobed candidate'
            };
        }

        if (contract.category === 'automation' || contract.category === 'autonomous') {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Autonomous operational category declared: ${contract.category}`
            };
        }

        if (contract.decisionPolicy || contract.policy || (contract.metadata && contract.metadata.policy)) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Decision policy / routing rules specified: ${contract.decisionPolicy || contract.policy || 'configured'}`
            };
        }

        const haystack = this.extractHaystack(contract, codeText);
        if (/autonomous|decision|policy|branching|evaluator|classify|routing|rule|arbitration|threshold|heuristic|if\s*\(.*plan|switch\s*\(.*action/i.test(haystack)) {
            return {
                followed: true,
                status: 'PASS',
                evidence: 'Decision policy, routing rule, or autonomous evaluation logic identified.'
            };
        }

        return {
            followed: false,
            status: 'FAIL',
            evidence: 'No autonomous decision rules, classification policies, or branching logic defined.'
        };
    }
}

module.exports = Rule5AutonomousDecision;
