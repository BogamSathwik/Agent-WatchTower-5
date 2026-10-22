/**
 * Phase 14 — Event Store Repository
 * In-memory repository for event sources, automation rules, policies, event logs, execution audits,
 * and event storm / cooldown tracking.
 */

const { EventSource, DEFAULT_SOURCES } = require('./EventSource');
const EventRule = require('./EventRule');
const EventPolicy = require('./EventPolicy');
const { POLICY_MODES } = require('./EventStates');

class EventStore {
    constructor() {
        this.sources = new Map();
        this.rules = new Map();
        this.policies = new Map();
        this.events = [];
        this.executions = [];
        this.pendingApprovals = new Map();
        this.cooldownTracker = new Map(); // key -> lastExecutedAt
        this.concurrencyTracker = new Map(); // key -> count

        this.initDefaults();
    }

    initDefaults() {
        // Initialize default built-in sources
        for (const srcDef of DEFAULT_SOURCES) {
            this.sources.set(srcDef.id, new EventSource(srcDef));
        }

        // Initialize default policy
        const defaultPolicy = new EventPolicy({
            id: 'pol_default',
            name: 'Default Automated Safety Policy',
            mode: POLICY_MODES.AUTOMATIC,
            riskLevel: 'LOW',
            cooldownMs: 5000,
            maxExecutionsPerWindow: 10,
            windowSizeMs: 60000,
            concurrencyLimit: 3
        });
        this.policies.set(defaultPolicy.id, defaultPolicy);

        // Initialize sample default rule for demonstration / tests
        const sampleRule = new EventRule({
            id: 'rule_auto_restart_health',
            name: 'Auto-restart system on CRITICAL health failure',
            description: 'Trigger runtime restart when health degradation event is received',
            enabled: true,
            sourceId: '*',
            eventType: 'HEALTH_CHANGED',
            conditions: [
                { field: 'severity', operator: 'equals', value: 'CRITICAL' }
            ],
            priority: 100,
            cooldownMs: 10000,
            policyId: 'pol_default',
            actions: [
                { actionType: 'RUNTIME_RESTART', params: {} }
            ]
        });
        this.rules.set(sampleRule.id, sampleRule);
    }

    // --- SOURCES ---
    registerSource(sourceDef) {
        const source = sourceDef instanceof EventSource ? sourceDef : new EventSource(sourceDef);
        this.sources.set(source.id, source);
        return source;
    }

    getSource(id) {
        return this.sources.get(id) || null;
    }

    listSources() {
        return Array.from(this.sources.values()).map(s => s.toJSON());
    }

    deleteSource(id) {
        return this.sources.delete(id);
    }

    // --- RULES ---
    registerRule(ruleDef) {
        const rule = ruleDef instanceof EventRule ? ruleDef : new EventRule(ruleDef);
        this.rules.set(rule.id, rule);
        return rule;
    }

    getRule(id) {
        return this.rules.get(id) || null;
    }

    listRules() {
        return Array.from(this.rules.values())
            .sort((a, b) => b.priority - a.priority)
            .map(r => r.toJSON());
    }

    deleteRule(id) {
        return this.rules.delete(id);
    }

    // --- POLICIES ---
    registerPolicy(policyDef) {
        const policy = policyDef instanceof EventPolicy ? policyDef : new EventPolicy(policyDef);
        this.policies.set(policy.id, policy);
        return policy;
    }

    getPolicy(id) {
        return this.policies.get(id) || this.policies.get('pol_default');
    }

    listPolicies() {
        return Array.from(this.policies.values()).map(p => p.toJSON());
    }

    // --- EVENTS & AUDIT ---
    recordEvent(event) {
        this.events.unshift(event.toJSON());
        if (this.events.length > 500) {
            this.events.pop();
        }

        // Update source stats if registered
        const source = this.sources.get(event.source);
        if (source) {
            source.recordEvent();
        }
    }

    getEvent(id) {
        return this.events.find(e => e.id === id || e.eventId === id) || null;
    }

    listEvents(limit = 100) {
        return this.events.slice(0, limit);
    }

    recordExecution(execRecord) {
        this.executions.unshift(execRecord);
        if (this.executions.length > 500) {
            this.executions.pop();
        }
    }

    listExecutions(limit = 100) {
        return this.executions.slice(0, limit);
    }

    // --- COOLDOWN & LOOP PROTECTION ---
    isCooldownActive(key, cooldownMs) {
        const last = this.cooldownTracker.get(key);
        if (!last) return false;
        return (Date.now() - last) < cooldownMs;
    }

    recordCooldown(key) {
        this.cooldownTracker.set(key, Date.now());
    }

    // --- APPROVALS ---
    recordPendingApproval(approvalRecord) {
        this.pendingApprovals.set(approvalRecord.approvalId, approvalRecord);
    }

    getPendingApproval(approvalId) {
        return this.pendingApprovals.get(approvalId) || null;
    }

    listPendingApprovals() {
        return Array.from(this.pendingApprovals.values());
    }

    resolveApproval(approvalId, status, resolvedBy = 'operator') {
        const item = this.pendingApprovals.get(approvalId);
        if (!item) return null;
        item.status = status; // APPROVED or REJECTED
        item.resolvedBy = resolvedBy;
        item.resolvedAt = new Date().toISOString();
        this.pendingApprovals.delete(approvalId);
        return item;
    }

    clear() {
        this.sources.clear();
        this.rules.clear();
        this.policies.clear();
        this.events = [];
        this.executions = [];
        this.pendingApprovals.clear();
        this.cooldownTracker.clear();
        this.concurrencyTracker.clear();
        this.initDefaults();
    }
}

module.exports = EventStore;
