const request = require('supertest');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { SystemExecutionService } = require('../src/service/SystemExecutionService');
const { HealthCheckEngine } = require('../src/health/HealthCheckEngine');
const { QualityTestRunner } = require('../src/quality/QualityTestRunner');
const { QualityTestDefinition } = require('../src/quality/QualityTestDefinition');
const { UsageEvent } = require('../src/usage/UsageEvent');
const { UsageStore } = require('../src/usage/UsageStore');
const { UsageEventCollector } = require('../src/usage/UsageEventCollector');
const { UsageAggregator } = require('../src/usage/UsageAggregator');

describe('Phase 5 — Universal Usage Analytics Engine Test Suite', () => {
    let systemRegistry;
    let usageStore;
    let usageCollector;
    let executionService;
    let healthEngine;
    let qualityRunner;
    let app;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        usageStore = new UsageStore();
        usageCollector = new UsageEventCollector({ usageStore });
        
        executionService = new SystemExecutionService({
            systemRegistry,
            usageCollector,
            allowLocalhost: true
        });

        healthEngine = new HealthCheckEngine({
            systemRegistry,
            executionService,
            usageCollector
        });

        qualityRunner = new QualityTestRunner({
            systemExecutionService: executionService,
            usageCollector
        });

        app = createApp({
            systemRegistry,
            executionService,
            healthEngine,
            qualityRunner,
            usageCollector
        });

        // Register default neutral test system
        systemRegistry.registerSystem({
            id: 'DEMO-SYSTEM-001',
            name: 'Demo Processing System',
            version: '1.0.0',
            capabilities: ['execute', 'health', 'testing'],
            adapter: { adapterType: 'mock' }
        });
    });

    // 1. Usage event validation
    test('1. Usage event validation', () => {
        const invalidRes = UsageEvent.validate({ name: 'missing systemId' });
        expect(invalidRes.valid).toBe(false);

        const validRes = UsageEvent.validate({ systemId: 'DEMO-SYSTEM-001' });
        expect(validRes.valid).toBe(true);
    });

    // 2. Event creation
    test('2. Event creation', () => {
        const evt = new UsageEvent({
            systemId: 'DEMO-SYSTEM-001',
            capability: 'execute',
            operation: 'execute',
            status: 'SUCCESS',
            durationMs: 120
        });

        expect(evt.eventId).toBeDefined();
        expect(evt.systemId).toBe('DEMO-SYSTEM-001');
        expect(evt.status).toBe('SUCCESS');
    });

    // 3. Event retrieval
    test('3. Event retrieval from store', () => {
        const evt = usageCollector.recordActivity({
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute'
        });

        const fetched = usageStore.getEvent(evt.eventId);
        expect(fetched).toBeDefined();
        expect(fetched.eventId).toBe(evt.eventId);
    });

    // 4. System filtering
    test('4. System filtering of usage events', () => {
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001' });
        usageCollector.recordActivity({ systemId: 'OTHER-SYS-002' });

        const results = usageStore.getEventsBySystem('DEMO-SYSTEM-001');
        expect(results.length).toBe(1);
        expect(results[0].systemId).toBe('DEMO-SYSTEM-001');
    });

    // 5. Capability filtering
    test('5. Capability filtering of usage events', () => {
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', capability: 'telemetry' });
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', capability: 'execute' });

        const results = usageStore.getEventsByCapability('telemetry');
        expect(results.length).toBe(1);
        expect(results[0].capability).toBe('telemetry');
    });

    // 6. Operation filtering
    test('6. Operation filtering of usage events', () => {
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', operation: 'op_a' });
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', operation: 'op_b' });

        const results = usageStore.getEventsByOperation('op_a');
        expect(results.length).toBe(1);
        expect(results[0].operation).toBe('op_a');
    });

    // 7. Time filtering
    test('7. Time filtering of usage events', () => {
        const past = new Date(Date.now() - 10000).toISOString();
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', timestamp: past });
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001' });

        const results = usageStore.getEventsByTimeRange(new Date(Date.now() - 5000).toISOString());
        expect(results.length).toBe(1);
    });

    // 8. Successful activity
    test('8. Successful activity recording', () => {
        const evt = usageCollector.recordActivity({
            systemId: 'DEMO-SYSTEM-001',
            status: 'SUCCESS'
        });
        expect(evt.status).toBe('SUCCESS');
    });

    // 9. Failed activity
    test('9. Failed activity recording', () => {
        const evt = usageCollector.recordActivity({
            systemId: 'DEMO-SYSTEM-001',
            status: 'FAILED'
        });
        expect(evt.status).toBe('FAILED');
    });

    // 10. Last-used calculation
    test('10. Last-used recency calculation', () => {
        const t1 = new Date(Date.now() - 60000).toISOString();
        const t2 = new Date().toISOString();

        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', timestamp: t1 });
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', timestamp: t2 });

        const aggregator = new UsageAggregator(usageStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });

        expect(metrics.lastUsedAt).toBe(t2);
    });

    // 11. First-used calculation
    test('11. First-used recency calculation', () => {
        const t1 = new Date(Date.now() - 120000).toISOString();
        const t2 = new Date().toISOString();

        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', timestamp: t1 });
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', timestamp: t2 });

        const aggregator = new UsageAggregator(usageStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });

        expect(metrics.firstUsedAt).toBe(t1);
    });

    // 12. Frequency calculation
    test('12. Frequency calculation (executions per hour/day)', () => {
        usageCollector.recordExecution({ systemId: 'DEMO-SYSTEM-001' });
        usageCollector.recordExecution({ systemId: 'DEMO-SYSTEM-001' });

        const aggregator = new UsageAggregator(usageStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001', window: '24h' });

        expect(metrics.frequency.executionsPerDay).toBeGreaterThan(0);
    });

    // 13. Active-day calculation
    test('13. Active-day calculation', () => {
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', timestamp: new Date().toISOString() });

        const aggregator = new UsageAggregator(usageStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });

        expect(metrics.activeDays).toBe(1);
    });

    // 14. Inactivity calculation
    test('14. Inactivity calculation', () => {
        const fiveDaysAgo = new Date(Date.now() - (5 * 24 * 60 * 60 * 1000)).toISOString();
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', timestamp: fiveDaysAgo });

        const aggregator = new UsageAggregator(usageStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });

        expect(metrics.inactiveForDays).toBeGreaterThanOrEqual(4.9);
    });

    // 15. Success rate
    test('15. Success rate percentage calculation', () => {
        usageCollector.recordExecution({ systemId: 'DEMO-SYSTEM-001', status: 'SUCCESS' });
        usageCollector.recordExecution({ systemId: 'DEMO-SYSTEM-001', status: 'FAILED' });

        const aggregator = new UsageAggregator(usageStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });

        expect(metrics.successRate).toBe(50);
    });

    // 16. Capability usage
    test('16. Capability usage breakdown', () => {
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', capability: 'telemetry' });
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', capability: 'telemetry' });
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', capability: 'execute' });

        const aggregator = new UsageAggregator(usageStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });

        expect(metrics.uniqueCapabilitiesCount).toBe(2);
        expect(metrics.capabilities['telemetry']).toBe(2);
    });

    // 17. Operation usage
    test('17. Operation usage breakdown', () => {
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', operation: 'op_x' });
        usageCollector.recordActivity({ systemId: 'DEMO-SYSTEM-001', operation: 'op_x' });

        const aggregator = new UsageAggregator(usageStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });

        expect(metrics.operations['op_x']).toBe(2);
    });

    // 18. Trend aggregation
    test('18. Trend time-series bucket generation', () => {
        usageCollector.recordExecution({ systemId: 'DEMO-SYSTEM-001' });

        const aggregator = new UsageAggregator(usageStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });

        expect(Array.isArray(metrics.trend)).toBe(true);
        expect(metrics.trend.length).toBe(10);
    });

    // 19. Retention
    test('19. Retention policy enforcement (maxEvents & retentionDays)', () => {
        const store = new UsageStore({ maxEvents: 3, retentionDays: 30 });

        store.recordEvent(new UsageEvent({ systemId: 'DEMO-SYSTEM-001', eventId: 'e1' }));
        store.recordEvent(new UsageEvent({ systemId: 'DEMO-SYSTEM-001', eventId: 'e2' }));
        store.recordEvent(new UsageEvent({ systemId: 'DEMO-SYSTEM-001', eventId: 'e3' }));
        store.recordEvent(new UsageEvent({ systemId: 'DEMO-SYSTEM-001', eventId: 'e4' })); // triggers trim

        expect(store.listEvents().length).toBe(3);
        expect(store.getEvent('e1')).toBeNull(); // e1 trimmed
    });

    // 20. Credential sanitization
    test('20. Credential sanitization in event metadata', () => {
        const evt = usageCollector.recordActivity({
            systemId: 'DEMO-SYSTEM-001',
            metadata: {
                authorization: 'Bearer secret_token',
                apiKey: 'ak_live_secret',
                password: 'supersecretpassword',
                normalField: 'public_value'
            }
        });

        expect(evt.metadata.authorization).toBe('[REDACTED]');
        expect(evt.metadata.apiKey).toBe('[REDACTED]');
        expect(evt.metadata.password).toBe('[REDACTED]');
        expect(evt.metadata.normalField).toBe('public_value');
    });

    // 21. Prototype pollution protection
    test('21. Prototype pollution protection on event metadata', () => {
        const maliciousPayload = JSON.parse('{"systemId":"DEMO-SYSTEM-001","metadata":{"__proto__":{"polluted":true}}}');
        const evt = usageCollector.recordActivity(maliciousPayload);

        expect(Object.prototype.polluted).toBeUndefined();
        expect(evt).toBeDefined();
    });

    // 22. RBAC
    test('22. RBAC enforcement on usage endpoints', async () => {
        // GET allowed for viewer
        const resGet = await request(app).get('/api/v1/usage/overview');
        expect(resGet.status).toBe(200);

        // PUT config restricted to Admin
        const resPutViewer = await request(app)
            .put('/api/v1/usage/config')
            .set('x-user-role', 'viewer')
            .send({ maxEvents: 1000 });

        expect(resPutViewer.status).toBe(403);
    });

    // 23. Health integration
    test('23. HealthCheckEngine integration emits HEALTH_CHECK events', async () => {
        await healthEngine.checkHealth('DEMO-SYSTEM-001');

        const events = usageStore.listEvents({ category: 'HEALTH_CHECK' });
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].systemId).toBe('DEMO-SYSTEM-001');
    });

    // 24. Quality integration
    test('24. QualityTestRunner integration emits QUALITY_TEST events', async () => {
        const testDef = new QualityTestDefinition({
            testId: 'qtest-usage-1',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute'
        });

        await qualityRunner.runTest(testDef);

        const events = usageStore.listEvents({ category: 'QUALITY_TEST' });
        expect(events.length).toBeGreaterThan(0);
        expect(events[0].systemId).toBe('DEMO-SYSTEM-001');
    });

    // 25. Internal activity distinction
    test('25. Internal activity distinction (EXECUTION vs HEALTH_CHECK / QUALITY_TEST)', async () => {
        await executionService.executeOperation('DEMO-SYSTEM-001', 'execute');
        await healthEngine.checkHealth('DEMO-SYSTEM-001');

        const aggregator = new UsageAggregator(usageStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });

        expect(metrics.totalExecutions).toBe(1); // User/API execution
        expect(metrics.internalChecks).toBeGreaterThanOrEqual(1);  // Health check
    });

    // 26. No business-specific hardcoding
    test('26. Universality: Zero business-specific hardcoding in Usage Engine', () => {
        const evt = new UsageEvent({
            systemId: 'CUSTOM-SYSTEM-999',
            capability: 'custom_cap',
            operation: 'custom_op'
        });

        expect(evt.capability).toBe('custom_cap');
        expect(evt.operation).toBe('custom_op');
    });

    // 27. Phase 1 regression
    test('27. Phase 1 regression: SystemRegistry and ContractValidator', () => {
        const sys = systemRegistry.getSystemInstance('DEMO-SYSTEM-001');
        expect(sys).toBeDefined();
        expect(sys.id).toBe('DEMO-SYSTEM-001');
    });

    // 28. Phase 2 regression
    test('28. Phase 2 regression: SystemExecutionService and Adapter Framework', async () => {
        const res = await executionService.executeOperation('DEMO-SYSTEM-001', 'execute');
        expect(res.success).toBe(true);
    });

    // 29. Phase 3 regression
    test('29. Phase 3 regression: HealthCheckEngine and Health States', async () => {
        const healthRes = await healthEngine.checkHealth('DEMO-SYSTEM-001');
        expect(healthRes.status).toBe('HEALTHY');
    });

    // 30. Phase 4 regression
    test('30. Phase 4 regression: QualityTestRunner and Assertion Engine', async () => {
        const testDef = new QualityTestDefinition({
            testId: 'qtest-reg-4',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute',
            assertions: [{ type: 'statusEquals', expected: 200 }]
        });

        const res = await qualityRunner.runTest(testDef);
        expect(res.status).toBe('PASS');
    });
});
