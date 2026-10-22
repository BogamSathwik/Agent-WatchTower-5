/**
 * Phase 34 — Adaptive Response History Service
 * Persists response plans, approval/execution/verification states, expected
 * and actual outcomes, differences, and learning records using the existing
 * persistence abstraction (best-effort) with an in-memory primary store.
 */

class AdaptiveResponseHistoryService {
    constructor(options = {}) {
        this.persistence = options.persistenceManager || options.persistence || null;
        this.plans = new Map(); // adaptivePlanId -> adaptive plan (mutable lifecycle record)
        this.coordinations = new Map(); // adaptivePlanId -> coordination record
        this.verifications = new Map(); // adaptivePlanId -> verification bundle
        this.outcomes = new Map(); // adaptivePlanId -> outcome analysis
        this.comparisons = new Map(); // adaptivePlanId -> expected-vs-actual
        this.learnings = new Map(); // adaptivePlanId -> [learning records]
    }

    _persistBestEffort(collection, key, value) {
        try {
            if (this.persistence && typeof this.persistence.set === 'function') {
                const r = this.persistence.set(collection, key, value);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            }
        } catch (e) { /* persistence is best-effort */ }
    }

    savePlan(plan) {
        this.plans.set(plan.adaptivePlanId, plan);
        this._persistBestEffort('adaptive_response_plans', `${plan.tenantId}:${plan.adaptivePlanId}`, plan);
        return plan;
    }

    getPlan(adaptivePlanId, tenantId = null) {
        const p = this.plans.get(adaptivePlanId);
        if (!p) return null;
        if (tenantId && p.tenantId !== tenantId) return null;
        return p;
    }

    listPlans(tenantId = null) {
        const all = [...this.plans.values()];
        return tenantId ? all.filter(p => p.tenantId === tenantId) : all;
    }

    updatePlan(adaptivePlanId, patch) {
        const p = this.plans.get(adaptivePlanId);
        if (!p) return null;
        Object.assign(p, patch, { updatedAt: new Date().toISOString() });
        this._persistBestEffort('adaptive_response_plans', `${p.tenantId}:${p.adaptivePlanId}`, p);
        return p;
    }

    saveCoordination(adaptivePlanId, record) {
        this.coordinations.set(adaptivePlanId, record);
        const p = this.plans.get(adaptivePlanId);
        this._persistBestEffort('adaptive_response_executions', `${p ? p.tenantId : 'default-tenant'}:${adaptivePlanId}`, record);
        return record;
    }

    saveVerification(adaptivePlanId, bundle) {
        this.verifications.set(adaptivePlanId, bundle);
        const p = this.plans.get(adaptivePlanId);
        this._persistBestEffort('adaptive_response_verifications', `${p ? p.tenantId : 'default-tenant'}:${adaptivePlanId}`, bundle);
        return bundle;
    }

    saveOutcome(adaptivePlanId, outcome) {
        this.outcomes.set(adaptivePlanId, outcome);
        const p = this.plans.get(adaptivePlanId);
        this._persistBestEffort('adaptive_response_outcomes', `${p ? p.tenantId : 'default-tenant'}:${adaptivePlanId}`, outcome);
        return outcome;
    }

    saveComparison(adaptivePlanId, comparison) {
        this.comparisons.set(adaptivePlanId, comparison);
        return comparison;
    }

    saveLearnings(adaptivePlanId, records) {
        const existing = this.learnings.get(adaptivePlanId) || [];
        const merged = existing.concat(records);
        this.learnings.set(adaptivePlanId, merged);
        const p = this.plans.get(adaptivePlanId);
        this._persistBestEffort('adaptive_response_learning', `${p ? p.tenantId : 'default-tenant'}:${adaptivePlanId}`, merged);
        return merged;
    }

    getHistory(tenantId = null) {
        return this.listPlans(tenantId).map(p => ({
            adaptivePlanId: p.adaptivePlanId,
            agentId: p.agentId,
            tenantId: p.tenantId,
            lifecycle: p.lifecycle,
            approvalState: p.approvalState,
            executionState: p.executionState,
            verificationState: p.verificationState,
            expectedOutcome: p.expectedOutcome,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
        }));
    }
}

module.exports = { AdaptiveResponseHistoryService };
