/**
 * Phase 25 — Safe Automation Condition Evaluator
 * Evaluates policy conditions against events, metrics, and agent states without dynamic code evaluation.
 * Strictly enforces prototype pollution protection and an allowlisted operator set.
 */

const ALLOWED_OPERATORS = Object.freeze([
    'equals', 'eq', '==',
    'notEquals', 'neq', '!=',
    'greaterThan', 'gt', '>',
    'greaterThanOrEqual', 'gte', '>=',
    'lessThan', 'lt', '<',
    'lessThanOrEqual', 'lte', '<=',
    'contains', 'includes',
    'notContains',
    'in',
    'notIn',
    'exists', 'isPresent',
    'matches'
]);

class AutomationConditionEvaluator {
    /**
     * Safely resolve nested property values from an object.
     * Prevents prototype pollution.
     */
    static resolvePath(obj, path) {
        if (!obj || typeof obj !== 'object' || !path) return undefined;
        const parts = String(path).split('.');
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined || typeof current !== 'object') return undefined;
            if (part === '__proto__' || part === 'constructor' || part === 'prototype') return undefined;
            current = current[part];
        }
        return current;
    }

    /**
     * Evaluate a single condition against context data.
     * @param {Object} condition { field, operator, value }
     * @param {Object} context 
     * @returns {boolean}
     */
    static evaluateSingle(condition, context = {}) {
        if (!condition || typeof condition !== 'object') return true;
        const { field, operator, value: expectedValue } = condition;
        if (!field) return true;

        const actualValue = this.resolvePath(context, field);

        const op = String(operator || 'equals').toLowerCase();

        switch (op) {
            case 'equals':
            case 'eq':
            case '==':
                return String(actualValue).toLowerCase() === String(expectedValue).toLowerCase();

            case 'notequals':
            case 'neq':
            case '!=':
                return String(actualValue).toLowerCase() !== String(expectedValue).toLowerCase();

            case 'greaterthan':
            case 'gt':
            case '>':
                return Number(actualValue) > Number(expectedValue);

            case 'greaterthanorequal':
            case 'gte':
            case '>=':
                return Number(actualValue) >= Number(expectedValue);

            case 'lessthan':
            case 'lt':
            case '<':
                return Number(actualValue) < Number(expectedValue);

            case 'lessthanorequal':
            case 'lte':
            case '<=':
                return Number(actualValue) <= Number(expectedValue);

            case 'contains':
            case 'includes':
                if (Array.isArray(actualValue)) {
                    return actualValue.some(item => String(item).toLowerCase() === String(expectedValue).toLowerCase());
                }
                if (typeof actualValue === 'string') {
                    return actualValue.toLowerCase().includes(String(expectedValue).toLowerCase());
                }
                return false;

            case 'notcontains':
                return !this.evaluateSingle({ field, operator: 'contains', value: expectedValue }, context);

            case 'in':
                if (Array.isArray(expectedValue)) {
                    return expectedValue.some(item => String(item).toLowerCase() === String(actualValue).toLowerCase());
                }
                return false;

            case 'notin':
                return !this.evaluateSingle({ field, operator: 'in', value: expectedValue }, context);

            case 'exists':
            case 'ispresent':
                return actualValue !== undefined && actualValue !== null && actualValue !== '';

            case 'matches':
                try {
                    const regex = new RegExp(expectedValue, 'i');
                    return regex.test(String(actualValue));
                } catch (_) {
                    return false;
                }

            default:
                return false;
        }
    }

    /**
     * Evaluate a group of conditions (with AND/OR logic).
     * @param {Array|Object} conditionGroup Array of conditions OR object { logicalOperator: 'AND'|'OR', conditions: [...] }
     * @param {Object} context 
     * @returns {boolean}
     */
    static evaluateGroup(conditionGroup, context = {}) {
        if (!conditionGroup) return true;

        if (Array.isArray(conditionGroup)) {
            if (conditionGroup.length === 0) return true;
            // Default array is AND
            return conditionGroup.every(cond => this.evaluateSingle(cond, context));
        }

        if (typeof conditionGroup === 'object') {
            const logicalOp = String(conditionGroup.logicalOperator || conditionGroup.logic || 'AND').toUpperCase();
            const conditions = Array.isArray(conditionGroup.conditions) ? conditionGroup.conditions : [];

            if (conditions.length === 0) return true;

            if (logicalOp === 'OR') {
                return conditions.some(cond => {
                    if (cond.conditions || cond.logicalOperator) {
                        return this.evaluateGroup(cond, context);
                    }
                    return this.evaluateSingle(cond, context);
                });
            } else {
                // AND
                return conditions.every(cond => {
                    if (cond.conditions || cond.logicalOperator) {
                        return this.evaluateGroup(cond, context);
                    }
                    return this.evaluateSingle(cond, context);
                });
            }
        }

        return true;
    }
}

module.exports = { AutomationConditionEvaluator, ALLOWED_OPERATORS };
