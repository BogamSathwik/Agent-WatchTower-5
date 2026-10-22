/**
 * Contract Validator
 * Validates Universal System Contract payloads against schema and security rules.
 */

const { LIFECYCLE_STATES } = require('../lifecycle/SystemLifecycle');

const ID_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

const STANDARD_PROTO_KEYS = new Set([
    '__proto__', 'constructor', '__defineGetter__', '__defineSetter__', 'hasOwnProperty',
    '__lookupGetter__', '__lookupSetter__', 'isPrototypeOf', 'propertyIsEnumerable',
    'toString', 'valueOf', 'toLocaleString'
]);

class ContractValidator {
    /**
     * Recursively scan object for prototype pollution attempts.
     */
    static hasPrototypePollution(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 10) return false;

        // 1. Check if Object.prototype was mutated by V8 JSON.parse __proto__ injection
        for (const k of Object.getOwnPropertyNames(Object.prototype)) {
            if (!STANDARD_PROTO_KEYS.has(k)) {
                delete Object.prototype[k]; // Clean up global prototype leak
                return true;
            }
        }

        // 2. Check if object prototype was overwritten via __proto__ injection
        const proto = Object.getPrototypeOf(obj);
        if (proto && proto !== Object.prototype && proto !== Array.prototype && proto !== null) {
            return true;
        }

        // 3. Check if forbidden keys exist as OWN properties on obj
        for (const key of FORBIDDEN_KEYS) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                return true;
            }
        }

        // 4. Recursively check child objects
        for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (this.hasPrototypePollution(obj[key], depth + 1)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Validate system registration or update payload.
     * @param {Object} payload 
     * @param {Object} options - { isUpdate: boolean }
     * @returns {Object} { valid: boolean, errors: Array }
     */
    static validate(payload, options = {}) {
        const errors = [];
        const isUpdate = Boolean(options.isUpdate);

        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return {
                valid: false,
                errors: [{
                    field: 'root',
                    code: 'INVALID_PAYLOAD',
                    message: 'Payload must be a non-null JSON object'
                }]
            };
        }

        // Prototype pollution check
        if (this.hasPrototypePollution(payload)) {
            return {
                valid: false,
                errors: [{
                    field: 'root',
                    code: 'SECURITY_VIOLATION',
                    message: 'Forbidden property name detected (prototype pollution attempt)'
                }]
            };
        }

        // 1. ID Validation
        if (!isUpdate || payload.id !== undefined) {
            if (!payload.id) {
                errors.push({
                    field: 'id',
                    code: 'MISSING_REQUIRED_FIELD',
                    message: 'System ID is required'
                });
            } else if (typeof payload.id !== 'string') {
                errors.push({
                    field: 'id',
                    code: 'INVALID_TYPE',
                    message: 'System ID must be a string'
                });
            } else if (!ID_REGEX.test(payload.id.trim())) {
                errors.push({
                    field: 'id',
                    code: 'INVALID_FORMAT',
                    message: 'System ID must contain only alphanumeric characters, hyphens, and underscores (2-64 chars)'
                });
            }
        }

        // 2. Name Validation
        if (!isUpdate || payload.name !== undefined) {
            if (!payload.name) {
                errors.push({
                    field: 'name',
                    code: 'MISSING_REQUIRED_FIELD',
                    message: 'System Name is required'
                });
            } else if (typeof payload.name !== 'string' || !payload.name.trim()) {
                errors.push({
                    field: 'name',
                    code: 'INVALID_TYPE',
                    message: 'System Name must be a non-empty string'
                });
            }
        }

        // 3. Version Validation
        if (!isUpdate || payload.version !== undefined) {
            if (!payload.version) {
                errors.push({
                    field: 'version',
                    code: 'MISSING_REQUIRED_FIELD',
                    message: 'System version is required'
                });
            } else if (typeof payload.version !== 'string' || !SEMVER_REGEX.test(payload.version.trim())) {
                errors.push({
                    field: 'version',
                    code: 'INVALID_FORMAT',
                    message: 'System version must follow semantic versioning format (e.g., 1.0.0)'
                });
            }
        }

        // 4. Contract Version Validation
        if (payload.contractVersion !== undefined && payload.contractVersion !== null) {
            if (typeof payload.contractVersion !== 'string' || !SEMVER_REGEX.test(payload.contractVersion.trim())) {
                errors.push({
                    field: 'contractVersion',
                    code: 'INVALID_FORMAT',
                    message: 'Contract version must follow semantic versioning format (e.g., 1.0.0)'
                });
            }
        }

        // 5. Capabilities Structure Validation
        if (payload.capabilities !== undefined && payload.capabilities !== null) {
            if (!Array.isArray(payload.capabilities) && typeof payload.capabilities !== 'object') {
                errors.push({
                    field: 'capabilities',
                    code: 'INVALID_TYPE',
                    message: 'Capabilities must be an array or object'
                });
            } else if (Array.isArray(payload.capabilities)) {
                payload.capabilities.forEach((cap, idx) => {
                    if (typeof cap !== 'string' && (typeof cap !== 'object' || cap === null)) {
                        errors.push({
                            field: `capabilities[${idx}]`,
                            code: 'INVALID_CAPABILITY',
                            message: 'Capability items must be strings or valid capability objects'
                        });
                    }
                });
            }
        }

        // 6. Adapter Metadata Validation
        if (payload.adapter !== undefined && payload.adapter !== null) {
            if (typeof payload.adapter !== 'object' || Array.isArray(payload.adapter)) {
                errors.push({
                    field: 'adapter',
                    code: 'INVALID_TYPE',
                    message: 'Adapter metadata must be an object'
                });
            } else {
                if (payload.adapter.adapterType && typeof payload.adapter.adapterType !== 'string') {
                    errors.push({
                        field: 'adapter.adapterType',
                        code: 'INVALID_TYPE',
                        message: 'Adapter type must be a string'
                    });
                }
                if (payload.adapter.timeoutConfig && typeof payload.adapter.timeoutConfig !== 'object') {
                    errors.push({
                        field: 'adapter.timeoutConfig',
                        code: 'INVALID_TYPE',
                        message: 'Timeout configuration must be an object'
                    });
                }
            }
        }

        // 7. Lifecycle State Validation
        if (payload.lifecycleState !== undefined && payload.lifecycleState !== null) {
            if (!Object.values(LIFECYCLE_STATES).includes(payload.lifecycleState)) {
                errors.push({
                    field: 'lifecycleState',
                    code: 'INVALID_STATE',
                    message: `Lifecycle state must be one of: ${Object.values(LIFECYCLE_STATES).join(', ')}`
                });
            }
        }

        // 8. Metadata Object Validation
        if (payload.metadata !== undefined && payload.metadata !== null) {
            if (typeof payload.metadata !== 'object' || Array.isArray(payload.metadata)) {
                errors.push({
                    field: 'metadata',
                    code: 'INVALID_TYPE',
                    message: 'Metadata must be a key-value object'
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = {
    ContractValidator
};
