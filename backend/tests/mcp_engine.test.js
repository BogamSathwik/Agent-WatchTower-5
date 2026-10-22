const request = require('supertest');
const { createApp } = require('../src/app');
const { McpService } = require('../src/mcp/McpService');

describe('Phase 17 — MCP Integration Layer Test Suite', () => {
    let app;
    let mcpService;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        mcpService = app.get('mcpService');
    });

    test('1. Lists built-in registered MCP server profiles', () => {
        const servers = mcpService.listServers();
        expect(servers.length).toBeGreaterThan(0);
        expect(servers[0].serverId).toBe('demo-mcp-server');
    });

    test('2. Discovers tools on MCP server', async () => {
        const tools = await mcpService.discoverTools('demo-mcp-server');
        expect(tools.length).toBeGreaterThan(0);
        expect(tools.map(t => t.name)).toContain('get_system_diagnostics');
    });

    test('3. Invokes MCP tool with secret redaction and correlation ID', async () => {
        const history = await mcpService.invokeTool('demo-mcp-server', 'fetch_agent_telemetry', {
            agentId: 'TEST-AGENT-001',
            apiKey: 'my-secret-key-12345'
        }, { role: 'operator', correlationId: 'corr_test_123' });

        expect(history.status).toBe('SUCCESS');
        expect(history.correlationId).toBe('corr_test_123');

        const histStr = JSON.stringify(history);
        expect(histStr).not.toContain('my-secret-key-12345');
        expect(histStr).toContain('***REDACTED***');
    });

    test('4. Rejects unauthorized role from invoking MCP tools', async () => {
        await expect(mcpService.invokeTool('demo-mcp-server', 'get_system_diagnostics', {}, { role: 'guest' }))
            .rejects.toThrow(/authorized/i);
    });

    test('5. REST API GET /api/v1/mcp/overview returns MCP server status', async () => {
        const res = await request(app)
            .get('/api/v1/mcp/overview')
            .set('Authorization', 'Bearer valid-api-key');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.totalServers).toBeGreaterThan(0);
    });

    test('6. REST API POST /api/v1/mcp/servers/:id/tools/:toolName/invoke executes MCP tool', async () => {
        const res = await request(app)
            .post('/api/v1/mcp/servers/demo-mcp-server/tools/fetch_agent_telemetry/invoke')
            .set('Authorization', 'Bearer valid-api-key')
            .send({ agentId: 'TEST-AGENT-001' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.output).toBeDefined();
    });
});
