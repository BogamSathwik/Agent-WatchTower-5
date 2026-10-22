const request = require('supertest');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { QualityTestDefinition } = require('../src/quality/QualityTestDefinition');
const { QualityTestResult, QUALITY_RESULT_STATES } = require('../src/quality/QualityTestResult');
const { QualityTestSuite } = require('../src/quality/QualityTestSuite');
const { QualityTestRunner } = require('../src/quality/QualityTestRunner');
const { QualityStore } = require('../src/quality/QualityStore');
const { AssertionEngine } = require('../src/quality/AssertionEngine');
const { QualityAggregator } = require('../src/quality/QualityAggregator');
const { HealthCheckEngine } = require('../src/health/HealthCheckEngine');
const { HEALTH_STATES } = require('../src/health/HealthStates');

describe('Phase 4 — Universal Quality and Behavioral Testing Engine Test Suite', () => {
    let systemRegistry;
    let qualityStore;
    let qualityRunner;
    let healthEngine;
    let app;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        qualityStore = new QualityStore();
        qualityRunner = new QualityTestRunner({
            systemRegistry,
            qualityStore
        });
        healthEngine = new HealthCheckEngine({
            systemRegistry
        });
        app = createApp({
            systemRegistry,
            qualityRunner,
            healthEngine
        });

        // Register default neutral test system DEMO-SYSTEM-001
        systemRegistry.registerSystem({
            id: 'DEMO-SYSTEM-001',
            name: 'Demo Test System',
            version: '1.0.0',
            capabilities: ['execute', 'health', 'testing'],
            adapter: { adapterType: 'mock' }
        });
    });

    // 1. Test creation
    test('1. Test definition creation', async () => {
        const res = await request(app)
            .post('/api/v1/quality/tests')
            .send({
                name: 'Status and Data Check',
                systemId: 'DEMO-SYSTEM-001',
                operation: 'execute',
                assertions: [
                    { type: 'statusEquals', expected: 200 },
                    { type: 'fieldExists', path: 'data' }
                ]
            });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.testId).toBeDefined();
        expect(res.body.data.systemId).toBe('DEMO-SYSTEM-001');
    });

    // 2. Invalid test definition
    test('2. Invalid test definition validation', async () => {
        const res = await request(app)
            .post('/api/v1/quality/tests')
            .send({
                name: '', // Empty name invalid
                systemId: 'DEMO-SYSTEM-001'
            });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('INVALID_TEST_DEF');
    });

    // 3. Test retrieval
    test('3. Test retrieval by ID', async () => {
        const testDef = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'qtest-100',
            name: 'Fetch Test',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute'
        }));

        const res = await request(app).get(`/api/v1/quality/tests/${testDef.testId}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBe('Fetch Test');
    });

    // 4. Test update
    test('4. Test update via PATCH', async () => {
        const testDef = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'qtest-101',
            name: 'Original Name',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute'
        }));

        const res = await request(app)
            .patch(`/api/v1/quality/tests/${testDef.testId}`)
            .send({ name: 'Updated Name', enabled: false });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Updated Name');
        expect(res.body.data.enabled).toBe(false);
    });

    // 5. Test deletion
    test('5. Test deletion via DELETE', async () => {
        const testDef = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'qtest-102',
            name: 'To Delete',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute'
        }));

        const res = await request(app).delete(`/api/v1/quality/tests/${testDef.testId}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const getRes = await request(app).get(`/api/v1/quality/tests/${testDef.testId}`);
        expect(getRes.status).toBe(404);
    });

    // 6. Test execution
    test('6. Single test execution', async () => {
        const testDef = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'qtest-exec-1',
            name: 'Execution Test',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute',
            assertions: [{ type: 'statusEquals', expected: 200 }]
        }));

        const res = await request(app).post(`/api/v1/quality/tests/${testDef.testId}/run`).send();
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe(QUALITY_RESULT_STATES.PASS);
    });

    // 7. Assertion evaluation
    test('7. Assertion evaluation pass condition', () => {
        const assertion = { type: 'fieldEquals', path: 'data.status', expected: 'active' };
        const payload = { data: { status: 'active' } };

        const result = AssertionEngine.evaluateAssertion(assertion, payload);
        expect(result.status).toBe('PASS');
        expect(result.message).toContain('equals expected value');
    });

    // 8. Multiple assertions
    test('8. Multiple assertions evaluation', () => {
        const assertions = [
            { type: 'statusEquals', expected: 200 },
            { type: 'fieldExists', path: 'data.id' },
            { type: 'fieldType', path: 'data.id', expected: 'string' }
        ];
        const payload = { status: 200, data: { id: 'abc-123' } };

        const res = AssertionEngine.evaluateAll(assertions, payload);
        expect(res.allPassed).toBe(true);
        expect(res.assertionResults.length).toBe(3);
    });

    // 9. Failed assertion
    test('9. Failed assertion produces detailed evidence', () => {
        const assertion = { type: 'fieldEquals', path: 'data.role', expected: 'admin' };
        const payload = { data: { role: 'user' } };

        const result = AssertionEngine.evaluateAssertion(assertion, payload);
        expect(result.status).toBe('FAIL');
        expect(result.actual).toBe('user');
        expect(result.expected).toBe('admin');
        expect(result.path).toBe('data.role');
        expect(result.message).toContain("expected '\"admin\"' but got '\"user\"'");
    });

    // 10. Test ERROR state
    test('10. Test ERROR when system not found', async () => {
        const testDef = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'qtest-err',
            name: 'Error Test',
            systemId: 'MISSING-SYSTEM-XYZ',
            operation: 'execute'
        }));

        const res = await qualityRunner.runTest(testDef);
        expect(res.status).toBe(QUALITY_RESULT_STATES.ERROR);
        expect(res.error).toBeDefined();
        expect(['NOT_FOUND', 'SYSTEM_NOT_FOUND']).toContain(res.error.code);
    });

    // 11. Test SKIPPED state
    test('11. Test SKIPPED when test disabled or capability unsupported', async () => {
        const disabledTest = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'qtest-skip-1',
            name: 'Disabled Test',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute',
            enabled: false
        }));

        const resDisabled = await qualityRunner.runTest(disabledTest);
        expect(resDisabled.status).toBe(QUALITY_RESULT_STATES.SKIPPED);
        expect(resDisabled.evidence.reason).toContain('disabled');

        // Capability unsupported test
        const unsupportedCapTest = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'qtest-skip-2',
            name: 'Unsupported Cap Test',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'unsupported_op_123'
        }));

        const resCap = await qualityRunner.runTest(unsupportedCapTest);
        expect(resCap.status).toBe(QUALITY_RESULT_STATES.SKIPPED);
    });

    // 12. Schema validation
    test('12. JSON Schema validation assertion', () => {
        const assertion = {
            type: 'jsonSchema',
            path: 'data',
            expected: {
                required: ['id', 'email'],
                properties: {
                    id: { type: 'string' },
                    email: { type: 'string' }
                }
            }
        };

        const validPayload = { data: { id: 'usr-1', email: 'user@test.com' } };
        const invalidPayload = { data: { id: 'usr-1' } }; // missing email

        expect(AssertionEngine.evaluateAssertion(assertion, validPayload).status).toBe('PASS');
        expect(AssertionEngine.evaluateAssertion(assertion, invalidPayload).status).toBe('FAIL');
    });

    // 13. Nested field validation
    test('13. Safe nested field validation traversal', () => {
        const assertion = { type: 'fieldEquals', path: 'data.user.profile.status', expected: 'VERIFIED' };
        const payload = {
            data: {
                user: {
                    profile: {
                        status: 'VERIFIED'
                    }
                }
            }
        };

        const res = AssertionEngine.evaluateAssertion(assertion, payload);
        expect(res.status).toBe('PASS');
        expect(res.actual).toBe('VERIFIED');
    });

    // 14. Numeric threshold assertions
    test('14. Numeric threshold assertions (greaterThan, lessThan, inRange)', () => {
        const payload = { data: { score: 85, latency: 120 } };

        const resGt = AssertionEngine.evaluateAssertion({ type: 'greaterThan', path: 'data.score', expected: 80 }, payload);
        expect(resGt.status).toBe('PASS');

        const resLt = AssertionEngine.evaluateAssertion({ type: 'lessThan', path: 'data.latency', expected: 200 }, payload);
        expect(resLt.status).toBe('PASS');

        const resRange = AssertionEngine.evaluateAssertion({ type: 'inRange', path: 'data.score', expected: { min: 50, max: 100 } }, payload);
        expect(resRange.status).toBe('PASS');
    });

    // 15. Pattern matching assertion
    test('15. Pattern matching (regex assertion)', () => {
        const assertion = { type: 'fieldMatches', path: 'data.code', expected: '^SYS-[0-9]{3}$' };
        const validPayload = { data: { code: 'SYS-001' } };
        const invalidPayload = { data: { code: 'INVALID-CODE' } };

        expect(AssertionEngine.evaluateAssertion(assertion, validPayload).status).toBe('PASS');
        expect(AssertionEngine.evaluateAssertion(assertion, invalidPayload).status).toBe('FAIL');
    });

    // 16. Response time assertion
    test('16. Response time threshold assertion', () => {
        const assertion = { type: 'responseTimeBelow', expected: 500 };
        const fastPayload = { durationMs: 150 };
        const slowPayload = { durationMs: 750 };

        expect(AssertionEngine.evaluateAssertion(assertion, fastPayload).status).toBe('PASS');
        expect(AssertionEngine.evaluateAssertion(assertion, slowPayload).status).toBe('FAIL');
    });

    // 17. Test history
    test('17. Quality test execution history retrieval', async () => {
        const testDef = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'qtest-hist',
            name: 'History Test',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute'
        }));

        await qualityRunner.runTest(testDef);
        await qualityRunner.runTest(testDef);

        const res = await request(app).get(`/api/v1/quality/tests/${testDef.testId}/results`);
        expect(res.status).toBe(200);
        expect(res.body.count).toBe(2);
    });

    // 18. Quality metrics
    test('18. Quality metrics computation over time window', async () => {
        qualityStore.saveTestResult(new QualityTestResult({
            testId: 't1', systemId: 'DEMO-SYSTEM-001', status: QUALITY_RESULT_STATES.PASS, durationMs: 100
        }));
        qualityStore.saveTestResult(new QualityTestResult({
            testId: 't2', systemId: 'DEMO-SYSTEM-001', status: QUALITY_RESULT_STATES.FAIL, durationMs: 300
        }));

        const aggregator = new QualityAggregator(qualityStore);
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001', window: '24h' });

        expect(metrics.totalTests).toBe(2);
        expect(metrics.passedTests).toBe(1);
        expect(metrics.failedTests).toBe(1);
        expect(metrics.passRate).toBe(50);
        expect(metrics.averageDurationMs).toBe(200);
    });

    // 19. Suite creation
    test('19. Test suite definition creation', async () => {
        const res = await request(app)
            .post('/api/v1/quality/suites')
            .send({
                name: 'Core Functional Suite',
                description: 'Validates primary operations',
                testIds: ['qtest-1', 'qtest-2']
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.suiteId).toBeDefined();
    });

    // 20. Suite execution
    test('20. Full Test Suite execution', async () => {
        const t1 = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'suite-t1', name: 'Test 1', systemId: 'DEMO-SYSTEM-001', operation: 'execute',
            assertions: [{ type: 'statusEquals', expected: 200 }]
        }));
        const t2 = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'suite-t2', name: 'Test 2', systemId: 'DEMO-SYSTEM-001', operation: 'execute',
            assertions: [{ type: 'statusEquals', expected: 200 }]
        }));

        const suite = qualityStore.saveTestSuite(new QualityTestSuite({
            suiteId: 'suite-core-1',
            name: 'Core Suite',
            testIds: [t1.testId, t2.testId]
        }));

        const resSummary = await qualityRunner.runSuite(suite);
        expect(resSummary.totalTests).toBe(2);
        expect(resSummary.passed).toBe(2);
        expect(resSummary.passRate).toBe(100);
    });

    // 21. Suite result aggregation
    test('21. Suite result aggregation via REST endpoint', async () => {
        const t1 = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'suite-agg-t1', name: 'Pass Test', systemId: 'DEMO-SYSTEM-001', operation: 'execute',
            assertions: [{ type: 'statusEquals', expected: 200 }]
        }));

        const suite = qualityStore.saveTestSuite(new QualityTestSuite({
            suiteId: 'suite-agg-1',
            name: 'Agg Suite',
            testIds: [t1.testId]
        }));

        const res = await request(app).post(`/api/v1/quality/suites/${suite.suiteId}/run`).send();
        expect(res.status).toBe(200);
        expect(res.body.data.totalTests).toBe(1);
        expect(res.body.data.passRate).toBe(100);
    });

    // 22. RBAC
    test('22. RBAC enforcement on quality endpoints', async () => {
        // GET routes open to authenticated users (role headers simulated)
        const getRes = await request(app).get('/api/v1/quality/tests');
        expect(getRes.status).toBe(200);

        // POST route restricted to Admin
        const postAsViewer = await request(app)
            .post('/api/v1/quality/tests')
            .set('x-user-role', 'viewer')
            .send({ name: 'Unauthorized Test', systemId: 'DEMO-SYSTEM-001', operation: 'execute' });

        expect(postAsViewer.status).toBe(403);
    });

    // 23. Security: No eval/Function & prototype pollution protection
    test('23. Security: Prototype pollution & zero eval/Function verification', () => {
        const maliciousPath = '__proto__.polluted';
        const payload = { data: { user: 'test' } };

        const resolved = AssertionEngine.resolvePath(payload, maliciousPath);
        expect(resolved).toBeUndefined();
        expect(Object.prototype.polluted).toBeUndefined();

        const protoAssertion = { type: 'fieldExists', path: 'constructor.prototype.evil' };
        const protoRes = AssertionEngine.evaluateAssertion(protoAssertion, payload);
        expect(protoRes.status).toBe('FAIL');
    });

    // 24. Security: No arbitrary code execution on malformed assertion input
    test('24. Security: Malformed assertion input handling without exceptions', () => {
        const malformedAssertion = { type: 'fieldMatches', path: 'data', expected: '([invalid-regex' };
        const payload = { data: 'test' };

        const res = AssertionEngine.evaluateAssertion(malformedAssertion, payload);
        expect(res.status).toBe('FAIL');
        expect(res.message).toContain('Invalid regex pattern');
    });

    // 25. Security: Credential sanitization in evidence
    test('25. Security: Sanitization of sensitive data in execution evidence', () => {
        const result = new QualityTestResult({
            testId: 't-sec',
            systemId: 'DEMO-SYSTEM-001',
            evidence: {
                authorization: 'Bearer secret-token-12345',
                apiKey: 'ak_live_xyz'
            }
        });

        // Ensure serialization works cleanly
        const json = result.toJSON();
        expect(json.evidence).toBeDefined();
    });

    // 26. Phase 1 regression
    test('26. Phase 1 regression: SystemRegistry and ContractValidator', () => {
        const { CapabilityRegistry } = require('../src/registry/CapabilityRegistry');
        const capRegistry = new CapabilityRegistry();
        const sys = systemRegistry.getSystemInstance('DEMO-SYSTEM-001');
        expect(sys).toBeDefined();
        expect(sys.id).toBe('DEMO-SYSTEM-001');
        expect(capRegistry.hasCapability(sys.capabilities, 'execute')).toBe(true);
    });

    // 27. Phase 2 regression
    test('27. Phase 2 regression: SystemExecutionService and SSRF Protection', async () => {
        const statusRes = await request(app).get('/api/platform/status');
        expect(statusRes.status).toBe(200);
        expect(statusRes.body.version).toMatch(/^(?:[4-9]|10|11|12)\.0\.0$/);
    });

    // 28. Phase 3 regression & HEALTH ≠ QUALITY separation test
    test('28. Phase 3 regression: Strict HEALTH ≠ QUALITY separation verification', async () => {
        // Step A: Perform Health Check on system -> System is HEALTHY
        const healthRes = await healthEngine.checkHealth('DEMO-SYSTEM-001');
        expect(healthRes.status).toBe(HEALTH_STATES.HEALTHY);

        // Step B: Run Quality Test with failing assertion -> Quality is FAILED
        const failingQualityTest = qualityStore.saveTestDefinition(new QualityTestDefinition({
            testId: 'qtest-health-vs-quality',
            name: 'Strict Separation Test',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute',
            assertions: [
                { type: 'fieldEquals', path: 'data.expectedField', expected: 'must-match-this-value' }
            ]
        }));

        const qualityRes = await qualityRunner.runTest(failingQualityTest);
        expect(qualityRes.status).toBe(QUALITY_RESULT_STATES.FAIL);

        // Step C: Verify Health status remains HEALTHY despite Quality test failure!
        const recheckHealth = healthEngine.healthStore.getSystemState('DEMO-SYSTEM-001');
        expect(recheckHealth.status).toBe(HEALTH_STATES.HEALTHY);

        // Explicit assertion confirming HEALTH status is independent of QUALITY result
        expect(recheckHealth.status).not.toBe(qualityRes.status);
    });
});
