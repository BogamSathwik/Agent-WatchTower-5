/**
 * Phase 17 — Human-Readable Operational Summary Test Suite
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const OperationalSummaryService = require('../src/intelligence/OperationalSummaryService');
const AgentMonitoringService = require('../src/monitoring/AgentMonitoringService');
const AgentMonitoringStore = require('../src/monitoring/AgentMonitoringStore');

describe('Phase 17 — Human-Readable Operational Summary Test Suite', () => {
    let app;
    let summaryService;
    let monitoringService;
    let store;

    beforeEach(() => {
        store = new AgentMonitoringStore();
        monitoringService = new AgentMonitoringService({ store });
        summaryService = new OperationalSummaryService({ agentMonitoringService: monitoringService });
        app = createApp({
            agentMonitoringService: monitoringService,
            operationalSummaryService: summaryService
        });
    });

    afterEach(() => {
        if (monitoringService) {
            monitoringService.stopAll();
        }
    });

    test('1. Healthy agent produces HEALTHY operational summary', () => {
        const agentData = { id: 'AGENT-HEALTHY-01', name: 'Healthy Test Agent', version: '1.0.0' };
        const monitoringData = {
            status: {
                currentState: 'HEALTHY',
                connectivity: 'CONNECTED',
                capabilities: ['ping', 'health'],
                latency: { lastLatencyMs: 45, avgLatencyMs: 50, minLatencyMs: 30, maxLatencyMs: 90 }
            }
        };

        const summary = summaryService.generateAgentSummary(agentData, monitoringData);

        expect(summary.overallStatus).toBe('HEALTHY');
        expect(summary.headline).toContain('operating normally');
        expect(summary.good.some(g => g.includes('connected and reachable'))).toBe(true);
        expect(summary.good.some(g => g.includes('Health checks are passing'))).toBe(true);
        expect(summary.recommendedActions).toContain('No immediate operator action required.');
    });

    test('2. Degraded agent produces DEGRADED summary with warnings', () => {
        const agentData = { id: 'AGENT-DEGRADED-01', name: 'Slow Agent', authentication: { authType: 'none' } };
        const monitoringData = {
            status: {
                currentState: 'DEGRADED',
                connectivity: 'CONNECTED',
                latency: { lastLatencyMs: 2500 }
            }
        };

        const summary = summaryService.generateAgentSummary(agentData, monitoringData);

        expect(summary.overallStatus).toBe('DEGRADED');
        expect(summary.warnings.some(w => w.includes('latency is elevated'))).toBe(true);
        expect(summary.warnings.some(w => w.includes('No authentication configured'))).toBe(true);
        expect(summary.recommendedActions.some(a => a.includes('Review recent agent response latency'))).toBe(true);
    });

    test('3. Offline agent produces OFFLINE summary with problems', () => {
        const agentData = { id: 'AGENT-OFFLINE-01', name: 'Unreachable Agent' };
        const monitoringData = {
            status: {
                currentState: 'OFFLINE',
                connectivity: 'DISCONNECTED',
                consecutiveFailures: 4,
                lastError: 'Connection refused at port 4001',
                activeIncidentId: 'inc_999'
            }
        };

        const summary = summaryService.generateAgentSummary(agentData, monitoringData);

        expect(summary.overallStatus).toBe('OFFLINE');
        expect(summary.problems.some(p => p.includes('unreachable'))).toBe(true);
        expect(summary.problems.some(p => p.includes('Failure Threshold Exceeded'))).toBe(true);
        expect(summary.problems.some(p => p.includes('Active Monitoring Incident'))).toBe(true);
        expect(summary.recommendedActions.some(a => a.includes('Verify that the external agent service process is running'))).toBe(true);
    });

    test('4. Redacts sensitive credentials in technical details', () => {
        const agentData = {
            id: 'AGENT-SECRET',
            authentication: {
                authType: 'bearer',
                token: 'super-secret-bearer-token',
                apiKey: 'api-key-12345',
                password: 'my-admin-password'
            }
        };

        const summary = summaryService.generateAgentSummary(agentData, {});

        expect(summary.technicalDetails.agent.authentication.token).toBe('***REDACTED***');
        expect(summary.technicalDetails.agent.authentication.apiKey).toBe('***REDACTED***');
        expect(summary.technicalDetails.agent.authentication.password).toBe('***REDACTED***');
    });

    test('5. GET /api/v1/agents/:id/summary REST endpoint returns structured summary', async () => {
        const res = await request(app)
            .get('/api/v1/agents/TEST-AGENT-001/summary')
            .set('x-tenant-id', 'test-tenant');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.agentId).toBe('TEST-AGENT-001');
        expect(res.body.data.overallStatus).toBeDefined();
        expect(res.body.data.good).toBeDefined();
        expect(res.body.data.recommendedActions).toBeDefined();
        expect(res.body.data.technicalDetails).toBeDefined();
    });

    test('6. GET /api/v1/systems/:id/summary REST endpoint returns system summary', async () => {
        const res = await request(app)
            .get('/api/v1/systems/DEMO-SYSTEM-001/summary')
            .set('x-tenant-id', 'test-tenant');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.systemId).toBe('DEMO-SYSTEM-001');
        expect(res.body.data.overallStatus).toBeDefined();
        expect(res.body.data.good).toBeDefined();
    });
});
