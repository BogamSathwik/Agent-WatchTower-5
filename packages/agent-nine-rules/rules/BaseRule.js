/**
 * BaseRule
 * Abstract base class representing a single autonomous agent standard rule.
 */
class BaseRule {
    /**
     * @param {Object} options
     * @param {string} options.id - Unique rule identifier (e.g. 'goal_objective')
     * @param {number} options.ruleNumber - Rule ordinal number (1-9)
     * @param {string} options.name - Human-readable rule title
     * @param {string} options.category - Category classification (e.g. 'Core', 'Usually')
     * @param {number} options.weight - Weight points (e.g. 15)
     * @param {'CORE'|'USUALLY'|'STRONGLY_CHARACTERISTIC'} options.importance - Importance classification
     * @param {string} options.description - Clear explanation of the requirement
     * @param {string} options.remediation - Actionable instructions to fix deficiencies
     */
    constructor(options = {}) {
        this.id = options.id || 'unnamed_rule';
        this.ruleNumber = options.ruleNumber || 0;
        this.name = options.name || 'Unnamed Rule';
        this.category = options.category || 'Core';
        this.weight = typeof options.weight === 'number' ? options.weight : 10;
        this.importance = options.importance || 'CORE';
        this.description = options.description || '';
        this.remediation = options.remediation || '';
    }

    /**
     * Evaluate an agent candidate or code against this rule.
     * @param {Object} contract - Agent specification or payload
     * @param {string} codeText - Combined raw code/source text if available
     * @param {Object} [runtimeContext] - Optional runtime telemetry (health, execs, tools)
     * @returns {{ followed: boolean, evidence: string|null, score?: number }}
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        throw new Error(`Rule ${this.id} must implement evaluate()`);
    }

    /**
     * Helper to concatenate contract and code strings for keyword searching.
     * @param {Object} contract
     * @param {string} [codeText]
     * @returns {string} Lowercased haystack
     */
    extractHaystack(contract = {}, codeText = '') {
        const parts = [
            contract.name,
            contract.description,
            contract.purpose,
            contract.toolsString,
            contract.category,
            contract.model,
            contract.rawCode,
            codeText
        ];
        if (contract.metadata) {
            try {
                parts.push(JSON.stringify(contract.metadata));
            } catch (_) {}
        }
        if (Array.isArray(contract.files)) {
            for (const f of contract.files) {
                if (f) {
                    if (f.name) parts.push(f.name);
                    if (f.path) parts.push(f.path);
                    if (f.content) parts.push(f.content);
                }
            }
        }
        return parts.filter(Boolean).join(' ').toLowerCase();
    }

    /**
     * Checks if any of the given keywords are contained in the haystack.
     * @param {string} haystack
     * @param {string[]} keywords
     * @returns {string[]} Matched keywords
     */
    findMatches(haystack, keywords = []) {
        if (!haystack || !Array.isArray(keywords)) return [];
        return keywords.filter(kw => haystack.includes(kw.toLowerCase()));
    }

    /**
     * Checks if the contract contains explicit compliance checklist or unverified directives.
     * @param {Object} contract
     * @returns {{ followed: boolean, status: 'PASS'|'FAIL'|'UNKNOWN', evidence: string }|null}
     */
    checkExplicitCompliance(contract = {}) {
        if (!contract || typeof contract !== 'object') return null;

        if (contract.compliance && contract.compliance[this.id] !== undefined) {
            const val = contract.compliance[this.id];
            if (val === 'UNKNOWN' || val === null || val === 'indeterminate' || val === 'UNASSESSED' || val === '?') {
                return {
                    followed: false,
                    status: 'UNKNOWN',
                    evidence: `Insufficient evidence: ${this.name} compliance is unverified or indeterminate in checklist`
                };
            }
            if (val === true || val === 'PASS' || val === 'COMPLIANT') {
                return {
                    followed: true,
                    status: 'PASS',
                    evidence: `Explicit declaration from contract compliance checklist: PASS`
                };
            }
            return {
                followed: false,
                status: 'FAIL',
                evidence: `Explicit non-compliance declaration in contract compliance checklist: FAIL`
            };
        }

        if (Array.isArray(contract.unverifiedRules) && (contract.unverifiedRules.includes(this.id) || contract.unverifiedRules.includes(this.ruleNumber))) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: `Insufficient evidence: ${this.name} has not been verified or tested`
            };
        }

        if (Array.isArray(contract.unknownRules) && (contract.unknownRules.includes(this.id) || contract.unknownRules.includes(this.ruleNumber))) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: `Insufficient evidence: evaluation data unavailable for ${this.name}`
            };
        }

        if (contract.evidenceStatus && contract.evidenceStatus[this.id]) {
            const st = String(contract.evidenceStatus[this.id]).toUpperCase();
            if (st === 'UNKNOWN' || st === 'INSUFFICIENT' || st === 'INDETERMINATE') {
                return {
                    followed: false,
                    status: 'UNKNOWN',
                    evidence: `Insufficient evidence: telemetry and inspection data indeterminate for ${this.name}`
                };
            }
        }

        return null;
    }

    /**
     * Checks if a string or value represents an indeterminate, unknown, or TBD specification.
     * @param {*} val
     * @returns {boolean}
     */
    isIndeterminateValue(val) {
        if (val === null || val === undefined) return false;
        if (typeof val === 'string') {
            const s = val.trim().toLowerCase();
            return s === 'unknown' || s === 'tbd' || s === 'indeterminate' || s === 'unverified' || s === 'pending' || s === '?';
        }
        return false;
    }

    /**
     * Returns a JSON-serializable specification of this rule.
     */
    toJSON() {
        return {
            id: this.id,
            ruleNumber: this.ruleNumber,
            name: this.name,
            category: this.category,
            weight: this.weight,
            importance: this.importance,
            description: this.description,
            remediation: this.remediation
        };
    }
}

module.exports = BaseRule;
