const request = require('supertest');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { AdapterRegistry } = require('../src/adapter/AdapterRegistry');
const { AdapterFactory } = require('../src/adapter/AdapterFactory');
const { SystemExecutionService } = require('../src/service/SystemExecutionService');
const { BaseAdapter } = require('../src/adapter/BaseAdapter');
const { HttpAdapter } = require('../src/adapter/HttpAdapter');
const { MockAdapter } = require('../src/adapter/MockAdapter');
const { SsrfProtector } = require('../src/adapter/SsrfProtector');
const { ErrorNormalizer } = require('../src/adapter/ErrorNormalizer');
const { ResponseNormalizer } = require('../src/adapter/ResponseNormalizer');
const { ConnectionManager } = require('../src/adapter/ConnectionManager');

describe('Phase 2 — Universal Adapter & Connectivity Framework Test Suite', () => {
    let systemRegistry;
    let adapterRegistry;
    let adapterFactory;
    let executionService;
    let app;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        adapterRegistry = new AdapterRegistry();
        adapterFactory = new AdapterFactory(adapterRegistry);
        executionService = new SystemExecutionService({
            systemRegistry,
            adapterRegistry,
            adapterFactory,
            allowLocalhost: true
        });
        app = createApp({
            systemRegistry,
            adapterRegistry,
            executionService
        });
    });

    // 1. Adapter registration
    test('1. Adapter registration in AdapterRegistry', () => {
        class CustomTestDriver extends BaseAdapter {}
        adapterRegistry.registerAdapter('custom-driver', CustomTestDriver);
        expect(adapterRegistry.hasAdapter('custom-driver')).toBe(true);
    });

    // 2. Adapter lookup
    test('2. Adapter lookup in AdapterRegistry', () => {
        const HttpClass = adapterRegistry.getAdapter('http');
        expect(HttpClass).toBe(HttpAdapter);
    });

    // 3. Adapter factory
    test('3. Adapter factory creates concrete adapter', () => {
        const adapter = adapterFactory.createAdapter({
            adapterType: 'mock',
            adapterId: 'factory-mock'
        });
        expect(adapter).toBeInstanceOf(MockAdapter);
        expect(adapter.adapterId).toBe('factory-mock');
    });

    // 4. HTTP adapter creation
    test('4. HTTP adapter creation via factory', () => {
        const adapter = adapterFactory.createAdapter({
            adapterType: 'http',
            connectionConfigRef: 'https://api.demo-system.example'
        });
        expect(adapter).toBeInstanceOf(HttpAdapter);
        expect(adapter.endpoint).toBe('https://api.demo-system.example');
    });

    // 5. Connection success
    test('5. Connection success', async () => {
        systemRegistry.registerSystem({
            id: 'DEMO-SYSTEM-001',
            name: 'Demo System',
            version: '1.0.0',
            capabilities: ['health', 'execute'],
            adapter: { adapterType: 'mock', adapterId: 'mock-1' }
        });

        const res = await request(app).post('/api/v1/systems/DEMO-SYSTEM-001/connect');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.operation).toBe('connect');
    });

    // 6. Connection failure
    test('6. Connection failure handling', async () => {
        class FailingConnectAdapter extends BaseAdapter {
            async connect() {
                return { success: false, status: 500, error: { code: 'CONNECT_FAILED', message: 'Connection refused' } };
            }
        }
        adapterRegistry.registerAdapter('failing-driver', FailingConnectAdapter);

        systemRegistry.registerSystem({
            id: 'FAIL-CONN-001',
            name: 'Failing System',
            version: '1.0.0',
            adapter: { adapterType: 'failing-driver' }
        });

        const res = await request(app).post('/api/v1/systems/FAIL-CONN-001/connect');
        expect(res.body.success).toBe(false);
    });

    // 7. Timeout handling
    test('7. Timeout handling', async () => {
        systemRegistry.registerSystem({
            id: 'TIMEOUT-SYS-001',
            name: 'Timeout System',
            version: '1.0.0',
            capabilities: ['execute'],
            adapter: { adapterType: 'mock' }
        });

        const res = await request(app)
            .post('/api/v1/systems/TIMEOUT-SYS-001/execute')
            .send({
                operation: 'execute',
                payload: { simulateTimeout: true }
            });

        expect(res.status).toBe(504);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('TIMEOUT');
        expect(res.body.error.retryable).toBe(true);
    });

    // 8. Authentication failure
    test('8. Authentication failure mapping', () => {
        const norm = ErrorNormalizer.normalize({ status: 401 });
        expect(norm.code).toBe('AUTH_FAILURE');
        expect(norm.category).toBe('AUTH');
        expect(norm.retryable).toBe(false);
    });

    // 9. Authorization failure mapping
    test('9. Authorization failure mapping', () => {
        const norm = ErrorNormalizer.normalize({ status: 403 });
        expect(norm.code).toBe('FORBIDDEN');
        expect(norm.category).toBe('AUTH');
        expect(norm.retryable).toBe(false);
    });

    // 10. GET request via Mock/Http Adapter
    test('10. GET request execution', async () => {
        systemRegistry.registerSystem({
            id: 'GET-SYS-001',
            name: 'Get System',
            version: '1.0.0',
            capabilities: ['health'],
            adapter: { adapterType: 'mock' }
        });

        const res = await request(app)
            .post('/api/v1/systems/GET-SYS-001/execute')
            .send({ operation: 'health' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.operation).toBe('health');
    });

    // 11. POST request execution
    test('11. POST request execution', async () => {
        systemRegistry.registerSystem({
            id: 'POST-SYS-001',
            name: 'Post System',
            version: '1.0.0',
            capabilities: ['execute'],
            adapter: { adapterType: 'mock' }
        });

        const res = await request(app)
            .post('/api/v1/systems/POST-SYS-001/execute')
            .send({
                operation: 'execute',
                payload: { mockData: { result: 'ok' } }
            });

        expect(res.status).toBe(200);
        expect(res.body.data.result).toBe('ok');
    });

    // 12. Invalid request error
    test('12. Invalid request (400) error normalization', () => {
        const norm = ErrorNormalizer.normalize({ status: 400 });
        expect(norm.code).toBe('HTTP_CLIENT_ERROR');
        expect(norm.retryable).toBe(false);
    });

    // 13. Retryable error classification
    test('13. Retryable error classification', () => {
        const norm502 = ErrorNormalizer.normalize({ code: 'ENOTFOUND' });
        expect(norm502.retryable).toBe(true);
        expect(norm502.code).toBe('DNS_FAILURE');
    });

    // 14. Non-retryable error classification
    test('14. Non-retryable error classification', () => {
        const norm404 = ErrorNormalizer.normalize({ status: 404 });
        expect(norm404.retryable).toBe(false);
        expect(norm404.code).toBe('NOT_FOUND');
    });

    // 15. Unsupported operation
    test('15. Unsupported operation rejection', async () => {
        systemRegistry.registerSystem({
            id: 'UNSUPPORTED-OPS-001',
            name: 'Limited System',
            version: '1.0.0',
            capabilities: ['telemetry'], // System supports telemetry capability, but adapter does not support 'telemetry' operation
            adapter: {
                adapterType: 'http',
                supportedOperations: ['health'] // Only supports health!
            }
        });

        const res = await request(app)
            .post('/api/v1/systems/UNSUPPORTED-OPS-001/execute')
            .send({ operation: 'telemetry' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('UNSUPPORTED_OPERATION');
    });

    // 16. Capability mismatch
    test('16. Capability mismatch rejection', async () => {
        systemRegistry.registerSystem({
            id: 'NO-EXEC-SYS',
            name: 'Health Only System',
            version: '1.0.0',
            capabilities: ['health'], // Only has health capability!
            adapter: { adapterType: 'mock' }
        });

        const res = await request(app)
            .post('/api/v1/systems/NO-EXEC-SYS/execute')
            .send({ operation: 'execute' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('CAPABILITY_MISMATCH');
    });

    // 17. Response normalization schema verification
    test('17. Response normalization schema', () => {
        const norm = ResponseNormalizer.normalize({
            success: true,
            status: 200,
            data: { test: 123 }
        }, {
            systemId: 'SYS-01',
            adapterId: 'ad-01',
            operation: 'health'
        });

        expect(norm.systemId).toBe('SYS-01');
        expect(norm.adapterId).toBe('ad-01');
        expect(norm.operation).toBe('health');
        expect(norm.success).toBe(true);
        expect(norm.evidence).toBeDefined();
        expect(norm.timestamp).toBeDefined();
    });

    // 18. Error normalization schema verification
    test('18. Error normalization schema', () => {
        const err = ErrorNormalizer.normalize(new Error('Connection failed'));
        expect(err.code).toBe('ADAPTER_ERROR');
        expect(err.category).toBe('ADAPTER');
        expect(err.message).toBe('Connection failed');
    });

    // 19. Credential sanitization
    test('19. Credential sanitization in headers', () => {
        const rawHeaders = {
            'Authorization': 'Bearer secret-token-123',
            'X-API-Key': 'secret-key-xyz',
            'Content-Type': 'application/json'
        };
        const sanitized = ConnectionManager.sanitizeHeaders(rawHeaders);
        expect(sanitized['Authorization']).toBe('[REDACTED]');
        expect(sanitized['X-API-Key']).toBe('[REDACTED]');
        expect(sanitized['Content-Type']).toBe('application/json');
    });

    // 20. SSRF protection
    test('20. SSRF protection blocks private IP and metadata endpoints', () => {
        const checkLocalhost = SsrfProtector.validateUrl('http://127.0.0.1/admin', { allowLocalhost: false });
        expect(checkLocalhost.safe).toBe(false);

        const checkMetadata = SsrfProtector.validateUrl('http://169.254.169.254/latest/meta-data', { allowLocalhost: false });
        expect(checkMetadata.safe).toBe(false);

        const checkPrivate = SsrfProtector.validateUrl('http://192.168.1.1/router', { allowLocalhost: false });
        expect(checkPrivate.safe).toBe(false);

        const checkPublic = SsrfProtector.validateUrl('https://api.example.com/health', { allowLocalhost: false });
        expect(checkPublic.safe).toBe(true);
    });

    // 21. Unknown adapter type
    test('21. Unknown adapter type rejected', () => {
        expect(() => {
            adapterFactory.createAdapter({ adapterType: 'non-existent-adapter' });
        }).toThrow();
    });

    // 22. Unknown system execution
    test('22. Unknown system execution returns 404', async () => {
        const res = await request(app)
            .post('/api/v1/systems/NON-EXISTENT-SYS/execute')
            .send({ operation: 'execute' });

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
    });

    // 23. Execute permission rejection (RBAC)
    test('23. Execute permission rejection for viewer role', async () => {
        systemRegistry.registerSystem({
            id: 'RBAC-SYS-01',
            name: 'RBAC System',
            version: '1.0.0',
            capabilities: ['execute'],
            adapter: { adapterType: 'mock' }
        });

        const res = await request(app)
            .post('/api/v1/systems/RBAC-SYS-01/execute')
            .set('x-user-role', 'viewer')
            .send({ operation: 'execute' });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    // 24. Successful generic execution
    test('24. Successful generic execution end-to-end', async () => {
        systemRegistry.registerSystem({
            id: 'DEMO-SYSTEM-001',
            name: 'Neutral Demo Processing Unit',
            version: '1.0.0',
            capabilities: ['health', 'execute', 'telemetry'],
            adapter: {
                adapterType: 'mock',
                adapterId: 'demo-mock-adapter'
            }
        });

        const res = await request(app)
            .post('/api/v1/systems/DEMO-SYSTEM-001/execute')
            .set('x-user-role', 'operator')
            .send({
                operation: 'execute',
                payload: {
                    mockData: { status: 'processed', count: 42 }
                }
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.systemId).toBe('DEMO-SYSTEM-001');
        expect(res.body.data.status).toBe('processed');
        expect(res.body.data.count).toBe(42);
        expect(res.body.evidence).toBeDefined();
    });
});
