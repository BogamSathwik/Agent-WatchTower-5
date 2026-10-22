/**
 * Remediation Store
 * Persistence and querying layer for remediation actions, rules, policies, executions, and audit logs.
 * Purely generic - zero business-specific logic.
 */

const { RemediationAction } = require('./RemediationAction');
const { RemediationRule } = require('./RemediationRule');
const { RemediationPolicy } = require('./RemediationPolicy');

class RemediationStore {
    constructor() {
        this.actions = new Map();
        this.rules = new Map();
        this.policy = new RemediationPolicy();
        this.executions = new Map();
        this.auditLogs = [];
    }

    // --- Action Operations ---

    saveAction(actionRaw) {
        const action = actionRaw instanceof RemediationAction ? actionRaw : new RemediationAction(actionRaw);
        this.actions.set(action.actionId, action);
        return action;
    }

    getAction(actionId) {
        if (!actionId) return null;
        return this.actions.get(String(actionId).trim()) || null;
    }

    listActions(filters = {}) {
        let list = Array.from(this.actions.values());
        if (filters.targetSystemId) {
            list = list.filter(a => a.targetSystemId === filters.targetSystemId);
        }
        if (filters.enabled !== undefined) {
            list = list.filter(a => a.enabled === Boolean(filters.enabled));
        }
        return list;
    }

    deleteAction(actionId) {
        return this.actions.delete(actionId);
    }

    // --- Rule Operations ---

    saveRule(ruleRaw) {
        const rule = ruleRaw instanceof RemediationRule ? ruleRaw : new RemediationRule(ruleRaw);
        this.rules.set(rule.ruleId, rule);
        return rule;
    }

    getRule(ruleId) {
        if (!ruleId) return null;
        return this.rules.get(String(ruleId).trim()) || null;
    }

    listRules(filters = {}) {
        let list = Array.from(this.rules.values());
        if (filters.triggerSource) {
            const src = String(filters.triggerSource).toLowerCase();
            list = list.filter(r => r.triggerSource.toLowerCase() === src);
        }
        if (filters.targetSystemId) {
            list = list.filter(r => r.targetSystemId === filters.targetSystemId);
        }
        if (filters.enabled !== undefined) {
            list = list.filter(r => r.enabled === Boolean(filters.enabled));
        }
        return list;
    }

    deleteRule(ruleId) {
        return this.rules.delete(ruleId);
    }

    // --- Policy Operations ---

    setPolicy(policyRaw) {
        this.policy = policyRaw instanceof RemediationPolicy ? policyRaw : new RemediationPolicy(policyRaw);
        return this.policy;
    }

    getPolicy() {
        return this.policy;
    }

    // --- Execution Record Operations ---

    saveExecution(execution) {
        this.executions.set(execution.executionId, execution);
        return execution;
    }

    getExecution(executionId) {
        if (!executionId) return null;
        return this.executions.get(String(executionId).trim()) || null;
    }

    listExecutions(filters = {}) {
        let list = Array.from(this.executions.values());
        if (filters.systemId) {
            list = list.filter(e => e.systemId === filters.systemId);
        }
        if (filters.status) {
            const st = String(filters.status).toUpperCase();
            list = list.filter(e => e.status === st);
        }
        if (filters.dryRun !== undefined) {
            list = list.filter(e => Boolean(e.dryRun) === Boolean(filters.dryRun));
        }
        return list;
    }

    // --- Audit Log Operations ---

    addAuditLog(entry = {}) {
        const log = {
            logId: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            timestamp: new Date().toISOString(),
            executionId: entry.executionId || null,
            actionId: entry.actionId || null,
            systemId: entry.systemId || null,
            actor: entry.actor || 'system',
            event: entry.event || 'REMEDIATION_LOG',
            status: entry.status || 'INFO',
            details: entry.details || {}
        };
        this.auditLogs.push(log);
        if (this.auditLogs.length > 5000) {
            this.auditLogs.shift();
        }
        return log;
    }

    listAuditLogs(filters = {}) {
        let list = [...this.auditLogs];
        if (filters.systemId) {
            list = list.filter(l => l.systemId === filters.systemId);
        }
        if (filters.executionId) {
            list = list.filter(l => l.executionId === filters.executionId);
        }
        return list;
    }

    clear() {
        this.actions.clear();
        this.rules.clear();
        this.executions.clear();
        this.auditLogs = [];
        this.policy = new RemediationPolicy();
    }
}

module.exports = RemediationStore;
