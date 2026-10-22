/**
 * OrchestrationResult Model
 * Universal, normalized execution result returned after an orchestration run completes.
 */

class OrchestrationResult {
    constructor(data = {}) {
        this.runId = data.runId || null;
        this.planId = data.planId || null;
        this.planName = data.planName || null;
        this.systemId = data.systemId || null;
        this.status = data.status || 'PENDING';
        this.startedAt = data.startedAt || new Date().toISOString();
        this.completedAt = data.completedAt || null;
        this.durationMs = typeof data.durationMs === 'number' ? data.durationMs : 0;
        this.systemsProcessed = typeof data.systemsProcessed === 'number' ? data.systemsProcessed : 0;
        this.stepsExecuted = typeof data.stepsExecuted === 'number' ? data.stepsExecuted : 0;
        this.stepsPassed = typeof data.stepsPassed === 'number' ? data.stepsPassed : 0;
        this.stepsFailed = typeof data.stepsFailed === 'number' ? data.stepsFailed : 0;
        this.stepsSkipped = typeof data.stepsSkipped === 'number' ? data.stepsSkipped : 0;
        this.stepResults = Array.isArray(data.stepResults) ? data.stepResults : [];
        this.errors = Array.isArray(data.errors) ? data.errors : [];
        this.warnings = Array.isArray(data.warnings) ? data.warnings : [];
        this.evidence = Array.isArray(data.evidence) ? data.evidence : [];
    }

    toJSON() {
        return {
            runId: this.runId,
            planId: this.planId,
            planName: this.planName,
            systemId: this.systemId,
            status: this.status,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            durationMs: this.durationMs,
            systemsProcessed: this.systemsProcessed,
            stepsExecuted: this.stepsExecuted,
            stepsPassed: this.stepsPassed,
            stepsFailed: this.stepsFailed,
            stepsSkipped: this.stepsSkipped,
            stepResults: this.stepResults,
            errors: this.errors,
            warnings: this.warnings,
            evidence: this.evidence
        };
    }
}

module.exports = OrchestrationResult;
