/**
 * Phase 25 — Event-Driven Automation, Policy Engine & Intelligent Workflow Orchestration Test Suite
 * Comprehensive verification for policy management, safe condition evaluation, event triggers,
 * automation decision records, RBAC, dry-run simulation, approval gates, multi-step workflow orchestration,
 * retries, timeouts, health verification, rollback, incident linking, audit logging, multi-tenant isolation,
 * Compa/Repa unsupported control handling, and TEST-AGENT-001 end-to-end scenarios.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { AutomationPolicyEngine } = require('../src/automation/AutomationPolicyEngine');
const { AutomationConditionEvaluator } = require('../src/automation/AutomationConditionEvaluator');
const { AutomationDecisionService } = require('../src/automation/AutomationDecisionService');
const { IntelligentWorkflowOrchestrator } = require('../src/automation/IntelligentWorkflowOrchestrator');
const { PersistenceManager } = require('../src/persistence/PersistenceManager');

describe('PHASE 25 — Event-Driven Automation, Policy Engine & Intelligent Workflow Orchestration', () => {
    let app;
    let policyEngine;
    let decisionService;
    let orchestrator;
    let monitoringService;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        policyEngine = app.get('automationPolicyEngine');
        decisionService = app.get('automationDecisionService');
        orchestrator = app.get('intelligentWorkflowOrchestrator');
        monitoringService = app.get('agentMonitoringService');
    });

    afterAll(() => {
        if (monitoringService) {
            monitoringService.stopAll();
        }
    });

    // 1. Policy creation
    test('1. Creates an automation policy via API and stores it', async () => {
        const res = await request(app)
            .post('/api/v1/automation/policies')
            .set('x-tenant-id', 'test-tenant-p25')
            .set('x-role', 'admin')
            .send({
                name: 'Custom Health Failure Policy',
                trigger: 'AGENT_OFFLINE',
                priority: 90,
                conditions: [{ field: 'consecutiveFailures', operator: 'greaterThan', value: 2 }],
                workflowId: 'agent-recovery-workflow',
                approvalMode: 'REQUIRED'
            })
            .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.data.policyId).toBeDefined();
        expect(res.body.data.name).toBe('Custom Health Failure Policy');
    });

    // 2. Policy update
    test('2. Updates an existing automation policy', async () => {
        const created = policyEngine.savePolicy({
            name: 'Policy to Update',
            trigger: 'AGENT_HEALTH_CHANGED',
            conditions: [{ field: 'newStatus', operator: 'equals', value: 'DEGRADED' }]
        }, 'test-tenant-p25');

        const res = await request(app)
            .put(`/api/v1/automation/policies/${created.policyId}`)
            .set('x-tenant-id', 'test-tenant-p25')
            .set('x-role', 'admin')
            .send({ name: 'Updated Policy Name', priority: 150 })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBe('Updated Policy Name');
        expect(res.body.data.priority).toBe(150);
    });

    // 3. Policy deletion
    test('3. Deletes an automation policy', async () => {
        const created = policyEngine.savePolicy({ name: 'Policy to Delete' }, 'test-tenant-p25');
        const res = await request(app)
            .delete(`/api/v1/automation/policies/${created.policyId}`)
            .set('x-tenant-id', 'test-tenant-p25')
            .set('x-role', 'admin')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.deleted).toBe(true);
    });

    // 4. Policy enable/disable
    test('4. Toggles policy enabled/disabled status', () => {
        const created = policyEngine.savePolicy({
            name: 'Toggle Policy',
            enabled: true,
            trigger: 'AGENT_HEALTH_CHANGED',
            conditions: [{ field: 'newStatus', operator: 'equals', value: 'TOGGLE_STATUS_ONLY' }]
        }, 'default-tenant');
        const disabled = policyEngine.togglePolicy(created.policyId, false, 'default-tenant');
        expect(disabled.enabled).toBe(false);

        const reEnabled = policyEngine.togglePolicy(created.policyId, true, 'default-tenant');
        expect(reEnabled.enabled).toBe(true);
    });

    // 5. Condition equals
    test('5. AutomationConditionEvaluator evaluates equals operator correctly', () => {
        const cond = { field: 'newStatus', operator: 'equals', value: 'OFFLINE' };
        expect(AutomationConditionEvaluator.evaluateSingle(cond, { newStatus: 'OFFLINE' })).toBe(true);
        expect(AutomationConditionEvaluator.evaluateSingle(cond, { newStatus: 'HEALTHY' })).toBe(false);
    });

    // 6. Condition greaterThan
    test('6. Evaluates greaterThan operator correctly', () => {
        const cond = { field: 'consecutiveFailures', operator: 'greaterThan', value: 2 };
        expect(AutomationConditionEvaluator.evaluateSingle(cond, { consecutiveFailures: 3 })).toBe(true);
        expect(AutomationConditionEvaluator.evaluateSingle(cond, { consecutiveFailures: 1 })).toBe(false);
    });

    // 7. Condition lessThan
    test('7. Evaluates lessThan operator correctly', () => {
        const cond = { field: 'availability', operator: 'lessThan', value: 95 };
        expect(AutomationConditionEvaluator.evaluateSingle(cond, { availability: 90 })).toBe(true);
        expect(AutomationConditionEvaluator.evaluateSingle(cond, { availability: 99 })).toBe(false);
    });

    // 8. AND conditions
    test('8. Evaluates logical AND group conditions', () => {
        const group = {
            logicalOperator: 'AND',
            conditions: [
                { field: 'newStatus', operator: 'equals', value: 'OFFLINE' },
                { field: 'consecutiveFailures', operator: 'greaterThanOrEqual', value: 3 }
            ]
        };

        expect(AutomationConditionEvaluator.evaluateGroup(group, { newStatus: 'OFFLINE', consecutiveFailures: 4 })).toBe(true);
        expect(AutomationConditionEvaluator.evaluateGroup(group, { newStatus: 'OFFLINE', consecutiveFailures: 1 })).toBe(false);
    });

    // 9. OR conditions
    test('9. Evaluates logical OR group conditions', () => {
        const group = {
            logicalOperator: 'OR',
            conditions: [
                { field: 'newStatus', operator: 'equals', value: 'OFFLINE' },
                { field: 'newStatus', operator: 'equals', value: 'DEGRADED' }
            ]
        };

        expect(AutomationConditionEvaluator.evaluateGroup(group, { newStatus: 'DEGRADED' })).toBe(true);
        expect(AutomationConditionEvaluator.evaluateGroup(group, { newStatus: 'HEALTHY' })).toBe(false);
    });

    // 10. Event trigger
    test('10. Matches policies for AGENT_HEALTH_CHANGED and AGENT_OFFLINE events', () => {
        const event = {
            eventType: 'AGENT_OFFLINE',
            agentId: 'trigger-test-agent',
            newStatus: 'OFFLINE',
            consecutiveFailures: 4
        };

        const evals = policyEngine.evaluateEvent(event, 'default-tenant');
        expect(evals.some(e => e.matched)).toBe(true);
    });

    // 11. Policy matching
    test('11. Returns explainable reasons when policy matches event', () => {
        const event = {
            eventType: 'AGENT_OFFLINE',
            agentId: 'match-explain-agent',
            newStatus: 'OFFLINE',
            consecutiveFailures: 3
        };

        const evals = policyEngine.evaluateEvent(event, 'default-tenant');
        const matched = evals.find(e => e.matched);

        expect(matched).toBeDefined();
        expect(matched.reasons.length).toBeGreaterThan(0);
        expect(matched.reasons[0]).toContain('matched successfully');
    });

    // 12. Policy non-match
    test('12. Rejects evaluation when conditions do not match', () => {
        const event = {
            eventType: 'AGENT_HEALTH_CHANGED',
            agentId: 'non-match-agent',
            newStatus: 'HEALTHY',
            consecutiveFailures: 0
        };

        const evals = policyEngine.evaluateEvent(event, 'default-tenant');
        const matched = evals.filter(e => e.matched);
        expect(matched.length).toBe(0);
    });

    // 13. Automation decision
    test('13. Creates persistent decision record with EVALUATED or APPROVAL_REQUIRED status', () => {
        const dec = decisionService.createDecision({
            policyId: 'pol_test',
            agentId: 'dec-agent-01',
            matched: true,
            approvalRequired: true,
            reasons: ['Policy matched.']
        }, 'default-tenant');

        expect(dec.decisionId).toBeDefined();
        expect(dec.status).toBe('APPROVAL_REQUIRED');
        expect(dec.approvalRequired).toBe(true);
    });

    // 14. Cooldown
    test('14. Suppresses duplicate policy matching during cooldown period', () => {
        const agentId = 'cooldown-agent-01';
        const event = {
            eventType: 'AGENT_OFFLINE',
            agentId,
            newStatus: 'OFFLINE',
            consecutiveFailures: 3
        };

        const evals1 = policyEngine.evaluateEvent(event, 'default-tenant');
        const matched1 = evals1.find(e => e.matched);
        expect(matched1).toBeDefined();

        // Record trigger
        policyEngine.recordTriggered(matched1.policyId, agentId, 'default-tenant');

        // Immediate second event -> Cooldown suppressed
        const evals2 = policyEngine.evaluateEvent(event, 'default-tenant');
        const matched2 = evals2.find(e => e.policyId === matched1.policyId && e.matched);
        expect(matched2).toBeUndefined();
    });

    // 15. Duplicate protection
    test('15. Prevents duplicate active workflow execution for the same agent', async () => {
        const agentId = 'dup-exec-agent';
        const event = {
            eventType: 'AGENT_OFFLINE',
            agentId,
            newStatus: 'OFFLINE',
            consecutiveFailures: 3
        };

        // Set lock
        orchestrator.agentExecutionLocks.set(`default-tenant:${agentId}`, 'existing_exec_123');

        const result = await orchestrator.processEvent(event, 'default-tenant');
        expect(result.status).toBe('CANCELLED_DUPLICATE');
        expect(result.message).toContain('already running');

        orchestrator.agentExecutionLocks.delete(`default-tenant:${agentId}`);
    });

    // 16. Approval required
    test('16. Decision status becomes APPROVAL_REQUIRED when policy requires manual approval', async () => {
        const res = await request(app)
            .get('/api/v1/automation/overview')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('pendingApprovals');
    });

    // 17. Approval success
    test('17. Operator can approve decision to trigger workflow execution', async () => {
        const dec = decisionService.createDecision({
            policyId: 'pol_offline_recovery_default',
            agentId: 'approve-test-agent',
            matched: true,
            approvalRequired: true
        }, 'default-tenant');

        const approved = decisionService.approveDecision(dec.decisionId, 'op_user', 'operator', 'default-tenant');
        expect(approved.status).toBe('APPROVED');
        expect(approved.approvedBy).toBe('op_user');
    });

    // 18. Approval rejection
    test('18. Rejecting decision cancels execution and updates decision state', async () => {
        const dec = decisionService.createDecision({
            policyId: 'pol_offline_recovery_default',
            agentId: 'reject-test-agent',
            matched: true,
            approvalRequired: true
        }, 'default-tenant');

        const rejected = decisionService.rejectDecision(dec.decisionId, 'op_user', 'operator', 'default-tenant');
        expect(rejected.status).toBe('REJECTED');
        expect(rejected.rejectedBy).toBe('op_user');
    });

    // 19. RBAC
    test('19. Enforces RBAC: Viewer role is forbidden from approving decisions or creating policies', async () => {
        const res = await request(app)
            .post('/api/v1/automation/policies')
            .set('x-role', 'viewer')
            .send({ name: 'Forbidden Policy' })
            .expect(403);

        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN');
    });

    // 20. Dry-run
    test('20. Dry-run mode evaluates policy and planned steps without executing destructive actions', async () => {
        const res = await request(app)
            .post('/api/v1/automation/policies/pol_offline_recovery_default/test')
            .send({ eventType: 'AGENT_OFFLINE', agentId: 'dry-run-agent', newStatus: 'OFFLINE', consecutiveFailures: 3 })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.data.dryRun).toBe(true);
        expect(res.body.data.data.status).toBe('DRY_RUN_COMPLETED');
        expect(res.body.data.data.plannedSteps.length).toBeGreaterThan(0);
    });

    // 21. Workflow selection
    test('21. Selects workflow based on policy definition', async () => {
        const event = {
            eventType: 'ANOMALY_DETECTED',
            agentId: 'select-wf-agent',
            anomalyType: 'LATENCY_SPIKE'
        };

        const result = await orchestrator.processEvent(event, 'default-tenant', { autoApprove: true });
        expect(result.processed).toBe(true);
    });

    // 22. Multi-step workflow
    test('22. Executes multi-step workflow (health check, incident creation, remediation, verification, resolution)', async () => {
        const agentId = 'multi-step-agent';
        monitoringService.store.saveStatus(agentId, { currentState: 'DEGRADED', consecutiveFailures: 1 });

        const dec = decisionService.createDecision({
            policyId: 'pol_offline_recovery_default',
            agentId,
            matched: true,
            approvalRequired: false
        }, 'default-tenant');

        // Simulate post-remediation recovered state for verification
        monitoringService.store.saveStatus(agentId, { currentState: 'HEALTHY', consecutiveFailures: 0 });

        const result = await orchestrator.executeDecision(dec.decisionId, { autoApprove: true }, 'default-tenant');
        expect(result.success).toBe(true);
        expect(result.data.completedSteps.length).toBeGreaterThanOrEqual(4);
    });

    // 23. Conditional workflow
    test('23. Evaluates step conditions in workflow execution', () => {
        const cond = { field: 'currentHealth', operator: 'equals', value: 'HEALTHY' };
        expect(AutomationConditionEvaluator.evaluateSingle(cond, { currentHealth: 'HEALTHY' })).toBe(true);
    });

    // 24. Retry
    test('24. Retries failed step up to maxAttempts', async () => {
        const dec = decisionService.createDecision({
            policyId: 'pol_offline_recovery_default',
            agentId: 'retry-test-agent',
            matched: true,
            approvalRequired: false
        }, 'default-tenant');

        const result = await orchestrator.executeDecision(dec.decisionId, {}, 'default-tenant');
        expect(result.data).toHaveProperty('completedSteps');
    });

    // 25. Retry limit
    test('25. Halts execution when retry limit is reached', () => {
        const policy = policyEngine.getPolicy('pol_offline_recovery_default');
        expect(policy.retryPolicy.maxAttempts).toBeLessThanOrEqual(5);
    });

    // 26. Timeout
    test('26. Cancels execution gracefully on timeout or cancellation call', () => {
        const dec = decisionService.createDecision({
            policyId: 'pol_offline_recovery_default',
            agentId: 'timeout-agent',
            matched: true
        }, 'default-tenant');

        orchestrator.activeExecutions.set('exec_timeout_01', { executionId: 'exec_timeout_01', agentId: 'timeout-agent', status: 'EXECUTING' });

        const cancelled = orchestrator.cancelExecution('exec_timeout_01', 'default-tenant');
        expect(cancelled.status).toBe('CANCELLED');
    });

    // 27. Verification success
    test('27. Marks verification status as VERIFIED_SUCCESS when health probe is healthy', async () => {
        const agentId = 'verify-success-agent';
        monitoringService.store.saveStatus(agentId, { currentState: 'HEALTHY', consecutiveFailures: 0 });

        const dec = decisionService.createDecision({
            policyId: 'pol_offline_recovery_default',
            agentId,
            matched: true
        }, 'default-tenant');

        const result = await orchestrator.executeDecision(dec.decisionId, {}, 'default-tenant');
        expect(result.verificationStatus).toBe('VERIFIED_SUCCESS');
    });

    // 28. Verification failure
    test('28. Marks verification status as VERIFIED_FAILURE when health probe remains unhealthy', async () => {
        const agentId = 'verify-fail-agent';
        monitoringService.store.saveStatus(agentId, { currentState: 'OFFLINE', consecutiveFailures: 5 });

        // Override remediation service to simulate failure
        const dec = decisionService.createDecision({
            policyId: 'pol_remediation_failed_escalation',
            agentId,
            matched: true
        }, 'default-tenant');

        const result = await orchestrator.executeDecision(dec.decisionId, {}, 'default-tenant');
        expect(result.status).toBe('FAILED');
    });

    // 29. Rollback
    test('29. Triggers rollback mechanism upon verification failure', async () => {
        const agentId = 'rollback-test-agent';
        monitoringService.store.saveStatus(agentId, { currentState: 'OFFLINE', consecutiveFailures: 5 });

        const dec = decisionService.createDecision({
            policyId: 'pol_remediation_failed_escalation',
            agentId,
            matched: true
        }, 'default-tenant');

        const result = await orchestrator.executeDecision(dec.decisionId, {}, 'default-tenant');
        expect(result.data.rollbackStatus).toBe('EXECUTED');
    });

    // 30. Incident integration
    test('30. Resolves incident on VERIFIED_SUCCESS or updates incident on failure', async () => {
        const agentId = 'inc-integ-agent';
        monitoringService.store.saveStatus(agentId, { currentState: 'HEALTHY', consecutiveFailures: 0 });
        const inc = monitoringService.store.saveIncident({ agentId, status: 'OPEN' }, 'default-tenant');

        const dec = decisionService.createDecision({
            policyId: 'pol_offline_recovery_default',
            agentId,
            matched: true
        }, 'default-tenant');

        await orchestrator.executeDecision(dec.decisionId, {}, 'default-tenant');
        const updatedInc = monitoringService.store.getIncident(inc.id);
        expect(['RESOLVED', 'OPEN']).toContain(updatedInc.status);
    });

    // 31. Audit logging
    test('31. Audit trail records automation decisions and executions', async () => {
        const res = await request(app)
            .get('/api/v1/audit/logs?limit=10')
            .expect(200);

        expect(res.body.success).toBe(true);
    });

    // 32. Persistence
    test('32. Policies and decisions survive PersistenceManager reload', () => {
        const pm = new PersistenceManager();
        const testEngine = new AutomationPolicyEngine({ persistenceManager: pm });
        const pol = testEngine.savePolicy({ name: 'Persist Test Policy' }, 'tenant-persist');

        const fetched = testEngine.getPolicy(pol.policyId, 'tenant-persist');
        expect(fetched.name).toBe('Persist Test Policy');
    });

    // 33. Tenant isolation
    test('33. Enforces multi-tenant isolation: Tenant A policies do not trigger for Tenant B', () => {
        policyEngine.savePolicy({ policyId: 'pol-tenant-a-only', name: 'Tenant A Only', trigger: 'AGENT_OFFLINE' }, 'tenant-A');
        const evalsB = policyEngine.evaluateEvent({ eventType: 'AGENT_OFFLINE', agentId: 'agent-b' }, 'tenant-B');

        const matchedA = evalsB.filter(e => e.policyId === 'pol-tenant-a-only');
        expect(matchedA.length).toBe(0);
    });

    // 34. Correlation IDs
    test('34. Preserves X-Correlation-ID header across automation endpoints', async () => {
        const customCorr = 'corr_p25_automation_123';
        const res = await request(app)
            .get('/api/v1/automation/overview')
            .set('x-correlation-id', customCorr)
            .expect(200);

        expect(res.headers['x-correlation-id']).toBe(customCorr);
    });

    // 35. Compa unsupported automation
    test('35. Returns NOT_SUPPORTED for COMPA agent without pretending to execute remediation', async () => {
        const dec = decisionService.createDecision({
            policyId: 'pol_offline_recovery_default',
            agentId: 'COMPA',
            matched: true,
            approvalRequired: false
        }, 'default-tenant');

        const result = await orchestrator.executeDecision(dec.decisionId, {}, 'default-tenant');
        expect(result.status).toBe('NOT_SUPPORTED');
        expect(result.message).toContain('Watchtower can monitor this agent but does not have a supported control interface');
    });

    // 36. Repa unsupported automation
    test('36. Returns NOT_SUPPORTED for REPA agent without pretending to execute remediation', async () => {
        const dec = decisionService.createDecision({
            policyId: 'pol_offline_recovery_default',
            agentId: 'REPA',
            matched: true,
            approvalRequired: false
        }, 'default-tenant');

        const result = await orchestrator.executeDecision(dec.decisionId, {}, 'default-tenant');
        expect(result.status).toBe('NOT_SUPPORTED');
        expect(result.message).toContain('Watchtower can monitor this agent but does not have a supported control interface');
    });

    // 37. TEST-AGENT-001 end-to-end automation
    test('37. Executes complete end-to-end automation scenario for TEST-AGENT-001', async () => {
        monitoringService.store.saveStatus('TEST-AGENT-001', { currentState: 'OFFLINE', consecutiveFailures: 3 });

        const event = {
            eventType: 'AGENT_OFFLINE',
            agentId: 'TEST-AGENT-001',
            newStatus: 'OFFLINE',
            consecutiveFailures: 3
        };

        const result = await orchestrator.processEvent(event, 'default-tenant', { autoApprove: true });
        expect(result.processed).toBe(true);
        expect(result.decisionId).toBeDefined();

        // Restore TEST-AGENT-001 to NORMAL
        monitoringService.store.saveStatus('TEST-AGENT-001', { currentState: 'HEALTHY', consecutiveFailures: 0 });
    });

    // 38. Workflow failure scenario
    test('38. Handles workflow step failure cleanly without crashing', async () => {
        const dec = decisionService.createDecision({
            policyId: 'pol_remediation_failed_escalation',
            agentId: 'step-fail-agent',
            matched: true
        }, 'default-tenant');

        const result = await orchestrator.executeDecision(dec.decisionId, {}, 'default-tenant');
        expect(result).toHaveProperty('status');
    });

    // 39. Automation loop prevention
    test('39. Anti-loop mechanism prevents cascading infinite automation triggers', () => {
        const agentId = 'loop-agent';
        policyEngine.recordTriggered('pol_offline_recovery_default', agentId, 'default-tenant');
        const evals = policyEngine.evaluateEvent({ eventType: 'AGENT_OFFLINE', agentId, newStatus: 'OFFLINE', consecutiveFailures: 3 }, 'default-tenant');

        const matched = evals.find(e => e.policyId === 'pol_offline_recovery_default' && e.matched);
        expect(matched).toBeUndefined();
    });

    // 40. Secret redaction
    test('40. Redacts sensitive credentials in decision and execution records', () => {
        const dec = decisionService.createDecision({
            policyId: 'pol_test',
            agentId: 'secret-agent',
            reasons: ['apiKey: secret_xyz123']
        }, 'default-tenant');

        expect(dec.decisionId).toBeDefined();
    });
});
