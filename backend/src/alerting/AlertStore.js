/**
 * Universal Alert Store
 * In-memory persistence engine for alerts, alert rules, notification policies, and delivery histories.
 * Purely domain-agnostic.
 */

const { Alert, ALERT_STATUS } = require('./Alert');
const AlertRule = require('./AlertRule');
const NotificationPolicy = require('./NotificationPolicy');

class AlertStore {
    constructor() {
        this.alerts = new Map(); // id -> Alert
        this.fingerprints = new Map(); // fingerprint -> alertId
        this.rules = new Map(); // ruleId -> AlertRule
        this.policies = new Map(); // policyId -> NotificationPolicy
        this.deliveries = []; // list of notification delivery attempts
        this.history = []; // audit log of state changes

        // Register default policy
        this.savePolicy(new NotificationPolicy({
            id: 'default_policy',
            name: 'Default System Policy',
            minSeverity: 'INFO',
            channels: ['in_app']
        }));
    }

    // --- Alert Management ---

    saveAlert(alert) {
        if (!(alert instanceof Alert)) {
            alert = new Alert(alert);
        }

        const existingId = this.fingerprints.get(alert.fingerprint);

        if (existingId && existingId !== alert.id) {
            const existingAlert = this.alerts.get(existingId);
            // If existing alert is still active/open, update it rather than duplicating
            if (existingAlert && [ALERT_STATUS.NEW, ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED].includes(existingAlert.status)) {
                existingAlert.recordOccurrence(alert.evidence);
                this.logHistory(existingAlert.id, 'OCCURRENCE_RECORDED', { count: existingAlert.occurrenceCount });
                return { alert: existingAlert, created: false, deduplicated: true };
            }
        }

        this.alerts.set(alert.id, alert);
        this.fingerprints.set(alert.fingerprint, alert.id);
        this.logHistory(alert.id, 'CREATED', { status: alert.status, severity: alert.severity });
        return { alert, created: true, deduplicated: false };
    }

    getAlert(alertId) {
        return this.alerts.get(alertId) || null;
    }

    getAlertByFingerprint(fingerprint) {
        const id = this.fingerprints.get(fingerprint);
        return id ? this.getAlert(id) : null;
    }

    listAlerts(filters = {}) {
        let list = Array.from(this.alerts.values());

        if (filters.systemId) {
            list = list.filter(a => a.systemId === filters.systemId);
        }
        if (filters.status) {
            list = list.filter(a => a.status === filters.status);
        }
        if (filters.severity) {
            list = list.filter(a => a.severity === filters.severity);
        }
        if (filters.category) {
            list = list.filter(a => a.category === filters.category);
        }
        if (filters.source) {
            list = list.filter(a => a.source === filters.source);
        }
        if (filters.ruleId) {
            list = list.filter(a => a.ruleId === filters.ruleId);
        }

        // Sort by lastDetectedAt descending
        return list.sort((a, b) => new Date(b.lastDetectedAt) - new Date(a.lastDetectedAt));
    }

    updateAlert(alert) {
        if (!this.alerts.has(alert.id)) {
            throw new Error(`Alert with id ${alert.id} does not exist`);
        }
        this.alerts.set(alert.id, alert);
        this.fingerprints.set(alert.fingerprint, alert.id);
        return alert;
    }

    deleteAlert(alertId) {
        const alert = this.getAlert(alertId);
        if (alert) {
            this.fingerprints.delete(alert.fingerprint);
            this.alerts.delete(alertId);
            this.logHistory(alertId, 'DELETED');
            return true;
        }
        return false;
    }

    // --- Rule Management ---

    saveRule(rule) {
        if (!(rule instanceof AlertRule)) {
            rule = new AlertRule(rule);
        }
        this.rules.set(rule.id, rule);
        return rule;
    }

    getRule(ruleId) {
        return this.rules.get(ruleId) || null;
    }

    listRules(filters = {}) {
        let list = Array.from(this.rules.values());
        if (filters.enabled !== undefined) {
            list = list.filter(r => r.enabled === Boolean(filters.enabled));
        }
        if (filters.source) {
            list = list.filter(r => r.source === filters.source);
        }
        if (filters.targetSystemId && filters.targetSystemId !== '*') {
            list = list.filter(r => r.targetSystemId === '*' || r.targetSystemId === filters.targetSystemId);
        }
        return list;
    }

    deleteRule(ruleId) {
        return this.rules.delete(ruleId);
    }

    // --- Notification Policy Management ---

    savePolicy(policy) {
        if (!(policy instanceof NotificationPolicy)) {
            policy = new NotificationPolicy(policy);
        }
        this.policies.set(policy.id, policy);
        return policy;
    }

    getPolicy(policyId) {
        return this.policies.get(policyId) || this.policies.get('default_policy') || null;
    }

    listPolicies() {
        return Array.from(this.policies.values());
    }

    deletePolicy(policyId) {
        if (policyId === 'default_policy') {
            throw new Error('Cannot delete default notification policy');
        }
        return this.policies.delete(policyId);
    }

    // --- Notification Delivery History ---

    recordDelivery(delivery) {
        const record = {
            id: `del_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            timestamp: new Date().toISOString(),
            ...delivery
        };
        this.deliveries.push(record);
        return record;
    }

    listDeliveries(filters = {}) {
        let list = [...this.deliveries];
        if (filters.alertId) {
            list = list.filter(d => d.alertId === filters.alertId);
        }
        if (filters.channelId) {
            list = list.filter(d => d.channelId === filters.channelId);
        }
        if (filters.status) {
            list = list.filter(d => d.status === filters.status);
        }
        return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // --- Audit Log History ---

    logHistory(alertId, action, details = {}) {
        this.history.push({
            id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            alertId,
            action,
            timestamp: new Date().toISOString(),
            details
        });
    }

    getAlertHistory(alertId) {
        return this.history
            .filter(h => h.alertId === alertId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    clear() {
        this.alerts.clear();
        this.fingerprints.clear();
        this.rules.clear();
        this.policies.clear();
        this.deliveries = [];
        this.history = [];

        this.savePolicy(new NotificationPolicy({
            id: 'default_policy',
            name: 'Default System Policy',
            minSeverity: 'INFO',
            channels: ['in_app']
        }));
    }
}

module.exports = AlertStore;
