/**
 * ReasoningStep Model
 * Discrete step in a structured reasoning plan (OBSERVE, ANALYZE, PLAN, DECIDE, ACTION, VERIFY).
 */

const REASONING_PHASES = Object.freeze({
    OBSERVE: 'OBSERVE',
    ANALYZE: 'ANALYZE',
    PLAN: 'PLAN',
    DECIDE: 'DECIDE',
    ACTION: 'ACTION',
    VERIFY: 'VERIFY'
});

class ReasoningStep {
    constructor(raw = {}) {
        this.stepId = raw.stepId || `rstep_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        this.phase = raw.phase && Object.values(REASONING_PHASES).includes(raw.phase) ? raw.phase : REASONING_PHASES.OBSERVE;
        this.title = raw.title || this.phase;
        this.detail = raw.detail || '';
        this.status = raw.status || 'PENDING'; // PENDING, PASSED, FAILED, SKIPPED
        this.output = raw.output !== undefined ? raw.output : null;
        this.timestamp = raw.timestamp || new Date().toISOString();
    }

    toJSON() {
        return {
            stepId: this.stepId,
            phase: this.phase,
            title: this.title,
            detail: this.detail,
            status: this.status,
            output: this.output,
            timestamp: this.timestamp
        };
    }
}

module.exports = { ReasoningStep, REASONING_PHASES };
