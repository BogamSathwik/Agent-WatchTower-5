/**
 * AuthenticationProfile Model
 * Generic authentication abstraction with strict credential sanitization.
 */

const { AUTH_TYPES } = require('./OnboardingStates');

class AuthenticationProfile {
    constructor(data = {}) {
        this.authType = data.authType || data.type || AUTH_TYPES.NONE;
        this.keyName = data.keyName || 'X-API-Key';
        this.secretKey = data.secretKey || data.token || data.apiKey || null;
        this.token = data.token || data.secretKey || null;
        this.username = data.username || null;
        this.password = data.password || null;
        this.customHeaders = data.customHeaders && typeof data.customHeaders === 'object' ? data.customHeaders : {};
    }

    validate() {
        const errors = [];
        const validTypes = Object.values(AUTH_TYPES);
        if (!validTypes.includes(this.authType)) {
            errors.push(`Invalid authType '${this.authType}'. Allowed: ${validTypes.join(', ')}`);
        }

        if (this.authType === AUTH_TYPES.API_KEY && !this.secretKey && !this.token) {
            errors.push('apiKey authType requires secretKey or token');
        }
        if (this.authType === AUTH_TYPES.BEARER && !this.token && !this.secretKey) {
            errors.push('bearer authType requires token');
        }
        if (this.authType === AUTH_TYPES.BASIC && (!this.username || !this.password)) {
            errors.push('basic authType requires username and password');
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Return a sanitized copy with all credentials redacted.
     */
    sanitize() {
        return {
            authType: this.authType,
            keyName: this.keyName,
            secretKey: this.secretKey ? '[REDACTED]' : null,
            token: this.token ? '[REDACTED]' : null,
            username: this.username || null,
            password: this.password ? '[REDACTED]' : null,
            hasCredentials: Boolean(this.secretKey || this.token || this.password)
        };
    }

    toJSON() {
        return this.sanitize();
    }
}

module.exports = AuthenticationProfile;
