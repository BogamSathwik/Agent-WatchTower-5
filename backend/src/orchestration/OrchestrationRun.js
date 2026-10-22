/**
 * OrchestrationRun Model
 * Active execution instance tracking status, timeline events, step states, and idempotency key.
 */

const { RUN_STATES, isValidRunTransition } = require('./OrchestrationStates');

class OrchestrationRun {
    constructor(data = {}) {
        this.runId = data.runId || `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.planId = data.planId || null;
        this.planName = data.planName || '';
        this.status = data.status || RUN_STATES.PENDING;
        this.idempotencyKey = data.idempotencyKey || null;
        
        this.startedAt = data.startedAt || new Date().toISOString();
        this.completedAt = data.completedAt || null;
        this.durationMs = data.durationMs || 0;
        
        this.systemsTargeted = Array.isArray(data.systemsTargeted) ? data.systemsTargeted : [];
        this.stepResults = Array.isArray(data.stepResults) ? data.stepResults : [];
        this.timeline = Array.isArray(data.timeline) ? data.timeline : [];
        this.errors = Array.isArray(data.errors) ? data.errors : [];
        this.warnings = Array.isArray(data.warnings) ? data.warnings : [];

        if (this.timeline.length === 0) {
            this.addTimelineEvent('RUN_CREATED', { planId: this.planId });
        }
    }

    transitionTo(nextStatus, reason = '') {
        if (!isValidRunTransition(this.status, nextStatus)) {
            throw new Error(`Invalid run state transition from '${this.status}' to '${nextStatus}'`);
        }
        this.status = nextStatus;
        if (nextStatus === RUN_STATES.COMPLETED || nextStatus === RUN_STATES.FAILED || nextStatus === RUN_STATES.PARTIAL || nextStatus === RUN_STATES.CANCELLED) {
            this.completedAt = new Date().toISOString();
            this.durationMs = new Date(this.completedAt).getTime() - new Date(this.startedAt).getTime();
        }
        this.addTimelineEvent(`STATUS_CHANGED_${nextStatus}`, { reason });
        return this;
    }

    addTimelineEvent(eventType, metadata = {}) {
        this.timeline.push({
            event: eventType,
            timestamp: new Date().toISOString(),
            metadata
        });
    }

    toJSON() {
        return {
            runId: this.runId,
            planId: this.planId,
            planName: this.planName,
            status: this.status,
            idempotencyKey: this.idempotencyKey,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            durationMs: this.durationMs,
            systemsTargeted: this.systemsTargeted,
            stepResults: this.stepResults,
            timeline: this.timeline,
            errors: this.errors,
            warnings: this.warnings
        };
    }
}

module.exports = OrchestrationRun;
