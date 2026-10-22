/**
 * Universal Correlation Rule Model
 * Data-driven correlation rule definitions for cross-engine observation matching.
 * Purely domain-agnostic.
 */

const crypto = require('crypto');
const { INSIGHT_SEVERITY } = require('./Insight');

class CorrelationRule {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.ruleId = raw.ruleId ? String(raw.ruleId).trim() : `rule_${crypto.randomBytes(8).toString('hex')}`;
        this.name = raw.name ? String(raw.name).trim() : 'Unnamed Correlation Rule';
        this.enabled = raw.enabled !== undefined ? Boolean(raw.enabled) : true;

        this.severity = Object.values(INSIGHT_SEVERITY).includes(raw.severity)
            ? raw.severity
            : INSIGHT_SEVERITY.MEDIUM;

        this.baseConfidence = raw.baseConfidence !== undefined
            ? Number(Math.min(1.0, Math.max(0.0, Number(raw.baseConfidence))).toFixed(2))
            : 0.85;

        this.window = raw.window ? String(raw.window).trim() : '24h';
        this.conditions = Array.isArray(raw.conditions) ? raw.conditions : [];
        this.logic = raw.logic ? String(raw.logic).trim().toUpperCase() : 'AND';

        this.titleTemplate = raw.titleTemplate ? String(raw.titleTemplate).trim() : 'Correlated Observation Detected';
        this.descriptionTemplate = raw.descriptionTemplate ? String(raw.descriptionTemplate).trim() : 'Observations match correlation rule logic.';

        this.createdAt = raw.createdAt || now;
        this.updatedAt = raw.updatedAt || now;
    }

    /**
     * Validate correlation rule payload.
     */
    static validate(raw) {
        const errors = [];

        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                valid: false,
                errors: [{ field: 'root', code: 'INVALID_PAYLOAD', message: 'Correlation rule payload must be a non-null object' }]
            };
        }

        if (!raw.name || typeof raw.name !== 'string' || !raw.name.trim()) {
            errors.push({ field: 'name', code: 'MISSING_REQUIRED_FIELD', message: 'Rule name is required' });
        }

        if (!Array.isArray(raw.conditions) || raw.conditions.length === 0) {
            errors.push({ field: 'conditions', code: 'INVALID_CONDITIONS', message: 'At least one condition object is required' });
        } else {
            raw.conditions.forEach((c, idx) => {
                if (!c || typeof c !== 'object') {
                    errors.push({ field: `conditions[${idx}]`, code: 'INVALID_CONDITION', message: `Condition at index ${idx} must be an object` });
                } else if (!c.source || !c.metric || !c.operator) {
                    errors.push({ field: `conditions[${idx}]`, code: 'MISSING_CONDITION_FIELDS', message: `Condition at index ${idx} requires source, metric, and operator` });
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    toJSON() {
        return {
            ruleId: this.ruleId,
            name: this.name,
            enabled: this.enabled,
            severity: this.severity,
            baseConfidence: this.baseConfidence,
            window: this.window,
            logic: this.logic,
            conditions: this.conditions,
            titleTemplate: this.titleTemplate,
            descriptionTemplate: this.descriptionTemplate,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = {
    CorrelationRule
};
