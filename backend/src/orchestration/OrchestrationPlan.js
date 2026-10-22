/**
 * OrchestrationPlan Model
 * Data-driven workflow definition describing target systems, execution steps, modes, schedules, and policies.
 */

const OrchestrationStep = require('./OrchestrationStep');
const { TARGET_MODES, EXECUTION_MODES, FAILURE_POLICIES } = require('./OrchestrationStates');

class OrchestrationPlan {
    constructor(data = {}) {
        this.id = data.id || `plan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.name = data.name || 'Universal Monitoring Plan';
        this.description = data.description || '';
        this.enabled = data.enabled !== false;
        
        this.targets = Array.isArray(data.targets) ? data.targets : [];
        const defaultMode = this.targets.length > 0 ? TARGET_MODES.SYSTEMS : TARGET_MODES.ALL_ACTIVE;
        this.targetMode = (data.targetMode || defaultMode).toUpperCase();
        this.targetFilter = data.targetFilter && typeof data.targetFilter === 'object' ? data.targetFilter : {};
        
        this.steps = Array.isArray(data.steps)
            ? data.steps.map(s => s instanceof OrchestrationStep ? s : new OrchestrationStep(s))
            : [];
            
        this.executionMode = (data.executionMode || EXECUTION_MODES.DEPENDENCY_AWARE).toUpperCase();
        this.failurePolicy = (data.failurePolicy || FAILURE_POLICIES.CONTINUE_AND_MARK_PARTIAL).toUpperCase();
        
        this.schedule = {
            enabled: data.schedule && data.schedule.enabled === true,
            intervalMs: data.schedule && typeof data.schedule.intervalMs === 'number' ? Math.max(1000, data.schedule.intervalMs) : 60000,
            cron: data.schedule && data.schedule.cron ? data.schedule.cron : null
        };

        this.concurrencyLimit = typeof data.concurrencyLimit === 'number' && data.concurrencyLimit > 0 ? data.concurrencyLimit : 5;
        this.timeoutMs = typeof data.timeoutMs === 'number' && data.timeoutMs > 0 ? data.timeoutMs : 300000;
        this.idempotencyWindowMs = typeof data.idempotencyWindowMs === 'number' ? data.idempotencyWindowMs : 60000;
        
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    validate() {
        const errors = [];
        if (!this.id || typeof this.id !== 'string') errors.push('Plan id is required');
        if (!this.name || typeof this.name !== 'string') errors.push('Plan name is required');
        if (!Object.values(TARGET_MODES).includes(this.targetMode)) {
            errors.push(`Invalid targetMode. Expected one of: ${Object.values(TARGET_MODES).join(', ')}`);
        }
        if (!Object.values(EXECUTION_MODES).includes(this.executionMode)) {
            errors.push(`Invalid executionMode. Expected one of: ${Object.values(EXECUTION_MODES).join(', ')}`);
        }
        if (!Object.values(FAILURE_POLICIES).includes(this.failurePolicy)) {
            errors.push(`Invalid failurePolicy. Expected one of: ${Object.values(FAILURE_POLICIES).join(', ')}`);
        }
        if (!Array.isArray(this.steps) || this.steps.length === 0) {
            errors.push('Plan must contain at least one step');
        } else {
            this.steps.forEach((step, idx) => {
                const res = step.validate();
                if (!res.valid) {
                    errors.push(`Step [${idx}] (${step.id}): ${res.errors.join(', ')}`);
                }
            });
        }

        return { valid: errors.length === 0, errors };
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            enabled: this.enabled,
            targetMode: this.targetMode,
            targets: this.targets,
            targetFilter: this.targetFilter,
            steps: this.steps.map(s => s.toJSON()),
            executionMode: this.executionMode,
            failurePolicy: this.failurePolicy,
            schedule: this.schedule,
            concurrencyLimit: this.concurrencyLimit,
            timeoutMs: this.timeoutMs,
            idempotencyWindowMs: this.idempotencyWindowMs,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = OrchestrationPlan;
