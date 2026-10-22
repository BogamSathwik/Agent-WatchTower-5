/**
 * Phase 17 — Agent Monitoring & E2E Observability Test Suite
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const AgentMonitoringService = require('../src/monitoring/AgentMonitoringService');
const AgentMonitoringStore = require('../src/monitoring/AgentMonitoringStore');
const { MONITORING_STATES } = require('../src/monitoring/AgentMonitoringStates');

describe('Phase 17 — Agent Monitoring & Observability Test Suite', () => {
    let app;
    let monitoringService;
    let store;

    beforeEach(() => {
        store = new AgentMonitoringStore();
        monitoringService = new AgentMonitoringService({ store });
        app = createApp({ agentMonitoringService: monitoringService });
    });

    afterEach(() => {
        if (monitoringService) {
            monitoringService.stopAll();
        }
    });

    test('1. Default monitoring configuration is initialized correctly', () => {
        const config = store.getConfig('TEST-AGENT-001');
        expect(config).toBeDefined();
        expect(config.agentId).toBe('TEST-AGENT-001');
        expect(config.enabled).toBe(true);
        expect(config.healthCheckEnabled).toBe(true);
        expect(config.capabilityCheckEnabled).toBe(true);
        expect(config.executionCheckEnabled).toBe(false);
        expect(config.failureThreshold).toBe(3);
    });

    test('2. Start continuous monitoring for an agent', async () => {
        const res = await request(app)
            .post('/api/v1/monitoring/agents/TEST-AGENT-001/start')
            .set('x-tenant-id', 'test-tenant');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.monitoringEnabled).toBe(true);
    });

    test('3. Stop continuous monitoring for an agent', async () => {
        await monitoringService.startMonitoring('TEST-AGENT-001', 'test-tenant');

        const res = await request(app)
            .post('/api/v1/monitoring/agents/TEST-AGENT-001/stop')
            .set('x-tenant-id', 'test-tenant');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.monitoringEnabled).toBe(false);
    });

    test('4. Perform manual check on a mock agent', async () => {
        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async (url) => {
            if (url.includes('/health')) {
                return { success: true, statusCode: 200, data: { status: 'HEALTHY' }, durationMs: 42 };
            }
            if (url.includes('/capabilities')) {
                return { success: true, statusCode: 200, data: { capabilities: ['health', 'ping'] }, durationMs: 15 };
            }
            return { success: true, statusCode: 200, data: {}, durationMs: 10 };
        });

        const status = await monitoringService.checkAgent('TEST-AGENT-001', 'test-tenant');

        expect(status.currentState).toBe(MONITORING_STATES.HEALTHY);
        expect(status.connectivity).toBe('CONNECTED');
        expect(status.latency.lastLatencyMs).toBe(57);
        expect(status.capabilities).toContain('health');
    });

    test('5. Record response latency metrics (min, max, avg)', async () => {
        let callCount = 0;
        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async () => {
            callCount++;
            const dur = callCount === 1 ? 100 : 200;
            return { success: true, statusCode: 200, data: { status: 'HEALTHY' }, durationMs: dur };
        });

        await monitoringService.checkAgent('AGENT-LATENCY-TEST', 'test-tenant');
        await monitoringService.checkAgent('AGENT-LATENCY-TEST', 'test-tenant');

        const status = store.getStatus('AGENT-LATENCY-TEST', 'test-tenant');
        expect(status.latency.minLatencyMs).toBeGreaterThan(0);
        expect(status.latency.maxLatencyMs).toBeGreaterThanOrEqual(status.latency.minLatencyMs);
        expect(status.latency.avgLatencyMs).toBeGreaterThan(0);
    });

    test('6. Detect DEGRADED state on slow response or explicit degraded status', async () => {
        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async () => {
            return { success: true, statusCode: 200, data: { status: 'DEGRADED' }, durationMs: 800 };
        });

        const status = await monitoringService.checkAgent('TEST-AGENT-001', 'test-tenant');
        expect(status.currentState).toBe(MONITORING_STATES.DEGRADED);
    });

    test('7. Detect UNHEALTHY state on HTTP 503 error', async () => {
        store.saveConfig('TEST-AGENT-001', { failureThreshold: 1 }, 'test-tenant');

        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async () => {
            return { success: false, statusCode: 503, data: { error: 'Service Error' }, durationMs: 50 };
        });

        const status = await monitoringService.checkAgent('TEST-AGENT-001', 'test-tenant');
        expect(status.currentState).toBe(MONITORING_STATES.UNHEALTHY);
        expect(status.consecutiveFailures).toBe(1);
    });

    test('8. Apply failure threshold before declaring UNHEALTHY/OFFLINE', async () => {
        store.saveConfig('TEST-THRESHOLD-AGENT', { failureThreshold: 3 }, 'test-tenant');
        store.saveStatus('TEST-THRESHOLD-AGENT', { currentState: MONITORING_STATES.HEALTHY }, 'test-tenant');

        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async () => {
            return { success: false, statusCode: 500, error: 'Internal Error', durationMs: 30 };
        });

        // 1st failure
        let status = await monitoringService.checkAgent('TEST-THRESHOLD-AGENT', 'test-tenant');
        expect(status.consecutiveFailures).toBe(1);
        expect(status.currentState).toBe(MONITORING_STATES.HEALTHY);

        // 2nd failure
        status = await monitoringService.checkAgent('TEST-THRESHOLD-AGENT', 'test-tenant');
        expect(status.consecutiveFailures).toBe(2);
        expect(status.currentState).toBe(MONITORING_STATES.HEALTHY);

        // 3rd failure
        status = await monitoringService.checkAgent('TEST-THRESHOLD-AGENT', 'test-tenant');
        expect(status.consecutiveFailures).toBe(3);
        expect([MONITORING_STATES.UNHEALTHY, MONITORING_STATES.OFFLINE]).toContain(status.currentState);
    });

    test('9. Detect recovery when unhealthy agent becomes healthy', async () => {
        store.saveConfig('TEST-RECOVER-AGENT', { recoveryThreshold: 1 }, 'test-tenant');
        store.saveStatus('TEST-RECOVER-AGENT', {
            currentState: MONITORING_STATES.UNHEALTHY,
            consecutiveFailures: 3,
            activeIncidentId: 'inc_test_123'
        }, 'test-tenant');

        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async () => {
            return { success: true, statusCode: 200, data: { status: 'HEALTHY' }, durationMs: 20 };
        });

        const status = await monitoringService.checkAgent('TEST-RECOVER-AGENT', 'test-tenant');
        expect(status.currentState).toBe(MONITORING_STATES.HEALTHY);
        expect(status.consecutiveFailures).toBe(0);
        expect(status.consecutiveRecoveries).toBe(1);
    });

    test('10. Perform safe test execution check', async () => {
        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async () => {
            return { success: true, statusCode: 200, data: { result: 'OK', executionId: 'exec_123' }, durationMs: 65 };
        });

        const res = await request(app)
            .post('/api/v1/monitoring/agents/TEST-AGENT-001/test-execution')
            .set('x-tenant-id', 'test-tenant')
            .send({ task: 'ping' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.durationMs).toBe(65);
    });

    test('11. Fetch detailed monitoring data for an agent via API', async () => {
        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async () => {
            return { success: true, statusCode: 200, data: { status: 'HEALTHY' }, durationMs: 10 };
        });

        await monitoringService.checkAgent('TEST-AGENT-001', 'test-tenant');

        const res = await request(app)
            .get('/api/v1/monitoring/agents/TEST-AGENT-001')
            .set('x-tenant-id', 'test-tenant');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBeDefined();
        expect(res.body.data.timeline).toBeDefined();
        expect(res.body.data.checkHistory).toBeDefined();
    });

    test('12. Update agent monitoring configuration via API', async () => {
        const res = await request(app)
            .put('/api/v1/monitoring/agents/TEST-AGENT-001/config')
            .set('x-tenant-id', 'test-tenant')
            .send({ healthIntervalSeconds: 30, failureThreshold: 5 });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.healthIntervalSeconds).toBe(30);
        expect(res.body.data.failureThreshold).toBe(5);
    });

    test('13. Check all agents via API', async () => {
        store.saveStatus('AGENT-1', { agentId: 'AGENT-1' }, 'test-tenant');
        store.saveStatus('AGENT-2', { agentId: 'AGENT-2' }, 'test-tenant');

        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async () => {
            return { success: true, statusCode: 200, data: { status: 'HEALTHY' }, durationMs: 15 };
        });

        const res = await request(app)
            .post('/api/v1/monitoring/check-all')
            .set('x-tenant-id', 'test-tenant');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    test('14. Proxy control mode simulation request', async () => {
        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async (url) => {
            return { success: true, statusCode: 200, data: { status: 'DEGRADED', mode: 'DEGRADED' }, durationMs: 10 };
        });

        const res = await request(app)
            .post('/api/v1/monitoring/agents/TEST-AGENT-001/control/mode')
            .set('x-tenant-id', 'test-tenant')
            .send({ mode: 'DEGRADED' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('15. One failing agent does not block monitoring of another agent', async () => {
        store.saveConfig('FAILING-AGENT', { failureThreshold: 1, endpointOverride: 'http://failing-agent-host:4000' }, 'test-tenant');

        jest.spyOn(monitoringService, '_makeHttpRequest').mockImplementation(async (url) => {
            if (url.includes('failing-agent-host')) {
                return { success: false, statusCode: 503, error: 'Network error', durationMs: 10 };
            }
            return { success: true, statusCode: 200, data: { status: 'HEALTHY' }, durationMs: 25 };
        });

        const res1 = await monitoringService.checkAgent('FAILING-AGENT', 'test-tenant');
        const res2 = await monitoringService.checkAgent('HEALTHY-AGENT', 'test-tenant');

        expect([MONITORING_STATES.UNHEALTHY, MONITORING_STATES.OFFLINE]).toContain(res1.currentState);
        expect(res2.currentState).toBe(MONITORING_STATES.HEALTHY);
    });

    test('16. Tenant isolation for agent monitoring statuses', async () => {
        store.saveStatus('AGENT-T1', { currentState: MONITORING_STATES.HEALTHY }, 'tenant-1');
        store.saveStatus('AGENT-T2', { currentState: MONITORING_STATES.DEGRADED }, 'tenant-2');

        const listT1 = await monitoringService.getMonitoredAgents('tenant-1');
        const listT2 = await monitoringService.getMonitoredAgents('tenant-2');

        expect(listT1.some(a => a.agentId === 'AGENT-T1')).toBe(true);
        expect(listT1.some(a => a.agentId === 'AGENT-T2')).toBe(false);

        expect(listT2.some(a => a.agentId === 'AGENT-T2')).toBe(true);
        expect(listT2.some(a => a.agentId === 'AGENT-T1')).toBe(false);
    });
});
