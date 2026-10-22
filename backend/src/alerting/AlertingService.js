/**
 * Universal Alerting Service
 * Orchestrates alert rule evaluation, deduplication, lifecycle transitions, notification dispatch, and persistence.
 * Integrates with IntelligenceService and underlying dimension stores.
 * Purely domain-agnostic.
 */

const { Alert, ALERT_STATUS, ALERT_SEVERITY } = require('./Alert');
const AlertRule = require('./AlertRule');
const AlertStore = require('./AlertStore');
const AlertEvaluator = require('./AlertEvaluator');
const NotificationProviderRegistry = require('./NotificationProviderRegistry');
const NotificationDispatcher = require('./NotificationDispatcher');
const { sseManager } = require('../events/SSEManager');

class AlertingService {
    constructor({
        alertStore = null,
        registry = null,
        intelligenceService = null,
        healthService = null,
        qualityStore = null,
        usageStore = null,
        experienceStore = null
    } = {}) {
        this.store = alertStore || new AlertStore();
        this.registry = registry || new NotificationProviderRegistry();
        this.dispatcher = new NotificationDispatcher(this.registry, this.store);
        this.intelligenceService = intelligenceService;
        this.healthService = healthService;
        this.qualityStore = qualityStore;
        this.usageStore = usageStore;
        this.experienceStore = experienceStore;

        this.escalationPolicies = new Map();
        // Seed default escalation policy
        this.saveEscalationPolicy({
            id: 'esc_default',
            name: 'Default Critical Escalation Policy',
            severity: ALERT_SEVERITY.CRITICAL,
            triggerCondition: 'UNACKNOWLEDGED_ALERT',
            escalationDelaySeconds: 300,
            escalationLevel: 1,
            maxEscalationLevel: 3,
            acknowledgementRequired: true,
            enabled: true,
            createdAt: new Date().toISOString()
        });
    }

    // --- Escalation Policy Operations ---

    listEscalationPolicies() {
        return Array.from(this.escalationPolicies.values());
    }

    getEscalationPolicy(id) {
        return this.escalationPolicies.get(id) || null;
    }

    saveEscalationPolicy(policyPayload) {
        const id = policyPayload.id || `esc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const policy = {
            id,
            name: policyPayload.name || 'Unnamed Escalation Policy',
            severity: policyPayload.severity || ALERT_SEVERITY.CRITICAL,
            triggerCondition: policyPayload.triggerCondition || 'UNACKNOWLEDGED_ALERT',
            escalationDelaySeconds: Number(policyPayload.escalationDelaySeconds) || 300,
            escalationLevel: Number(policyPayload.escalationLevel) || 1,
            maxEscalationLevel: Number(policyPayload.maxEscalationLevel) || 3,
            acknowledgementRequired: policyPayload.acknowledgementRequired !== false,
            enabled: policyPayload.enabled !== false,
            createdAt: policyPayload.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.escalationPolicies.set(id, policy);
        return policy;
    }

    updateEscalationPolicy(id, updates) {
        const existing = this.getEscalationPolicy(id);
        if (!existing) {
            const err = new Error(`Escalation policy '${id}' not found`);
            err.statusCode = 404;
            throw err;
        }
        const updated = this.saveEscalationPolicy({ ...existing, ...updates, id });
        return updated;
    }

    deleteEscalationPolicy(id) {
        const existed = this.escalationPolicies.has(id);
        if (!existed) {
            const err = new Error(`Escalation policy '${id}' not found`);
            err.statusCode = 404;
            throw err;
        }
        this.escalationPolicies.delete(id);
        return { id, deleted: true };
    }

    escalateAlert(alertId, actor = 'operator', reason = 'Manual escalation') {
        const alert = this.store.getAlert(alertId);
        if (!alert) {
            const err = new Error(`Alert '${alertId}' not found`);
            err.statusCode = 404;
            throw err;
        }

        // Stop escalation if acknowledged, resolved, or dismissed
        if ([ALERT_STATUS.ACKNOWLEDGED, ALERT_STATUS.RESOLVED, ALERT_STATUS.DISMISSED].includes(alert.status)) {
            const err = new Error(`Cannot escalate alert '${alertId}' in status '${alert.status}'`);
            err.statusCode = 400;
            throw err;
        }

        const currentLevel = alert.escalationLevel || 1;
        const maxLevel = alert.maxEscalationLevel || 3;

        if (currentLevel >= maxLevel) {
            const err = new Error(`Alert '${alertId}' has already reached maximum escalation level (${maxLevel})`);
            err.statusCode = 400;
            throw err;
        }

        const newLevel = currentLevel + 1;
        alert.escalationLevel = newLevel;
        alert.isEscalated = true;
        alert.lastEscalatedAt = new Date().toISOString();

        this.store.updateAlert(alert);
        this.store.logHistory(alertId, 'ESCALATED', { actor, reason, escalationLevel: newLevel });

        sseManager.broadcast('ALERT_ESCALATED', {
            alertId,
            systemId: alert.systemId,
            severity: alert.severity,
            title: alert.title,
            escalationLevel: newLevel,
            maxEscalationLevel: maxLevel,
            actor,
            reason
        });

        return alert;
    }

    // --- Alert Evaluation & Ingestion ---

    async evaluateSystem(systemId, window = '15m') {
        const rules = this.store.listRules({ enabled: true, targetSystemId: systemId });
        const activeAlerts = this.store.listAlerts({ systemId });

        let observations = [];
        if (this.intelligenceService && typeof this.intelligenceService.getSystemObservations === 'function') {
            observations = await this.intelligenceService.getSystemObservations(systemId, window);
        }

        const evaluationResult = AlertEvaluator.evaluateSystemRules(rules, observations, activeAlerts);

        const createdAlerts = [];
        const updatedAlerts = [];

        for (const item of evaluationResult.triggered) {
            const alertObj = new Alert({
                systemId: item.systemId,
                source: item.rule.source,
                ruleId: item.rule.id,
                title: item.title,
                description: item.description,
                severity: item.rule.severity,
                category: item.rule.category,
                condition: {
                    metric: item.rule.metric,
                    operator: item.rule.operator,
                    value: item.rule.value
                },
                evidence: item.evidence,
                metadata: {
                    policyId: item.rule.notificationPolicyId,
                    evaluationWindow: item.rule.evaluationWindow
                }
            });

            const { alert, created, deduplicated } = this.store.saveAlert(alertObj);

            if (created) {
                createdAlerts.push(alert);
                sseManager.broadcast('ALERT_CREATED', {
                    alertId: alert.id,
                    systemId: alert.systemId,
                    severity: alert.severity,
                    title: alert.title
                });
            } else if (deduplicated) {
                updatedAlerts.push(alert);
            }

            await this.dispatcher.dispatch(alert, { policyId: item.rule.notificationPolicyId });
        }

        const autoResolvedAlerts = [];
        for (const item of evaluationResult.recovered) {
            const alert = item.alert;
            alert.resolve([item.recoveryEvidence]);
            this.store.updateAlert(alert);
            this.store.logHistory(alert.id, 'AUTO_RESOLVED', item.recoveryEvidence);
            autoResolvedAlerts.push(alert);
        }

        return {
            systemId,
            evaluatedRulesCount: rules.length,
            observationsCount: observations.length,
            triggeredCount: evaluationResult.triggered.length,
            createdAlertsCount: createdAlerts.length,
            updatedAlertsCount: updatedAlerts.length,
            autoResolvedCount: autoResolvedAlerts.length,
            createdAlerts,
            updatedAlerts,
            autoResolvedAlerts
        };
    }

    // --- Alert Lifecycle Operations ---

    createManualAlert(alertPayload) {
        const alert = new Alert(alertPayload);
        const { alert: savedAlert } = this.store.saveAlert(alert);
        this.dispatcher.dispatch(savedAlert);

        sseManager.broadcast('ALERT_CREATED', {
            alertId: savedAlert.id,
            systemId: savedAlert.systemId,
            severity: savedAlert.severity,
            title: savedAlert.title
        });

        return savedAlert;
    }

    // Alias used by monitoring loop (same lifecycle as manual alerts).
    createAlert(alertPayload) {
        return this.createManualAlert(alertPayload);
    }

    getAlert(alertId) {
        return this.store.getAlert(alertId);
    }

    listAlerts(filters = {}) {
        return this.store.listAlerts(filters);
    }

    acknowledgeAlert(alertId, actor = 'operator', reason = '') {
        const alert = this.store.getAlert(alertId);
        if (!alert) {
            const err = new Error(`Alert ${alertId} not found`);
            err.statusCode = 404;
            throw err;
        }
        alert.acknowledge(actor, reason);
        this.store.updateAlert(alert);
        this.store.logHistory(alertId, 'ACKNOWLEDGED', { actor, reason });

        sseManager.broadcast('ALERT_ACKNOWLEDGED', {
            alertId,
            systemId: alert.systemId,
            severity: alert.severity,
            acknowledgedBy: actor
        });

        return alert;
    }

    resolveAlert(alertId, recoveryEvidence = [], actor = 'operator') {
        const alert = this.store.getAlert(alertId);
        if (!alert) {
            const err = new Error(`Alert ${alertId} not found`);
            err.statusCode = 404;
            throw err;
        }
        alert.resolve(recoveryEvidence);
        this.store.updateAlert(alert);
        this.store.logHistory(alertId, 'RESOLVED', { actor, recoveryEvidence });
        return alert;
    }

    dismissAlert(alertId, actor = 'operator', reason = '') {
        const alert = this.store.getAlert(alertId);
        if (!alert) {
            const err = new Error(`Alert ${alertId} not found`);
            err.statusCode = 404;
            throw err;
        }
        alert.dismiss(actor, reason);
        this.store.updateAlert(alert);
        this.store.logHistory(alertId, 'DISMISSED', { actor, reason });
        return alert;
    }

    reopenAlert(alertId, reason = 'Manually reopened') {
        const alert = this.store.getAlert(alertId);
        if (!alert) {
            const err = new Error(`Alert ${alertId} not found`);
            err.statusCode = 404;
            throw err;
        }
        alert.reopen(reason);
        this.store.updateAlert(alert);
        this.store.logHistory(alertId, 'REOPENED', { reason });
        return alert;
    }

    getAlertHistory(alertId) {
        return this.store.getAlertHistory(alertId);
    }

    // --- Alert Rules Operations ---

    createRule(rulePayload) {
        const validation = AlertRule.validate(rulePayload);
        if (!validation.valid) {
            const err = new Error(validation.error);
            err.statusCode = 400;
            throw err;
        }
        const rule = new AlertRule(rulePayload);
        return this.store.saveRule(rule);
    }

    getRule(ruleId) {
        return this.store.getRule(ruleId);
    }

    listRules(filters = {}) {
        return this.store.listRules(filters);
    }

    updateRule(ruleId, updates) {
        const rule = this.store.getRule(ruleId);
        if (!rule) {
            const err = new Error(`Rule ${ruleId} not found`);
            err.statusCode = 404;
            throw err;
        }
        Object.assign(rule, updates);
        return this.store.saveRule(rule);
    }

    deleteRule(ruleId) {
        return this.store.deleteRule(ruleId);
    }

    // --- Notification Policies Operations ---

    createPolicy(policyPayload) {
        const policy = this.store.savePolicy(policyPayload);
        return policy;
    }

    getPolicy(policyId) {
        return this.store.getPolicy(policyId);
    }

    listPolicies() {
        return this.store.listPolicies();
    }

    updatePolicy(policyId, updates) {
        const policy = this.store.getPolicy(policyId);
        if (!policy) {
            const err = new Error(`Policy ${policyId} not found`);
            err.statusCode = 404;
            throw err;
        }
        Object.assign(policy, updates);
        return this.store.savePolicy(policy);
    }

    deletePolicy(policyId) {
        return this.store.deletePolicy(policyId);
    }

    // --- Delivery & Channel Management ---

    listChannels() {
        return this.registry.list();
    }

    registerChannel(provider) {
        return this.registry.register(provider);
    }

    listDeliveries(filters = {}) {
        return this.store.listDeliveries(filters);
    }

    // --- Overview Metrics ---

    getOverview() {
        const allAlerts = this.store.listAlerts();
        const activeAlerts = allAlerts.filter(a => [ALERT_STATUS.NEW, ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED].includes(a.status));
        const resolvedAlerts = allAlerts.filter(a => a.status === ALERT_STATUS.RESOLVED);
        const dismissedAlerts = allAlerts.filter(a => a.status === ALERT_STATUS.DISMISSED);

        const deliveries = this.store.listDeliveries();
        const notificationFailures = deliveries.filter(d => d.status === 'FAILED' || d.status === 'EXHAUSTED').length;
        const escalatedCount = allAlerts.filter(a => a.isEscalated).length;

        const severityCounts = {
            [ALERT_SEVERITY.INFO]: 0,
            [ALERT_SEVERITY.LOW]: 0,
            [ALERT_SEVERITY.MEDIUM]: 0,
            [ALERT_SEVERITY.HIGH]: 0,
            [ALERT_SEVERITY.CRITICAL]: 0
        };

        activeAlerts.forEach(a => {
            if (severityCounts[a.severity] !== undefined) {
                severityCounts[a.severity]++;
            }
        });

        return {
            totalAlerts: allAlerts.length,
            activeAlertsCount: activeAlerts.length,
            escalatedAlertsCount: escalatedCount,
            criticalAlertsCount: severityCounts[ALERT_SEVERITY.CRITICAL],
            highAlertsCount: severityCounts[ALERT_SEVERITY.HIGH],
            mediumAlertsCount: severityCounts[ALERT_SEVERITY.MEDIUM],
            lowAlertsCount: severityCounts[ALERT_SEVERITY.LOW],
            infoAlertsCount: severityCounts[ALERT_SEVERITY.INFO],
            resolvedCount: resolvedAlerts.length,
            dismissedCount: dismissedAlerts.length,
            notificationFailuresCount: notificationFailures,
            rulesCount: this.store.listRules().length,
            policiesCount: this.store.listPolicies().length,
            escalationPoliciesCount: this.listEscalationPolicies().length,
            channelsCount: this.registry.list().length
        };
    }
}

module.exports = AlertingService;
