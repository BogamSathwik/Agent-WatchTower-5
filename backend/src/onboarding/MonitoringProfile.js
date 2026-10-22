/**
 * MonitoringProfile Model
 * Configures enablement and operational parameters across all 7 monitoring dimensions.
 */

class MonitoringProfile {
    constructor(data = {}) {
        const h = data.health || {};
        this.health = {
            enabled: h.enabled !== false,
            intervalMs: typeof h.intervalMs === 'number' ? h.intervalMs : 60000,
            timeoutMs: typeof h.timeoutMs === 'number' ? h.timeoutMs : 10000,
            failureThreshold: typeof h.failureThreshold === 'number' ? h.failureThreshold : 3,
            recoveryThreshold: typeof h.recoveryThreshold === 'number' ? h.recoveryThreshold : 2
        };

        const q = data.quality || {};
        this.quality = { enabled: q.enabled !== false };

        const u = data.usage || {};
        this.usage = { enabled: u.enabled !== false };

        const e = data.experience || {};
        this.experience = { enabled: e.enabled !== false };

        const i = data.intelligence || {};
        this.intelligence = { enabled: i.enabled !== false };

        const a = data.alerting || {};
        this.alerting = { enabled: a.enabled !== false };

        const r = data.reporting || {};
        this.reporting = { enabled: r.enabled !== false };
    }

    validate() {
        const errors = [];
        if (typeof this.health.intervalMs !== 'number' || this.health.intervalMs <= 0) {
            errors.push('health.intervalMs must be a positive number');
        }
        if (typeof this.health.timeoutMs !== 'number' || this.health.timeoutMs <= 0) {
            errors.push('health.timeoutMs must be a positive number');
        }
        if (typeof this.health.failureThreshold !== 'number' || this.health.failureThreshold <= 0) {
            errors.push('health.failureThreshold must be a positive integer');
        }
        if (typeof this.health.recoveryThreshold !== 'number' || this.health.recoveryThreshold <= 0) {
            errors.push('health.recoveryThreshold must be a positive integer');
        }
        return { valid: errors.length === 0, errors };
    }

    toJSON() {
        return {
            health: this.health,
            quality: this.quality,
            usage: this.usage,
            experience: this.experience,
            intelligence: this.intelligence,
            alerting: this.alerting,
            reporting: this.reporting
        };
    }
}

module.exports = MonitoringProfile;
