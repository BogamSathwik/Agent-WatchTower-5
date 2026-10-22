/**
 * OrchestrationStore
 * In-memory store for plans, runs, audit trail, and idempotency key mapping.
 */

class OrchestrationStore {
    constructor() {
        this.plans = new Map();
        this.runs = new Map();
        this.idempotencyMap = new Map(); // key -> runId
        this.auditLogs = [];
    }

    savePlan(plan) {
        if (!plan || !plan.id) throw new Error('Plan must have an id');
        plan.updatedAt = new Date().toISOString();
        this.plans.set(plan.id, plan);
        this.addAuditLog('SYSTEM', 'PLAN_SAVED', 'PLAN', plan.id, { name: plan.name });
        return plan;
    }

    getPlan(planId) {
        return this.plans.get(planId) || null;
    }

    listPlans(filterFn = null) {
        const list = Array.from(this.plans.values());
        return filterFn ? list.filter(filterFn) : list;
    }

    deletePlan(planId) {
        const existed = this.plans.delete(planId);
        if (existed) {
            this.addAuditLog('SYSTEM', 'PLAN_DELETED', 'PLAN', planId, {});
        }
        return existed;
    }

    saveRun(run) {
        if (!run || !run.runId) throw new Error('Run must have a runId');
        this.runs.set(run.runId, run);
        if (run.idempotencyKey) {
            this.idempotencyMap.set(run.idempotencyKey, {
                runId: run.runId,
                timestamp: Date.now()
            });
        }
        return run;
    }

    getRun(runId) {
        return this.runs.get(runId) || null;
    }

    getRunByIdempotencyKey(key) {
        if (!key) return null;
        const entry = this.idempotencyMap.get(key);
        if (!entry) return null;
        return this.getRun(entry.runId);
    }

    listRuns(filterFn = null) {
        const list = Array.from(this.runs.values());
        return filterFn ? list.filter(filterFn) : list;
    }

    addAuditLog(actor, action, resource, resourceId, metadata = {}) {
        const entry = {
            id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            actor: actor || 'anonymous',
            action,
            resource,
            resourceId,
            timestamp: new Date().toISOString(),
            metadata: JSON.parse(JSON.stringify(metadata))
        };
        this.auditLogs.push(entry);
        if (this.auditLogs.length > 5000) this.auditLogs.shift();
        return entry;
    }

    getAuditLogs(limit = 100) {
        return this.auditLogs.slice(-limit);
    }

    clear() {
        this.plans.clear();
        this.runs.clear();
        this.idempotencyMap.clear();
        this.auditLogs = [];
    }
}

module.exports = OrchestrationStore;
