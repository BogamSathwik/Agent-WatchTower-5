/**
 * Universal Alert Rule Model
 * Data-driven alert configuration model specifying evaluation conditions, severities, cooldowns, and notification policies.
 * Purely domain-agnostic.
 */

const { ALERT_SEVERITY, ALERT_CATEGORY } = require('./Alert');

class AlertRule {
    constructor({
        id,
        name,
        description = '',
        enabled = true,
        source = 'HEALTH', // HEALTH, QUALITY, USAGE, EXPERIENCE, INTELLIGENCE, SYSTEM
        metric,
        operator = 'equals',
        value,
        targetSystemId = '*', // '*' matches any system, or specific systemId
        severity = ALERT_SEVERITY.HIGH,
        category = ALERT_CATEGORY.SYSTEM,
        cooldownSeconds = 300, // 5 minutes default cooldown for notifications
        evaluationWindow = '15m',
        notificationPolicyId = 'default_policy',
        deduplicationStrategy = 'FINGERPRINT',
        metadata = {}
    }) {
        if (!name) throw new Error('AlertRule name is required');
        if (!metric) throw new Error('AlertRule metric is required');

        this.id = id || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.name = String(name);
        this.description = String(description);
        this.enabled = Boolean(enabled);
        this.source = String(source).toUpperCase();
        this.metric = String(metric);
        this.operator = String(operator);
        this.value = value;
        this.targetSystemId = String(targetSystemId);
        this.severity = Object.values(ALERT_SEVERITY).includes(severity) ? severity : ALERT_SEVERITY.HIGH;
        this.category = Object.values(ALERT_CATEGORY).includes(category) ? category : ALERT_CATEGORY.SYSTEM;
        this.cooldownSeconds = Math.max(0, Number(cooldownSeconds) || 0);
        this.evaluationWindow = String(evaluationWindow);
        this.notificationPolicyId = String(notificationPolicyId);
        this.deduplicationStrategy = String(deduplicationStrategy);
        this.metadata = metadata || {};
    }

    /**
     * Validate AlertRule parameters.
     */
    static validate(ruleDef) {
        if (!ruleDef || typeof ruleDef !== 'object') {
            return { valid: false, error: 'Rule definition must be an object' };
        }
        if (!ruleDef.name || String(ruleDef.name).trim().length === 0) {
            return { valid: false, error: 'Rule name is required' };
        }
        if (!ruleDef.metric || String(ruleDef.metric).trim().length === 0) {
            return { valid: false, error: 'Rule metric is required' };
        }
        if (!ruleDef.operator || String(ruleDef.operator).trim().length === 0) {
            return { valid: false, error: 'Rule operator is required' };
        }
        return { valid: true };
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            enabled: this.enabled,
            source: this.source,
            metric: this.metric,
            operator: this.operator,
            value: this.value,
            targetSystemId: this.targetSystemId,
            severity: this.severity,
            category: this.category,
            cooldownSeconds: this.cooldownSeconds,
            evaluationWindow: this.evaluationWindow,
            notificationPolicyId: this.notificationPolicyId,
            deduplicationStrategy: this.deduplicationStrategy,
            metadata: this.metadata
        };
    }
}

module.exports = AlertRule;
