/**
 * Platform Configuration Service
 * Provides centralized management of non-sensitive configuration settings for platform,
 * telemetry, tenant, audit, persistence, alerting, and remediation categories.
 */

const SENSITIVE_KEYS = ['secret', 'apiKey', 'password', 'token', 'authorization', 'privateKey'];

function redactConfigSecrets(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const copy = JSON.parse(JSON.stringify(obj));

    function clean(target) {
        if (!target || typeof target !== 'object') return;
        for (const key of Object.keys(target)) {
            if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
                target[key] = '[REDACTED]';
            } else if (typeof target[key] === 'object') {
                clean(target[key]);
            }
        }
    }
    clean(copy);
    return copy;
}

class ConfigurationService {
    constructor() {
        this.config = {
            platform: {
                name: 'Universal Monitoring & Intelligence Platform',
                version: '15.0.0',
                environment: process.env.NODE_ENV || 'development'
            },
            telemetry: {
                enabled: true,
                prometheusEnabled: true,
                metricsPath: '/api/v1/telemetry/metrics'
            },
            tenant: {
                mode: 'SINGLE_AND_MULTI_TENANT',
                defaultTenant: 'default-tenant'
            },
            audit: {
                enabled: true,
                retentionDays: 30,
                maxRecords: 5000
            },
            persistence: {
                mode: process.env.PERSISTENCE_MODE || 'memory',
                autoRestoreOnStartup: true
            },
            alerting: {
                enabled: true,
                maxEscalationLevel: 3
            },
            remediation: {
                policyMode: 'APPROVAL_REQUIRED',
                dryRunDefault: true
            }
        };
    }

    getConfig(category = null) {
        if (category && this.config[category]) {
            return redactConfigSecrets(this.config[category]);
        }
        return redactConfigSecrets(this.config);
    }

    updateConfig(category, updates) {
        if (!this.config[category]) {
            const err = new Error(`Configuration category '${category}' does not exist`);
            err.statusCode = 400;
            throw err;
        }

        const redactedUpdates = redactConfigSecrets(updates);
        Object.assign(this.config[category], redactedUpdates);
        return redactConfigSecrets(this.config[category]);
    }
}

const configurationService = new ConfigurationService();

module.exports = {
    ConfigurationService,
    configurationService
};
