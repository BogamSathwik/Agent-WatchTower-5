/**
 * Phase 14 — Safe Event Condition Evaluator
 * Evaluates rule conditions against normalized event properties and payloads strictly without dynamic code evaluation.
 */

const { CONDITION_OPERATORS } = require('./EventStates');

class EventCondition {
    constructor(data = {}) {
        this.field = data.field || 'eventType'; // e.g. 'severity', 'category', 'payload.status', 'systemId'
        this.operator = data.operator || CONDITION_OPERATORS.EQUALS;
        this.value = data.value !== undefined ? data.value : null;
    }

    static resolveValue(obj, fieldPath) {
        if (!obj || typeof obj !== 'object' || !fieldPath) return undefined;
        const parts = fieldPath.split('.');
        let curr = obj;
        for (const part of parts) {
            if (curr === null || curr === undefined || typeof curr !== 'object') return undefined;
            if (part === '__proto__' || part === 'constructor' || part === 'prototype') return undefined;
            curr = curr[part];
        }
        return curr;
    }

    evaluate(event) {
        if (!event || typeof event !== 'object') return false;

        const actualValue = EventCondition.resolveValue(event, this.field);
        const expectedValue = this.value;

        switch (this.operator) {
            case CONDITION_OPERATORS.EQUALS:
                return String(actualValue).toLowerCase() === String(expectedValue).toLowerCase();

            case CONDITION_OPERATORS.NOT_EQUALS:
                return String(actualValue).toLowerCase() !== String(expectedValue).toLowerCase();

            case CONDITION_OPERATORS.GREATER_THAN:
                return Number(actualValue) > Number(expectedValue);

            case CONDITION_OPERATORS.LESS_THAN:
                return Number(actualValue) < Number(expectedValue);

            case CONDITION_OPERATORS.GREATER_THAN_OR_EQUAL:
                return Number(actualValue) >= Number(expectedValue);

            case CONDITION_OPERATORS.LESS_THAN_OR_EQUAL:
                return Number(actualValue) <= Number(expectedValue);

            case CONDITION_OPERATORS.CONTAINS:
                if (Array.isArray(actualValue)) {
                    return actualValue.includes(expectedValue);
                }
                if (typeof actualValue === 'string') {
                    return actualValue.toLowerCase().includes(String(expectedValue).toLowerCase());
                }
                return false;

            case CONDITION_OPERATORS.EXISTS:
                return actualValue !== undefined && actualValue !== null;

            case CONDITION_OPERATORS.MATCHES:
                try {
                    const regex = new RegExp(expectedValue, 'i');
                    return regex.test(String(actualValue));
                } catch (e) {
                    return false;
                }

            default:
                return false;
        }
    }

    toJSON() {
        return {
            field: this.field,
            operator: this.operator,
            value: this.value
        };
    }
}

module.exports = EventCondition;
