/**
 * Universal Notification Policy Model
 * Configures notification dispatch parameters: min severity, channels, cooldowns, and retries.
 * Purely domain-agnostic.
 */

const { ALERT_SEVERITY } = require('./Alert');

class NotificationPolicy {
    constructor({
        id = 'default_policy',
        name = 'Default Notification Policy',
        enabled = true,
        minSeverity = ALERT_SEVERITY.INFO,
        channels = ['in_app'],
        cooldownSeconds = 300,
        maxAttempts = 3,
        backoffFactor = 2,
        quietHours = null,
        metadata = {}
    }) {
        this.id = String(id);
        this.name = String(name);
        this.enabled = Boolean(enabled);
        this.minSeverity = Object.values(ALERT_SEVERITY).includes(minSeverity) ? minSeverity : ALERT_SEVERITY.INFO;
        this.channels = Array.isArray(channels) ? channels : ['in_app'];
        this.cooldownSeconds = Math.max(0, Number(cooldownSeconds) || 0);
        this.maxAttempts = Math.max(1, Number(maxAttempts) || 1);
        this.backoffFactor = Math.max(1, Number(backoffFactor) || 2);
        this.quietHours = quietHours || null;
        this.metadata = metadata || {};
    }

    /**
     * Check if alert severity satisfies policy threshold.
     */
    shouldNotify(alertSeverity) {
        if (!this.enabled) return false;

        const severityRank = {
            [ALERT_SEVERITY.INFO]: 1,
            [ALERT_SEVERITY.LOW]: 2,
            [ALERT_SEVERITY.MEDIUM]: 3,
            [ALERT_SEVERITY.HIGH]: 4,
            [ALERT_SEVERITY.CRITICAL]: 5
        };

        const alertRank = severityRank[alertSeverity] || 1;
        const policyMinRank = severityRank[this.minSeverity] || 1;

        return alertRank >= policyMinRank;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            enabled: this.enabled,
            minSeverity: this.minSeverity,
            channels: this.channels,
            cooldownSeconds: this.cooldownSeconds,
            maxAttempts: this.maxAttempts,
            backoffFactor: this.backoffFactor,
            quietHours: this.quietHours,
            metadata: this.metadata
        };
    }
}

module.exports = NotificationPolicy;
