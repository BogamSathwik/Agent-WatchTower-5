/**
 * OrchestrationEngine
 * Core orchestrator coordinating Health, Quality, Usage, Experience, Intelligence, Alerting, and Reporting.
 */

const OrchestrationPlan = require('./OrchestrationPlan');
const OrchestrationRun = require('./OrchestrationRun');
const OrchestrationResult = require('./OrchestrationResult');
const OrchestrationValidator = require('./OrchestrationValidator');
const { RUN_STATES, STEP_STATES, TARGET_MODES, EXECUTION_MODES, FAILURE_POLICIES, STEP_TYPES } = require('./OrchestrationStates');

class OrchestrationEngine {
    constructor({
        systemRegistry = null,
        healthEngine = null,
        qualityRunner = null,
        usageCollector = null,
        experienceStore = null,
        intelligenceService = null,
        alertingService = null,
        reportingService = null,
        orchestrationStore = null
    } = {}) {
        this.systemRegistry = systemRegistry;
        this.healthEngine = healthEngine;
        this.qualityRunner = qualityRunner;
        this.usageCollector = usageCollector;
        this.experienceStore = experienceStore;
        this.intelligenceService = intelligenceService;
        this.alertingService = alertingService;
        this.reportingService = reportingService;
        this.orchestrationStore = orchestrationStore;
        
        this.activeRuns = new Map(); // runId -> OrchestrationRun
    }

    async executePlan(planInput, options = {}) {
        const plan = planInput instanceof OrchestrationPlan ? planInput : new OrchestrationPlan(planInput);
        
        // 1. Validation
        const valRes = OrchestrationValidator.validatePlan(plan);
        if (!valRes.valid) {
            throw new Error(`Plan validation failed: ${valRes.errors.join('; ')}`);
        }

        // 2. Idempotency Check
        const idempotencyKey = options.idempotencyKey || null;
        if (idempotencyKey && this.orchestrationStore) {
            const existingRun = this.orchestrationStore.getRunByIdempotencyKey(idempotencyKey);
            if (existingRun) {
                return new OrchestrationResult(existingRun);
            }
        }

        // 3. Resolve Target Systems
        const targetSystemIds = this.resolveTargetSystems(plan);
        if (targetSystemIds.length === 0) {
            throw new Error(`No target systems resolved for plan '${plan.id}' (mode: ${plan.targetMode})`);
        }

        // 4. Create Run
        const run = new OrchestrationRun({
            planId: plan.id,
            planName: plan.name,
            idempotencyKey,
            systemsTargeted: targetSystemIds
        });

        if (this.orchestrationStore) {
            this.orchestrationStore.saveRun(run);
        }
        this.activeRuns.set(run.runId, run);

        run.transitionTo(RUN_STATES.RUNNING);

        // Overall Timeout Guard
        let isTimedOut = false;
        const overallTimer = setTimeout(() => {
            isTimedOut = true;
            if (run.status === RUN_STATES.RUNNING) {
                run.errors.push('Overall orchestration timeout exceeded');
                run.transitionTo(RUN_STATES.FAILED, 'OVERALL_TIMEOUT');
            }
        }, plan.timeoutMs);

        try {
            let totalExecuted = 0;
            let totalPassed = 0;
            let totalFailed = 0;
            let totalSkipped = 0;
            const aggregatedStepResults = [];
            const aggregatedEvidence = [];

            // Process per system
            for (const systemId of targetSystemIds) {
                if (isTimedOut || run.status === RUN_STATES.CANCELLED) break;

                const sysResult = await this.executePlanForSystem(plan, systemId, run);
                
                totalExecuted += sysResult.stepsExecuted;
                totalPassed += sysResult.stepsPassed;
                totalFailed += sysResult.stepsFailed;
                totalSkipped += sysResult.stepsSkipped;
                aggregatedStepResults.push(...sysResult.stepResults);
                aggregatedEvidence.push(...sysResult.evidence);

                if (sysResult.status === RUN_STATES.FAILED && plan.failurePolicy === FAILURE_POLICIES.FAIL_FAST) {
                    run.errors.push(`FAIL_FAST triggered by system failure on '${systemId}'`);
                    break;
                }
            }

            clearTimeout(overallTimer);

            if (run.status === RUN_STATES.RUNNING) {
                if (totalFailed === 0) {
                    run.transitionTo(RUN_STATES.COMPLETED);
                } else if (plan.failurePolicy === FAILURE_POLICIES.FAIL_FAST) {
                    run.transitionTo(RUN_STATES.FAILED);
                } else if (plan.failurePolicy === FAILURE_POLICIES.CONTINUE_AND_MARK_PARTIAL || totalPassed > 0) {
                    run.transitionTo(RUN_STATES.PARTIAL);
                } else {
                    run.transitionTo(RUN_STATES.FAILED);
                }
            }

            run.stepResults = aggregatedStepResults;

            const finalResult = new OrchestrationResult({
                runId: run.runId,
                planId: plan.id,
                planName: plan.name,
                systemId: targetSystemIds.length === 1 ? targetSystemIds[0] : 'MULTI_SYSTEM',
                status: run.status,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
                durationMs: run.durationMs,
                systemsProcessed: targetSystemIds.length,
                stepsExecuted: totalExecuted,
                stepsPassed: totalPassed,
                stepsFailed: totalFailed,
                stepsSkipped: totalSkipped,
                stepResults: aggregatedStepResults,
                errors: run.errors,
                warnings: run.warnings,
                evidence: aggregatedEvidence
            });

            if (this.orchestrationStore) {
                this.orchestrationStore.saveRun(run);
            }
            return finalResult;
        } finally {
            clearTimeout(overallTimer);
            this.activeRuns.delete(run.runId);
        }
    }

    async executePlanForSystem(plan, systemId, run) {
        let stepsToRun = plan.steps.filter(s => s.enabled);
        if (plan.executionMode === EXECUTION_MODES.DEPENDENCY_AWARE) {
            stepsToRun = OrchestrationValidator.resolveExecutionOrder(stepsToRun);
        }

        const stepStateMap = new Map(); // stepId -> STEP_STATES
        const stepResults = [];
        const evidence = [];
        let systemFailed = false;

        for (const step of stepsToRun) {
            if (run.status === RUN_STATES.CANCELLED) break;

            // Check step dependencies
            const depsPassed = (step.dependsOn || []).every(depId => stepStateMap.get(depId) === STEP_STATES.PASSED);
            if (!depsPassed) {
                stepStateMap.set(step.id, STEP_STATES.SKIPPED);
                stepResults.push({
                    stepId: step.id,
                    systemId,
                    type: step.type,
                    status: STEP_STATES.SKIPPED,
                    reason: 'Unsatisfied or failed dependencies'
                });
                continue;
            }

            // Execute step with retry & timeout
            const stepResult = await this.executeStepWithRetry(step, systemId, run);
            stepStateMap.set(step.id, stepResult.status);
            stepResults.push(stepResult);

            if (stepResult.evidence) {
                evidence.push(...(Array.isArray(stepResult.evidence) ? stepResult.evidence : [stepResult.evidence]));
            }

            if (stepResult.status === STEP_STATES.FAILED) {
                systemFailed = true;
                if (!step.continueOnFailure && plan.failurePolicy === FAILURE_POLICIES.FAIL_FAST) {
                    break;
                }
            }
        }

        const executed = stepResults.filter(r => r.status !== STEP_STATES.SKIPPED).length;
        const passed = stepResults.filter(r => r.status === STEP_STATES.PASSED).length;
        const failed = stepResults.filter(r => r.status === STEP_STATES.FAILED).length;
        const skipped = stepResults.filter(r => r.status === STEP_STATES.SKIPPED).length;

        return {
            status: systemFailed ? RUN_STATES.FAILED : RUN_STATES.COMPLETED,
            stepsExecuted: executed,
            stepsPassed: passed,
            stepsFailed: failed,
            stepsSkipped: skipped,
            stepResults,
            evidence
        };
    }

    async executeStepWithRetry(step, systemId, run) {
        const maxAttempts = step.retryPolicy ? step.retryPolicy.maxAttempts : 1;
        const backoffMs = step.retryPolicy ? step.retryPolicy.backoffMs : 0;
        
        let attempt = 0;
        let lastError = null;
        const startedAt = new Date().toISOString();

        run.addTimelineEvent('STEP_STARTED', { stepId: step.id, type: step.type, systemId });

        while (attempt < maxAttempts) {
            attempt++;
            try {
                const output = await this.executeStepWithTimeout(step, systemId);
                const completedAt = new Date().toISOString();
                const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

                run.addTimelineEvent('STEP_COMPLETED', { stepId: step.id, systemId, attempts: attempt });

                return {
                    stepId: step.id,
                    systemId,
                    type: step.type,
                    status: STEP_STATES.PASSED,
                    attempts: attempt,
                    startedAt,
                    completedAt,
                    durationMs,
                    result: this.sanitizeOutput(output),
                    evidence: {
                        source: step.type,
                        systemId,
                        timestamp: completedAt,
                        data: this.sanitizeOutput(output)
                    }
                };
            } catch (err) {
                lastError = err;
                const isRetryable = this.isErrorRetryable(err, step.retryPolicy);

                if (attempt < maxAttempts && isRetryable) {
                    if (backoffMs > 0) {
                        await new Promise(r => setTimeout(r, backoffMs));
                    }
                } else {
                    break;
                }
            }
        }

        const completedAt = new Date().toISOString();
        const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
        run.addTimelineEvent('STEP_FAILED', { stepId: step.id, systemId, error: lastError ? lastError.message : 'Unknown' });

        return {
            stepId: step.id,
            systemId,
            type: step.type,
            status: STEP_STATES.FAILED,
            attempts: attempt,
            startedAt,
            completedAt,
            durationMs,
            error: {
                message: lastError ? lastError.message : 'Step execution failed',
                code: lastError && lastError.code ? lastError.code : 'STEP_FAILED'
            }
        };
    }

    async executeStepWithTimeout(step, systemId) {
        return new Promise((resolve, reject) => {
            let timer = null;

            if (step.timeoutMs > 0) {
                timer = setTimeout(() => {
                    const err = new Error(`Step '${step.id}' timed out after ${step.timeoutMs}ms`);
                    err.code = 'TIMEOUT_ERROR';
                    reject(err);
                }, step.timeoutMs);
            }

            this.dispatchStepHandler(step, systemId)
                .then(res => {
                    if (timer) clearTimeout(timer);
                    resolve(res);
                })
                .catch(err => {
                    if (timer) clearTimeout(timer);
                    reject(err);
                });
        });
    }

    async dispatchStepHandler(step, systemId) {
        switch (step.type) {
            case STEP_TYPES.HEALTH:
                if (!this.healthEngine) return { status: 'SKIPPED', message: 'Health engine not attached' };
                return await this.healthEngine.checkHealth(systemId);

            case STEP_TYPES.QUALITY:
                if (!this.qualityRunner) return { status: 'SKIPPED', message: 'Quality runner not attached' };
                if (typeof this.qualityRunner.runAllTests === 'function') {
                    return await this.qualityRunner.runAllTests(systemId);
                }
                if (typeof this.qualityRunner.runTestsForSystem === 'function') {
                    return await this.qualityRunner.runTestsForSystem(systemId);
                }
                return { status: 'PASSED' };

            case STEP_TYPES.USAGE:
                if (!this.usageCollector) return { status: 'SKIPPED', message: 'Usage collector not attached' };
                return typeof this.usageCollector.getSystemMetrics === 'function' ? await this.usageCollector.getSystemMetrics(systemId) : { status: 'RECORDED' };

            case STEP_TYPES.EXPERIENCE:
                if (!this.experienceStore) return { status: 'SKIPPED', message: 'Experience store not attached' };
                return typeof this.experienceStore.getSystemSummary === 'function' ? await this.experienceStore.getSystemSummary(systemId) : { status: 'COLLECTED' };

            case STEP_TYPES.INTELLIGENCE:
                if (!this.intelligenceService) return { status: 'SKIPPED', message: 'Intelligence service not attached' };
                return await this.intelligenceService.analyzeSystem(systemId);

            case STEP_TYPES.ALERT:
                if (!this.alertingService) return { status: 'SKIPPED', message: 'Alerting service not attached' };
                if (typeof this.alertingService.evaluateSystem === 'function') {
                    return await this.alertingService.evaluateSystem(systemId);
                }
                if (typeof this.alertingService.evaluateSystemAlerts === 'function') {
                    return await this.alertingService.evaluateSystemAlerts(systemId);
                }
                return { status: 'EVALUATED' };

            case STEP_TYPES.REPORT:
                if (!this.reportingService) return { status: 'SKIPPED', message: 'Reporting service not attached' };
                if (typeof this.reportingService.generateReport === 'function') {
                    return await this.reportingService.generateReport(systemId);
                }
                if (typeof this.reportingService.generateSystemReport === 'function') {
                    return await this.reportingService.generateSystemReport(systemId);
                }
                return { status: 'GENERATED' };

            default:
                throw new Error(`Unsupported orchestration step type '${step.type}'`);
        }
    }

    resolveTargetSystems(plan) {
        if (plan.targetMode === TARGET_MODES.SYSTEM || plan.targetMode === TARGET_MODES.SYSTEMS) {
            return plan.targets || [];
        }

        if (!this.systemRegistry) {
            return plan.targets || [];
        }

        const allSystems = this.systemRegistry.getAllSystems ? this.systemRegistry.getAllSystems() : (this.systemRegistry.listSystems ? this.systemRegistry.listSystems() : []);
        if (plan.targetMode === TARGET_MODES.ALL_ACTIVE) {
            return allSystems
                .filter(s => s.status !== 'OFFLINE' && s.status !== 'INACTIVE')
                .map(s => s.id || s.systemId);
        }

        if (plan.targetMode === TARGET_MODES.FILTER) {
            const filter = plan.targetFilter || {};
            return allSystems
                .filter(sys => {
                    for (const [k, v] of Object.entries(filter)) {
                        if (sys[k] !== v) return false;
                    }
                    return true;
                })
                .map(s => s.id || s.systemId);
        }

        return plan.targets || [];
    }

    isErrorRetryable(err, retryPolicy) {
        if (!retryPolicy || !Array.isArray(retryPolicy.retryableErrors)) return true;
        const code = err ? (err.code || err.name) : '';
        return retryPolicy.retryableErrors.some(e => code.includes(e) || err.message.includes(e));
    }

    cancelRun(runId) {
        const run = this.activeRuns.get(runId) || (this.orchestrationStore ? this.orchestrationStore.getRun(runId) : null);
        if (!run) return false;
        if (run.status === RUN_STATES.RUNNING || run.status === RUN_STATES.PENDING) {
            run.transitionTo(RUN_STATES.CANCELLED, 'USER_REQUESTED');
            if (this.orchestrationStore) this.orchestrationStore.saveRun(run);
            return true;
        }
        return false;
    }

    sanitizeOutput(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        const redacted = JSON.parse(JSON.stringify(obj));
        const sanitizeKeys = (item) => {
            if (!item || typeof item !== 'object') return;
            Object.keys(item).forEach(k => {
                if (/token|secret|password|key|authorization/i.test(k)) {
                    item[k] = '[REDACTED]';
                } else if (typeof item[k] === 'object') {
                    sanitizeKeys(item[k]);
                }
            });
        };
        sanitizeKeys(redacted);
        return redacted;
    }
}

module.exports = OrchestrationEngine;
