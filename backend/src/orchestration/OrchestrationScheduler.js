/**
 * OrchestrationScheduler
 * Automated scheduler for periodic execution of configured OrchestrationPlans.
 * Prevents overlapping executions of the same plan.
 */

const { SCHEDULER_STATES } = require('./OrchestrationStates');

class OrchestrationScheduler {
    constructor({ orchestrationEngine = null, orchestrationStore = null } = {}) {
        this.orchestrationEngine = orchestrationEngine;
        this.orchestrationStore = orchestrationStore;
        
        this.state = SCHEDULER_STATES.STOPPED;
        this.timers = new Map(); // planId -> intervalTimer
        this.runningPlans = new Set(); // planId
        this.lastExecutedAt = new Map(); // planId -> timestamp ISO
        this.overlapCount = 0;
    }

    start() {
        if (this.state === SCHEDULER_STATES.RUNNING) return this.getStatus();
        this.state = SCHEDULER_STATES.RUNNING;
        this.scheduleAllEnabledPlans();
        return this.getStatus();
    }

    stop() {
        this.state = SCHEDULER_STATES.STOPPED;
        this.clearAllTimers();
        return this.getStatus();
    }

    pause() {
        if (this.state === SCHEDULER_STATES.RUNNING) {
            this.state = SCHEDULER_STATES.PAUSED;
            this.clearAllTimers();
        }
        return this.getStatus();
    }

    resume() {
        if (this.state === SCHEDULER_STATES.PAUSED) {
            this.state = SCHEDULER_STATES.RUNNING;
            this.scheduleAllEnabledPlans();
        }
        return this.getStatus();
    }

    scheduleAllEnabledPlans() {
        this.clearAllTimers();
        if (this.state !== SCHEDULER_STATES.RUNNING || !this.orchestrationStore) return;

        const plans = this.orchestrationStore.listPlans(p => p.enabled && p.schedule && p.schedule.enabled);
        plans.forEach(plan => {
            this.schedulePlan(plan);
        });
    }

    schedulePlan(plan) {
        if (!plan || !plan.id || !plan.enabled || !plan.schedule || !plan.schedule.enabled) return;
        if (this.timers.has(plan.id)) {
            clearInterval(this.timers.get(plan.id));
        }

        const intervalMs = plan.schedule.intervalMs || 60000;
        const timer = setInterval(() => {
            this.triggerPlanExecution(plan.id);
        }, intervalMs);

        this.timers.set(plan.id, timer);
    }

    async triggerPlanExecution(planId) {
        if (this.state !== SCHEDULER_STATES.RUNNING) return null;
        if (!this.orchestrationEngine || !this.orchestrationStore) return null;

        const plan = this.orchestrationStore.getPlan(planId);
        if (!plan || !plan.enabled) return null;

        // Prevent overlapping execution
        if (this.runningPlans.has(plan.id)) {
            this.overlapCount++;
            this.orchestrationStore.addAuditLog('SCHEDULER', 'SKIPPED_OVERLAP', 'PLAN', plan.id, {
                reason: 'Plan is already executing'
            });
            return null;
        }

        this.runningPlans.add(plan.id);
        this.lastExecutedAt.set(plan.id, new Date().toISOString());

        try {
            const result = await this.orchestrationEngine.executePlan(plan, {
                idempotencyKey: `sched_${plan.id}_${Date.now()}`
            });
            return result;
        } catch (err) {
            this.orchestrationStore.addAuditLog('SCHEDULER', 'EXECUTION_ERROR', 'PLAN', plan.id, {
                error: err.message
            });
            return null;
        } finally {
            this.runningPlans.delete(plan.id);
        }
    }

    clearAllTimers() {
        this.timers.forEach(t => clearInterval(t));
        this.timers.clear();
    }

    getStatus() {
        return {
            state: this.state,
            activeTimersCount: this.timers.size,
            runningPlansCount: this.runningPlans.size,
            runningPlanIds: Array.from(this.runningPlans),
            overlapCount: this.overlapCount,
            lastExecutedAt: Object.fromEntries(this.lastExecutedAt)
        };
    }
}

module.exports = OrchestrationScheduler;
