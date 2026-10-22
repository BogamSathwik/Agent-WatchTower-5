/**
 * Phase 29 — Intelligent Response Center Service
 * Master orchestration service for autonomous operations and response center intelligence.
 * Connects Response Option Engine, Safety Engine, Plan Service, Approval Service,
 * Execution Service, Verification Service, History Service, Learning Service, and Recommendation Service.
 * Integrates directly with Incident Management and Knowledge Graph services without creating duplicate systems.
 */

const { ResponseOptionEngine } = require('./ResponseOptionEngine');
const { ResponseSafetyEngine } = require('./ResponseSafetyEngine');
const { ResponsePlanService } = require('./ResponsePlanService');
const { ResponseApprovalService } = require('./ResponseApprovalService');
const { ResponseExecutionService } = require('./ResponseExecutionService');
const { ResponseVerificationService } = require('./ResponseVerificationService');
const { ResponseHistoryService } = require('./ResponseHistoryService');
const { ResponseLearningService } = require('./ResponseLearningService');
const { ResponseRecommendationService } = require('./ResponseRecommendationService');

class IntelligentResponseCenterService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.remediationService = options.remediationService || null;
        this.workflowOrchestrator = options.intelligentWorkflowOrchestrator || options.workflowOrchestrator || null;
        this.automationPolicyEngine = options.automationPolicyEngine || null;
        this.automationDecisionService = options.automationDecisionService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
        this.rootCauseAnalyzer = options.rootCauseAnalyzer || null;
        this.investigationContextService = options.investigationContextService || null;
        this.knowledgeGraphService = options.agentKnowledgeGraphService || options.knowledgeGraphService || null;
        this.knowledgeGraphBuilder = options.knowledgeGraphBuilder || null;
        this.auditService = options.auditService || null;
        this.persistence = options.persistenceManager || options.persistence || null;
        this.sseManager = options.sseManager || null;

        // Initialize sub-engines
        this.optionEngine = options.optionEngine || new ResponseOptionEngine({
            remediationService: this.remediationService,
            workflowOrchestrator: this.workflowOrchestrator
        });

        this.safetyEngine = options.safetyEngine || new ResponseSafetyEngine({
            automationPolicyEngine: this.automationPolicyEngine,
            blastRadiusAnalyzer: this.blastRadiusAnalyzer
        });

        this.planService = options.planService || new ResponsePlanService({
            persistenceManager: this.persistence
        });

        this.approvalService = options.approvalService || new ResponseApprovalService({
            planService: this.planService,
            auditService: this.auditService
        });

        this.executionService = options.executionService || new ResponseExecutionService({
            planService: this.planService,
            remediationService: this.remediationService,
            workflowOrchestrator: this.workflowOrchestrator,
            monitoringService: this.monitoringService,
            auditService: this.auditService,
            sseManager: this.sseManager
        });

        this.verificationService = options.verificationService || new ResponseVerificationService({
            planService: this.planService,
            monitoringService: this.monitoringService,
            remediationService: this.remediationService,
            auditService: this.auditService
        });

        this.historyService = options.historyService || new ResponseHistoryService();

        this.learningService = options.learningService || new ResponseLearningService({
            persistenceManager: this.persistence
        });

        this.recommendationService = options.recommendationService || new ResponseRecommendationService({
            learningService: this.learningService,
            optionEngine: this.optionEngine
        });
    }

    /**
     * Creates context for an operational problem.
     */
    createResponseContext({ agentId, incidentId = null, problemSummary = 'Operational issue', tenantId = 'default-tenant' } = {}) {
        let incident = null;
        if (incidentId && this.monitoringService && this.monitoringService.store) {
            incident = this.monitoringService.store.incidents?.get(incidentId) || null;
        }

        const evidence = [];
        if (this.monitoringService && this.monitoringService.store) {
            const statusRec = typeof this.monitoringService.store.getStatus === 'function'
                ? this.monitoringService.store.getStatus(agentId, tenantId)
                : this.monitoringService.store.statuses?.get(agentId);

            if (statusRec) {
                evidence.push(`Agent health check: ${statusRec.status || statusRec.health || 'UNKNOWN'}`);
                if (statusRec.latency) evidence.push(`Latency measurement: ${statusRec.latency}ms`);
            }
        }

        if (incident) {
            evidence.push(`Active incident ${incident.incidentId}: ${incident.summary || incident.title || 'Incident open'}`);
        }

        return {
            agentId,
            incidentId,
            problemSummary,
            evidence: evidence.length > 0 ? evidence : [`Agent ${agentId} reported operational alert.`],
            tenantId,
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Generates available response options.
     */
    generateResponseOptions({ agentId, incidentId = null, tenantId = 'default-tenant' } = {}) {
        const context = this.createResponseContext({ agentId, incidentId, tenantId });
        return this.optionEngine.generateOptions(context);
    }

    /**
     * Evaluates safety of an action.
     */
    evaluateResponseSafety({ action, agentId, userRole = 'OPERATOR', incident = null }) {
        return this.safetyEngine.evaluateSafety({ action, agentId, userRole, incident });
    }

    /**
     * Constructs a response plan.
     */
    createResponsePlan({ agentId, incidentId = null, selectedAction = null, operatorId = 'OPERATOR', userRole = 'OPERATOR', tenantId = 'default-tenant' } = {}) {
        const context = this.createResponseContext({ agentId, incidentId, tenantId });
        const options = this.optionEngine.generateOptions(context);
        
        const action = selectedAction || options[0];
        const safety = this.safetyEngine.evaluateSafety({ action, agentId, userRole, incident: context.incident });

        const plan = this.planService.createPlan({
            incidentId,
            targetAgentId: agentId,
            problemSummary: context.problemSummary,
            evidence: context.evidence,
            responseOptions: options,
            selectedAction: action,
            safety,
            operatorId,
            tenantId
        });

        // Record history step
        this.historyService.addStep(plan.planId, {
            actor: operatorId,
            action: 'RESPONSE_PLAN_CREATED',
            status: 'INFO',
            summary: `Response plan created for ${agentId}. Action selected: ${action?.title || action?.actionType}.`,
            evidence: context.evidence
        });

        // Update Incident status if present
        this._updateIncidentResponseProgress(incidentId, plan.planId, 'RESPONSE IN PROGRESS', tenantId);

        // Update Knowledge Graph if present
        this._addKnowledgeGraphLinks(plan, tenantId);

        return plan;
    }

    /**
     * Requests operator approval.
     */
    requestApproval({ planId, operatorId = 'OPERATOR', tenantId = 'default-tenant' }) {
        const updated = this.approvalService.requestApproval(this.planService.getPlan(planId), tenantId);
        this.historyService.addStep(planId, {
            actor: operatorId,
            action: 'APPROVAL_REQUESTED',
            status: 'PENDING',
            summary: `Response plan ${planId} submitted for operator approval.`
        });
        return updated;
    }

    /**
     * Approves response plan.
     */
    approveResponse({ planId, operatorId = 'OPERATOR', userRole = 'OPERATOR', tenantId = 'default-tenant' }) {
        const updated = this.approvalService.approveResponse(planId, { operatorId, userRole, tenantId });
        this.historyService.addStep(planId, {
            actor: operatorId,
            action: 'RESPONSE_APPROVED',
            status: 'APPROVED',
            summary: `Response plan ${planId} approved by operator ${operatorId}.`
        });
        return updated;
    }

    /**
     * Rejects response plan.
     */
    rejectResponse({ planId, operatorId = 'OPERATOR', reason = 'Operator rejected execution', userRole = 'OPERATOR', tenantId = 'default-tenant' }) {
        const updated = this.approvalService.rejectResponse(planId, { operatorId, reason, userRole, tenantId });
        this.historyService.addStep(planId, {
            actor: operatorId,
            action: 'RESPONSE_REJECTED',
            status: 'REJECTED',
            summary: `Response plan ${planId} rejected by operator ${operatorId}. Reason: ${reason}`
        });
        return updated;
    }

    /**
     * Executes approved or safe response plan.
     */
    async executeResponse({ planId, operatorId = 'OPERATOR', userRole = 'OPERATOR', tenantId = 'default-tenant' }) {
        const result = await this.executionService.executeResponse(planId, { operatorId, userRole, tenantId });

        this.historyService.addStep(planId, {
            actor: operatorId,
            action: 'RESPONSE_EXECUTED',
            status: result.success ? 'EXECUTED' : 'FAILED',
            summary: result.success ? `Response plan ${planId} execution completed.` : `Execution failed: ${result.error}`
        });

        if (result.success && result.status === 'VERIFYING') {
            return await this.verifyResponse({ planId, tenantId });
        }

        return result;
    }

    /**
     * Verifies post-execution state.
     */
    async verifyResponse({ planId, tenantId = 'default-tenant' }) {
        const verification = await this.verificationService.verifyResponse(planId, tenantId);

        this.historyService.addStep(planId, {
            actor: 'SYSTEM_VERIFIER',
            action: 'RESPONSE_VERIFIED',
            status: verification.verified ? 'VERIFIED' : 'FAILED',
            summary: verification.verified
                ? `Verification successful for response plan ${planId}. Target restored.`
                : `Verification failed for response plan ${planId}.`
        });

        const plan = this.planService.getPlan(planId);
        if (plan) {
            // Record structured outcome for learning
            this.learningService.recordOutcome({
                problemType: plan.problemSummary,
                agentId: plan.targetAgentId,
                evidencePattern: plan.evidence,
                actionSelected: plan.selectedAction,
                executionResult: plan.executionState,
                verificationResult: verification.verified ? 'VERIFIED' : 'FAILED',
                tenantId
            });

            if (verification.verified) {
                this._updateIncidentResponseProgress(plan.incidentId, planId, 'RESOLVED', tenantId);
            }
        }

        return verification;
    }

    /**
     * Safe rollback execution.
     */
    async rollbackResponse({ planId, operatorId = 'OPERATOR', reason = 'Verification failure', userRole = 'OPERATOR', tenantId = 'default-tenant' }) {
        if (userRole === 'VIEWER') {
            const err = new Error("RBAC Access Denied: User role 'VIEWER' is not authorized to trigger rollback.");
            err.statusCode = 403;
            throw err;
        }

        const updated = await this.verificationService.rollbackResponse(planId, { operatorId, reason, tenantId });
        this.historyService.addStep(planId, {
            actor: operatorId,
            action: 'RESPONSE_ROLLED_BACK',
            status: 'ROLLED_BACK',
            summary: `Safe rollback executed for plan ${planId}. Reason: ${reason}`
        });
        return updated;
    }

    completeResponse({ planId, tenantId = 'default-tenant' }) {
        const updated = this.planService.updatePlan(planId, { executionState: 'COMPLETED' });
        this.historyService.addStep(planId, {
            actor: 'SYSTEM',
            action: 'RESPONSE_COMPLETED',
            status: 'COMPLETED',
            summary: `Response plan ${planId} marked as completed.`
        });
        return updated;
    }

    getResponseStatus({ planId, tenantId = 'default-tenant' }) {
        return this.planService.getPlan(planId);
    }

    getResponseHistory({ planId, tenantId = 'default-tenant' }) {
        return this.historyService.getHistory(planId);
    }

    getAllPlans({ tenantId = null, status = null, agentId = null } = {}) {
        let plans = this.planService.getAllPlans(tenantId);
        if (status) plans = plans.filter(p => p.executionState === status || p.approvalState === status);
        if (agentId) plans = plans.filter(p => p.targetAgentId === agentId);
        return plans;
    }

    getApprovalQueue({ tenantId = null } = {}) {
        return this.approvalService.getApprovalQueue(tenantId);
    }

    getRecommendations({ agentId = 'UNKNOWN', incidentId = null, tenantId = 'default-tenant' } = {}) {
        let incident = null;
        if (incidentId && this.monitoringService && this.monitoringService.store) {
            incident = this.monitoringService.store.incidents?.get(incidentId) || null;
        }
        return this.recommendationService.getRecommendations({ agentId, incident, tenantId });
    }

    _updateIncidentResponseProgress(incidentId, planId, statusText, tenantId) {
        if (!incidentId || !this.monitoringService || !this.monitoringService.store) return;
        try {
            const inc = this.monitoringService.store.incidents?.get(incidentId);
            if (inc) {
                inc.responseStatus = statusText;
                inc.responsePlanId = planId;
                if (statusText === 'RESOLVED' && typeof this.monitoringService.store.resolveIncident === 'function') {
                    this.monitoringService.store.resolveIncident(incidentId, `Resolved via Response Plan ${planId}`);
                }
            }
        } catch (_) {}
    }

    _addKnowledgeGraphLinks(plan, tenantId) {
        if (!this.knowledgeGraphService || typeof this.knowledgeGraphService.addRelationship !== 'function') return;
        try {
            if (plan.incidentId) {
                this.knowledgeGraphService.addRelationship({
                    sourceEntityId: plan.incidentId,
                    targetEntityId: plan.targetAgentId,
                    relationshipType: 'INCIDENT_INVOLVES_AGENT',
                    origin: 'OBSERVED',
                    confidence: 1.0,
                    evidence: [`Response Plan ${plan.planId} generated for incident ${plan.incidentId}`],
                    tenantId
                });
            }

            this.knowledgeGraphService.addRelationship({
                sourceEntityId: plan.planId,
                targetEntityId: plan.targetAgentId,
                relationshipType: 'REMEDIATION_ATTEMPTED_ON_AGENT',
                origin: 'OBSERVED',
                confidence: 1.0,
                evidence: [`Response Plan ${plan.planId} targets agent ${plan.targetAgentId}`],
                tenantId
            });
        } catch (_) {}
    }
}

module.exports = { IntelligentResponseCenterService };
