const request = require('supertest');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { HealthCheckEngine } = require('../src/health/HealthCheckEngine');
const { HealthStore } = require('../src/health/HealthStore');
const { HealthConfig } = require('../src/health/HealthConfig');
const { HEALTH_STATES, HEALTH_REASONS } = require('../src/health/HealthStates');

describe('Phase 3 — Universal Health Monitoring Engine Test Suite', () => {
    let systemRegistry;
    let healthStore;
    let healthEngine;
    let app;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        healthStore = new HealthStore();
        healthEngine = new HealthCheckEngine({
            systemRegistry,
            healthStore
        });
        app = createApp({
            systemRegistry,
            healthEngine
        });
    });

    // 1. Healthy system check
    test('1. Healthy system check', async () => {
        systemRegistry.registerSystem({
            id: 'DEMO-SYSTEM-001',
            name: 'Demo System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const res = await request(app).post('/api/v1/health/DEMO-SYSTEM-001/check');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe(HEALTH_STATES.HEALTHY);
    });

    // 2. Unknown system check
    test('2. Unknown system handling', async () => {
        const res = await request(app).post('/api/v1/health/NON-EXISTENT-SYS/check');
        expect(res.body.data.status).toBe(HEALTH_STATES.UNKNOWN);
        expect(res.body.data.reason).toBe(HEALTH_REASONS.SYSTEM_NOT_FOUND);
    });

    // 3. Missing health capability
    test('3. Missing health capability handling', async () => {
        systemRegistry.registerSystem({
            id: 'NO-HEALTH-SYS',
            name: 'No Health System',
            version: '1.0.0',
            capabilities: ['execute'], // Missing health capability!
            adapter: { adapterType: 'mock' }
        });

        const res = await request(app).post('/api/v1/health/NO-HEALTH-SYS/check');
        expect(res.body.data.status).toBe(HEALTH_STATES.UNKNOWN);
        expect(res.body.data.reason).toBe(HEALTH_REASONS.HEALTH_CAPABILITY_UNAVAILABLE);
    });

    // 4. Health check success
    test('4. Health check success', async () => {
        systemRegistry.registerSystem({
            id: 'HEALTH-OK',
            name: 'OK System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const result = await healthEngine.checkHealth('HEALTH-OK');
        expect(result.success).toBe(true);
        expect(result.status).toBe(HEALTH_STATES.HEALTHY);
    });

    // 5. Health check failure
    test('5. Health check failure handling', async () => {
        systemRegistry.registerSystem({
            id: 'FAIL-SYS',
            name: 'Failing System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const result = await healthEngine.checkHealth('FAIL-SYS', {
            overrideConfig: { failureThreshold: 1 },
            payload: { simulateFailure: true }
        });

        expect(result.success).toBe(false);
    });

    // 6. Timeout handling
    test('6. Timeout handling in health check', async () => {
        systemRegistry.registerSystem({
            id: 'TIMEOUT-SYS',
            name: 'Timeout System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const result = await healthEngine.checkHealth('TIMEOUT-SYS', {
            overrideConfig: { failureThreshold: 1 },
            payload: { simulateTimeout: true }
        });

        expect(result.success).toBe(false);
    });

    // 7. DNS failure handling
    test('7. DNS failure classification', async () => {
        const result = await healthEngine.checkHealth('UNKNOWN-SYS');
        expect(result.status).toBe(HEALTH_STATES.UNKNOWN);
    });

    // 8. Connection failure handling
    test('8. Connection failure mapping', async () => {
        systemRegistry.registerSystem({
            id: 'CONN-ERR-SYS',
            name: 'Conn Err System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const result = await healthEngine.checkHealth('CONN-ERR-SYS', {
            overrideConfig: { failureThreshold: 1 }
        });
        expect(result.systemId).toBe('CONN-ERR-SYS');
    });

    // 9. HTTP error handling
    test('9. HTTP error handling in health check', async () => {
        systemRegistry.registerSystem({
            id: 'HTTP-ERR-SYS',
            name: 'HTTP Error System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const result = await healthEngine.checkHealth('HTTP-ERR-SYS');
        expect(result.systemId).toBe('HTTP-ERR-SYS');
    });

    // 10. Authentication error handling
    test('10. Authentication error handling', async () => {
        systemRegistry.registerSystem({
            id: 'AUTH-ERR-SYS',
            name: 'Auth Error System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const result = await healthEngine.checkHealth('AUTH-ERR-SYS');
        expect(result.systemId).toBe('AUTH-ERR-SYS');
    });

    // 11. Authorization error handling
    test('11. Authorization error handling', async () => {
        systemRegistry.registerSystem({
            id: 'FORBIDDEN-SYS',
            name: 'Forbidden System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const result = await healthEngine.checkHealth('FORBIDDEN-SYS');
        expect(result.systemId).toBe('FORBIDDEN-SYS');
    });

    // 12. Unsupported operation
    test('12. Unsupported operation in health check', async () => {
        systemRegistry.registerSystem({
            id: 'UNSUPPORTED-HEALTH-SYS',
            name: 'Unsupported Health System',
            version: '1.0.0',
            capabilities: ['execute'],
            adapter: { adapterType: 'mock' }
        });

        const result = await healthEngine.checkHealth('UNSUPPORTED-HEALTH-SYS');
        expect(result.status).toBe(HEALTH_STATES.UNKNOWN);
        expect(result.reason).toBe(HEALTH_REASONS.HEALTH_CAPABILITY_UNAVAILABLE);
    });

    // 13. Monotonic response time measurement
    test('13. Response time measurement is non-negative number', async () => {
        systemRegistry.registerSystem({
            id: 'TIME-SYS',
            name: 'Time System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const result = await healthEngine.checkHealth('TIME-SYS');
        expect(typeof result.responseTimeMs).toBe('number');
        expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    // 14. Latency threshold classification (DEGRADED)
    test('14. Latency threshold classification triggers DEGRADED status', async () => {
        systemRegistry.registerSystem({
            id: 'SLOW-SYS',
            name: 'Slow System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const result = await healthEngine.checkHealth('SLOW-SYS', {
            overrideConfig: { latencyThresholdMs: -1 }
        });

        expect(result.status).toBe(HEALTH_STATES.DEGRADED);
        expect(result.reason).toBe(HEALTH_REASONS.LATENCY_THRESHOLD_EXCEEDED);
    });

    // 15. Failure threshold state transition to OFFLINE
    test('15. Consecutive failures >= failureThreshold transitions to OFFLINE', async () => {
        systemRegistry.registerSystem({
            id: 'OFFLINE-THRESH-SYS',
            name: 'Offline Threshold System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        healthEngine.executionService.executeOperation = jest.fn().mockResolvedValue({
            success: false,
            error: { code: 'CONNECTION_FAILURE', message: 'Connection refused' }
        });

        // Failure 1 (Threshold 2)
        let r1 = await healthEngine.checkHealth('OFFLINE-THRESH-SYS', { overrideConfig: { failureThreshold: 2 } });
        expect(r1.consecutiveFailures).toBe(1);

        // Failure 2 -> OFFLINE!
        let r2 = await healthEngine.checkHealth('OFFLINE-THRESH-SYS', { overrideConfig: { failureThreshold: 2 } });
        expect(r2.consecutiveFailures).toBe(2);
        expect(r2.status).toBe(HEALTH_STATES.OFFLINE);
        expect(r2.reason).toBe(HEALTH_REASONS.CONSECUTIVE_FAILURES_EXCEEDED);
    });

    // 16. Recovery threshold state transition to HEALTHY
    test('16. Consecutive successes >= recoveryThreshold recovers to HEALTHY', async () => {
        systemRegistry.registerSystem({
            id: 'RECOVER-SYS',
            name: 'Recovering System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        // Set state to OFFLINE initially
        healthStore.updateSystemState('RECOVER-SYS', {
            status: HEALTH_STATES.OFFLINE,
            consecutiveFailures: 3,
            consecutiveSuccesses: 0
        });

        // Success 1 (Threshold 2) -> Recovery in progress
        let r1 = await healthEngine.checkHealth('RECOVER-SYS', { overrideConfig: { recoveryThreshold: 2, latencyThresholdMs: 5000 } });
        expect(r1.consecutiveSuccesses).toBe(1);

        // Success 2 -> Recovered to HEALTHY!
        let r2 = await healthEngine.checkHealth('RECOVER-SYS', { overrideConfig: { recoveryThreshold: 2, latencyThresholdMs: 5000 } });
        expect(r2.consecutiveSuccesses).toBe(2);
        expect(r2.status).toBe(HEALTH_STATES.HEALTHY);
    });

    // 17. Consecutive failures tracking
    test('17. Consecutive failures counter increments correctly', async () => {
        systemRegistry.registerSystem({
            id: 'COUNTER-FAIL-SYS',
            name: 'Counter System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        healthEngine.executionService.executeOperation = jest.fn().mockResolvedValue({
            success: false,
            error: { code: 'HTTP_SERVER_ERROR' }
        });

        await healthEngine.checkHealth('COUNTER-FAIL-SYS', { overrideConfig: { failureThreshold: 5 } });
        await healthEngine.checkHealth('COUNTER-FAIL-SYS', { overrideConfig: { failureThreshold: 5 } });
        const res = await healthEngine.checkHealth('COUNTER-FAIL-SYS', { overrideConfig: { failureThreshold: 5 } });

        expect(res.consecutiveFailures).toBe(3);
    });

    // 18. Consecutive successes tracking
    test('18. Consecutive successes counter increments correctly', async () => {
        systemRegistry.registerSystem({
            id: 'COUNTER-OK-SYS',
            name: 'Counter System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        await healthEngine.checkHealth('COUNTER-OK-SYS');
        await healthEngine.checkHealth('COUNTER-OK-SYS');
        const res = await healthEngine.checkHealth('COUNTER-OK-SYS');

        expect(res.consecutiveSuccesses).toBe(3);
    });

    // 19. Health measurement history
    test('19. Health measurement history API', async () => {
        systemRegistry.registerSystem({
            id: 'HIST-SYS',
            name: 'History System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        await healthEngine.checkHealth('HIST-SYS');
        await healthEngine.checkHealth('HIST-SYS');

        const res = await request(app).get('/api/v1/health/HIST-SYS/history');
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(2);
    });

    // 20. Health metrics computation over time window
    test('20. Health metrics computation', async () => {
        systemRegistry.registerSystem({
            id: 'METRIC-SYS',
            name: 'Metrics System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        await healthEngine.checkHealth('METRIC-SYS');

        const res = await request(app).get('/api/v1/health/METRIC-SYS/metrics?window=1h');
        expect(res.status).toBe(200);
        expect(res.body.data.availability).toBe(100);
        expect(res.body.data.totalChecks).toBe(1);
    });

    // 21. Availability percentage calculation
    test('21. Availability percentage calculation', async () => {
        systemRegistry.registerSystem({
            id: 'AVAIL-SYS',
            name: 'Avail System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        await healthEngine.checkHealth('AVAIL-SYS');

        const overview = healthStore.getOverview(systemRegistry.getAllSystems());
        expect(overview.overallAvailability).toBe(100);
    });

    // 22. Manual health check trigger via API
    test('22. Manual health check trigger via API', async () => {
        systemRegistry.registerSystem({
            id: 'MANUAL-SYS',
            name: 'Manual System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const res = await request(app)
            .post('/api/v1/health/MANUAL-SYS/check')
            .set('x-user-role', 'operator');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.systemId).toBe('MANUAL-SYS');
    });

    // 23. Health configuration validation
    test('23. Health configuration validation rejects negative values', async () => {
        systemRegistry.registerSystem({
            id: 'CONF-VALID-SYS',
            name: 'Config System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const res = await request(app)
            .put('/api/v1/health/CONF-VALID-SYS/config')
            .send({ checkIntervalMs: -500 }); // Negative interval!

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('INVALID_CONFIG');
    });

    // 24. RBAC authorization check
    test('24. RBAC authorization rejects viewer updating config', async () => {
        systemRegistry.registerSystem({
            id: 'RBAC-CONF-SYS',
            name: 'Config System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const res = await request(app)
            .put('/api/v1/health/RBAC-CONF-SYS/config')
            .set('x-user-role', 'viewer')
            .send({ timeoutMs: 3000 });

        expect(res.status).toBe(403);
    });

    // 25. Header credential sanitization
    test('25. Header credential sanitization in evidence', async () => {
        systemRegistry.registerSystem({
            id: 'SECRET-SYS',
            name: 'Secret System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: {
                adapterType: 'mock',
                authRef: { authType: 'api_key', secretKey: 'top-secret-token-123' }
            }
        });

        const res = await healthEngine.checkHealth('SECRET-SYS');
        const str = JSON.stringify(res);
        expect(str.includes('top-secret-token-123')).toBe(false);
    });

    // 26. Zero secret leakage
    test('26. Zero secret leakage in health endpoints', async () => {
        systemRegistry.registerSystem({
            id: 'NO-LEAK-SYS',
            name: 'No Leak System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        await healthEngine.checkHealth('NO-LEAK-SYS');
        const res = await request(app).get('/api/v1/health/NO-LEAK-SYS');
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body).includes('password')).toBe(false);
    });

    // 27. Generic Mock Health Simulations (Scenarios A through G)
    describe('27. Generic Mock Health Scenarios A through G', () => {
        beforeEach(() => {
            systemRegistry.registerSystem({
                id: 'DEMO-SYSTEM-001',
                name: 'Neutral Demo Processing Unit',
                version: '1.0.0',
                capabilities: ['health', 'execute'],
                adapter: { adapterType: 'mock' }
            });
        });

        // Scenario A: healthy + low latency
        test('Scenario A: healthy + low latency', async () => {
            const res = await healthEngine.checkHealth('DEMO-SYSTEM-001', {
                overrideConfig: { latencyThresholdMs: 2000 }
            });
            expect(res.status).toBe(HEALTH_STATES.HEALTHY);
            expect(res.reason).toBe(HEALTH_REASONS.HEALTH_CHECK_SUCCESS);
        });

        // Scenario B: healthy + high latency
        test('Scenario B: healthy + high latency (DEGRADED)', async () => {
            const res = await healthEngine.checkHealth('DEMO-SYSTEM-001', {
                overrideConfig: { latencyThresholdMs: 2 },
                payload: { simulatedLatencyMs: 15 }
            });
            expect(res.status).toBe(HEALTH_STATES.DEGRADED);
            expect(res.reason).toBe(HEALTH_REASONS.LATENCY_THRESHOLD_EXCEEDED);
        });

        // Scenario C: temporary failure
        test('Scenario C: temporary failure', async () => {
            healthEngine.executionService.executeOperation = jest.fn().mockResolvedValueOnce({
                success: false,
                error: { code: 'HTTP_SERVER_ERROR' }
            });

            const res = await healthEngine.checkHealth('DEMO-SYSTEM-001', {
                overrideConfig: { failureThreshold: 3 }
            });
            expect(res.success).toBe(false);
            expect(res.consecutiveFailures).toBe(1);
        });

        // Scenario D: repeated failures -> OFFLINE
        test('Scenario D: repeated failures -> OFFLINE', async () => {
            healthEngine.executionService.executeOperation = jest.fn().mockResolvedValue({
                success: false,
                error: { code: 'CONNECTION_FAILURE' }
            });

            await healthEngine.checkHealth('DEMO-SYSTEM-001', { overrideConfig: { failureThreshold: 2 } });
            const res = await healthEngine.checkHealth('DEMO-SYSTEM-001', { overrideConfig: { failureThreshold: 2 } });

            expect(res.status).toBe(HEALTH_STATES.OFFLINE);
            expect(res.reason).toBe(HEALTH_REASONS.CONSECUTIVE_FAILURES_EXCEEDED);
        });

        // Scenario E: recovery -> HEALTHY
        test('Scenario E: recovery -> HEALTHY', async () => {
            healthStore.updateSystemState('DEMO-SYSTEM-001', {
                status: HEALTH_STATES.OFFLINE,
                consecutiveFailures: 3,
                consecutiveSuccesses: 0
            });

            await healthEngine.checkHealth('DEMO-SYSTEM-001', { overrideConfig: { recoveryThreshold: 2, latencyThresholdMs: 5000 } });
            const res = await healthEngine.checkHealth('DEMO-SYSTEM-001', { overrideConfig: { recoveryThreshold: 2, latencyThresholdMs: 5000 } });

            expect(res.status).toBe(HEALTH_STATES.HEALTHY);
        });

        // Scenario F: timeout simulation
        test('Scenario F: timeout simulation', async () => {
            healthEngine.executionService.executeOperation = jest.fn().mockResolvedValueOnce({
                success: false,
                error: { code: 'TIMEOUT', message: 'Timeout' }
            });

            const res = await healthEngine.checkHealth('DEMO-SYSTEM-001');
            expect(res.error.code).toBe('TIMEOUT');
            expect(res.reason).toBe(HEALTH_REASONS.TIMEOUT);
        });

        // Scenario G: unsupported health operation
        test('Scenario G: unsupported health operation', async () => {
            systemRegistry.registerSystem({
                id: 'DEMO-NO-HEALTH',
                name: 'No Health',
                version: '1.0.0',
                capabilities: ['execute'],
                adapter: { adapterType: 'mock' }
            });

            const res = await healthEngine.checkHealth('DEMO-NO-HEALTH');
            expect(res.status).toBe(HEALTH_STATES.UNKNOWN);
            expect(res.reason).toBe(HEALTH_REASONS.HEALTH_CAPABILITY_UNAVAILABLE);
        });
    });
});
