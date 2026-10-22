/**
 * Phase 29 Test Suite — Autonomous Operations & Intelligent Response Center
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { IntelligentResponseCenterService } = require('../src/response/IntelligentResponseCenterService');
const { ResponseOptionEngine } = require('../src/response/ResponseOptionEngine');
const { ResponseSafetyEngine, SAFETY_LEVELS } = require('../src/response/ResponseSafetyEngine');
const { ResponsePlanService } = require('../src/response/ResponsePlanService');
const { ResponseApprovalService } = require('../src/response/ResponseApprovalService');
const { ResponseExecutionService } = require('../src/response/ResponseExecutionService');
const { ResponseVerificationService } = require('../src/response/ResponseVerificationService');
const { ResponseHistoryService } = require('../src/response/ResponseHistoryService');
const { ResponseLearningService } = require('../src/response/ResponseLearningService');
const { ResponseRecommendationService } = require('../src/response/ResponseRecommendationService');

describe('PHASE 29 — Autonomous Operations & Intelligent Response Center Suite', () => {
    let app;
    let responseCenterService;
    let monitoringService;

    beforeEach(() => {
        app = createApp();
        responseCenterService = app.get('responseCenterService');
        monitoringService = app.get('agentMonitoringService');
    });

    test('1. IntelligentResponseCenterService initializes with all sub-engines', () => {
        expect(responseCenterService).toBeDefined();
        expect(responseCenterService.optionEngine).toBeInstanceOf(ResponseOptionEngine);
        expect(responseCenterService.safetyEngine).toBeInstanceOf(ResponseSafetyEngine);
        expect(responseCenterService.planService).toBeInstanceOf(ResponsePlanService);
        expect(responseCenterService.approvalService).toBeInstanceOf(ResponseApprovalService);
        expect(responseCenterService.executionService).toBeInstanceOf(ResponseExecutionService);
        expect(responseCenterService.verificationService).toBeInstanceOf(ResponseVerificationService);
        expect(responseCenterService.historyService).toBeInstanceOf(ResponseHistoryService);
        expect(responseCenterService.learningService).toBeInstanceOf(ResponseLearningService);
        expect(responseCenterService.recommendationService).toBeInstanceOf(ResponseRecommendationService);
    });

    test('2. ResponseOptionEngine generates options for standard monitored agents', () => {
        const options = responseCenterService.generateResponseOptions({
            agentId: 'TEST-AGENT-001',
            tenantId: 'tenant-1'
        });

        expect(Array.isArray(options)).toBe(true);
        expect(options.length).toBeGreaterThan(3);

        const types = options.map(o => o.actionType);
        expect(types).toContain('INSPECT_HEALTH');
        expect(types).toContain('INSPECT_TIMELINE');
        expect(types).toContain('INSPECT_DEPENDENCIES');
        expect(types).toContain('INSPECT_EVIDENCE');
        expect(types).toContain('EXECUTE_REMEDIATION');
    });

    test('3. Truthful handling for external agent Compa: Execution is UNSUPPORTED', () => {
        const compaOptions = responseCenterService.generateResponseOptions({
            agentId: 'compa-agent-ext',
            tenantId: 'tenant-1'
        });

        const remediationOpt = compaOptions.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        expect(remediationOpt).toBeDefined();
        expect(remediationOpt.executionSupported).toBe(false);
        expect(remediationOpt.unsupportedReason).toBeDefined();

        const healthOpt = compaOptions.find(o => o.actionType === 'INSPECT_HEALTH');
        expect(healthOpt).toBeDefined();
        expect(healthOpt.executionSupported).toBe(true);
    });

    test('4. Truthful handling for external agent Repa: Execution is UNSUPPORTED', () => {
        const repaOptions = responseCenterService.generateResponseOptions({
            agentId: 'repa-agent-ext',
            tenantId: 'tenant-1'
        });

        const workflowOpt = repaOptions.find(o => o.actionType === 'EXECUTE_WORKFLOW');
        expect(workflowOpt).toBeDefined();
        expect(workflowOpt.executionSupported).toBe(false);

        const timelineOpt = repaOptions.find(o => o.actionType === 'INSPECT_TIMELINE');
        expect(timelineOpt.executionSupported).toBe(true);
    });

    test('5. ResponseSafetyEngine evaluates read-only actions as SAFE', () => {
        const action = { actionType: 'INSPECT_HEALTH', title: 'Inspect Health' };
        const safety = responseCenterService.evaluateResponseSafety({
            action,
            agentId: 'TEST-AGENT-001',
            userRole: 'OPERATOR'
        });

        expect(safety.safetyLevel).toBe(SAFETY_LEVELS.SAFE);
        expect(safety.isAllowed).toBe(true);
        expect(safety.requiresApproval).toBe(false);
    });

    test('6. ResponseSafetyEngine evaluates stateful remediation as REQUIRES_APPROVAL', () => {
        const action = { actionType: 'EXECUTE_REMEDIATION', title: 'Execute Remediation' };
        const safety = responseCenterService.evaluateResponseSafety({
            action,
            agentId: 'TEST-AGENT-001',
            userRole: 'OPERATOR',
            incident: { severity: 'CRITICAL' }
        });

        expect(safety.safetyLevel).toBe(SAFETY_LEVELS.REQUIRES_APPROVAL);
        expect(safety.requiresApproval).toBe(true);
        expect(safety.blastRadius).toBe('HIGH');
    });

    test('7. ResponseSafetyEngine evaluates Viewer role as RESTRICTED for mutation actions', () => {
        const action = { actionType: 'EXECUTE_REMEDIATION', title: 'Execute Remediation' };
        const safety = responseCenterService.evaluateResponseSafety({
            action,
            agentId: 'TEST-AGENT-001',
            userRole: 'VIEWER'
        });

        expect(safety.safetyLevel).toBe(SAFETY_LEVELS.RESTRICTED);
        expect(safety.isAllowed).toBe(false);
    });

    test('8. ResponseSafetyEngine evaluates Compa stateful action as UNSUPPORTED', () => {
        const action = { actionType: 'EXECUTE_REMEDIATION', title: 'Execute Remediation' };
        const safety = responseCenterService.evaluateResponseSafety({
            action,
            agentId: 'compa-agent-ext',
            userRole: 'OPERATOR'
        });

        expect(safety.safetyLevel).toBe(SAFETY_LEVELS.UNSUPPORTED);
        expect(safety.isAllowed).toBe(false);
    });

    test('9. ResponsePlanService creates plan with complete structure and narrative', () => {
        const plan = responseCenterService.createResponsePlan({
            agentId: 'AGENT-X',
            incidentId: 'INC-100',
            tenantId: 'tenant-1'
        });

        expect(plan.planId).toBeDefined();
        expect(plan.targetAgentId).toBe('AGENT-X');
        expect(plan.incidentId).toBe('INC-100');
        expect(plan.narrativeExplanation).toBeDefined();
        expect(plan.narrativeExplanation.whyProposed).toBeDefined();
        expect(plan.narrativeExplanation.evidenceSupported).toBeDefined();
        expect(plan.narrativeExplanation.howVerified).toBeDefined();
        expect(plan.narrativeExplanation.whatIfFails).toBeDefined();
    });

    test('10. ResponseApprovalService processes approval workflow: Approve plan', () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-Y', tenantId: 'tenant-1' });
        const remediationOpt = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');

        const plan = responseCenterService.createResponsePlan({
            agentId: 'AGENT-Y',
            selectedAction: remediationOpt,
            tenantId: 'tenant-1'
        });

        const approved = responseCenterService.approveResponse({
            planId: plan.planId,
            operatorId: 'OP-01',
            userRole: 'OPERATOR',
            tenantId: 'tenant-1'
        });

        expect(approved.approvalState).toBe('APPROVED');
        expect(approved.executionState).toBe('APPROVED');
        expect(approved.approvedBy).toBe('OP-01');
    });

    test('11. ResponseApprovalService processes approval workflow: Reject plan', () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-Z', tenantId: 'tenant-1' });
        const remediationOpt = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');

        const plan = responseCenterService.createResponsePlan({
            agentId: 'AGENT-Z',
            selectedAction: remediationOpt,
            tenantId: 'tenant-1'
        });

        const rejected = responseCenterService.rejectResponse({
            planId: plan.planId,
            operatorId: 'OP-02',
            reason: 'High blast radius risk',
            userRole: 'OPERATOR',
            tenantId: 'tenant-1'
        });

        expect(rejected.approvalState).toBe('REJECTED');
        expect(rejected.executionState).toBe('CANCELLED');
        expect(rejected.rejectionReason).toBe('High blast radius risk');
    });

    test('12. Viewer role cannot approve a response plan (RBAC check)', () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-RBAC', tenantId: 'tenant-1' });
        const remediationOpt = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');

        const plan = responseCenterService.createResponsePlan({
            agentId: 'AGENT-RBAC',
            selectedAction: remediationOpt,
            tenantId: 'tenant-1'
        });

        expect(() => {
            responseCenterService.approveResponse({
                planId: plan.planId,
                operatorId: 'VIEWER-USER',
                userRole: 'VIEWER',
                tenantId: 'tenant-1'
            });
        }).toThrow(/RBAC Access Denied/);
    });

    test('13. getApprovalQueue retrieves only pending approval plans', () => {
        const options1 = responseCenterService.generateResponseOptions({ agentId: 'AGENT-Q1', tenantId: 'tenant-q' });
        const rem1 = options1.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        const p1 = responseCenterService.createResponsePlan({ agentId: 'AGENT-Q1', selectedAction: rem1, tenantId: 'tenant-q' });

        const options2 = responseCenterService.generateResponseOptions({ agentId: 'AGENT-Q2', tenantId: 'tenant-q' });
        const rem2 = options2.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        const p2 = responseCenterService.createResponsePlan({ agentId: 'AGENT-Q2', selectedAction: rem2, tenantId: 'tenant-q' });

        responseCenterService.approveResponse({ planId: p1.planId, tenantId: 'tenant-q' });

        const queue = responseCenterService.getApprovalQueue({ tenantId: 'tenant-q' });
        expect(queue.length).toBe(1);
        expect(queue[0].planId).toBe(p2.planId);
    });

    test('14. ExecutionService executes approved plan and moves to VERIFYING state', async () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-EXEC', tenantId: 'tenant-1' });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-EXEC', selectedAction: rem, tenantId: 'tenant-1' });

        responseCenterService.approveResponse({ planId: plan.planId, tenantId: 'tenant-1' });

        const res = await responseCenterService.executeResponse({ planId: plan.planId, tenantId: 'tenant-1' });
        expect(res.verified).toBe(true);
        expect(res.status).toBe('VERIFIED');
    });

    test('15. ExecutionService blocks unapproved plan execution', async () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-UNAPPROVED', tenantId: 'tenant-1' });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');

        const plan = responseCenterService.createResponsePlan({
            agentId: 'AGENT-UNAPPROVED',
            selectedAction: rem,
            tenantId: 'tenant-1'
        });

        await expect(responseCenterService.executeResponse({ planId: plan.planId, tenantId: 'tenant-1' }))
            .rejects.toThrow(/Operator approval is pending/);
    });

    test('16. ExecutionService handles UNSUPPORTED execution for Compa gracefully', async () => {
        const compaOptions = responseCenterService.generateResponseOptions({ agentId: 'compa-agent-ext', tenantId: 'tenant-1' });
        const rem = compaOptions.find(o => o.actionType === 'EXECUTE_REMEDIATION');

        const compaPlan = responseCenterService.createResponsePlan({
            agentId: 'compa-agent-ext',
            selectedAction: rem,
            tenantId: 'tenant-1'
        });

        const res = await responseCenterService.executeResponse({ planId: compaPlan.planId, tenantId: 'tenant-1' });

        expect(res.success).toBe(false);
        expect(res.status).toBe('UNSUPPORTED');
    });

    test('17. ResponseVerificationService verifies post-execution agent state', async () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-VERIFY', tenantId: 'tenant-1' });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-VERIFY', selectedAction: rem, tenantId: 'tenant-1' });

        responseCenterService.approveResponse({ planId: plan.planId, tenantId: 'tenant-1' });
        await responseCenterService.executeResponse({ planId: plan.planId, tenantId: 'tenant-1' });

        const verification = await responseCenterService.verifyResponse({ planId: plan.planId, tenantId: 'tenant-1' });
        expect(verification.verified).toBe(true);
        expect(verification.status).toBe('VERIFIED');
    });

    test('18. ResponseVerificationService triggers safe rollback when verification fails', async () => {
        const tenantId = 'tenant-fail';
        monitoringService.store.saveStatus('AGENT-FAIL-VERIFY', { status: 'OFFLINE' }, tenantId);

        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-FAIL-VERIFY', tenantId });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');

        const plan = responseCenterService.createResponsePlan({
            agentId: 'AGENT-FAIL-VERIFY',
            selectedAction: rem,
            tenantId
        });

        responseCenterService.approveResponse({ planId: plan.planId, tenantId });
        responseCenterService.planService.updatePlan(plan.planId, { executionState: 'VERIFYING', approvalState: 'APPROVED' });

        const verification = await responseCenterService.verifyResponse({ planId: plan.planId, tenantId });
        expect(verification.verified).toBe(false);
        expect(verification.status).toBe('FAILED');

        const updated = responseCenterService.getResponseStatus({ planId: plan.planId, tenantId });
        expect(updated.rollbackState).toBe('ROLLED_BACK');
    });

    test('19. ResponseHistoryService maintains chronological event history timeline', () => {
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-HIST', tenantId: 'tenant-1' });

        const history = responseCenterService.getResponseHistory({ planId: plan.planId, tenantId: 'tenant-1' });
        expect(Array.isArray(history)).toBe(true);
        expect(history.length).toBeGreaterThanOrEqual(1);

        const actions = history.map(h => h.action);
        expect(actions).toContain('RESPONSE_PLAN_CREATED');
    });

    test('20. ResponseLearningService records structured historical outcomes', () => {
        const outcome = responseCenterService.learningService.recordOutcome({
            problemType: 'LATENCY_SPIKE',
            agentId: 'AGENT-LEARN',
            actionSelected: { actionType: 'EXECUTE_REMEDIATION', title: 'Restart Agent Protocol' },
            executionResult: 'COMPLETED',
            verificationResult: 'VERIFIED',
            tenantId: 'tenant-1'
        });

        expect(outcome.id).toBeDefined();
        expect(outcome.agentId).toBe('AGENT-LEARN');
        expect(outcome.verificationResult).toBe('VERIFIED');

        const history = responseCenterService.learningService.getHistoricalOutcomes({ agentId: 'AGENT-LEARN', tenantId: 'tenant-1' });
        expect(history.length).toBe(1);
    });

    test('21. ResponseRecommendationService recommends responses based on historical outcomes', () => {
        responseCenterService.learningService.recordOutcome({
            problemType: 'DEGRADATION',
            agentId: 'AGENT-REC',
            actionSelected: { actionType: 'EXECUTE_REMEDIATION', title: 'Restart Protocol' },
            verificationResult: 'VERIFIED',
            tenantId: 'tenant-1'
        });

        const recs = responseCenterService.getRecommendations({ agentId: 'AGENT-REC', tenantId: 'tenant-1' });
        expect(recs.previouslyObservedResponses.length).toBeGreaterThan(0);
        expect(recs.availableResponses.length).toBeGreaterThan(0);
        expect(recs.recommendationSummary).toContain('Restart Protocol');
    });

    test('22. Incident Integration: Plan creation updates active incident response status', () => {
        const tenantId = 'tenant-inc';
        const inc = monitoringService.store.saveIncident({
            agentId: 'AGENT-INC-TEST',
            title: 'Agent Incident',
            severity: 'HIGH',
            status: 'OPEN',
            tenantId
        });

        const incId = inc.id || inc.incidentId;

        const plan = responseCenterService.createResponsePlan({
            agentId: 'AGENT-INC-TEST',
            incidentId: incId,
            tenantId
        });

        const storedInc = monitoringService.store.incidents.get(incId);
        expect(storedInc).toBeDefined();
        expect(storedInc.responseStatus).toBe('RESPONSE IN PROGRESS');
        expect(storedInc.responsePlanId).toBe(plan.planId);
    });

    test('23. Knowledge Graph Integration: Plan creation adds relationship edges', () => {
        const plan = responseCenterService.createResponsePlan({
            agentId: 'AGENT-KG-TEST',
            incidentId: 'INC-KG-99',
            tenantId: 'tenant-1'
        });

        const graphService = app.get('agentKnowledgeGraphService');
        if (graphService) {
            const rels = graphService.listRelationships({}, 'tenant-1');
            const targetedRel = rels.find(r => r.sourceEntityId === plan.planId);
            expect(targetedRel).toBeDefined();
            expect(targetedRel.origin).toBe('OBSERVED');
        }
    });

    test('24. GET /api/v1/response/plans lists response plans', async () => {
        responseCenterService.createResponsePlan({ agentId: 'AGENT-API-1', tenantId: 'tenant-1' });

        const res = await request(app)
            .get('/api/v1/response/plans')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('25. POST /api/v1/response/plans creates response plan via API', async () => {
        const res = await request(app)
            .post('/api/v1/response/plans')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR')
            .send({
                agentId: 'AGENT-API-CREATE',
                incidentId: 'INC-API-01'
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.planId).toBeDefined();
        expect(res.body.data.targetAgentId).toBe('AGENT-API-CREATE');
    });

    test('26. GET /api/v1/response/plans/:id retrieves plan details', async () => {
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-API-GET', tenantId: 'tenant-1' });

        const res = await request(app)
            .get(`/api/v1/response/plans/${plan.planId}`)
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.planId).toBe(plan.planId);
    });

    test('27. POST /api/v1/response/plans/:id/approve approves plan via API', async () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-API-APP', tenantId: 'tenant-1' });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-API-APP', selectedAction: rem, tenantId: 'tenant-1' });

        const res = await request(app)
            .post(`/api/v1/response/plans/${plan.planId}/approve`)
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.approvalState).toBe('APPROVED');
    });

    test('28. POST /api/v1/response/plans/:id/reject rejects plan via API', async () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-API-REJ', tenantId: 'tenant-1' });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-API-REJ', selectedAction: rem, tenantId: 'tenant-1' });

        const res = await request(app)
            .post(`/api/v1/response/plans/${plan.planId}/reject`)
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR')
            .send({ reason: 'Operator test rejection' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.approvalState).toBe('REJECTED');
    });

    test('29. POST /api/v1/response/plans/:id/execute executes plan via API', async () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-API-EXEC', tenantId: 'tenant-1' });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-API-EXEC', selectedAction: rem, tenantId: 'tenant-1' });

        responseCenterService.approveResponse({ planId: plan.planId, tenantId: 'tenant-1' });

        const res = await request(app)
            .post(`/api/v1/response/plans/${plan.planId}/execute`)
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('30. POST /api/v1/response/plans/:id/rollback triggers rollback via API', async () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-API-ROLLBACK', tenantId: 'tenant-1' });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-API-ROLLBACK', selectedAction: rem, tenantId: 'tenant-1' });

        const res = await request(app)
            .post(`/api/v1/response/plans/${plan.planId}/rollback`)
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR')
            .send({ reason: 'API rollback test' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.rollbackState).toBe('ROLLED_BACK');
    });

    test('31. GET /api/v1/response/plans/:id/history retrieves plan history', async () => {
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-API-HIST', tenantId: 'tenant-1' });

        const res = await request(app)
            .get(`/api/v1/response/plans/${plan.planId}/history`)
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('32. GET /api/v1/response/approval-queue retrieves approval queue via API', async () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-API-QUEUE', tenantId: 'tenant-q-api' });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        responseCenterService.createResponsePlan({ agentId: 'AGENT-API-QUEUE', selectedAction: rem, tenantId: 'tenant-q-api' });

        const res = await request(app)
            .get('/api/v1/response/approval-queue')
            .set('X-Tenant-ID', 'tenant-q-api')
            .set('X-User-Role', 'OPERATOR');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('33. GET /api/v1/response/recommendations retrieves recommendations via API', async () => {
        const res = await request(app)
            .get('/api/v1/response/recommendations?agentId=TEST-AGENT-001')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.availableResponses).toBeDefined();
    });

    test('34. RBAC Enforcement: Viewer role rejected for plan approval (403)', async () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-RBAC-API', tenantId: 'tenant-1' });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-RBAC-API', selectedAction: rem, tenantId: 'tenant-1' });

        const res = await request(app)
            .post(`/api/v1/response/plans/${plan.planId}/approve`)
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    test('35. RBAC Enforcement: Viewer role rejected for plan execution (403)', async () => {
        const options = responseCenterService.generateResponseOptions({ agentId: 'AGENT-RBAC-EXEC-API', tenantId: 'tenant-1' });
        const rem = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');
        const plan = responseCenterService.createResponsePlan({ agentId: 'AGENT-RBAC-EXEC-API', selectedAction: rem, tenantId: 'tenant-1' });

        const res = await request(app)
            .post(`/api/v1/response/plans/${plan.planId}/execute`)
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    test('36. Multi-tenant isolation: Tenant A cannot see Tenant B response plans', async () => {
        responseCenterService.createResponsePlan({ agentId: 'AGENT-TENANT-A', tenantId: 'tenant-A' });
        responseCenterService.createResponsePlan({ agentId: 'AGENT-TENANT-B', tenantId: 'tenant-B' });

        const resA = await request(app)
            .get('/api/v1/response/plans')
            .set('X-Tenant-ID', 'tenant-A')
            .set('X-User-Role', 'OPERATOR');

        expect(resA.status).toBe(200);
        const plansA = resA.body.data;
        expect(plansA.every(p => p.tenantId === 'tenant-A')).toBe(true);
        expect(plansA.some(p => p.targetAgentId === 'AGENT-TENANT-B')).toBe(false);
    });

    test('37. Secret parameters (apiKey, token, password) are redacted in API responses', async () => {
        const plan = responseCenterService.createResponsePlan({
            agentId: 'SECRET-AGENT',
            tenantId: 'tenant-1'
        });

        plan.evidence.push({ apiKey: 'SUPER_SECRET_KEY_999', token: 'BEARER_SECRET' });
        responseCenterService.planService.updatePlan(plan.planId, { evidence: plan.evidence });

        const res = await request(app)
            .get(`/api/v1/response/plans/${plan.planId}`)
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR');

        expect(res.status).toBe(200);
        const jsonStr = JSON.stringify(res.body);
        expect(jsonStr).not.toContain('SUPER_SECRET_KEY_999');
        expect(jsonStr).not.toContain('BEARER_SECRET');
        expect(jsonStr).toContain('[REDACTED]');
    });

    test('38. X-Correlation-ID is preserved in Response Center API responses', async () => {
        const cid = 'CORRELATION-ID-RESP-999';
        const res = await request(app)
            .get('/api/v1/response/plans')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'OPERATOR')
            .set('X-Correlation-ID', cid);

        expect(res.status).toBe(200);
        expect(res.headers['x-correlation-id']).toBe(cid);
    });

    test('39. TEST-AGENT Topology Scenario (A -> B -> C): Cascading problem response options', () => {
        const tenantId = 'tenant-topology-rc';

        monitoringService.store.saveStatus('TEST-AGENT-C', { status: 'DEGRADED' }, tenantId);
        monitoringService.store.saveStatus('TEST-AGENT-B', { status: 'DEGRADED' }, tenantId);
        monitoringService.store.saveStatus('TEST-AGENT-A', { status: 'HEALTHY' }, tenantId);

        const options = responseCenterService.generateResponseOptions({ agentId: 'TEST-AGENT-C', tenantId });
        const remediationOpt = options.find(o => o.actionType === 'EXECUTE_REMEDIATION');

        const planC = responseCenterService.createResponsePlan({
            agentId: 'TEST-AGENT-C',
            problemSummary: 'Root dependency DEGRADED',
            selectedAction: remediationOpt,
            tenantId
        });

        expect(planC.selectedAction).toBeDefined();
        expect(planC.safetyClassification).toBe('REQUIRES_APPROVAL');
    });

    test('40. Phase 28 Command Center and Phase 27 Knowledge Graph endpoints remain 100% operational', async () => {
        const ccRes = await request(app)
            .get('/api/v1/command-center/overview')
            .set('X-User-Role', 'OPERATOR');
        expect(ccRes.status).toBe(200);
        expect(ccRes.body.status || ccRes.body.scorecard).toBeDefined();

        const kgRes = await request(app)
            .get('/api/v1/knowledge/graph')
            .set('X-User-Role', 'OPERATOR');
        expect(kgRes.status).toBe(200);
        expect(kgRes.body.success).toBe(true);
    });
});
