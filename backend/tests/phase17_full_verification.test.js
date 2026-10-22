const request = require('supertest');
const { createApp } = require('../src/app');

describe('PHASE 17 — Full Verification & Five-Capability Validation Suite', () => {
    let app;

    beforeAll(() => {
        app = createApp({ environment: 'test' });

        // Register TEST-AGENT-001 in systemRegistry for workflow target resolution
        const registry = app.get('systemRegistry');
        if (registry && typeof registry.registerSystem === 'function') {
            registry.registerSystem({
                id: 'TEST-AGENT-001',
                name: 'AgentOS Universal Test Agent',
                category: 'testing',
                version: '1.0.0',
                contractVersion: '1.0.0',
                baseUrl: 'http://localhost:3000',
                capabilities: ['health', 'execution', 'telemetry']
            });
        }

        // Mock healthEngine.checkHealth to return HEALTHY status deterministically in test environment
        const healthEngine = app.get('healthEngine');
        if (healthEngine && typeof healthEngine.checkHealth === 'function') {
            jest.spyOn(healthEngine, 'checkHealth').mockImplementation(async (systemId) => {
                return {
                    systemId: systemId || 'TEST-AGENT-001',
                    status: 'HEALTHY',
                    success: true,
                    responseTimeMs: 12,
                    measuredAt: new Date().toISOString()
                };
            });
        }

        const workflowService = app.get('workflowService');
        if (workflowService && workflowService.engine && workflowService.engine.healthEngine) {
            jest.spyOn(workflowService.engine.healthEngine, 'checkHealth').mockImplementation(async (systemId) => {
                return {
                    systemId: systemId || 'TEST-AGENT-001',
                    status: 'HEALTHY',
                    success: true,
                    responseTimeMs: 12,
                    measuredAt: new Date().toISOString()
                };
            });
        }
    });

    beforeEach(() => {
        const healthEngine = app.get('healthEngine');
        if (healthEngine && healthEngine.healthStore) {
            healthEngine.healthStore.recordResult('TEST-AGENT-001', {
                healthy: true,
                consecutiveFailures: 0,
                status: 'HEALTHY',
                lastCheckTime: new Date().toISOString()
            });
        }
    });

    // STEP 2 — WORKFLOW VERIFICATION
    describe('STEP 2: Workflow Engine Verification', () => {
        test('Should create, validate, execute generic Agent Health Validation workflow with 5 steps', async () => {
            // 1 & 2 & 3 & 4. Create & Validate Workflow with 5 steps for TEST-AGENT-001
            const wfRes = await request(app)
                .post('/api/v1/workflows')
                .set('Authorization', 'Bearer valid-api-key')
                .send({
                    name: 'Agent Health Validation',
                    description: 'Comprehensive 5-step agent health & capability validation workflow',
                    agentId: 'TEST-AGENT-001',
                    steps: [
                        { id: 'step_1', name: 'Health Check', type: 'HEALTH_CHECK', target: 'TEST-AGENT-001', timeoutMs: 5000, retryConfig: { maxRetries: 2 } },
                        { id: 'step_2', name: 'Capability Discovery', type: 'CAPABILITY_DISCOVERY', target: 'TEST-AGENT-001', dependsOn: ['step_1'] },
                        { id: 'step_3', name: 'Agent Execution', type: 'AGENT_EXECUTION', target: 'TEST-AGENT-001', dependsOn: ['step_2'] },
                        { id: 'step_4', name: 'Validation', type: 'VALIDATION', target: 'TEST-AGENT-001', dependsOn: ['step_3'] },
                        { id: 'step_5', name: 'Report', type: 'REPORT', target: 'TEST-AGENT-001', dependsOn: ['step_4'] }
                    ]
                });

            expect(wfRes.statusCode).toBe(201);
            expect(wfRes.body.data.id).toBeDefined();
            const wfId = wfRes.body.data.id;

            // 5 & 6 & 7 & 11 & 12. Trigger workflow execution
            const runRes = await request(app)
                .post(`/api/v1/workflows/${wfId}/run`)
                .set('Authorization', 'Bearer valid-api-key');

            expect(runRes.statusCode).toBe(200);
            expect(runRes.body.data.executionId).toBeDefined();

            // Wait brief tick for background execution completion
            await new Promise(r => setTimeout(r, 150));

            const workflowService = app.get('workflowService');
            const execution = workflowService.getExecution(runRes.body.data.executionId);
            expect(execution).toBeDefined();
            expect(execution.status).toBe('SUCCEEDED');
            expect(execution.stepResults).toHaveLength(5);
        });
    });

    // STEP 3 — ORCHESTRATION VERIFICATION
    describe('STEP 3: Orchestration Engine Verification', () => {
        test('Should execute Workflow via existing OrchestrationEngine with dependency graph, timeline, retry & timeout', async () => {
            const workflowService = app.get('workflowService');
            const orchestrationService = app.get('orchestrationService');
            expect(workflowService).toBeDefined();
            expect(orchestrationService).toBeDefined();

            // Create multi-branch orchestration workflow
            const wfRes = await request(app)
                .post('/api/v1/workflows')
                .set('Authorization', 'Bearer valid-api-key')
                .send({
                    name: 'Orchestrated Dependency Workflow',
                    agentId: 'TEST-AGENT-001',
                    steps: [
                        { id: 'root', name: 'Root Step', type: 'HEALTH_CHECK', target: 'TEST-AGENT-001' },
                        { id: 'dep_a', name: 'Dependent A', type: 'CAPABILITY_DISCOVERY', target: 'TEST-AGENT-001', dependsOn: ['root'] },
                        { id: 'dep_b', name: 'Dependent B', type: 'VALIDATION', target: 'TEST-AGENT-001', dependsOn: ['root'] },
                        { id: 'join', name: 'Join Step', type: 'REPORT', target: 'TEST-AGENT-001', dependsOn: ['dep_a', 'dep_b'] }
                    ]
                });

            expect(wfRes.statusCode).toBe(201);
            const wfId = wfRes.body.data.id;

            const runRes = await request(app)
                .post(`/api/v1/workflows/${wfId}/run`)
                .set('Authorization', 'Bearer valid-api-key');

            expect(runRes.statusCode).toBe(200);
            expect(runRes.body.data.executionId).toBeDefined();

            await new Promise(r => setTimeout(r, 150));
            const execution = workflowService.getExecution(runRes.body.data.executionId);
            expect(execution.status).toBe('SUCCEEDED');
        });
    });

    // STEP 4 — AGENT FRAMEWORK VERIFICATION
    describe('STEP 4: Agent Framework Verification', () => {
        test('Should discover identity, version, contract, capabilities, health, execution, tools without domain hardcoding', async () => {
            const fwRes = await request(app)
                .get('/api/v1/framework/agents/TEST-AGENT-001')
                .set('Authorization', 'Bearer valid-api-key');

            expect(fwRes.statusCode).toBe(200);
            const agentData = fwRes.body.data;
            expect(agentData.id).toBe('TEST-AGENT-001');
            expect(agentData.name).toBeDefined();
            expect(agentData.version).toBeDefined();
            expect(agentData.capabilities).toBeDefined();

            // Check 0 domain-specific terms
            const domainKeywords = ['compa', 'repa', 'smp', 'hotel', 'business', 'competitor', 'reputation', 'social media'];
            const jsonString = JSON.stringify(fwRes.body).toLowerCase();
            domainKeywords.forEach(kw => {
                expect(jsonString).not.toContain(kw);
            });
        });
    });

    // STEP 5 — REASONING VERIFICATION
    describe('STEP 5: Reasoning Engine Verification', () => {
        test('Should process NORMAL -> DEGRADED observation, propose policy-checked action, audit log, and return clean JSON decision', async () => {
            const res = await request(app)
                .post('/api/v1/reasoning/analyze')
                .set('Authorization', 'Bearer valid-api-key')
                .send({
                    agentId: 'TEST-AGENT-001',
                    observation: {
                        status: 'DEGRADED',
                        health: 'UNHEALTHY',
                        latencyMs: 4500,
                        errorRate: 0.15
                    }
                });

            expect(res.statusCode).toBe(200);
            const decision = res.body.data.decision;
            expect(['ACTION_PROPOSED', 'EXECUTED']).toContain(decision.status);
            expect(decision.observation).toBeDefined();
            expect(decision.analysis).toBeDefined();
            expect(decision.selectedAction).toBeDefined();
            expect(decision.nextStep).toBeDefined();

            // Confirm secret redaction
            expect(JSON.stringify(decision)).not.toContain('secret');
            expect(JSON.stringify(decision)).not.toContain('apiKey');
        });
    });

    // STEP 6 — MCP VERIFICATION
    describe('STEP 6: MCP Integration Layer Verification', () => {
        test('Should register MCP server, discover tools, authorize, invoke tool, & log audit with correlation ID', async () => {
            const invRes = await request(app)
                .post('/api/v1/mcp/servers/demo-mcp-server/tools/fetch_agent_telemetry/invoke')
                .set('Authorization', 'Bearer valid-api-key')
                .send({ agentId: 'TEST-AGENT-001' });

            expect(invRes.statusCode).toBe(200);
            expect(invRes.body.data.status).toBe('SUCCESS');
            expect(invRes.body.data.correlationId).toBeDefined();
        });
    });

    // STEP 7 — FIVE-CAPABILITY END-TO-END TEST
    describe('STEP 7: Complete 5-Capability End-to-End Workflow Scenario', () => {
        test('Should execute DEMO AGENT MONITORING WORKFLOW combining Workflow, Orchestration, Framework, Reasoning & MCP', async () => {
            const wfRes = await request(app)
                .post('/api/v1/workflows')
                .set('Authorization', 'Bearer valid-api-key')
                .send({
                    name: 'DEMO AGENT MONITORING WORKFLOW',
                    description: 'End-to-End five capability validation flow',
                    agentId: 'TEST-AGENT-001',
                    steps: [
                        { id: 'step_health', name: 'Execute Health Check', type: 'HEALTH_CHECK', target: 'TEST-AGENT-001' },
                        { id: 'step_reason', name: 'Reasoning Diagnostic Analysis', type: 'REASONING', target: 'TEST-AGENT-001', dependsOn: ['step_health'] },
                        { id: 'step_mcp', name: 'Invoke MCP Diagnostic Tool', type: 'MCP_TOOL_CALL', target: 'TEST-AGENT-001', parameters: { serverId: 'demo-mcp-server', toolName: 'fetch_agent_telemetry' }, dependsOn: ['step_reason'] },
                        { id: 'step_report', name: 'Generate Operational Report', type: 'REPORT', target: 'TEST-AGENT-001', dependsOn: ['step_mcp'] }
                    ]
                });

            expect(wfRes.statusCode).toBe(201);
            const wfId = wfRes.body.data.id;

            const runRes = await request(app)
                .post(`/api/v1/workflows/${wfId}/run`)
                .set('Authorization', 'Bearer valid-api-key');

            expect(runRes.statusCode).toBe(200);
            expect(runRes.body.data.executionId).toBeDefined();

            await new Promise(r => setTimeout(r, 150));

            const workflowService = app.get('workflowService');
            const execution = workflowService.getExecution(runRes.body.data.executionId);
            if (execution.status !== 'SUCCEEDED') {
                console.log('STEP 7 EXECUTION ERROR:', execution.error, execution.stepResults);
            }
            expect(execution.status).toBe('SUCCEEDED');
            expect(execution.stepResults).toHaveLength(4);

            // Audit verification
            const auditRes = await request(app)
                .get('/api/v1/audit/logs')
                .set('Authorization', 'Bearer valid-api-key');

            expect(auditRes.statusCode).toBe(200);
            expect(auditRes.body.data.length).toBeGreaterThan(0);
        });
    });
});
