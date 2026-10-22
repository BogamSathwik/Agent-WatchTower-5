/**
 * Remediation Rule Model
 * Connects operational conditions, alerts, and insights to target remediation actions.
 * Purely generic - zero business-specific hardcoding.
 */

class RemediationRule {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.ruleId = raw.ruleId ? String(raw.ruleId).trim() : (raw.id ? String(raw.id).trim() : '');
        this.name = raw.name ? String(raw.name).trim() : '';
        this.description = raw.description ? String(raw.description).trim() : '';
        this.triggerSource = raw.triggerSource ? String(raw.triggerSource).trim().toLowerCase() : 'health'; // 'health', 'quality', 'alert', 'intelligence', 'incident'

        this.condition = (typeof raw.condition === 'object' && raw.condition !== null)
            ? {
                metric: raw.condition.metric ? String(raw.condition.metric).trim() : 'status',
                operator: raw.condition.operator ? String(raw.condition.operator).trim() : 'EQUALS',
                value: raw.condition.value !== undefined ? raw.condition.value : 'unhealthy',
                severity: raw.condition.severity ? String(raw.condition.severity).toUpperCase() : 'HIGH'
            }
            : { metric: 'status', operator: 'EQUALS', value: 'unhealthy', severity: 'HIGH' };

        this.targetSystemId = raw.targetSystemId ? String(raw.targetSystemId).trim() : '';
        this.remediationActionId = raw.remediationActionId ? String(raw.remediationActionId).trim() : '';

        this.cooldownMs = Number(raw.cooldownMs) || 60000;
        this.maxRetries = Number(raw.maxRetries) || 3;
        this.enabled = Boolean(raw.enabled ?? true);

        this.metadata = (typeof raw.metadata === 'object' && raw.metadata !== null && !Array.isArray(raw.metadata))
            ? raw.metadata
            : {};

        this.createdAt = raw.createdAt || now;
        this.updatedAt = raw.updatedAt || now;
    }

    /**
     * Evaluates if a given observation/event matches this rule's trigger condition.
     */
    matchesTrigger(event = {}) {
        if (!this.enabled) return false;
        
        if (this.triggerSource && event.triggerSource && String(event.triggerSource).toLowerCase() !== this.triggerSource) {
            return false;
        }

        if (this.targetSystemId && event.systemId && event.systemId !== this.targetSystemId) {
            return false;
        }

        let metricVal = undefined;
        if (event[this.condition.metric] !== undefined) {
            metricVal = event[this.condition.metric];
        } else if (event.metric === this.condition.metric || event.metricName === this.condition.metric) {
            metricVal = event.value;
        } else {
            metricVal = event.status !== undefined ? event.status : (event.severity !== undefined ? event.severity : event.value);
        }

        if (metricVal === undefined || metricVal === null) return false;

        const targetVal = this.condition.value;
        const op = this.condition.operator.toUpperCase();

        switch (op) {
            case 'EQUALS':
            case '==':
            case '=':
                return String(metricVal).toLowerCase() === String(targetVal).toLowerCase();
            case 'NOT_EQUALS':
            case '!=':
                return String(metricVal).toLowerCase() !== String(targetVal).toLowerCase();
            case 'GREATER_THAN':
            case '>':
                return Number(metricVal) > Number(targetVal);
            case 'LESS_THAN':
            case '<':
                return Number(metricVal) < Number(targetVal);
            case 'CONTAINS':
                return String(metricVal).toLowerCase().includes(String(targetVal).toLowerCase());
            default:
                return String(metricVal).toLowerCase() === String(targetVal).toLowerCase();
        }
    }

    toJSON() {
        return {
            ruleId: this.ruleId,
            name: this.name,
            description: this.description,
            triggerSource: this.triggerSource,
            condition: this.condition,
            targetSystemId: this.targetSystemId,
            remediationActionId: this.remediationActionId,
            cooldownMs: this.cooldownMs,
            maxRetries: this.maxRetries,
            enabled: this.enabled,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = {
    RemediationRule
};
