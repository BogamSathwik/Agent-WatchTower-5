const BaseRule = require('./BaseRule');

/**
 * ConfigurableRule
 * Declarative, adaptable rule implementation that can be created, updated,
 * or serialized from plain JSON / configuration objects without subclassing.
 */
class ConfigurableRule extends BaseRule {
    /**
     * @param {Object} options
     * @param {string} options.id - Unique rule ID (e.g., 'security_sandbox')
     * @param {number} [options.ruleNumber] - Rule number (1, 2, ...)
     * @param {string} options.name - Human-readable rule title
     * @param {string} [options.category='Custom'] - Category label
     * @param {number} [options.weight=10] - Rule score weight
     * @param {'CORE'|'USUALLY'|'STRONGLY_CHARACTERISTIC'} [options.importance='CORE'] - Importance tier
     * @param {string} [options.description=''] - Rule description
     * @param {string} [options.remediation=''] - Actionable fix instructions
     * @param {string[]} [options.keywords=[]] - Code/contract keywords that satisfy this rule
     * @param {string[]} [options.requiredFields=[]] - Fields in agent contract that satisfy this rule
     * @param {Function} [options.evaluate] - Optional custom evaluation function (contract, codeText, runtimeContext)
     */
    constructor(options = {}) {
        super(options);
        this.keywords = Array.isArray(options.keywords) ? [...options.keywords] : [];
        this.requiredFields = Array.isArray(options.requiredFields) ? [...options.requiredFields] : [];
        this.customEvaluate = typeof options.evaluate === 'function' ? options.evaluate : null;
    }

    /**
     * Evaluates candidate against this rule.
     * @override
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        // 1. Check explicit contract compliance checklist or unverified flags
        const explicit = this.checkExplicitCompliance(contract);
        if (explicit) return explicit;

        // 2. If a custom evaluation function was supplied, delegate to it
        if (this.customEvaluate) {
            return this.customEvaluate(contract, codeText, runtimeContext, this);
        }

        // 3. Check for presence of required contract fields
        for (const field of this.requiredFields) {
            const val = contract[field];
            if (this.isIndeterminateValue(val)) {
                return {
                    followed: false,
                    status: 'UNKNOWN',
                    evidence: `Insufficient evidence: '${field}' is declared as indeterminate (${val})`
                };
            }
            if (val !== undefined && val !== null && val !== false && val !== '') {
                return {
                    followed: true,
                    status: 'PASS',
                    evidence: `Verified via '${field}': ${typeof val === 'object' ? JSON.stringify(val).slice(0, 80) : String(val)}`
                };
            }
        }

        // 4. Check for keyword matches in contract metadata or codeText
        if (this.keywords.length > 0) {
            const haystack = this.extractHaystack(contract, codeText);
            const matches = this.findMatches(haystack, this.keywords);
            if (matches.length > 0) {
                return {
                    followed: true,
                    status: 'PASS',
                    evidence: `Matched keywords: ${matches.slice(0, 4).join(', ')}`
                };
            }
        }

        // 5. If unprobed and insufficient evidence
        if (contract.unprobed === true && !codeText) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: `Insufficient evidence: remote candidate unverified for ${this.name}`
            };
        }

        // 6. Default to FAIL with remediation advice
        return {
            followed: false,
            status: 'FAIL',
            evidence: `Requirement for ${this.name} not satisfied.`,
            remediation: this.remediation || `Ensure the agent satisfies ${this.name}.`
        };
    }

    /**
     * Updates this rule configuration dynamically.
     * @param {Object} updates
     */
    update(updates = {}) {
        if (updates.name !== undefined) this.name = updates.name;
        if (updates.category !== undefined) this.category = updates.category;
        if (updates.weight !== undefined) this.weight = Number(updates.weight);
        if (updates.importance !== undefined) this.importance = updates.importance;
        if (updates.description !== undefined) this.description = updates.description;
        if (updates.remediation !== undefined) this.remediation = updates.remediation;
        if (Array.isArray(updates.keywords)) this.keywords = [...updates.keywords];
        if (Array.isArray(updates.requiredFields)) this.requiredFields = [...updates.requiredFields];
        if (typeof updates.evaluate === 'function') this.customEvaluate = updates.evaluate;
    }

    /**
     * Serializes rule including configurable keywords and fields.
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            keywords: this.keywords,
            requiredFields: this.requiredFields,
            isConfigurable: true
        };
    }
}

module.exports = ConfigurableRule;
