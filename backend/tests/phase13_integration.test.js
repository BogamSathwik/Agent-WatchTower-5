const request = require('supertest');
const { createApp } = require('../src/app');

describe('Phase 13 — Full UI ↔ Backend Functional Integration Suite', () => {
    let app;

    beforeEach(() => {
        app = createApp();
    });

    test('1. GET /api/platform/status returns operational status and version', async () => {
        const res = await request(app)
            .get('/api/platform/status')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('operational');
        expect(res.body.version).toBe('12.0.0');
        expect(typeof res.body.registeredSystemsCount).toBe('number');
        expect(typeof res.body.registeredAdaptersCount).toBe('number');
    });

    test('2. Agent Registry API validates contract fields and handles registration workflow', async () => {
        // Invalid spec missing name and category
        const invalidRes = await request(app)
            .post('/api/v1/agents/register')
            .send({ id: 'invalid-agent' })
            .expect(400);

        expect(invalidRes.body.success).toBe(false);
        expect(invalidRes.body.error).toBeDefined();

        // Valid registration
        const validContract = {
            id: 'agent-phase13-test-1',
            name: 'Phase 13 Autonomous Worker',
            category: 'automation',
            version: '1.0.0',
            contractVersion: '1.0.0',
            capabilities: [
                { id: 'execute', name: 'Task Executor', operations: ['execute'] }
            ],
            runner: {
                type: 'http',
                endpoint: 'http://localhost:9090/agent',
                method: 'POST'
            }
        };

        const regRes = await request(app)
            .post('/api/v1/agents/register')
            .send(validContract)
            .expect(201);

        expect(regRes.body.success).toBe(true);
        expect(regRes.body.data.id).toBe('agent-phase13-test-1');

        // Fetch agents list
        const listRes = await request(app)
            .get('/api/v1/agents')
            .expect(200);

        expect(listRes.body.success).toBe(true);
        expect(Array.isArray(listRes.body.data)).toBe(true);
        expect(listRes.body.data.some(a => a.id === 'agent-phase13-test-1')).toBe(true);

        // Check health
        const healthRes = await request(app)
            .post('/api/v1/agents/agent-phase13-test-1/health')
            .expect(200);

        expect(healthRes.body.success).toBe(true);

        // Retire agent
        const retireRes = await request(app)
            .post('/api/v1/agents/agent-phase13-test-1/retire')
            .expect(200);

        expect(retireRes.body.success).toBe(true);
        expect(retireRes.body.data.lifecycleState).toBe('RETIRED');
    });

    test('3. System Onboarding API workflow executes test-connection, discover-capabilities, and profile', async () => {
        const payload = {
            id: 'sys-phase13-test-1',
            name: 'Phase 13 Test System',
            category: 'service',
            connection: {
                baseUrl: 'http://localhost:8080/api',
                adapterType: 'mock'
            }
        };

        // Onboard system
        const onboardRes = await request(app)
            .post('/api/v1/onboarding/systems')
            .send(payload)
            .expect(201);

        expect(onboardRes.body.success).toBe(true);

        // Test connection
        const connRes = await request(app)
            .post('/api/v1/onboarding/systems/sys-phase13-test-1/test-connection')
            .expect(200);

        expect(connRes.body.success).toBe(true);

        // Discover capabilities
        const discRes = await request(app)
            .post('/api/v1/onboarding/systems/sys-phase13-test-1/discover-capabilities')
            .expect(200);

        expect(discRes.body.success).toBe(true);

        // Profile
        const profRes = await request(app)
            .get('/api/v1/onboarding/systems/sys-phase13-test-1/profile')
            .expect(200);

        expect(profRes.body.success).toBe(true);
        expect(profRes.body.data.system.id).toBe('sys-phase13-test-1');
    });

    test('4. Remediation Engine preserves safety controls and supports dry-run simulation', async () => {
        // Overview
        const overviewRes = await request(app)
            .get('/api/v1/remediation/overview')
            .expect(200);

        expect(overviewRes.body.success).toBe(true);
        expect(overviewRes.body.data.policyMode).toBeDefined();

        // Register safety action requiring approval
        const actionPayload = {
            actionId: 'action-phase13-restart',
            name: 'Restart Service',
            targetSystemId: 'sys-phase13-test-1',
            capability: 'restart',
            riskLevel: 'HIGH',
            approvalRequired: true
        };

        await request(app)
            .post('/api/v1/remediation/actions')
            .send(actionPayload)
            .expect(201);

        // Dry Run simulation (non-destructive)
        const dryRunRes = await request(app)
            .post('/api/v1/remediation/dry-run')
            .send({ actionId: 'action-phase13-restart', systemId: 'sys-phase13-test-1' })
            .expect(200);

        expect(dryRunRes.body.success).toBe(true);
        expect(dryRunRes.body.data.dryRun).toBe(true);
    });

    test('5. All core module overview endpoints respond with valid structures', async () => {
        const endpoints = [
            '/api/v1/health/overview',
            '/api/v1/quality/overview',
            '/api/v1/usage/overview',
            '/api/v1/experience/overview',
            '/api/v1/intelligence/insights',
            '/api/v1/alerts/overview',
            '/api/v1/orchestration/overview',
            '/api/v1/runtime/overview',
            '/api/v1/events/overview'
        ];

        for (const ep of endpoints) {
            const res = await request(app).get(ep).expect(200);
            expect(res.body.success).toBe(true);
        }
    });
});
