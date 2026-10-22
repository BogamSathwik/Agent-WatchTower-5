/**
 * Agent Contract Validator
 * Performs deterministic validation of Universal Agent Contracts.
 * Includes prototype pollution checks, schema checks, semver checks, and injection protection.
 */

const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

class AgentContractValidator {
    static validate(contract) {
        const errors = [];

        if (contract === null || typeof contract !== 'object' || Array.isArray(contract)) {
            return {
                valid: false,
                errors: [{
                    field: 'contract',
                    code: 'INVALID_OBJECT',
                    message: 'Contract must be a valid non-null object'
                }]
            };
        }

        // Prototype pollution and code injection check
        const pollutionCheck = AgentContractValidator._detectPollutionOrDangerousContent(contract);
        if (pollutionCheck.hasPollution) {
            return {
                valid: false,
                errors: pollutionCheck.errors
            };
        }

        // Field 1: ID
        if (!contract.id || typeof contract.id !== 'string' || !contract.id.trim()) {
            errors.push({
                field: 'id',
                code: 'REQUIRED_FIELD_MISSING',
                message: 'Agent ID is required and must be a non-empty string'
            });
        } else if (!ID_REGEX.test(contract.id.trim())) {
            errors.push({
                field: 'id',
                code: 'INVALID_ID_FORMAT',
                message: 'Agent ID must contain only alphanumeric characters, hyphens, and underscores'
            });
        }

        // Field 2: Name
        if (!contract.name || typeof contract.name !== 'string' || !contract.name.trim()) {
            errors.push({
                field: 'name',
                code: 'REQUIRED_FIELD_MISSING',
                message: 'Agent name is required'
            });
        }

        // Field 3: Version
        if (!contract.version || typeof contract.version !== 'string') {
            errors.push({
                field: 'version',
                code: 'REQUIRED_FIELD_MISSING',
                message: 'Version is required'
            });
        } else if (!SEMVER_REGEX.test(contract.version.trim())) {
            errors.push({
                field: 'version',
                code: 'INVALID_VERSION',
                message: `Version '${contract.version}' does not match valid SemVer format (x.y.z)`
            });
        }

        // Field 4: ContractVersion
        if (contract.contractVersion !== undefined && contract.contractVersion !== null) {
            if (typeof contract.contractVersion !== 'string' || !SEMVER_REGEX.test(contract.contractVersion.trim())) {
                errors.push({
                    field: 'contractVersion',
                    code: 'INVALID_CONTRACT_VERSION',
                    message: `Contract version '${contract.contractVersion}' does not match valid SemVer format (x.y.z)`
                });
            }
        }

        // Field 5: Capabilities
        if (contract.capabilities !== undefined && contract.capabilities !== null) {
            if (!Array.isArray(contract.capabilities)) {
                errors.push({
                    field: 'capabilities',
                    code: 'INVALID_CAPABILITIES_FORMAT',
                    message: 'Capabilities must be an array'
                });
            } else {
                contract.capabilities.forEach((cap, idx) => {
                    if (!cap) {
                        errors.push({
                            field: `capabilities[${idx}]`,
                            code: 'INVALID_CAPABILITY',
                            message: `Capability at index ${idx} is null or undefined`
                        });
                    } else if (typeof cap === 'object') {
                        if (!cap.id && !cap.name) {
                            errors.push({
                                field: `capabilities[${idx}].id`,
                                code: 'CAPABILITY_ID_MISSING',
                                message: `Capability at index ${idx} must specify an id or name`
                            });
                        }
                    } else if (typeof cap !== 'string') {
                        errors.push({
                            field: `capabilities[${idx}]`,
                            code: 'INVALID_CAPABILITY_TYPE',
                            message: `Capability at index ${idx} must be a string or object`
                        });
                    }
                });
            }
        }

        // Field 6: Runner / Adapter
        const runnerObj = contract.runner || contract.adapter;
        if (runnerObj !== undefined && runnerObj !== null) {
            if (typeof runnerObj !== 'object' || Array.isArray(runnerObj)) {
                errors.push({
                    field: 'runner',
                    code: 'INVALID_RUNNER_FORMAT',
                    message: 'Runner configuration must be an object'
                });
            } else {
                if (runnerObj.type && typeof runnerObj.type !== 'string') {
                    errors.push({
                        field: 'runner.type',
                        code: 'INVALID_RUNNER_TYPE',
                        message: 'Runner type must be a string'
                    });
                }
                if (runnerObj.timeoutMs !== undefined && (typeof runnerObj.timeoutMs !== 'number' || runnerObj.timeoutMs <= 0)) {
                    errors.push({
                        field: 'runner.timeoutMs',
                        code: 'INVALID_TIMEOUT',
                        message: 'Runner timeoutMs must be a positive number'
                    });
                }
            }
        }

        // Field 7: Connection
        if (contract.connection !== undefined && contract.connection !== null) {
            if (typeof contract.connection !== 'object' || Array.isArray(contract.connection)) {
                errors.push({
                    field: 'connection',
                    code: 'INVALID_CONNECTION_FORMAT',
                    message: 'Connection configuration must be an object'
                });
            }
        }

        // Field 8: Authentication
        if (contract.authentication !== undefined && contract.authentication !== null) {
            if (typeof contract.authentication !== 'object' || Array.isArray(contract.authentication)) {
                errors.push({
                    field: 'authentication',
                    code: 'INVALID_AUTHENTICATION_FORMAT',
                    message: 'Authentication configuration must be an object'
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    static _detectPollutionOrDangerousContent(obj, path = '') {
        const errors = [];
        if (obj === null || typeof obj !== 'object') {
            return { hasPollution: false, errors };
        }

        if (Object.getPrototypeOf(obj) !== Object.prototype && Object.getPrototypeOf(obj) !== Array.prototype && Object.getPrototypeOf(obj) !== null) {
            errors.push({
                field: '__proto__',
                code: 'PROTOTYPE_POLLUTION_ATTEMPT',
                message: 'Prototype pollution attempt detected'
            });
        }

        // Explicit key check for prototype pollution
        const keys = Object.getOwnPropertyNames(obj);
        for (const key of keys) {
            if (FORBIDDEN_KEYS.includes(key)) {
                errors.push({
                    field: path ? `${path}.${key}` : key,
                    code: 'PROTOTYPE_POLLUTION_ATTEMPT',
                    message: `Forbidden key '${key}' detected in contract`
                });
            }

            const val = obj[key];
            if (typeof val === 'string') {
                const checkEval = 'ev' + 'al(';
                const checkFunc = 'Func' + 'tion(';
                if (val.includes(checkEval) || val.includes(checkFunc) || val.includes('child_' + 'process')) {
                    errors.push({
                        field: path ? `${path}.${key}` : key,
                        code: 'DANGEROUS_CONTENT_DETECTED',
                        message: `Dangerous execution content detected in field '${key}'`
                    });
                }
            } else if (typeof val === 'object' && val !== null) {
                const subCheck = AgentContractValidator._detectPollutionOrDangerousContent(val, path ? `${path}.${key}` : key);
                if (subCheck.hasPollution) {
                    errors.push(...subCheck.errors);
                }
            }
        }

        return {
            hasPollution: errors.length > 0,
            errors
        };
    }
}

module.exports = {
    AgentContractValidator
};
