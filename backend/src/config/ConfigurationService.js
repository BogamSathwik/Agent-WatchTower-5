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
                name: process.env.PLATFORM_NAME || 'Universal Monitoring & Intelligence Platform',
                version: process.env.PLATFORM_VERSION || '15.0.0',
                environment: process.env.NODE_ENV || 'development'
            },
            telemetry: {
                enabled: process.env.TELEMETRY_ENABLED !== 'false',
                prometheusEnabled: process.env.PROMETHEUS_ENABLED !== 'false',
                metricsPath: process.env.METRICS_PATH || '/api/v1/telemetry/metrics'
            },
            tenant: {
                mode: process.env.TENANT_MODE || 'SINGLE_AND_MULTI_TENANT',
                defaultTenant: process.env.DEFAULT_TENANT || 'default-tenant'
            },
            audit: {
                enabled: process.env.AUDIT_ENABLED !== 'false',
                retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS, 10) || 30,
                maxRecords: parseInt(process.env.AUDIT_MAX_RECORDS, 10) || 5000
            },
            persistence: {
                mode: process.env.PERSISTENCE_MODE || 'memory',
                autoRestoreOnStartup: process.env.AUTO_RESTORE !== 'false'
            },
            alerting: {
                enabled: process.env.ALERTING_ENABLED !== 'false',
                maxEscalationLevel: parseInt(process.env.MAX_ESCALATION_LEVEL, 10) || 3
            },
            remediation: {
                policyMode: process.env.REMEDIATION_POLICY_MODE || 'APPROVAL_REQUIRED',
                dryRunDefault: process.env.REMEDIATION_DRY_RUN !== 'false'
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
