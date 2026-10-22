/**
 * Phase 34 — Adaptive Response Service (master facade)
 * Connects Decision Intelligence, Simulation, Response Center, remediation,
 * verification, incidents, Fleet Intelligence, and learning into one governed
 * lifecycle: PLAN → ELIGIBILITY → APPROVAL → EXECUTION → VERIFICATION →
 * OUTCOME → LEARNING. Delegates all execution/verification to existing
 * infrastructure; never implements its own.
 */

const { ResponsePlanOrchestrator } = require('./ResponsePlanOrchestrator');
const { ResponseEligibilityEngine } = require('./ResponseEligibilityEngine');
const { ResponseExecutionCoordinator } = require('./ResponseExecutionCoordinator');
const { ResponseOutcomeAnalyzer } = require('./ResponseOutcomeAnalyzer');
const { ExpectedVsActualAnalyzer } = require('./ExpectedVsActualAnalyzer');
const { ResponseLearningEngine } = require('./ResponseLearningEngine');
const { ResponseEffectivenessTracker } = require('./ResponseEffectivenessTracker');
const { AdaptiveResponseHistoryService } = require('./AdaptiveResponseHistoryService');
const { DecisionEvidenceService } = require('../decision/DecisionEvidenceService');

function pushStage(plan, stage) {
    if (!plan.lifecycle.includes(stage)) plan.lifecycle.push(stage);
}

class AdaptiveResponseService {
    constructor(options = {}) {
        this.responseCenterService = options.responseCenterService || null;
        this.monitoringService = options.monitoringService || null;
        this.evidenceService = options.evidenceService || new DecisionEvidenceService(options);
        this.decisionService = options.decisionService || options.decisionIntelligenceService || null;
        this.simulationService = options.simulationService || options.simulationIntelligenceService || null;
        this.fleetIntelligenceService = options.fleetIntelligenceService || null;
        this.auditService = options.auditService || options.auditLogService || null;

        this.planOrchestrator = options.planOrchestrator || new ResponsePlanOrchestrator({
            responseCenterService: this.responseCenterService,
            evidenceService: this.evidenceService,
            decisionService: this.decisionService,
            simulationService: this.simulationService,
            monitoringService: this.monitoringService
        });
        this.eligibilityEngine = options.eligibilityEngine || new ResponseEligibilityEngine({
            responseCenterService: this.responseCenterService,
            monitoringService: this.monitoringService
        });
        this.executionCoordinator = options.executionCoordinator || new ResponseExecutionCoordinator({
            responseCenterService: this.responseCenterService,
            eligibilityEngine: this.eligibilityEngine,
            monitoringService: this.monitoringService
        });
        this.outcomeAnalyzer = options.outcomeAnalyzer || new ResponseOutcomeAnalyzer({
            monitoringService: this.monitoringService
        });
        this.expectedVsActualAnalyzer = options.expectedVsActualAnalyzer || new ExpectedVsActualAnalyzer();
        this.learningEngine = options.learningEngine || new ResponseLearningEngine();
        this.effectivenessTracker = options.effectivenessTracker || new ResponseEffectivenessTracker();
        this.historyService = options.historyService || new AdaptiveResponseHistoryService({
            persistenceManager: options.persistenceManager || options.persistence || null
        });
    }

    getOverview({ tenantId = 'default-tenant' } = {}) {
        const plans = this.historyService.listPlans(tenantId);
        const awaitingApproval = plans.filter(p => p.approvalState === 'PENDING' && p.executionState === 'PLANNED').length;
        const executing = plans.filter(p => ['EXECUTING', 'VERIFYING'].includes(p.executionState)).length;
        const verificationPending = plans.filter(p => p.executionState === 'EXECUTED_VIA_RESPONSE_CENTER' && p.verificationState === 'PENDING').length;
        const recovered = plans.filter(p => p.verificationState === 'VERIFIED_RECOVERED').length;
        const failed = plans.filter(p => ['FAILED', 'DEGRADED', 'UNCHANGED'].includes(p.verificationState)).length;
        const unsupported = plans.filter(p => p.verificationState === 'UNSUPPORTED' || p.executionState === 'STOPPED_UNSUPPORTED').length;
        const learningEvents = plans.reduce((n, p) => n + ((this.historyService.learnings.get(p.adaptivePlanId) || []).length), 0);
        return {
            tenantId,
            timestamp: new Date().toISOString(),
            scorecard: {
                totalPlans: plans.length,
                awaitingApproval,
                executing,
                verificationPending,
                recovered,
                failed,
                unsupported,
                learningEvents
            },
            recentPlans: [...plans].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10),
            note: 'Governance lifecycle only. Execution and verification run exclusively in existing Response Center infrastructure.'
        };
    }

    createPlan(params, { operator = 'operator', userRole = 'OPERATOR' } = {}) {
        const plan = this.planOrchestrator.createAdaptivePlan({ ...params, operator, userRole });
        pushStage(plan, 'ELIGIBILITY');
        const eligibility = this.eligibilityEngine.checkEligibility(plan, { tenantId: plan.tenantId, userRole });
        plan.eligibility = eligibility;
        this.historyService.savePlan(plan);
        this._audit('ADAPTIVE_PLAN_CREATED', plan);
        return this._view(plan);
    }

    getPlan(adaptivePlanId, { tenantId = 'default-tenant' } = {}) {
        const plan = this.historyService.getPlan(adaptivePlanId, tenantId);
        if (!plan) return { status: 'NOT_FOUND', adaptivePlanId, tenantId };
        return { status: 'FOUND', ...this._view(plan) };
    }

    checkEligibility(adaptivePlanId, { tenantId = 'default-tenant', userRole = 'OPERATOR' } = {}) {
        const plan = this.historyService.getPlan(adaptivePlanId, tenantId);
        if (!plan) return { status: 'NOT_FOUND', adaptivePlanId, tenantId };
        const eligibility = this.eligibilityEngine.checkEligibility(plan, { tenantId, userRole });
        plan.eligibility = eligibility;
        this.historyService.updatePlan(adaptivePlanId, { eligibility });
        return { status: 'FOUND', adaptivePlanId, tenantId, eligibility };
    }

    approvePlan(adaptivePlanId, { tenantId = 'default-tenant', operator = 'operator', userRole = 'OPERATOR' } = {}) {
        const plan = this.historyService.getPlan(adaptivePlanId, tenantId);
        if (!plan) return { status: 'NOT_FOUND', adaptivePlanId, tenantId };
        if (String(userRole).toUpperCase() === 'VIEWER') {
            const err = new Error("RBAC Access Denied: User role 'VIEWER' is not authorized to approve operational responses.");
            err.statusCode = 403;
            throw err;
        }
        // Delegate to the existing approval service (authoritative, incl. Compa/Repa guard).
        const updated = this.responseCenterService.approveResponse({ planId: plan.responseCenterPlanId, operatorId: operator, userRole, tenantId });
        pushStage(plan, 'APPROVAL');
        this.historyService.updatePlan(adaptivePlanId, { approvalState: updated.approvalState || 'APPROVED', lifecycle: plan.lifecycle });
        this._audit('ADAPTIVE_PLAN_APPROVED', plan);
        return { status: 'APPROVED', adaptivePlanId, tenantId, approval: updated, plan: this._view(this.historyService.getPlan(adaptivePlanId, tenantId)).plan };
    }

    async executePlan(adaptivePlanId, { tenantId = 'default-tenant', operator = 'operator', userRole = 'OPERATOR' } = {}) {
        const plan = this.historyService.getPlan(adaptivePlanId, tenantId);
        if (!plan) return { status: 'NOT_FOUND', adaptivePlanId, tenantId };
        if (String(userRole).toUpperCase() === 'VIEWER') {
            const err = new Error("RBAC Access Denied: User role 'VIEWER' is not authorized to execute response plans.");
            err.statusCode = 403;
            throw err;
        }
        const coordination = await this.executionCoordinator.executeAdaptivePlan(plan, { tenantId, operator, userRole });
        pushStage(plan, 'EXECUTION');
        const patch = { lifecycle: plan.lifecycle };
        if (coordination.outcome === 'EXECUTED_VIA_RESPONSE_CENTER') {
            patch.executionState = 'EXECUTED_VIA_RESPONSE_CENTER';
        } else if (coordination.outcome === 'EXECUTION_FAILED') {
            patch.executionState = 'FAILED';
        } else {
            patch.executionState = coordination.outcome; // STOPPED_* states are recorded, not executed
        }
        this.historyService.updatePlan(adaptivePlanId, patch);
        this.historyService.saveCoordination(adaptivePlanId, coordination);
        this._audit('ADAPTIVE_PLAN_EXECUTED', plan);
        return { status: 'FOUND', adaptivePlanId, tenantId, coordination, plan: this._view(this.historyService.getPlan(adaptivePlanId, tenantId)).plan };
    }

    async verifyPlan(adaptivePlanId, { tenantId = 'default-tenant' } = {}) {
        const plan = this.historyService.getPlan(adaptivePlanId, tenantId);
        if (!plan) return { status: 'NOT_FOUND', adaptivePlanId, tenantId };
        const bundle = await this.executionCoordinator.verifyAdaptivePlan(plan, { tenantId });
        pushStage(plan, 'VERIFICATION');
        this.historyService.updatePlan(adaptivePlanId, { lifecycle: plan.lifecycle });
        this.historyService.saveVerification(adaptivePlanId, bundle);
        // Outcome analysis immediately follows verification (observed facts only).
        const coordination = this.historyService.coordinations.get(adaptivePlanId) || null;
        const outcome = this.outcomeAnalyzer.analyzeOutcome({ adaptivePlan: plan, coordination, verificationBundle: bundle, tenantId });
        pushStage(plan, 'OUTCOME');
        this.historyService.updatePlan(adaptivePlanId, { verificationState: outcome.verificationState, lifecycle: plan.lifecycle });
        this.historyService.saveOutcome(adaptivePlanId, outcome);
        const comparison = this.expectedVsActualAnalyzer.compareExpectedVsActual({ adaptivePlan: plan, outcomeAnalysis: outcome, tenantId });
        this.historyService.saveComparison(adaptivePlanId, comparison);
        this._audit('ADAPTIVE_PLAN_VERIFIED', plan);
        return { status: 'FOUND', adaptivePlanId, tenantId, verification: bundle.verification, outcome, plan: this._view(this.historyService.getPlan(adaptivePlanId, tenantId)).plan };
    }

    analyzeOutcome(adaptivePlanId, { tenantId = 'default-tenant' } = {}) {
        const plan = this.historyService.getPlan(adaptivePlanId, tenantId);
        if (!plan) return { status: 'NOT_FOUND', adaptivePlanId, tenantId };
        const existing = this.historyService.outcomes.get(adaptivePlanId);
        if (existing) {
            const comparison = this.historyService.comparisons.get(adaptivePlanId) || null;
            return { status: 'FOUND', adaptivePlanId, tenantId, outcome: existing, comparison };
        }
        const coordination = this.historyService.coordinations.get(adaptivePlanId) || null;
        const verificationBundle = this.historyService.verifications.get(adaptivePlanId) || null;
        const outcome = this.outcomeAnalyzer.analyzeOutcome({ adaptivePlan: plan, coordination, verificationBundle, tenantId });
        const comparison = this.expectedVsActualAnalyzer.compareExpectedVsActual({ adaptivePlan: plan, outcomeAnalysis: outcome, tenantId });
        pushStage(plan, 'OUTCOME');
        this.historyService.updatePlan(adaptivePlanId, { verificationState: outcome.verificationState, lifecycle: plan.lifecycle });
        this.historyService.saveOutcome(adaptivePlanId, outcome);
        this.historyService.saveComparison(adaptivePlanId, comparison);
        return { status: 'FOUND', adaptivePlanId, tenantId, outcome, comparison };
    }

    learnFromOutcome(adaptivePlanId, { tenantId = 'default-tenant' } = {}) {
        const plan = this.historyService.getPlan(adaptivePlanId, tenantId);
        if (!plan) return { status: 'NOT_FOUND', adaptivePlanId, tenantId };
        const analyzed = this.analyzeOutcome(adaptivePlanId, { tenantId });
        const records = this.learningEngine.learnFromOutcome({
            adaptivePlan: plan,
            outcomeAnalysis: analyzed.outcome,
            comparison: analyzed.comparison,
            tenantId
        });
        pushStage(plan, 'LEARNING');
        this.historyService.updatePlan(adaptivePlanId, { lifecycle: plan.lifecycle });
        const merged = this.historyService.saveLearnings(adaptivePlanId, records);
        // Effectiveness tracking (counts/durations only, no scores).
        const outcome = analyzed.outcome;
        const durationSeconds = outcome.preState && outcome.postState && outcome.preState.capturedAt && outcome.postState.capturedAt
            ? Math.max(0, Math.round((new Date(outcome.postState.capturedAt) - new Date(outcome.preState.capturedAt)) / 1000))
            : null;
        this.effectivenessTracker.trackRecord({
            responseType: plan.selectedResponse ? plan.selectedResponse.optionType : 'UNKNOWN',
            agentId: plan.agentId,
            problemType: plan.sourceContext && plan.sourceContext.decisionScenario ? plan.sourceContext.decisionScenario.scenarioType : null,
            incidentType: plan.sourceContext && plan.sourceContext.incident ? plan.sourceContext.incident.severity : null,
            dependencyScope: plan.affectedDependencies && plan.affectedDependencies.length > 0 ? plan.affectedDependencies.join(',') : null,
            verificationState: outcome.verificationState,
            durationSeconds,
            planId: adaptivePlanId,
            tenantId
        });
        this._audit('ADAPTIVE_LEARNING_RECORDED', plan);
        return { status: 'FOUND', adaptivePlanId, tenantId, learning: merged };
    }

    getHistory({ tenantId = 'default-tenant' } = {}) {
        return { tenantId, plans: this.historyService.getHistory(tenantId) };
    }

    getEffectiveness(params) {
        return this.effectivenessTracker.getEffectiveness(params);
    }

    getOutcomePatterns(params) {
        return this.effectivenessTracker.getOutcomePatterns(params);
    }

    getAgentResponseHistory(agentId, { tenantId = 'default-tenant' } = {}) {
        const plans = this.historyService.listPlans(tenantId).filter(p => p.agentId === agentId);
        return {
            tenantId,
            agentId,
            plans: plans.map(p => ({
                adaptivePlanId: p.adaptivePlanId,
                lifecycle: p.lifecycle,
                approvalState: p.approvalState,
                executionState: p.executionState,
                verificationState: p.verificationState,
                learning: this.historyService.learnings.get(p.adaptivePlanId) || []
            }))
        };
    }

    _view(plan) {
        return {
            plan,
            coordination: this.historyService.coordinations.get(plan.adaptivePlanId) || null,
            verification: this.historyService.verifications.get(plan.adaptivePlanId) || null,
            outcome: this.historyService.outcomes.get(plan.adaptivePlanId) || null,
            comparison: this.historyService.comparisons.get(plan.adaptivePlanId) || null,
            learning: this.historyService.learnings.get(plan.adaptivePlanId) || []
        };
    }

    _audit(eventType, plan) {
        try {
            if (this.auditService && typeof this.auditService.logEvent === 'function') {
                this.auditService.logEvent({
                    eventType,
                    action: 'adaptive_response_lifecycle',
                    actor: 'operator',
                    tenantId: plan ? plan.tenantId : 'default-tenant',
                    resourceType: 'adaptive-response-plan',
                    resourceId: plan ? plan.adaptivePlanId : 'unknown',
                    outcome: 'SUCCESS',
                    severity: 'INFO',
                    correlationId: `adp_${Date.now()}`,
                    metadata: { agentId: plan ? plan.agentId : null }
                });
            }
        } catch (e) { /* audit non-fatal */ }
    }
}

module.exports = { AdaptiveResponseService };
