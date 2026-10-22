/**
 * Assertion Engine
 * Generic, secure assertion processor for evaluating system execution outputs against test rules.
 * ZERO dynamic code execution (eval/Function). Safe property path resolution.
 */

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

class AssertionEngine {
    /**
     * Safely resolve nested property path without prototype pollution or dynamic code evaluation.
     * @param {Object} obj 
     * @param {string} path - e.g. "data.user.profile.status" or "status"
     * @returns {*} Resolved value or undefined
     */
    static resolvePath(obj, path) {
        if (!obj || typeof obj !== 'object' || !path || typeof path !== 'string') {
            return undefined;
        }

        const keys = path.split('.').map(k => k.trim());
        let current = obj;

        for (const key of keys) {
            if (!key || FORBIDDEN_KEYS.has(key)) {
                return undefined;
            }
            if (current === null || current === undefined || typeof current !== 'object') {
                return undefined;
            }
            current = current[key];
        }

        return current;
    }

    /**
     * Evaluate a single assertion definition against execution result payload.
     * @param {Object} assertionDef - { type, path, expected, assertionId }
     * @param {Object} resultPayload - Standardized execution result from ResponseNormalizer
     * @returns {Object} Structured assertion result
     */
    static evaluateAssertion(assertionDef = {}, resultPayload = {}) {
        const type = assertionDef.type || 'statusEquals';
        const assertionId = assertionDef.assertionId || `assert_${Math.random().toString(36).substring(2, 8)}`;
        const path = assertionDef.path || (type.startsWith('status') ? 'status' : 'data');
        const expected = assertionDef.expected;

        const actual = path === 'status' ? resultPayload.status :
                       path === 'durationMs' ? resultPayload.durationMs :
                       this.resolvePath(resultPayload, path);

        let passed = false;
        let message = '';

        switch (type) {
            case 'statusEquals':
                passed = (resultPayload.status === Number(expected));
                message = passed
                    ? `Status ${resultPayload.status} equals expected ${expected}`
                    : `Expected status ${expected} but received ${resultPayload.status}`;
                break;

            case 'statusIn':
                const allowed = Array.isArray(expected) ? expected.map(Number) : [];
                passed = allowed.includes(resultPayload.status);
                message = passed
                    ? `Status ${resultPayload.status} is within allowed set [${allowed.join(', ')}]`
                    : `Status ${resultPayload.status} is not in allowed set [${allowed.join(', ')}]`;
                break;

            case 'fieldExists':
                passed = (actual !== undefined && actual !== null);
                message = passed
                    ? `Field '${path}' exists`
                    : `Field '${path}' is missing or null`;
                break;

            case 'fieldNotExists':
                passed = (actual === undefined || actual === null);
                message = passed
                    ? `Field '${path}' does not exist as expected`
                    : `Field '${path}' unexpectedly exists`;
                break;

            case 'fieldEquals':
                passed = (JSON.stringify(actual) === JSON.stringify(expected));
                message = passed
                    ? `Field '${path}' equals expected value`
                    : `Field '${path}' expected '${JSON.stringify(expected)}' but got '${JSON.stringify(actual)}'`;
                break;

            case 'fieldContains':
                if (typeof actual === 'string') {
                    passed = actual.includes(String(expected));
                } else if (Array.isArray(actual)) {
                    passed = actual.some(item => JSON.stringify(item) === JSON.stringify(expected) || item === expected);
                } else {
                    passed = false;
                }
                message = passed
                    ? `Field '${path}' contains expected value`
                    : `Field '${path}' does not contain '${JSON.stringify(expected)}'`;
                break;

            case 'fieldMatches':
                try {
                    const regex = new RegExp(String(expected));
                    passed = typeof actual === 'string' && regex.test(actual);
                    message = passed
                        ? `Field '${path}' matches regex pattern '${expected}'`
                        : `Field '${path}' does not match pattern '${expected}'`;
                } catch (e) {
                    passed = false;
                    message = `Invalid regex pattern '${expected}'`;
                }
                break;

            case 'fieldType':
                const targetType = String(expected).toLowerCase();
                if (targetType === 'array') {
                    passed = Array.isArray(actual);
                } else {
                    passed = (typeof actual === targetType);
                }
                message = passed
                    ? `Field '${path}' type is '${targetType}'`
                    : `Field '${path}' expected type '${targetType}' but got '${typeof actual}'`;
                break;

            case 'greaterThan':
                passed = (typeof actual === 'number' && actual > Number(expected));
                message = passed
                    ? `Field '${path}' (${actual}) is greater than ${expected}`
                    : `Field '${path}' (${actual}) is not greater than ${expected}`;
                break;

            case 'lessThan':
                passed = (typeof actual === 'number' && actual < Number(expected));
                message = passed
                    ? `Field '${path}' (${actual}) is less than ${expected}`
                    : `Field '${path}' (${actual}) is not less than ${expected}`;
                break;

            case 'inRange':
                const min = expected ? Number(expected.min) : 0;
                const max = expected ? Number(expected.max) : Infinity;
                passed = (typeof actual === 'number' && actual >= min && actual <= max);
                message = passed
                    ? `Field '${path}' (${actual}) is within range [${min}, ${max}]`
                    : `Field '${path}' (${actual}) is outside range [${min}, ${max}]`;
                break;

            case 'arrayLength':
                passed = (Array.isArray(actual) && actual.length === Number(expected));
                message = passed
                    ? `Array '${path}' length is ${expected}`
                    : `Array '${path}' expected length ${expected} but got ${Array.isArray(actual) ? actual.length : 'non-array'}`;
                break;

            case 'responseTimeBelow':
                const duration = Number(resultPayload.durationMs) || 0;
                passed = (duration <= Number(expected));
                message = passed
                    ? `Response time ${duration}ms is below threshold ${expected}ms`
                    : `Response time ${duration}ms exceeded threshold ${expected}ms`;
                break;

            case 'jsonSchema':
                passed = this.validateJsonSchema(actual, expected);
                message = passed
                    ? `Field '${path}' matches JSON schema`
                    : `Field '${path}' failed JSON schema validation`;
                break;

            default:
                passed = false;
                message = `Unknown assertion type '${type}'`;
                break;
        }

        return {
            assertionId,
            type,
            path,
            expected,
            actual: actual !== undefined ? actual : null,
            status: passed ? 'PASS' : 'FAIL',
            message
        };
    }

    /**
     * Basic structural JSON schema check without unsafe code execution.
     */
    static validateJsonSchema(actual, schema) {
        if (!schema || typeof schema !== 'object') return true;
        if (!actual || typeof actual !== 'object') return false;

        if (schema.required && Array.isArray(schema.required)) {
            for (const reqKey of schema.required) {
                if (actual[reqKey] === undefined || actual[reqKey] === null) {
                    return false;
                }
            }
        }

        if (schema.properties && typeof schema.properties === 'object') {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (actual[key] !== undefined) {
                    if (propSchema.type && typeof actual[key] !== propSchema.type && !(propSchema.type === 'array' && Array.isArray(actual[key]))) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    /**
     * Evaluate all assertions against a result payload.
     * @param {Array<Object>} assertionsList 
     * @param {Object} resultPayload 
     * @returns {Object} { allPassed: boolean, assertionResults: Array }
     */
    static evaluateAll(assertionsList = [], resultPayload = {}) {
        if (!Array.isArray(assertionsList) || assertionsList.length === 0) {
            // Default implicit assertion: status 200 OK
            const defaultAssert = this.evaluateAssertion({ type: 'statusEquals', expected: 200 }, resultPayload);
            return {
                allPassed: defaultAssert.status === 'PASS',
                assertionResults: [defaultAssert]
            };
        }

        const assertionResults = assertionsList.map(assertDef => this.evaluateAssertion(assertDef, resultPayload));
        const allPassed = assertionResults.every(res => res.status === 'PASS');

        return {
            allPassed,
            assertionResults
        };
    }
}

module.exports = {
    AssertionEngine
};
