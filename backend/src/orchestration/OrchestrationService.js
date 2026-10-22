/**
 * OrchestrationService
 * Unified service facade orchestrating plan management, engine execution, continuous scheduler, and storage.
 */

const OrchestrationStore = require('./OrchestrationStore');
const OrchestrationEngine = require('./OrchestrationEngine');
const OrchestrationScheduler = require('./OrchestrationScheduler');
const OrchestrationPlan = require('./OrchestrationPlan');
const OrchestrationValidator = require('./OrchestrationValidator');

class OrchestrationService {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.healthEngine = options.healthEngine || null;
        this.qualityRunner = options.qualityRunner || null;
        this.usageCollector = options.usageCollector || null;
        this.experienceStore = options.experienceStore || null;
        this.intelligenceService = options.intelligenceService || null;
        this.alertingService = options.alertingService || null;
        this.reportingService = options.reportingService || null;

        this.orchestrationStore = options.orchestrationStore || new OrchestrationStore();

        this.orchestrationEngine = new OrchestrationEngine({
            systemRegistry: this.systemRegistry,
            healthEngine: this.healthEngine,
            qualityRunner: this.qualityRunner,
            usageCollector: this.usageCollector,
            experienceStore: this.experienceStore,
            intelligenceService: this.intelligenceService,
            alertingService: this.alertingService,
            reportingService: this.reportingService,
            orchestrationStore: this.orchestrationStore
        });

        this.orchestrationScheduler = new OrchestrationScheduler({
            orchestrationEngine: this.orchestrationEngine,
            orchestrationStore: this.orchestrationStore
        });
    }

    createPlan(planData) {
        const plan = planData instanceof OrchestrationPlan ? planData : new OrchestrationPlan(planData);
        const valRes = OrchestrationValidator.validatePlan(plan);
        if (!valRes.valid) {
            throw new Error(`Plan validation failed: ${valRes.errors.join('; ')}`);
        }
        return this.orchestrationStore.savePlan(plan);
    }

    getPlan(planId) {
        return this.orchestrationStore.getPlan(planId);
    }

    listPlans(filterFn = null) {
        return this.orchestrationStore.listPlans(filterFn);
    }

    updatePlan(planId, updates) {
        const existing = this.getPlan(planId);
        if (!existing) throw new Error(`Plan '${planId}' not found`);

        const merged = new OrchestrationPlan({
            ...existing.toJSON(),
            ...updates,
            id: planId,
            updatedAt: new Date().toISOString()
        });

        const valRes = OrchestrationValidator.validatePlan(merged);
        if (!valRes.valid) {
            throw new Error(`Updated plan validation failed: ${valRes.errors.join('; ')}`);
        }
        return this.orchestrationStore.savePlan(merged);
    }

    deletePlan(planId) {
        return this.orchestrationStore.deletePlan(planId);
    }

    async runPlan(planId, options = {}) {
        const plan = this.getPlan(planId);
        if (!plan) throw new Error(`Plan '${planId}' not found`);
        if (!plan.enabled) throw new Error(`Plan '${planId}' is currently disabled`);

        return await this.orchestrationEngine.executePlan(plan, options);
    }

    async runAdHocPlan(planData, options = {}) {
        const plan = new OrchestrationPlan(planData);
        return await this.orchestrationEngine.executePlan(plan, options);
    }

    cancelRun(runId) {
        return this.orchestrationEngine.cancelRun(runId);
    }

    getRun(runId) {
        return this.orchestrationStore.getRun(runId);
    }

    listRuns(filterFn = null) {
        return this.orchestrationStore.listRuns(filterFn);
    }

    getOverview() {
        const plans = this.listPlans();
        const runs = this.listRuns();
        const schedulerStatus = this.orchestrationScheduler.getStatus();

        return {
            totalPlans: plans.length,
            activePlans: plans.filter(p => p.enabled).length,
            totalRuns: runs.length,
            completedRuns: runs.filter(r => r.status === 'COMPLETED').length,
            failedRuns: runs.filter(r => r.status === 'FAILED').length,
            partialRuns: runs.filter(r => r.status === 'PARTIAL').length,
            runningRuns: runs.filter(r => r.status === 'RUNNING').length,
            cancelledRuns: runs.filter(r => r.status === 'CANCELLED').length,
            scheduler: schedulerStatus
        };
    }
}

module.exports = OrchestrationService;
