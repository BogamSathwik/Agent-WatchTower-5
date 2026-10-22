/**
 * Universal Correlation Operators Engine
 * Safe, deterministic, non-eval operator evaluation functions for condition matching.
 * Purely domain-agnostic.
 */

const OPERATORS = Object.freeze({
    EQUALS: 'equals',
    NOT_EQUALS: 'notEquals',
    GREATER_THAN: 'greaterThan',
    GREATER_THAN_OR_EQUAL: 'greaterThanOrEqual',
    LESS_THAN: 'lessThan',
    LESS_THAN_OR_EQUAL: 'lessThanOrEqual',
    BETWEEN: 'between',
    IN_RANGE: 'inRange',
    INCREASED_BY: 'increasedBy',
    DECREASED_BY: 'decreasedBy',
    TREND_UP: 'trendUp',
    TREND_DOWN: 'trendDown',
    STABLE: 'stable',
    CHANGED: 'changed',
    EXISTS: 'exists',
    NOT_EXISTS: 'notExists'
});

class CorrelationOperators {

    /**
     * Evaluate single condition against an observation or numeric delta.
     */
    static evaluate(operator, actualValue, targetValue) {
        const op = String(operator).trim();

        switch (op) {
            case OPERATORS.EXISTS:
                return actualValue !== null && actualValue !== undefined;

            case OPERATORS.NOT_EXISTS:
                return actualValue === null || actualValue === undefined;

            case OPERATORS.EQUALS:
                return String(actualValue) === String(targetValue);

            case OPERATORS.NOT_EQUALS:
                return String(actualValue) !== String(targetValue);

            case OPERATORS.GREATER_THAN:
                return Number(actualValue) > Number(targetValue);

            case OPERATORS.GREATER_THAN_OR_EQUAL:
                return Number(actualValue) >= Number(targetValue);

            case OPERATORS.LESS_THAN:
                return Number(actualValue) < Number(targetValue);

            case OPERATORS.LESS_THAN_OR_EQUAL:
                return Number(actualValue) <= Number(targetValue);

            case OPERATORS.BETWEEN:
            case OPERATORS.IN_RANGE:
                if (Array.isArray(targetValue) && targetValue.length >= 2) {
                    const val = Number(actualValue);
                    const min = Math.min(Number(targetValue[0]), Number(targetValue[1]));
                    const max = Math.max(Number(targetValue[0]), Number(targetValue[1]));
                    return val >= min && val <= max;
                }
                return false;

            case OPERATORS.INCREASED_BY:
                if (typeof actualValue === 'object' && actualValue !== null) {
                    const delta = Number(actualValue.changePercent || 0);
                    return delta >= Number(targetValue);
                }
                return false;

            case OPERATORS.DECREASED_BY:
                if (typeof actualValue === 'object' && actualValue !== null) {
                    const delta = Number(actualValue.changePercent || 0);
                    return delta <= -Math.abs(Number(targetValue));
                }
                return false;

            case OPERATORS.TREND_UP:
                return String(actualValue).toUpperCase() === 'INCREASING';

            case OPERATORS.TREND_DOWN:
                return String(actualValue).toUpperCase() === 'DECREASING';

            case OPERATORS.STABLE:
                return String(actualValue).toUpperCase() === 'STABLE';

            case OPERATORS.CHANGED:
                if (typeof actualValue === 'object' && actualValue !== null) {
                    return actualValue.before !== actualValue.after;
                }
                return false;

            default:
                return false;
        }
    }

    /**
     * Combine multiple evaluation results logically (AND, OR, NOT).
     */
    static combine(results = [], logic = 'AND') {
        if (results.length === 0) return false;

        const mode = String(logic).toUpperCase();

        if (mode === 'OR') {
            return results.some(r => Boolean(r));
        }

        if (mode === 'NOT') {
            return !results.every(r => Boolean(r));
        }

        // Default AND logic
        return results.every(r => Boolean(r));
    }
}

module.exports = {
    OPERATORS,
    CorrelationOperators
};
