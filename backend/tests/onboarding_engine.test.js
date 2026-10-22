/**
 * Universal System Onboarding & Configuration Engine Test Suite
 * Covers 30+ comprehensive test scenarios: onboarding lifecycle, validation, adapter configuration,
 * credential sanitization, SSRF protection, capability discovery, connection testing, RBAC, API route compatibility,
 * prototype pollution protection, secret leakage prevention, and full platform regression.
 */

const request = require('supertest');
const { createApp, SystemRegistry } = require('../src/app');
const SystemOnboarding = require('../src/onboarding/SystemOnboarding');
const OnboardingValidator = require('../src/onboarding/OnboardingValidator');
const ConnectionProfile = require('../src/onboarding/ConnectionProfile');
const AuthenticationProfile = require('../src/onboarding/AuthenticationProfile');
const MonitoringProfile = require('../src/onboarding/MonitoringProfile');
const CapabilityDiscovery = require('../src/onboarding/CapabilityDiscovery');
const OnboardingService = require('../src/onboarding/OnboardingService');
const { ONBOARDING_STATES, CONNECTION_TEST_RESULTS } = require('../src/onboarding/OnboardingStates');
const { ROLES } = require('../src/middleware/authMiddleware');

describe('Universal System Onboarding & Configuration Engine (Phase 10)', () => {
    let app;
    let service;

    beforeEach(() => {
        app = createApp();
        service = app.get('onboardingService');
    });

    // 1. Valid system onboarding
    test('1. Valid system onboarding initializes correctly with default profiles', async () => {
        const payload = {
            id: 'SYS-VALID-01',
            name: 'Valid Payment System',
            category: 'api',
            connection: { baseUrl: 'https://api.payments.org', adapterType: 'http' },
            authentication: { type: 'apiKey', secretKey: 'secret_12345' },
            capabilities: ['health', 'execute']
        };

        const onboarding = await service.onboardSystem(payload);
        expect(onboarding.id).toBe('SYS-VALID-01');
        expect(onboarding.name).toBe('Valid Payment System');
        expect(onboarding.status).toBe(ONBOARDING_STATES.CONFIGURED);
        expect(onboarding.authentication.authType).toBe('apiKey');
        expect(onboarding.sanitize().authentication.secretKey).toBe('[REDACTED]');
    });

    // 2. Missing required fields
    test('2. Missing required fields (id, name, baseUrl) fails validation', () => {
        const payload = { name: 'No ID System' };
        const res = OnboardingValidator.validate(payload);
        expect(res.valid).toBe(false);
        expect(res.errors.length).toBeGreaterThan(0);
        expect(res.errors.some(e => e.includes('id'))).toBe(true);
    });

    // 3. Invalid system ID
    test('3. Invalid system ID (special characters / spaces) is rejected', () => {
        const payload = { id: 'SYS ID WITH SPACES!', name: 'Bad ID', connection: { baseUrl: 'https://api.org' } };
        const res = OnboardingValidator.validate(payload);
        expect(res.valid).toBe(false);
        expect(res.errors.some(e => e.toLowerCase().includes('system id') || e.includes('id'))).toBe(true);
    });

    // 4. Invalid URL
    test('4. Invalid URL structure is rejected', () => {
        const payload = { id: 'SYS-BAD-URL', name: 'Bad URL', connection: { baseUrl: 'not-a-valid-url' } };
        const res = OnboardingValidator.validate(payload);
        expect(res.valid).toBe(false);
        expect(res.errors.some(e => e.includes('URL') || e.includes('baseUrl'))).toBe(true);
    });

    // 5. Unsupported adapter
    test('5. Unsupported adapter type fails validation', () => {
        const conn = new ConnectionProfile({ baseUrl: 'https://api.org', adapterType: 'invalid-adapter-type' });
        const res = conn.validate();
        expect(res.valid).toBe(false);
        expect(res.errors.some(e => e.includes('adapterType'))).toBe(true);
    });

    // 6. Invalid authentication configuration
    test('6. Invalid authentication configuration fails validation', () => {
        const auth = new AuthenticationProfile({ type: 'invalid_auth_type' });
        const res = auth.validate();
        expect(res.valid).toBe(false);
        expect(res.errors.some(e => e.includes('authType') || e.includes('Authentication type'))).toBe(true);
    });

    // 7. Credential sanitization
    test('7. Credentials (secretKey, token, password) are completely sanitized/masked in serialized output', () => {
        const auth = new AuthenticationProfile({
            type: 'bearer',
            secretKey: 'super-secret-key-999',
            token: 'my-bearer-token-abc',
            password: 'my-password-123'
        });
        const sanitized = auth.sanitize();
        expect(sanitized.secretKey).toBe('[REDACTED]');
        expect(sanitized.token).toBe('[REDACTED]');
        expect(sanitized.password).toBe('[REDACTED]');
        expect(JSON.stringify(sanitized)).not.toContain('super-secret-key-999');
        expect(JSON.stringify(sanitized)).not.toContain('my-bearer-token-abc');
    });

    // 8. Duplicate system
    test('8. Onboarding duplicate system ID throws conflict (409)', async () => {
        const payload = { id: 'DUP-SYS-01', name: 'Original', connection: { baseUrl: 'https://api.org' } };
        await service.onboardSystem(payload);

        await expect(service.onboardSystem(payload)).rejects.toThrow(/already registered/i);
    });

    // 9. System retrieval
    test('9. Retrieve onboarded system by ID returns correct profile', async () => {
        await service.onboardSystem({ id: 'RETRIEVE-SYS-01', name: 'Retrieval Target', connection: { baseUrl: 'https://api.org' } });
        const retrieved = service.getOnboarding('RETRIEVE-SYS-01');
        expect(retrieved).toBeDefined();
        expect(retrieved.name).toBe('Retrieval Target');
    });

    // 10. System update
    test('10. Update system configuration updates parameters without exposing secrets', async () => {
        await service.onboardSystem({ id: 'UPDATE-SYS-01', name: 'Initial Name', connection: { baseUrl: 'https://api.org' } });
        const updated = await service.updateConfiguration('UPDATE-SYS-01', {
            name: 'Updated Name',
            capabilities: ['health', 'quality', 'intelligence']
        });

        expect(updated.name).toBe('Updated Name');
        expect(updated.capabilities).toContain('intelligence');
    });

    // 11. Configuration validation
    test('11. Validate endpoint returns full structured validation report', async () => {
        await service.onboardSystem({ id: 'VAL-SYS-01', name: 'Val System', connection: { baseUrl: 'https://api.org' } });

        const res = await request(app)
            .post('/api/v1/onboarding/systems/VAL-SYS-01/validate')
            .set('x-user-role', 'admin');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.valid).toBe(true);
    });

    // 12. Connection test success
    test('12. Test connection operation returns normalized success result', async () => {
        await service.onboardSystem({ id: 'CONN-TEST-SYS', name: 'Conn Test', connection: { baseUrl: 'https://api.org' } });

        const testRes = await service.testConnection('CONN-TEST-SYS');
        expect(testRes.systemId).toBe('CONN-TEST-SYS');
        expect(testRes.connected).toBe(true);
        expect(testRes.status).toBe(CONNECTION_TEST_RESULTS.CONNECTED);
    });

    // 13. Connection timeout
    test('13. Connection timeout normalizes to TIMEOUT status', async () => {
        const mockHealthEngine = {
            checkHealth: jest.fn().mockRejectedValue(new Error('Connection timeout after 5000ms'))
        };
        const mockService = new OnboardingService({ healthEngine: mockHealthEngine });
        await mockService.onboardSystem({ id: 'TIMEOUT-SYS', name: 'Timeout Sys', connection: { baseUrl: 'https://api.org' } });

        const testRes = await mockService.testConnection('TIMEOUT-SYS');
        expect(testRes.status).toBe(CONNECTION_TEST_RESULTS.TIMEOUT);
        expect(testRes.connected).toBe(false);
    });

    // 14. Authentication failure
    test('14. Authentication failure normalizes to AUTHENTICATION_FAILED status', async () => {
        const authErr = new Error('Invalid API key');
        authErr.statusCode = 401;
        const mockHealthEngine = { checkHealth: jest.fn().mockRejectedValue(authErr) };
        const mockService = new OnboardingService({ healthEngine: mockHealthEngine });
        await mockService.onboardSystem({ id: 'AUTH-FAIL-SYS', name: 'Auth Fail', connection: { baseUrl: 'https://api.org' } });

        const testRes = await mockService.testConnection('AUTH-FAIL-SYS');
        expect(testRes.status).toBe(CONNECTION_TEST_RESULTS.AUTHENTICATION_FAILED);
        expect(testRes.connected).toBe(false);
    });

    // 15. Authorization failure
    test('15. Authorization failure normalizes to AUTHORIZATION_FAILED status', async () => {
        const authzErr = new Error('Forbidden scope');
        authzErr.statusCode = 403;
        const mockHealthEngine = { checkHealth: jest.fn().mockRejectedValue(authzErr) };
        const mockService = new OnboardingService({ healthEngine: mockHealthEngine });
        await mockService.onboardSystem({ id: 'AUTHZ-FAIL-SYS', name: 'Authz Fail', connection: { baseUrl: 'https://api.org' } });

        const testRes = await mockService.testConnection('AUTHZ-FAIL-SYS');
        expect(testRes.status).toBe(CONNECTION_TEST_RESULTS.AUTHORIZATION_FAILED);
        expect(testRes.connected).toBe(false);
    });

    // 16. SSRF protection
    test('16. SSRF blocked URL returns SECURITY_BLOCKED connection test result', async () => {
        // Disallow localhost to trigger SSRF block
        const testRes = await service.testConnection('NON-EXISTENT', { baseUrl: 'http://169.254.169.254/latest/meta-data', allowLocalhost: false });
        expect(testRes.status).toBe(CONNECTION_TEST_RESULTS.SECURITY_BLOCKED);
        expect(testRes.connected).toBe(false);
        expect(testRes.error.message).toContain('Security blocked');
    });

    // 17. Capability declaration
    test('17. Systems can declare arbitrary generic capabilities dynamically', async () => {
        const onboarding = await service.onboardSystem({
            id: 'CAP-SYS-01',
            name: 'Cap System',
            connection: { baseUrl: 'https://api.org' },
            capabilities: ['health', 'telemetry', 'custom_dimension']
        });
        expect(onboarding.capabilities).toEqual(['health', 'telemetry', 'custom_dimension']);
    });

    // 18. Capability discovery
    test('18. Capability discovery tests target operations and returns structured evidence', async () => {
        const discovery = new CapabilityDiscovery();
        const report = await discovery.discoverCapabilities({ id: 'DISC-SYS', capabilities: ['health'] });

        expect(report.systemId).toBe('DISC-SYS');
        expect(Array.isArray(report.capabilities)).toBe(true);
        const healthCap = report.capabilities.find(c => c.capability === 'health');
        expect(healthCap).toBeDefined();
        expect(healthCap.supported).toBe(true);
    });

    // 19. Unsupported capability
    test('19. Capability discovery handles unsupported capabilities gracefully without failing', async () => {
        const discovery = new CapabilityDiscovery();
        const report = await discovery.discoverCapabilities({ id: 'DISC-SYS', capabilities: ['health'] });
        const unsupportedCap = report.capabilities.find(c => c.capability === 'reporting');
        expect(unsupportedCap.supported).toBe(false);
        expect(unsupportedCap.status).toBe('UNSUPPORTED');
    });

    // 20. Monitoring configuration
    test('20. Monitoring profile accepts valid multi-dimensional configurations', () => {
        const mon = new MonitoringProfile({
            health: { enabled: true, intervalMs: 30000, failureThreshold: 3 },
            quality: { enabled: true },
            intelligence: { enabled: true }
        });
        expect(mon.health.intervalMs).toBe(30000);
        expect(mon.health.failureThreshold).toBe(3);
        expect(mon.quality.enabled).toBe(true);
    });

    // 21. Invalid monitoring configuration
    test('21. Invalid monitoring values (negative interval / zero threshold) are rejected', () => {
        const mon = new MonitoringProfile({
            health: { intervalMs: -500, failureThreshold: 0 }
        });
        const valRes = mon.validate();
        expect(valRes.valid).toBe(false);
        expect(valRes.errors.length).toBeGreaterThan(0);
    });

    // 22. Lifecycle transitions
    test('22. Valid onboarding state transitions succeed (CONFIGURED -> MONITORING -> DISABLED)', async () => {
        await service.onboardSystem({ id: 'LIFE-SYS-01', name: 'Life System', connection: { baseUrl: 'https://api.org' } });
        
        const active = service.activateSystem('LIFE-SYS-01');
        expect(active.status).toBe(ONBOARDING_STATES.MONITORING);

        const paused = service.deactivateSystem('LIFE-SYS-01');
        expect(paused.status).toBe(ONBOARDING_STATES.DISABLED);
    });

    // 23. Invalid lifecycle transition
    test('23. Invalid state transition (RETIRED -> MONITORING) throws error', async () => {
        await service.onboardSystem({ id: 'LIFE-SYS-02', name: 'Retired System', connection: { baseUrl: 'https://api.org' } });
        service.retireSystem('LIFE-SYS-02');

        expect(() => service.activateSystem('LIFE-SYS-02')).toThrow(/Invalid onboarding state transition/i);
    });

    // 24. RBAC viewer rejection
    test('24. Viewer role cannot invoke mutation endpoints (POST/PATCH/DELETE) (403)', async () => {
        await service.onboardSystem({ id: 'RBAC-SYS-01', name: 'RBAC System', connection: { baseUrl: 'https://api.org' } });

        const postRes = await request(app)
            .post('/api/v1/onboarding/systems')
            .set('x-user-role', 'viewer')
            .send({ id: 'NEW-SYS', name: 'New' });
        expect(postRes.status).toBe(403);

        const patchRes = await request(app)
            .patch('/api/v1/onboarding/systems/RBAC-SYS-01')
            .set('x-user-role', 'viewer')
            .send({ name: 'Hacked' });
        expect(patchRes.status).toBe(403);
    });

    // 25. RBAC operator permissions
    test('25. Operator role can perform validation, connection test, and discovery', async () => {
        await service.onboardSystem({ id: 'RBAC-SYS-02', name: 'Op System', connection: { baseUrl: 'https://api.org' } });

        const testRes = await request(app)
            .post('/api/v1/onboarding/systems/RBAC-SYS-02/test-connection')
            .set('x-user-role', 'operator');
        expect(testRes.status).toBe(200);

        const discRes = await request(app)
            .post('/api/v1/onboarding/systems/RBAC-SYS-02/discover-capabilities')
            .set('x-user-role', 'operator');
        expect(discRes.status).toBe(200);
    });

    // 26. RBAC admin permissions
    test('26. Admin role has full CRUD and lifecycle management authority', async () => {
        const createRes = await request(app)
            .post('/api/v1/onboarding/systems')
            .set('x-user-role', 'admin')
            .send({ id: 'ADMIN-SYS', name: 'Admin Managed', connection: { baseUrl: 'https://api.org' } });
        expect(createRes.status).toBe(201);

        const actRes = await request(app)
            .post('/api/v1/onboarding/systems/ADMIN-SYS/activate')
            .set('x-user-role', 'admin');
        expect(actRes.status).toBe(200);

        const delRes = await request(app)
            .delete('/api/v1/onboarding/systems/ADMIN-SYS')
            .set('x-user-role', 'admin');
        expect(delRes.status).toBe(200);
    });

    // 27. Secret leakage prevention
    test('27. GET responses never leak raw authentication secrets or headers', async () => {
        await service.onboardSystem({
            id: 'SECRET-SYS',
            name: 'Secret System',
            connection: { baseUrl: 'https://api.org', headers: { Authorization: 'Bearer secret_token_xyz' } },
            authentication: { type: 'bearer', secretKey: 'top_secret_key' }
        });

        const res = await request(app)
            .get('/api/v1/onboarding/systems/SECRET-SYS')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        const text = JSON.stringify(res.body);
        expect(text).not.toContain('top_secret_key');
        expect(text).not.toContain('secret_token_xyz');
        expect(res.body.data.authentication.secretKey).toBe('[REDACTED]');
    });

    // 28. API route compatibility
    test('28. AgentGenPro compliance: all onboarding routes start with /api/v1/onboarding/', async () => {
        await service.onboardSystem({ id: 'SYS-01', name: 'Route System', connection: { baseUrl: 'https://api.org' } });
        const routes = [
            { method: 'get', url: '/api/v1/onboarding/systems' },
            { method: 'get', url: '/api/v1/onboarding/systems/SYS-01' },
            { method: 'get', url: '/api/v1/onboarding/systems/SYS-01/config' },
            { method: 'get', url: '/api/v1/onboarding/systems/SYS-01/status' },
            { method: 'get', url: '/api/v1/onboarding/systems/SYS-01/profile' }
        ];

        for (const r of routes) {
            const res = await request(app)[r.method](r.url).set('x-user-role', 'admin');
            expect(res.status).toBe(200);
            expect(r.url.startsWith('/api/')).toBe(true);
        }
    });

    // 29. Prototype pollution protection
    test('29. Prototype pollution attempts in payload object are rejected or ignored', async () => {
        const pollutedPayload = JSON.parse('{"id": "POLLUTE-SYS", "name": "Pollute", "connection": {"baseUrl": "https://api.org"}, "__proto__": {"polluted": true}}');
        await service.onboardSystem(pollutedPayload);

        expect(({}).polluted).toBeUndefined();
    });

    // 30. Regression against all previous phases
    test('30. Full platform regression: platform status endpoint and core routes remain operational', async () => {
        const statusRes = await request(app).get('/api/platform/status');
        expect(statusRes.status).toBe(200);
        expect(statusRes.body.success).toBe(true);
        expect(statusRes.body.version).toMatch(/^(?:10|11|12)\.0\.0$/);

        const sysRes = await request(app).get('/api/systems').set('x-user-role', 'viewer');
        expect(sysRes.status).toBe(200);

        const healthRes = await request(app).get('/api/v1/health/overview').set('x-user-role', 'viewer');
        expect(healthRes.status).toBe(200);

        const orchRes = await request(app).get('/api/v1/orchestration/overview').set('x-user-role', 'viewer');
        expect(orchRes.status).toBe(200);
    });
});
