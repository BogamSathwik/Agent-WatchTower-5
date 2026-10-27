const BaseRule = require('./BaseRule');

/**
 * Rule 1: Goal / Objective (Core)
 * The agent must have an explicit mission, purpose, goal, or intended objective.
 */
class Rule1GoalObjective extends BaseRule {
    constructor() {
        super({
            id: 'goal_objective',
            ruleNumber: 1,
            name: 'Goal / Objective',
            category: 'Core',
            weight: 15,
            importance: 'CORE',
            description: 'Agent defines an explicit goal, objective, or intended outcome.',
            remediation: 'Provide a clear, descriptive purpose or goal explaining what task this agent accomplishes (minimum 10 characters).'
        });
    }

    /**
     * @override
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        const explicit = this.checkExplicitCompliance(contract);
        if (explicit) return explicit;

        const goalVal = contract.purpose || (contract.metadata && (contract.metadata.goal || contract.metadata.objective)) || contract.description;
        if (this.isIndeterminateValue(goalVal)) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: `Insufficient evidence: goal/purpose specification is marked as "${goalVal}"`
            };
        }

        if (contract.unprobed === true && !contract.purpose && !contract.description && !codeText) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: unprobed candidate with no purpose metadata or source code'
            };
        }

        const textParts = [
            contract.purpose,
            contract.description,
            (contract.metadata && contract.metadata.goal),
            (contract.metadata && contract.metadata.objective),
            contract.name
        ].filter(Boolean).map(s => String(s).trim());

        const combinedText = textParts.join(' ').trim();
        if (combinedText.length >= 10) {
            const preview = combinedText.slice(0, 65) + (combinedText.length > 65 ? '…' : '');
            return {
                followed: true,
                status: 'PASS',
                evidence: `Explicit goal defined: "${preview}"`
            };
        }

        if (codeText) {
            const goalMatch = codeText.match(/(?:goal|objective|purpose|task|role|mission)[\s:=]+["'`]?([^"'`\r\n]{10,})/i);
            if (goalMatch && goalMatch[1]) {
                const preview = goalMatch[1].trim().slice(0, 60) + (goalMatch[1].trim().length > 60 ? '…' : '');
                return {
                    followed: true,
                    status: 'PASS',
                    evidence: `Goal extracted from source code/comments: "${preview}"`
                };
            }
        }

        return {
            followed: false,
            status: 'FAIL',
            evidence: 'No explicit goal, purpose statement, or task objective declared (minimum 10 chars).'
        };
    }
}

module.exports = Rule1GoalObjective;
