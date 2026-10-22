/**
 * OnboardingValidator
 * Validates onboarding request parameters, system contract fields, URL security, auth configs, and monitoring profiles.
 */

const ConnectionProfile = require('./ConnectionProfile');
const AuthenticationProfile = require('./AuthenticationProfile');
const MonitoringProfile = require('./MonitoringProfile');
const { ADAPTER_TYPES, AUTH_TYPES } = require('./OnboardingStates');

class OnboardingValidator {
    static validate(payload = {}, options = {}) {
        const errors = [];

        if (!payload || typeof payload !== 'object') {
            return { valid: false, errors: ['Onboarding payload must be an object'] };
        }

        // 1. System ID validation
        if (!payload.id || typeof payload.id !== 'string' || !payload.id.trim()) {
            errors.push('System id is required and must be a non-empty string');
        } else if (!/^[a-zA-Z0-9_-]{2,64}$/.test(payload.id.trim())) {
            errors.push('System id must be 2-64 alphanumeric characters (dashes and underscores allowed)');
        }

        // 2. Name & metadata validation
        if (!payload.name || typeof payload.name !== 'string' || !payload.name.trim()) {
            errors.push('System name is required and must be a non-empty string');
        }

        // 3. Connection profile validation
        const connection = payload.connection instanceof ConnectionProfile ? payload.connection : new ConnectionProfile(payload.connection || { baseUrl: payload.baseUrl, adapterType: payload.adapterType || (payload.adapter ? payload.adapter.adapterType : null) });
        const connRes = connection.validate(options);
        if (!connRes.valid) {
            errors.push(...connRes.errors.map(e => `Connection: ${e}`));
        }

        // 4. Authentication profile validation
        const auth = payload.authentication instanceof AuthenticationProfile ? payload.authentication : new AuthenticationProfile(payload.authentication || payload.authRef || {});
        const authRes = auth.validate();
        if (!authRes.valid) {
            errors.push(...authRes.errors.map(e => `Authentication: ${e}`));
        }

        // 5. Monitoring profile validation
        if (payload.monitoring) {
            const monitoring = payload.monitoring instanceof MonitoringProfile ? payload.monitoring : new MonitoringProfile(payload.monitoring);
            const monRes = monitoring.validate();
            if (!monRes.valid) {
                errors.push(...monRes.errors.map(e => `Monitoring: ${e}`));
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = OnboardingValidator;
