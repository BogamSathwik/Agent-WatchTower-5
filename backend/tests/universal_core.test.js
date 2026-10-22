const request = require('supertest');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');

describe('Phase 1 — Universal Platform Core Test Suite', () => {
    let registry;
    let app;

    beforeEach(() => {
        registry = new SystemRegistry();
        app = createApp(registry);
    });

    // 1. Valid system registration
    test('1. Valid system registration', async () => {
        const payload = {
            id: 'DEMO-SYSTEM-001',
            name: 'Demo External System',
            version: '1.0.0',
            contractVersion: '1.0.0',
            description: 'Neutral demo system for platform testing',
            category: 'service',
            capabilities: ['health', 'execute', 'telemetry'],
            adapter: {
                adapterType: 'http',
                adapterId: 'demo-http-adapter',
                endpoint: 'https://api.demo-system.example/v1'
            }
        };

        const res = await request(app)
            .post('/api/v1/systems/register')
            .send(payload);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe('DEMO-SYSTEM-001');
        expect(res.body.data.lifecycleState).toBe('REGISTERED');
        expect(res.body.data.capabilities.length).toBe(3);
    });

    // 2. Invalid system registration
    test('2. Invalid system registration (non-object payload)', async () => {
        const res = await request(app)
            .post('/api/v1/systems/register')
            .send('Invalid string payload')
            .set('Content-Type', 'application/json');

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    // 3. Missing required field
    test('3. Missing required field (missing name)', async () => {
        const payload = {
            id: 'TEST-SYSTEM-002',
            version: '1.0.0'
            // Missing 'name'
        };

        const res = await request(app)
            .post('/api/v1/systems/register')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors.some(e => e.field === 'name')).toBe(true);
    });

    // 4. Invalid ID format
    test('4. Invalid ID format', async () => {
        const payload = {
            id: 'INVALID ID WITH SPACES!@#$',
            name: 'Test App',
            version: '1.0.0'
        };

        const res = await request(app)
            .post('/api/v1/systems/register')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors.some(e => e.field === 'id')).toBe(true);
    });

    // 5. Invalid version format
    test('5. Invalid version format', async () => {
        const payload = {
            id: 'TEST-SYSTEM-003',
            name: 'Test App',
            version: 'v1.0-invalid-semver'
        };

        const res = await request(app)
            .post('/api/v1/systems/register')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors.some(e => e.field === 'version')).toBe(true);
    });

    // 6. Invalid capability structure
    test('6. Invalid capability structure', async () => {
        const payload = {
            id: 'TEST-SYSTEM-004',
            name: 'Test App',
            version: '1.0.0',
            capabilities: 12345 // Number instead of Array/Object
        };

        const res = await request(app)
            .post('/api/v1/systems/register')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors.some(e => e.field === 'capabilities')).toBe(true);
    });

    // 7. Duplicate registration
    test('7. Duplicate registration', async () => {
        const payload = {
            id: 'DEMO-SYSTEM-001',
            name: 'Demo External System',
            version: '1.0.0'
        };

        await request(app).post('/api/v1/systems/register').send(payload);

        const res = await request(app).post('/api/v1/systems/register').send(payload);

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('REGISTRATION_ERROR');
    });

    // 8. System retrieval
    test('8. System retrieval by ID', async () => {
        registry.registerSystem({
            id: 'SYSTEM-GET-01',
            name: 'Retrieval System',
            version: '1.0.0'
        });

        const res = await request(app).get('/api/v1/systems/SYSTEM-GET-01');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe('SYSTEM-GET-01');
    });

    // 9. System listing
    test('9. System listing with search/filter', async () => {
        registry.registerSystem({ id: 'SYS-01', name: 'Alpha Service', version: '1.0.0', category: 'microservice' });
        registry.registerSystem({ id: 'SYS-02', name: 'Beta Web App', version: '1.0.0', category: 'web-app' });

        const resAll = await request(app).get('/api/v1/systems');
        expect(resAll.status).toBe(200);
        expect(resAll.body.count).toBe(2);

        const resFiltered = await request(app).get('/api/v1/systems?category=web-app');
        expect(resFiltered.body.count).toBe(1);
        expect(resFiltered.body.data[0].id).toBe('SYS-02');
    });

    // 10. System update
    test('10. System update via PATCH', async () => {
        registry.registerSystem({ id: 'SYS-UPDATE', name: 'Original Name', version: '1.0.0' });

        const res = await request(app)
            .patch('/api/v1/systems/SYS-UPDATE')
            .send({ name: 'Updated System Name', version: '1.1.0' });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Updated System Name');
        expect(res.body.data.version).toBe('1.1.0');
    });

    // 11. System activation
    test('11. System activation', async () => {
        registry.registerSystem({ id: 'SYS-ACTIVATE', name: 'App', version: '1.0.0' });

        const res = await request(app).post('/api/v1/systems/SYS-ACTIVATE/activate');

        expect(res.status).toBe(200);
        expect(res.body.data.lifecycleState).toBe('ACTIVE');
    });

    // 12. System deactivation
    test('12. System deactivation', async () => {
        registry.registerSystem({ id: 'SYS-DEACTIVATE', name: 'App', version: '1.0.0' });
        registry.activateSystem('SYS-DEACTIVATE');

        const res = await request(app).post('/api/v1/systems/SYS-DEACTIVATE/deactivate');

        expect(res.status).toBe(200);
        expect(res.body.data.lifecycleState).toBe('INACTIVE');
    });

    // 13. System retirement
    test('13. System retirement', async () => {
        registry.registerSystem({ id: 'SYS-RETIRE', name: 'App', version: '1.0.0' });

        const res = await request(app).post('/api/v1/systems/SYS-RETIRE/retire');

        expect(res.status).toBe(200);
        expect(res.body.data.lifecycleState).toBe('RETIRED');
    });

    // 14. Capability lookup
    test('14. Capability lookup', async () => {
        registry.registerSystem({
            id: 'SYS-CAP',
            name: 'Capable System',
            version: '1.0.0',
            capabilities: ['health', 'telemetry']
        });

        const res = await request(app).get('/api/v1/systems/SYS-CAP/capabilities');

        expect(res.status).toBe(200);
        expect(res.body.data.capabilities.some(c => c.type === 'health')).toBe(true);
        expect(registry.hasCapability('SYS-CAP', 'health')).toBe(true);
        expect(registry.hasCapability('SYS-CAP', 'execute')).toBe(false);
    });

    // 15. Unknown system retrieval
    test('15. Unknown system retrieval returns 404', async () => {
        const res = await request(app).get('/api/v1/systems/NON-EXISTENT-ID');

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('SYSTEM_NOT_FOUND');
    });

    // 16. Unauthorized operation
    test('16. Unauthorized operation (RBAC role rejection)', async () => {
        registry.registerSystem({ id: 'SYS-RBAC', name: 'Protected System', version: '1.0.0' });

        // Viewer role trying to retire a system (admin role required)
        const res = await request(app)
            .post('/api/v1/systems/SYS-RBAC/retire')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('FORBIDDEN');
    });

    // 17. Prototype pollution attempt
    test('17. Prototype pollution attempt rejected', async () => {
        const rawPollutedBody = '{"id":"SYS-POLLUTE","name":"Test","version":"1.0.0","__proto__":{"admin":true}}';

        const res = await request(app)
            .post('/api/v1/systems/register')
            .set('Content-Type', 'application/json')
            .send(rawPollutedBody);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors.some(e => e.code === 'SECURITY_VIOLATION')).toBe(true);
    });

    // 18. Invalid adapter metadata
    test('18. Invalid adapter metadata rejected', async () => {
        const payload = {
            id: 'SYS-ADAPTER-ERR',
            name: 'Test System',
            version: '1.0.0',
            adapter: 'invalid-string-instead-of-object'
        };

        const res = await request(app)
            .post('/api/v1/systems/register')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.errors.some(e => e.field === 'adapter')).toBe(true);
    });

    // 19. Malformed JSON request
    test('19. Malformed JSON request body', async () => {
        const res = await request(app)
            .post('/api/v1/systems/register')
            .set('Content-Type', 'application/json')
            .send('{ id: malformed json without quotes }');

        expect(res.status).toBe(400);
    });

    // 20. API error handling (invalid lifecycle transition)
    test('20. API error handling for invalid lifecycle transition', async () => {
        registry.registerSystem({ id: 'SYS-LIFECYCLE-ERR', name: 'Test', version: '1.0.0' });
        registry.retireSystem('SYS-LIFECYCLE-ERR');

        // Retired is terminal, trying to activate should fail
        const res = await request(app).post('/api/v1/systems/SYS-LIFECYCLE-ERR/activate');

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('LIFECYCLE_ERROR');
    });
});
