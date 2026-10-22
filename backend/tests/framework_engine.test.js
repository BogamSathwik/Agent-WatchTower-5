const request = require('supertest');
const { createApp } = require('../src/app');
const { AgentFramework } = require('../src/framework/AgentFramework');
const { AgentDefinition } = require('../src/framework/AgentDefinition');

describe('Phase 17 — Agent Framework Layer Test Suite', () => {
    let app;
    let framework;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        framework = app.get('agentFramework');
    });

    test('1. Initializes default built-in framework agent', () => {
        const agent = framework.getAgent('TEST-AGENT-001');
        expect(agent).toBeDefined();
        expect(agent.name).toBe('AgentOS Universal Test Agent');
        expect(agent.capabilities).toContain('health');
    });

    test('2. Discovers capabilities and tools for agent', () => {
        const caps = framework.discoverCapabilities('TEST-AGENT-001');
        expect(caps.length).toBeGreaterThan(0);

        const tools = framework.listTools('TEST-AGENT-001');
        expect(tools.length).toBeGreaterThan(0);
        expect(tools.map(t => t.name)).toContain('ping');
    });

    test('3. Registers new custom framework agent', () => {
        const newAgent = new AgentDefinition({
            id: 'CUSTOM-AGENT-002',
            name: 'Custom Analysis Framework Agent',
            category: 'analysis',
            capabilities: ['analysis', 'reporting'],
            tools: [
                { name: 'analyze_metrics', description: 'Analyze telemetry metrics' }
            ]
        });

        framework.registerAgent(newAgent);
        const retrieved = framework.getAgent('CUSTOM-AGENT-002');
        expect(retrieved).toBeDefined();
        expect(retrieved.category).toBe('analysis');
    });

    test('4. REST API GET /api/v1/framework/overview returns framework status', async () => {
        const res = await request(app)
            .get('/api/v1/framework/overview')
            .set('Authorization', 'Bearer valid-api-key');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.totalAgents).toBeGreaterThanOrEqual(1);
    });

    test('5. REST API GET /api/v1/framework/agents/:id/capabilities returns agent capabilities', async () => {
        const res = await request(app)
            .get('/api/v1/framework/agents/TEST-AGENT-001/capabilities')
            .set('Authorization', 'Bearer valid-api-key');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.capabilities).toContain('health');
    });
});
