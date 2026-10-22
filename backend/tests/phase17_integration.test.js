const request = require('supertest');
const { createApp } = require('../src/app');

describe('Phase 17 — End-to-End Agent Intelligence & Integration Test Suite', () => {
    let app;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
    });

    test('1. End-to-End: Agent Framework -> Workflow -> Orchestration -> Reasoning -> MCP -> Audit', async () => {
        // Step A: Framework Agent
        const fwRes = await request(app)
            .get('/api/v1/framework/agents/TEST-AGENT-001')
            .set('Authorization', 'Bearer valid-api-key');
        expect(fwRes.statusCode).toBe(200);

        // Step B: Create Agent Workflow
        const wfRes = await request(app)
            .post('/api/v1/workflows')
            .set('Authorization', 'Bearer valid-api-key')
            .send({
                name: 'E2E Integrated Agent Workflow',
                agentId: 'TEST-AGENT-001',
                steps: [
                    { id: 'step_health', name: 'Check Health', type: 'HEALTH_CHECK' },
                    { id: 'step_reason', name: 'Analyze Telemetry', type: 'REASONING', dependsOn: ['step_health'] },
                    { id: 'step_mcp', name: 'Fetch Diagnostics', type: 'MCP_TOOL_CALL', dependsOn: ['step_reason'] }
                ]
            });

        expect(wfRes.statusCode).toBe(201);
        const wfId = wfRes.body.data.id;

        // Step C: Trigger Workflow Run
        const runRes = await request(app)
            .post(`/api/v1/workflows/${wfId}/run`)
            .set('Authorization', 'Bearer valid-api-key');

        expect(runRes.statusCode).toBe(200);

        // Step D: Trigger Reasoning Cycle
        const reasonRes = await request(app)
            .post('/api/v1/reasoning/analyze')
            .set('Authorization', 'Bearer valid-api-key')
            .send({
                agentId: 'TEST-AGENT-001',
                observation: { status: 'DEGRADED', latencyMs: 3200 }
            });

        expect(reasonRes.statusCode).toBe(200);
        expect(reasonRes.body.data.decision.decisionId).toBeDefined();

        // Step E: Invoke MCP Tool
        const mcpRes = await request(app)
            .post('/api/v1/mcp/servers/demo-mcp-server/tools/get_system_diagnostics/invoke')
            .set('Authorization', 'Bearer valid-api-key')
            .send({ depth: 'full' });

        expect(mcpRes.statusCode).toBe(200);
        expect(mcpRes.body.data.status).toBe('SUCCESS');

        // Step F: Audit Log Inspection
        const auditRes = await request(app)
            .get('/api/v1/audit/logs')
            .set('Authorization', 'Bearer valid-api-key');

        expect(auditRes.statusCode).toBe(200);
        expect(auditRes.body.data.some(l => l.eventType.includes('MCP') || l.eventType.includes('WORKFLOW') || l.eventType.includes('REASONING'))).toBe(true);
    });

    test('2. Hardcoding Audit: Confirm ZERO domain-specific keywords inside API endpoints', async () => {
        const testKeywords = ['compa', 'repa', 'smp', 'hotel', 'competitor', 'reputation'];
        const res = await request(app)
            .get('/api/v1/framework/overview')
            .set('Authorization', 'Bearer valid-api-key');

        const jsonStr = JSON.stringify(res.body).toLowerCase();
        for (const kw of testKeywords) {
            expect(jsonStr).not.toContain(kw);
        }
    });
});
