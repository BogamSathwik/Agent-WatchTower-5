/**
 * Phase 25 — Automation Policy Engine
 * Evaluates event-driven policies, triggers, and condition sets.
 * Manages policy lifecycle and persistence across restarts.
 */

const { AutomationConditionEvaluator } = require('./AutomationConditionEvaluator');

class AutomationPolicyEngine {
    constructor(options = {}) {
        this.persistence = options.persistenceManager || options.persistence || null;
        this.policies = new Map();
        this.cooldowns = new Map(); // key -> lastExecutedAt

        this.initDefaultPolicies();
    }

    /**
     * Pre-populate standard default automation policies.
     */
    initDefaultPolicies() {
        const defaultPolicies = [
            {
                policyId: 'pol_offline_recovery_default',
                name: 'Offline Agent Automatic Recovery',
                description: 'When an agent becomes OFFLINE and consecutive failures >= 3, trigger recovery workflow.',
                enabled: true,
                tenantId: 'default-tenant',
                trigger: 'AGENT_OFFLINE',
                priority: 100,
                conditions: {
                    logicalOperator: 'AND',
                    conditions: [
                        { field: 'newStatus', operator: 'equals', value: 'OFFLINE' },
                        { field: 'consecutiveFailures', operator: 'greaterThanOrEqual', value: 3 }
                    ]
                },
                workflowId: 'agent-recovery-workflow',
                approvalMode: 'REQUIRED',
                cooldownSeconds: 300,
                retryPolicy: { maxAttempts: 3, backoffMs: 2000 },
                verificationPolicy: { checkHealth: true, expectedState: 'HEALTHY' }
            },
            {
                policyId: 'pol_latency_degradation_warning',
                name: 'Latency Degradation Warning Policy',
                description: 'When an agent response latency exceeds threshold, create an alert and incident.',
                enabled: true,
                tenantId: 'default-tenant',
                trigger: 'ANOMALY_DETECTED',
                priority: 80,
                conditions: {
                    logicalOperator: 'AND',
                    conditions: [
                        { field: 'anomalyType', operator: 'equals', value: 'LATENCY_SPIKE' }
                    ]
                },
                workflowId: 'latency-warning-workflow',
                approvalMode: 'AUTO_APPROVED',
                cooldownSeconds: 180,
                retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
                verificationPolicy: { checkHealth: false }
            },
            {
                policyId: 'pol_remediation_failed_escalation',
                name: 'Failed Remediation Operator Escalation',
                description: 'When self-healing remediation fails, halt automation and escalate to operator attention.',
                enabled: true,
                tenantId: 'default-tenant',
                trigger: 'REMEDIATION_FAILED',
                priority: 120,
                conditions: [
                    { field: 'status', operator: 'equals', value: 'FAILED' }
                ],
                workflowId: 'operator-escalation-workflow',
                approvalMode: 'REQUIRED',
                cooldownSeconds: 60,
                retryPolicy: { maxAttempts: 1, backoffMs: 0 },
                verificationPolicy: { checkHealth: true, expectedState: 'HEALTHY' }
            }
        ];

        for (const p of defaultPolicies) {
            this.savePolicy(p);
        }
    }

    _persist(key, value) {
        if (!this.persistence) return;
        try {
            if (typeof this.persistence.setSafe === 'function') {
                this.persistence.setSafe('automation_policies', key, value);
            } else if (typeof this.persistence.set === 'function') {
                const r = this.persistence.set('automation_policies', key, value);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            } else if (typeof this.persistence.setItem === 'function') {
                this.persistence.setItem(`automation_policies_${key}`, value);
            }
        } catch (_) {}
    }

    savePolicy(policyData, tenantId = 'default-tenant') {
        const id = policyData.policyId || policyData.id || `pol_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const tid = policyData.tenantId || tenantId;

        const existing = this.getPolicy(id, tid) || {};
        const policy = {
            policyId: id,
            id,
            name: policyData.name || existing.name || 'Untitled Automation Policy',
            description: policyData.description || existing.description || '',
            enabled: policyData.enabled !== undefined ? Boolean(policyData.enabled) : (existing.enabled !== undefined ? existing.enabled : true),
            tenantId: tid,
            trigger: String(policyData.trigger || existing.trigger || 'AGENT_HEALTH_CHANGED').toUpperCase(),
            priority: Number(policyData.priority !== undefined ? policyData.priority : (existing.priority || 50)),
            conditions: policyData.conditions !== undefined ? policyData.conditions : (existing.conditions || []),
            actions: policyData.actions || existing.actions || [],
            workflowId: policyData.workflowId || existing.workflowId || 'agent-recovery-workflow',
            approvalMode: String(policyData.approvalMode || existing.approvalMode || 'REQUIRED').toUpperCase(),
            cooldownSeconds: Number(policyData.cooldownSeconds || policyData.cooldown || existing.cooldownSeconds || 300),
            retryPolicy: policyData.retryPolicy || existing.retryPolicy || { maxAttempts: 3, backoffMs: 1000 },
            verificationPolicy: policyData.verificationPolicy || existing.verificationPolicy || { checkHealth: true, expectedState: 'HEALTHY' },
            createdAt: existing.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const key = `${tid}:${id}`;
        this.policies.set(key, policy);
        this._persist(key, policy);
        return { ...policy };
    }

    getPolicy(policyId, tenantId = 'default-tenant') {
        const key = `${tenantId}:${policyId}`;
        if (this.policies.has(key)) {
            return { ...this.policies.get(key) };
        }
        for (const [k, p] of this.policies.entries()) {
            if (p.policyId === policyId || p.id === policyId) {
                if (p.tenantId === tenantId || tenantId === 'global' || p.tenantId === 'default-tenant') {
                    return { ...p };
                }
            }
        }
        return null;
    }

    listPolicies(tenantId = 'default-tenant') {
        const results = [];
        for (const [key, policy] of this.policies.entries()) {
            if (policy.tenantId === tenantId || tenantId === 'global' || policy.tenantId === 'default-tenant') {
                results.push({ ...policy });
            }
        }
        return results.sort((a, b) => b.priority - a.priority);
    }

    deletePolicy(policyId, tenantId = 'default-tenant') {
        const key = `${tenantId}:${policyId}`;
        let deleted = this.policies.delete(key);
        if (!deleted) {
            for (const [k, p] of this.policies.entries()) {
                if ((p.policyId === policyId || p.id === policyId) && (p.tenantId === tenantId || tenantId === 'global')) {
                    this.policies.delete(k);
                    deleted = true;
                    break;
                }
            }
        }
        return deleted;
    }

    togglePolicy(policyId, enabled, tenantId = 'default-tenant') {
        const policy = this.getPolicy(policyId, tenantId);
        if (!policy) {
            const err = new Error(`Automation policy '${policyId}' not found.`);
            err.statusCode = 404;
            throw err;
        }
        return this.savePolicy({ ...policy, enabled: Boolean(enabled) }, tenantId);
    }

    /**
     * Evaluate policies matching an event.
     * @param {Object} event 
     * @param {string} tenantId 
     */
    evaluateEvent(event, tenantId = 'default-tenant') {
        const tid = event.tenantId || tenantId;
        const trigger = String(event.eventType || event.type || event.trigger || 'AGENT_HEALTH_CHANGED').toUpperCase();
        const agentId = event.agentId || event.systemId || (event.payload && event.payload.agentId);

        const candidates = this.listPolicies(tid).filter(p => p.enabled && (
            p.trigger === trigger || 
            (trigger === 'AGENT_OFFLINE' && p.trigger === 'AGENT_HEALTH_CHANGED') ||
            (trigger === 'AGENT_HEALTH_CHANGED' && p.trigger === 'AGENT_OFFLINE' && (event.newStatus === 'OFFLINE' || event.state === 'OFFLINE'))
        ));

        const evaluations = [];

        // Build context object for condition matching
        const context = {
            ...event,
            agentId,
            tenantId: tid,
            trigger,
            newStatus: event.newStatus || event.healthState || event.state || (event.payload && event.payload.newStatus),
            previousStatus: event.previousStatus || (event.payload && event.payload.previousStatus),
            consecutiveFailures: event.consecutiveFailures !== undefined ? event.consecutiveFailures : (event.payload && event.payload.consecutiveFailures || 0),
            responseTimeMs: event.responseTimeMs !== undefined ? event.responseTimeMs : (event.durationMs || 0),
            anomalyType: event.anomalyType || event.type || (event.payload && event.payload.anomalyType),
            riskLevel: event.riskLevel || (event.payload && event.payload.riskLevel),
            status: event.status || event.state
        };

        for (const policy of candidates) {
            const reasons = [];
            let matched = false;

            // 1. Condition evaluation
            const condResult = AutomationConditionEvaluator.evaluateGroup(policy.conditions, context);
            if (!condResult) {
                reasons.push(`Conditions did not match event context (trigger: ${trigger}).`);
            } else {
                matched = true;
                reasons.push(`Trigger '${trigger}' and policy conditions matched successfully.`);
            }

            // 2. Cooldown check
            const cooldownKey = `${tid}:${agentId}:${policy.policyId}`;
            const lastTriggered = this.cooldowns.get(cooldownKey) || 0;
            const cooldownMs = (policy.cooldownSeconds || 300) * 1000;
            const now = Date.now();

            if (matched && (now - lastTriggered) < cooldownMs) {
                matched = false;
                const remainingSec = Math.ceil((cooldownMs - (now - lastTriggered)) / 1000);
                reasons.push(`Policy is in cooldown period (${remainingSec}s remaining). Automation suppressed to prevent storm.`);
            }

            evaluations.push({
                policyId: policy.policyId,
                policyName: policy.name,
                matched,
                reasons,
                workflowId: policy.workflowId,
                approvalRequired: policy.approvalMode === 'REQUIRED',
                approvalMode: policy.approvalMode,
                policy,
                eventContext: context
            });
        }

        return evaluations;
    }

    recordTriggered(policyId, agentId, tenantId = 'default-tenant') {
        const cooldownKey = `${tenantId}:${agentId}:${policyId}`;
        this.cooldowns.set(cooldownKey, Date.now());
    }
}

module.exports = { AutomationPolicyEngine };
