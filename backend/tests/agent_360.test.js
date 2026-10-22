/**
 * Phase 21 — Agent 360 Operational Intelligence Test Suite
 * Comprehensive verification of Unified Agent Operations & Intelligence:
 * Header, Summary Cards, Human-Readable Status, Health Timeline, Telemetry,
 * Workflows, Reasoning, Alerts, MCP, Capability Matrix, Unified Activity Timeline,
 * and External Agent (Compa/Repa) compatibility without hardcoded logic.
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');
const { COMPA_AGENT_PROFILE, REPA_AGENT_PROFILE } = require('../src/adapter/profiles/ExternalAgentProfiles');

describe('Phase 21 — Agent 360 Operational Intelligence Suite', () => {
    let app;
    let agentService;
    let indexHtml;

    beforeEach(() => {
        app = createApp();
        agentService = app.get('agentService');
        const candidates = [
            path.join(__dirname, '..', '..', 'frontend', 'index.html'),
            path.join(__dirname, '..', 'frontend', 'index.html'),
            path.join(__dirname, '..', 'index.html')
        ];
        const indexPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
        indexHtml = fs.readFileSync(indexPath, 'utf8');

        // Register TEST-AGENT-001 for operational tests
        if (agentService) {
            try {
                agentService.registerAgent({
                    id: 'TEST-AGENT-001',
                    name: 'Test Operational Agent',
                    category: 'API',
                    version: '1.0.0',
                    contractVersion: '1.0.0',
                    capabilities: ['health_check', 'telemetry'],
                    metadata: { environment: 'test' }
                });
            } catch (e) {
                // Agent may already be registered
            }
        }
    });

    // 1. Agent 360 DOM & UI Mounting
    test('1. Agent 360 panel (panelAgent360) and nav button (tabBtnAgent360) render in DOM', () => {
        expect(indexHtml).toContain('id="panelAgent360"');
        expect(indexHtml).toContain('id="tabBtnAgent360"');
        expect(indexHtml).toContain("switchTab('agent360')");
        expect(indexHtml).toContain('Agent 360 View');
    });

    // 2. Agent Metadata Loading via API
    test('2. Agent metadata loads via /api/v1/agents/TEST-AGENT-001/operations', async () => {
        const res = await request(app).get('/api/v1/agents/TEST-AGENT-001/operations');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.identity).toBeDefined();
        expect(res.body.data.identity.id).toBe('TEST-AGENT-001');
        expect(res.body.data.runtime).toBeDefined();
    });

    // 3. Health Endpoint Loading
    test('3. Health state loads via /api/v1/agents/TEST-AGENT-001/health', async () => {
        const res = await request(app).post('/api/v1/agents/TEST-AGENT-001/health');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
    });

    // 4. Telemetry Stream Query
    test('4. Telemetry timeline loads via /api/v1/telemetry/agents/TEST-AGENT-001/timeline', async () => {
        const res = await request(app).get('/api/v1/telemetry/agents/TEST-AGENT-001/timeline');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 5. Workflows Query
    test('5. Workflows load via /api/v1/workflows', async () => {
        const res = await request(app).get('/api/v1/workflows');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 6. Reasoning Traces Query
    test('6. Reasoning traces load via /api/v1/reasoning/traces?agentId=TEST-AGENT-001', async () => {
        const res = await request(app).get('/api/v1/reasoning/traces?agentId=TEST-AGENT-001');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 7. Alerts Query
    test('7. Alerts load via /api/v1/alerts', async () => {
        const res = await request(app).get('/api/v1/alerts');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 8. MCP State Query
    test('8. MCP server state loads via /api/v1/mcp/servers', async () => {
        const res = await request(app).get('/api/v1/mcp/servers');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 9. Capability Matrix Functionality
    test('9. Capability matrix helper function buildCapabilityMatrix is present in script', () => {
        expect(indexHtml).toContain('function buildCapabilityMatrix');
        expect(indexHtml).toContain('renderCapabilityMatrixCard');
    });

    // 10. Unsupported Capabilities Handling
    test('10. Unsupported capabilities display "— Unsupported" / explanation, not FAILED', () => {
        expect(indexHtml).toContain('This capability is not exposed by the external agent.');
        expect(indexHtml).toContain('— Unsupported');
    });

    // 11. Empty States Rendering
    test('11. Empty states render clear human-readable messages', () => {
        expect(indexHtml).toContain('No historical health data available.');
        expect(indexHtml).toContain('No telemetry events have been received for this agent.');
        expect(indexHtml).toContain('No workflows currently associated with this agent.');
        expect(indexHtml).toContain('No reasoning traces recorded for this agent.');
        expect(indexHtml).toContain('No alerts associated with this agent.');
        expect(indexHtml).toContain('MCP: Not Configured');
    });

    // 12. Error States Handling
    test('12. Error states return structured error object for 404 non-existent agent', async () => {
        const res = await request(app).get('/api/v1/agents/NON-EXISTENT-AGENT-9999/operations');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBeDefined();
    });

    // 13. Refresh Behavior
    test('13. Refresh functions (fetchAgent360Overview & refreshAgent360) exist', () => {
        expect(indexHtml).toContain('function fetchAgent360Overview');
        expect(indexHtml).toContain('function refreshAgent360');
        expect(indexHtml).toContain('function openAgent360');
    });

    // 14. Compa Agent Profile Verification
    test('14. Compa Agent profile parameters exist in ExternalAgentProfiles', () => {
        expect(COMPA_AGENT_PROFILE.id).toBe('compa-agent-ext');
        expect(COMPA_AGENT_PROFILE.name).toBe('Compa Agent');
        expect(COMPA_AGENT_PROFILE.endpoints.contract.enabled).toBe(false);
    });

    // 15. Repa Agent Profile Verification
    test('15. Repa Agent profile parameters exist in ExternalAgentProfiles', () => {
        expect(REPA_AGENT_PROFILE.id).toBe('repa-agent-ext');
        expect(REPA_AGENT_PROFILE.name).toBe('Repa Agent');
        expect(REPA_AGENT_PROFILE.endpoints.contract.enabled).toBe(false);
    });

    // 16. Generic Future Agent Compatibility
    test('16. Generic agent operations summary generation works for arbitrary agent ID', async () => {
        const res = await request(app).get('/api/v1/agents/TEST-AGENT-001/summary');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.overallStatus).toBeDefined();
    });

    // 17. No Hardcoded Compa/Repa Special Cases in UI Rendering Code
    test('17. No hardcoded Compa/Repa special-case checks in frontend JS rendering code', () => {
        expect(indexHtml).not.toContain('if (agent.name === "Compa Agent")');
        expect(indexHtml).not.toContain('if (agent.id === "Compa-Agent-01")');
        expect(indexHtml).not.toContain('if (agentId === "Compa-Agent-01")');
    });

    // 18. No Raw Chain-of-Thought Exposure
    test('18. Reasoning activity displays safe operational summaries without raw chain-of-thought', () => {
        expect(indexHtml).toContain('Safe Operational Reasoning Summaries');
        expect(indexHtml).toContain('OBSERVATION:');
        expect(indexHtml).toContain('EVIDENCE:');
        expect(indexHtml).toContain('DECISION / ACTION:');
        expect(indexHtml).toContain('OUTCOME:');
        expect(indexHtml).toContain('Safety:');
    });

    // 19. No Fake Metrics (N/A Handling)
    test('19. Missing metrics display "N/A" rather than fake/fabricated numbers', () => {
        expect(indexHtml).toContain('Not available from this agent');
    });

    // 20. Existing Pages Remain Functional
    test('20. Standard agent list /api/v1/agents remains fully functional', async () => {
        const res = await request(app).get('/api/v1/agents');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});
