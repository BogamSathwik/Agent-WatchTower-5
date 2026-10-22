const request = require('supertest');
const { createApp } = require('../src/app');
const { AgentWorkflow } = require('../src/workflow/AgentWorkflow');
const { WorkflowStep } = require('../src/workflow/WorkflowStep');
const { WorkflowValidator } = require('../src/workflow/WorkflowValidator');
const WorkflowToOrchestrationAdapter = require('../src/workflow/WorkflowToOrchestrationAdapter');

describe('Phase 17 — Workflow Engine & Orchestration Integration Test Suite', () => {
    let app;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
    });

    test('1. Creates valid AgentWorkflow instance with default policies', () => {
        const wf = new AgentWorkflow({
            id: 'wf_unit_test',
            name: 'Unit Test Workflow',
            agentId: 'TEST-AGENT-001',
            steps: [
                { id: 'step1', name: 'Health Check', type: 'HEALTH_CHECK' },
                { id: 'step2', name: 'Capability Discovery', type: 'CAPABILITY_DISCOVERY', dependsOn: ['step1'] }
            ]
        });

        expect(wf.id).toBe('wf_unit_test');
        expect(wf.steps.length).toBe(2);
        expect(wf.steps[1].dependsOn).toContain('step1');

        const val = WorkflowValidator.validateWorkflow(wf);
        expect(val.valid).toBe(true);
    });

    test('2. WorkflowToOrchestrationAdapter compiles AgentWorkflow into OrchestrationPlan', () => {
        const wf = new AgentWorkflow({
            id: 'wf_compile_test',
            name: 'Compile Test Workflow',
            agentId: 'TEST-AGENT-001',
            steps: [
                { id: 'step1', name: 'Check Health', type: 'HEALTH_CHECK' },
                { id: 'step2', name: 'Run Capability', type: 'AGENT_EXECUTION', dependsOn: ['step1'] }
            ]
        });

        const plan = WorkflowToOrchestrationAdapter.compileWorkflowToPlan(wf);
        expect(plan.id).toContain('wf_compile_test');
        expect(plan.steps.length).toBe(2);
        expect(plan.steps[1].dependsOn).toContain('step1');
        const validation = plan.validate();
        expect(validation.valid).toBe(true);
    });

    test('3. REST API GET /api/v1/workflows lists registered workflows', async () => {
        const res = await request(app)
            .get('/api/v1/workflows')
            .set('Authorization', 'Bearer valid-api-key')
            .set('x-tenant-id', 'global');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('4. REST API POST /api/v1/workflows creates a new workflow', async () => {
        const res = await request(app)
            .post('/api/v1/workflows')
            .set('Authorization', 'Bearer valid-api-key')
            .set('x-tenant-id', 'global')
            .send({
                name: 'API Created Workflow',
                agentId: 'TEST-AGENT-001',
                steps: [
                    { id: 's1', name: 'Step 1', type: 'HEALTH_CHECK' }
                ]
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBeDefined();
    });
});
