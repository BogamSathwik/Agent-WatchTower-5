/**
 * Remediation Safety Engine
 * Validates SSRF safety, prototype pollution, loop/storm protection, circuit breaker state, and parameters.
 * Reuses existing SsrfProtector and security abstractions.
 */

const { SsrfProtector } = require('../adapter/SsrfProtector');
const { SystemRegistry } = require('../registry/SystemRegistry');

const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

class RemediationSafetyEngine {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.allowLocalhost = Boolean(options.allowLocalhost);
        this.ssrfProtector = options.ssrfProtector || new SsrfProtector({ allowLocalhost: this.allowLocalhost });
        this.recentExecutions = []; // history array for storm & loop protection
        this.consecutiveFailures = new Map(); // systemId -> failure count
        this.activeLocks = new Set(); // actionFingerprint locks
    }

    /**
     * Validate action & payload before execution.
     */
    validateSafety(action, targetSystem, registryOrOptions = {}) {
        let systemObj = targetSystem;
        const registry = (registryOrOptions && typeof registryOrOptions.getSystem === 'function')
            ? registryOrOptions
            : (registryOrOptions && registryOrOptions.systemRegistry ? registryOrOptions.systemRegistry : this.systemRegistry);

        const options = (typeof registryOrOptions === 'object' && registryOrOptions !== null && typeof registryOrOptions.getSystem !== 'function')
            ? registryOrOptions
            : {};

        if (typeof targetSystem === 'string') {
            if (registry && typeof registry.getSystem === 'function') {
                systemObj = registry.getSystem(targetSystem);
            } else {
                systemObj = { id: targetSystem, systemId: targetSystem };
            }
        }

        if (!systemObj) {
            return {
                safe: false,
                reason: 'TARGET_SYSTEM_NOT_FOUND',
                errors: ['Target system not registered or not found']
            };
        }

        const pollution = this._checkPrototypePollution(action);
        if (pollution.hasPollution) {
            return {
                safe: false,
                reason: 'Invalid object prototype / prototype pollution detected',
                errors: pollution.errors
            };
        }

        // SSRF Target Validation on all endpoints
        const endpointsToCheck = [];
        if (systemObj) {
            if (typeof systemObj.endpoints === 'string') endpointsToCheck.push(systemObj.endpoints);
            else if (systemObj.endpoints && typeof systemObj.endpoints === 'object') {
                endpointsToCheck.push(...Object.values(systemObj.endpoints).filter(v => typeof v === 'string'));
            }
            if (systemObj.adapter && systemObj.adapter.connectionConfigRef) {
                endpointsToCheck.push(systemObj.adapter.connectionConfigRef);
            }
            if (systemObj.metadata && systemObj.metadata.url) {
                endpointsToCheck.push(systemObj.metadata.url);
            }
            if (systemObj.url) {
                endpointsToCheck.push(systemObj.url);
            }
        }
        if (action) {
            if (action.targetUrl) endpointsToCheck.push(action.targetUrl);
            if (action.url) endpointsToCheck.push(action.url);
            if (action.parameters && action.parameters.url) endpointsToCheck.push(action.parameters.url);
        }

        const allowLocalhost = (options.allowLocalhost !== undefined) ? Boolean(options.allowLocalhost) : this.allowLocalhost;

        for (const ep of endpointsToCheck) {
            if (ep && typeof ep === 'string' && ep.startsWith('http')) {
                const ssrfCheck = SsrfProtector.validateUrl(ep, { allowLocalhost });
                if (!ssrfCheck.safe) {
                    return {
                        safe: false,
                        reason: 'SSRF_PROTECTION_BLOCKED: Unsafe target URL',
                        errors: [`Remediation endpoint '${ep}' failed SSRF safety validation: ${ssrfCheck.error}`]
                    };
                }
            }
        }

        // Circuit Breaker Check
        const systemId = systemObj.id || systemObj.systemId || (typeof targetSystem === 'string' ? targetSystem : 'unknown-system');
        const failCount = this.consecutiveFailures.get(systemId) || 0;
        const threshold = options.circuitBreakerThreshold || 5;
        if (failCount >= threshold) {
            return {
                safe: false,
                reason: `Circuit breaker OPEN for system '${systemId}' after ${failCount} failures`,
                errors: [`Circuit breaker tripped for system '${systemId}' after ${failCount} consecutive failures`]
            };
        }

        // Storm & Loop Protection Check
        const actionId = action.actionId || action.name || 'action';
        const fingerprint = `${systemId}:${actionId}`;
        const attempts = this.recentExecutions.filter(e => e.fingerprint === fingerprint);

        const cooldownMs = options.cooldownMs || (action && action.cooldownMs) || 0;
        if (cooldownMs > 0) {
            const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
            if (lastAttempt && (Date.now() - lastAttempt.timestamp < cooldownMs)) {
                return {
                    safe: false,
                    reason: `Remediation cooldown active for '${fingerprint}' (${Math.ceil((cooldownMs - (Date.now() - lastAttempt.timestamp)) / 1000)}s remaining)`,
                    errors: [`Cooldown period (${cooldownMs}ms) not elapsed for '${fingerprint}'`]
                };
            }
        }

        const maxAttempts = (action.retryPolicy && action.retryPolicy.maxAttempts) ? action.retryPolicy.maxAttempts : 3;
        if (attempts.length >= maxAttempts) {
            return {
                safe: false,
                reason: `Maximum attempt limit (${maxAttempts}) reached for action '${fingerprint}' (storm protection activated)`,
                errors: [`Execution limit reached for '${fingerprint}'`]
            };
        }

        // Concurrent Execution Lock Check
        if (this.activeLocks.has(fingerprint) || this.activeLocks.has(actionId)) {
            return {
                safe: false,
                reason: `Concurrent execution lock active for '${fingerprint}'`,
                errors: [`Remediation action '${fingerprint}' is currently executing in another process`]
            };
        }

        return {
            safe: true,
            fingerprint,
            errors: []
        };
    }

    acquireLock(actionId, systemId) {
        const lockKey = systemId ? `${systemId}:${actionId}` : actionId;
        if (this.activeLocks.has(lockKey)) return false;
        this.activeLocks.add(lockKey);
        return true;
    }

    releaseLock(actionId, systemId) {
        const lockKey = systemId ? `${systemId}:${actionId}` : actionId;
        this.activeLocks.delete(lockKey);
    }

    recordAttempt(actionId, systemId) {
        const fingerprint = `${systemId}:${actionId}`;
        this.recentExecutions.push({ fingerprint, timestamp: Date.now() });
    }

    recordFailure(systemId) {
        const current = this.consecutiveFailures.get(systemId) || 0;
        this.consecutiveFailures.set(systemId, current + 1);
    }

    recordExecution(fingerprint, success) {
        const systemId = fingerprint.split(':')[0];
        this.recentExecutions.push({ fingerprint, timestamp: Date.now(), success });

        if (this.recentExecutions.length > 1000) {
            this.recentExecutions.shift();
        }

        if (success) {
            this.consecutiveFailures.set(systemId, 0);
        } else {
            const current = this.consecutiveFailures.get(systemId) || 0;
            this.consecutiveFailures.set(systemId, current + 1);
        }
    }

    resetCircuitBreaker(systemId) {
        this.consecutiveFailures.set(systemId, 0);
    }

    _checkPrototypePollution(obj) {
        const errors = [];
        if (!obj || typeof obj !== 'object') return { hasPollution: false, errors };

        const proto = Object.getPrototypeOf(obj);
        if (proto && proto !== Object.prototype && proto !== Array.prototype && proto !== null && typeof obj !== 'function' && !obj.constructor?.name?.includes('Remediation')) {
            errors.push('Forbidden prototype manipulation detected');
        }

        const keys = Object.getOwnPropertyNames(obj);
        for (const k of keys) {
            if (FORBIDDEN_KEYS.includes(k)) {
                errors.push(`Forbidden key '${k}' detected`);
            }
        }
        return { hasPollution: errors.length > 0, errors };
    }
}

module.exports = {
    RemediationSafetyEngine
};
