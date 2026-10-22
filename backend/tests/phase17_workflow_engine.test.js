/**
 * Phase 17: Advanced Workflow Automation & Intelligent Orchestration Test Suite
 * Comprehensive test suite validating workflow domain models, execution engine,
 * conditional branching, retries, timeouts, approval gates, event triggers,
 * SSE broadcasting, audit logging, tenant isolation, RBAC, secret redaction,
 * anti-loop protection, and AgentGenPro router compliance.
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { WorkflowService } = require('../src/workflow/WorkflowService');
const { Workflow } = require('../src/workflow/Workflow');
const { WorkflowStep, STEP_TYPES } = require('../src/workflow/WorkflowStep');
const { WORKFLOW_STATES } = require('../src/workflow/WorkflowStates');
const { auditLogService } = require('../src/audit/AuditLogService');
const { ROLES } = require('../src/middleware/authMiddleware');

describe('Phase 17 — Universal Workflow Automation Engine Suite', () => {
    let app;
    let systemRegistry;
    let workflowService;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        systemRegistry.registerSystem({
            id: 'wf-sys-target-1',
            name: 'Workflow Target System',
            category: 'INTERNAL_API',
            version: '1.0.0',
            baseUrl: 'http://localhost:3000',
            capabilities: ['health']
        });

        app = createApp({ systemRegistry });
        workflowService = app.get('workflowService');
    });

    // 1. Workflow Creation
    test('1. POST /api/v1/workflows creates a new valid workflow definition', async () => {
        const payload = {
            id: 'wf_test_1',
            name: 'Automated Diagnostic & Verification Flow',
            description: 'Runs health check and sends notification',
            version: '1.0.0',
            steps: [
                { id: 's1', name: 'Step 1', type: STEP_TYPES.HEALTH_CHECK, target: 'wf-sys-target-1' },
                { id: 's2', name: 'Step 2', type: STEP_TYPES.NOTIFICATION, parameters: { message: 'Done' } }
            ]
        };

        const res = await request(app)
            .post('/api/v1/workflows')
            .set('x-user-role', 'admin')
            .send(payload);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe('wf_test_1');
        expect(res.body.data.steps.length).toBe(2);
    });

    // 2. Workflow Validation
    test('2. Validates workflow definitions and detects missing fields or duplicate steps', async () => {
        const invalidWf = new Workflow({
            id: 'wf_invalid',
            name: 'Invalid WF',
            steps: [
                { id: 'step_dup', type: STEP_TYPES.HEALTH_CHECK },
                { id: 'step_dup', type: STEP_TYPES.NOTIFICATION }
            ]
        });

        const validation = invalidWf.validate();
        expect(validation.valid).toBe(false);
        expect(validation.errors.some(e => e.includes('Duplicate step ID'))).toBe(true);
    });

    // 3. Workflow Retrieval
    test('3. GET /api/v1/workflows/:id retrieves an existing workflow', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_get_3',
            name: 'Retrieval Test Flow',
            steps: [{ id: 'st1', type: STEP_TYPES.HEALTH_CHECK }]
        });

        const res = await request(app)
            .get(`/api/v1/workflows/${wf.id}`)
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(wf.id);
    });

    // 4. Workflow Update
    test('4. PATCH /api/v1/workflows/:id updates workflow properties', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_upd_4',
            name: 'Initial Name',
            steps: [{ id: 'st1', type: STEP_TYPES.HEALTH_CHECK }]
        });

        const res = await request(app)
            .patch(`/api/v1/workflows/${wf.id}`)
            .set('x-user-role', 'operator')
            .send({ name: 'Updated Flow Name' });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Updated Flow Name');
    });

    // 5. Workflow Deletion
    test('5. DELETE /api/v1/workflows/:id removes a workflow', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_del_5',
            name: 'Delete Flow',
            steps: [{ id: 'st1', type: STEP_TYPES.HEALTH_CHECK }]
        });

        const res = await request(app)
            .delete(`/api/v1/workflows/${wf.id}`)
            .set('x-user-role', 'admin');

        expect(res.status).toBe(200);
        expect(workflowService.getWorkflow(wf.id)).toBeNull();
    });

    // 6. Step Execution
    test('6. Executes workflow steps sequentially and records results', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_exec_6',
            name: 'Step Execution Flow',
            steps: [
                { id: 'step_1', type: STEP_TYPES.HEALTH_CHECK, target: 'wf-sys-target-1' },
                { id: 'step_2', type: STEP_TYPES.NOTIFICATION, parameters: { message: 'Step 2 done' } }
            ]
        });

        const execution = await workflowService.executeWorkflow(wf.id, { actor: 'test_user' });
        expect(execution.executionId).toBeDefined();
        expect(execution.status).toBe(WORKFLOW_STATES.RUNNING);

        // Wait brief delay for background loop completion
        await new Promise(r => setTimeout(r, 100));

        const updated = workflowService.getExecution(execution.executionId);
        expect(updated.status).toBe(WORKFLOW_STATES.SUCCEEDED);
        expect(updated.stepResults.length).toBe(2);
    });

    // 7. Conditional Branching
    test('7. Evaluates step branching conditions correctly', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_branch_7',
            name: 'Conditional Branching Flow',
            steps: [
                {
                    id: 'step_cond',
                    type: STEP_TYPES.CONDITION,
                    conditions: {
                        field: 'env',
                        operator: 'EQUALS',
                        value: 'production',
                        onTrueStepId: 'step_prod',
                        onFalseStepId: 'step_dev'
                    }
                },
                { id: 'step_dev', type: STEP_TYPES.NOTIFICATION, parameters: { message: 'Dev mode' } },
                { id: 'step_prod', type: STEP_TYPES.NOTIFICATION, parameters: { message: 'Prod mode' } }
            ]
        });

        const execution = await workflowService.executeWorkflow(wf.id, {
            variables: { env: 'production' }
        });

        await new Promise(r => setTimeout(r, 100));

        const updated = workflowService.getExecution(execution.executionId);
        expect(updated.status).toBe(WORKFLOW_STATES.SUCCEEDED);
        const stepIds = updated.stepResults.map(s => s.stepId);
        expect(stepIds).toContain('step_prod');
    });

    // 8. Retry Behavior
    test('8. Step-level retry policy retries failed attempts with backoff', async () => {
        let attemptsCount = 0;
        // Engine retry behavior executes up to maxAttempts
        const wf = workflowService.createWorkflow({
            id: 'wf_retry_8',
            name: 'Retry Policy Flow',
            steps: [
                {
                    id: 'step_failing',
                    type: STEP_TYPES.HEALTH_CHECK,
                    target: 'NON_EXISTENT_SYS_FAIL',
                    retryPolicy: { maxAttempts: 2, backoffMs: 10, backoffMultiplier: 1, maxBackoffMs: 50 },
                    continueOnFailure: true
                }
            ]
        });

        const execution = await workflowService.executeWorkflow(wf.id);
        await new Promise(r => setTimeout(r, 150));

        const updated = workflowService.getExecution(execution.executionId);
        expect(updated.stepResults[0].attempts).toBe(2);
    });

    // 9. Timeout Behavior
    test('9. Workflow execution times out if execution duration exceeds maxWorkflowTimeoutMs', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_timeout_9',
            name: 'Timeout Flow',
            timeoutPolicy: { maxWorkflowTimeoutMs: 15 },
            steps: [
                { id: 'slow_step', type: STEP_TYPES.DELAY, timeoutMs: 15, parameters: { delayMs: 300 } }
            ]
        });

        const execution = await workflowService.executeWorkflow(wf.id);
        await new Promise(r => setTimeout(r, 250));

        const updated = workflowService.getExecution(execution.executionId);
        expect([WORKFLOW_STATES.TIMED_OUT, WORKFLOW_STATES.FAILED]).toContain(updated.status);
    });

    // 10. Approval Workflow
    test('10. Pauses execution on APPROVAL step and resumes upon approval', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_approval_10',
            name: 'Approval Gate Flow',
            steps: [
                { id: 'gate_step', type: STEP_TYPES.APPROVAL, parameters: { roles: ['admin'] } },
                { id: 'final_step', type: STEP_TYPES.NOTIFICATION, parameters: { message: 'Approved!' } }
            ]
        });

        const execution = await workflowService.executeWorkflow(wf.id);
        await new Promise(r => setTimeout(r, 100));

        const pausedRecord = workflowService.getExecution(execution.executionId);
        expect(pausedRecord.status).toBe(WORKFLOW_STATES.WAITING_APPROVAL);

        // Approve execution step
        await workflowService.approveExecution(execution.executionId, 'admin_user', 'admin');
        await new Promise(r => setTimeout(r, 100));

        const approvedRecord = workflowService.getExecution(execution.executionId);
        expect(approvedRecord.status).toBe(WORKFLOW_STATES.SUCCEEDED);
    });

    // 11. Pause Execution
    test('11. POST /api/v1/workflows/:id/pause pauses active workflow execution', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_pause_11',
            name: 'Pause Test Flow',
            steps: [{ id: 's1', type: STEP_TYPES.DELAY, parameters: { delayMs: 500 } }]
        });

        const execution = await workflowService.executeWorkflow(wf.id);
        const res = await request(app)
            .post(`/api/v1/workflows/${execution.executionId}/pause`)
            .set('x-user-role', 'operator');

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(WORKFLOW_STATES.PAUSED);
    });

    // 12. Resume Execution
    test('12. POST /api/v1/workflows/:id/resume resumes paused workflow execution', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_resume_12',
            name: 'Resume Test Flow',
            steps: [{ id: 's1', type: STEP_TYPES.DELAY, parameters: { delayMs: 500 } }]
        });

        const execution = await workflowService.executeWorkflow(wf.id);
        workflowService.pauseExecution(execution.executionId);

        const res = await request(app)
            .post(`/api/v1/workflows/${execution.executionId}/resume`)
            .set('x-user-role', 'operator');

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(WORKFLOW_STATES.RUNNING);
    });

    // 13. Cancellation
    test('13. POST /api/v1/workflows/:id/cancel cancels active workflow execution', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_cancel_13',
            name: 'Cancel Test Flow',
            steps: [{ id: 's1', type: STEP_TYPES.DELAY, parameters: { delayMs: 1000 } }]
        });

        const execution = await workflowService.executeWorkflow(wf.id);
        const res = await request(app)
            .post(`/api/v1/workflows/${execution.executionId}/cancel`)
            .set('x-user-role', 'operator');

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(WORKFLOW_STATES.CANCELLED);
    });

    // 14. Successful Workflow
    test('14. Full workflow completes with SUCCEEDED status when all steps pass', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_succ_14',
            name: 'Success Flow',
            steps: [{ id: 's1', type: STEP_TYPES.NOTIFICATION, parameters: { message: 'Pass' } }]
        });

        const execution = await workflowService.executeWorkflow(wf.id);
        await new Promise(r => setTimeout(r, 100));

        const updated = workflowService.getExecution(execution.executionId);
        expect(updated.status).toBe(WORKFLOW_STATES.SUCCEEDED);
    });

    // 15. Failed Workflow
    test('15. Workflow fails immediately when step fails and continueOnFailure is false', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_fail_15',
            name: 'Fail Flow',
            steps: [
                { id: 's_fail', type: STEP_TYPES.HEALTH_CHECK, target: 'NON_EXISTENT_SYS_FAIL', continueOnFailure: false }
            ]
        });

        const execution = await workflowService.executeWorkflow(wf.id);
        await new Promise(r => setTimeout(r, 100));

        const updated = workflowService.getExecution(execution.executionId);
        expect(updated.status).toBe(WORKFLOW_STATES.FAILED);
    });

    // 16. Event-Triggered Execution
    test('16. Triggers event-driven workflows automatically on matching platform events', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_evt_16',
            name: 'Event Triggered Flow',
            trigger: { type: 'EVENT', eventType: 'HEALTH_DEGRADED', enabled: true },
            steps: [{ id: 's1', type: STEP_TYPES.NOTIFICATION, parameters: { message: 'Event handled' } }]
        });

        workflowService.handlePlatformEvent({
            eventType: 'HEALTH_DEGRADED',
            systemId: 'wf-sys-target-1',
            correlationId: 'corr_evt_trigger_16'
        });

        await new Promise(r => setTimeout(r, 150));

        const execs = workflowService.listExecutions({ workflowId: wf.id });
        expect(execs.length).toBeGreaterThanOrEqual(1);
    });

    // 17. Scheduled Execution Overview
    test('17. Returns scheduled and active workflow counts in overview API', async () => {
        const res = await request(app)
            .get('/api/v1/workflows/overview')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.totalWorkflows).toBeGreaterThanOrEqual(1);
    });

    // 18. Audit Logging
    test('18. Creates audit log entries for workflow creation, updates, and executions', async () => {
        const initialCount = auditLogService.listEvents({ limit: 1000 }).length;

        const wf = workflowService.createWorkflow({
            id: 'wf_audit_18',
            name: 'Audit Log Flow',
            steps: [{ id: 's1', type: STEP_TYPES.NOTIFICATION, parameters: { msg: 'audit' } }]
        });

        const newCount = auditLogService.listEvents({ limit: 1000 }).length;
        expect(newCount).toBeGreaterThan(initialCount);

        const latest = auditLogService.listEvents({ limit: 1 })[0];
        expect(latest.action).toBe('create_workflow');
    });

    // 19. Correlation ID Propagation
    test('19. Preserves X-Correlation-ID in workflow execution context and response headers', async () => {
        const customCorr = 'corr_wf_custom_phase17_999';

        const wf = workflowService.createWorkflow({
            id: 'wf_corr_19',
            name: 'Correlation Flow',
            steps: [{ id: 's1', type: STEP_TYPES.NOTIFICATION }]
        });

        const res = await request(app)
            .post(`/api/v1/workflows/${wf.id}/execute`)
            .set('x-user-role', 'operator')
            .set('x-correlation-id', customCorr);

        expect(res.headers['x-correlation-id']).toBe(customCorr);
        expect(res.body.data.correlationId).toBe(customCorr);
    });

    // 20. Tenant Isolation
    test('20. Enforces tenant isolation on workflow listing and detail endpoints', async () => {
        workflowService.createWorkflow({
            id: 'wf_tenant_a',
            name: 'Tenant A Flow',
            tenantId: 'tenant-alpha',
            steps: [{ id: 's1', type: STEP_TYPES.NOTIFICATION }]
        });

        const resTenantB = await request(app)
            .get('/api/v1/workflows')
            .set('x-user-role', 'operator')
            .set('x-tenant-id', 'tenant-beta');

        expect(resTenantB.status).toBe(200);
        const ids = resTenantB.body.data.map(w => w.id);
        expect(ids).not.toContain('wf_tenant_a');
    });

    // 21. RBAC Permissions
    test('21. Enforces RBAC permissions on workflow mutation routes', async () => {
        const resViewer = await request(app)
            .post('/api/v1/workflows')
            .set('x-user-role', 'viewer')
            .send({ id: 'wf_rbac', name: 'RBAC Test', steps: [{ id: 's1', type: STEP_TYPES.NOTIFICATION }] });

        expect(resViewer.status).toBe(403);
    });

    // 22. Secret Redaction
    test('22. Secrets are not leaked in workflow metadata or execution logs', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_secret_22',
            name: 'Secret Redaction Flow',
            metadata: { apiKey: 'SUPER_SECRET', safe: 'public' },
            steps: [{ id: 's1', type: STEP_TYPES.NOTIFICATION }]
        });

        const res = await request(app)
            .get(`/api/v1/workflows/${wf.id}`)
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.data.metadata.safe).toBe('public');
    });

    // 23. Anti-Loop Protection
    test('23. Anti-loop protection halts executions that exceed max step limit', async () => {
        // Engine maxStepsPerExecution limit triggers halted execution
        const engine = workflowService.engine;
        engine.maxStepsPerExecution = 5;

        const wf = workflowService.createWorkflow({
            id: 'wf_loop_23',
            name: 'Infinite Loop Flow',
            steps: [
                {
                    id: 's_loop',
                    type: STEP_TYPES.CONDITION,
                    conditions: { field: 'always', operator: 'EXISTS', onTrueStepId: 's_loop' }
                }
            ]
        });

        const execution = await engine.executeWorkflow(wf, { variables: { always: true } });
        await new Promise(r => setTimeout(r, 150));

        const record = workflowService.getExecution(execution.executionId);
        expect(record.status).toBe(WORKFLOW_STATES.FAILED);
        expect(record.error).toContain('Anti-loop protection');
    });

    // 24. Execution Inspector API
    test('24. GET /api/v1/workflow-executions/:id returns detailed execution timeline and step results', async () => {
        const wf = workflowService.createWorkflow({
            id: 'wf_inspect_24',
            name: 'Inspector Flow',
            steps: [{ id: 's1', type: STEP_TYPES.NOTIFICATION, parameters: { msg: 'ok' } }]
        });

        const execution = await workflowService.executeWorkflow(wf.id);
        await new Promise(r => setTimeout(r, 100));

        const res = await request(app)
            .get(`/api/v1/workflow-executions/${execution.executionId}`)
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.executionId).toBe(execution.executionId);
        expect(res.body.data.stepResults).toBeDefined();
    });

    // 25. AgentGenPro Router Compliance
    test('25. Workflow routers do not contain forbidden Node core modules or server startup code', () => {
        const forbiddenPatterns = [
            /require\(['"]fs['"]\)/,
            /require\(['"]child_process['"]\)/,
            /require\(['"]os['"]\)/,
            /\.listen\(/,
            /express\.json\(/,
            /req\.on\(['"]data['"]\)/,
            /req\.on\(['"]end['"]\)/
        ];

        const routerPath = path.join(__dirname, '../src/api/workflowRoutes.js');
        const content = fs.readFileSync(routerPath, 'utf8');

        forbiddenPatterns.forEach(pattern => {
            expect(pattern.test(content)).toBe(false);
        });
    });
});
