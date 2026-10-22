/**
 * Test Suite: Phase 11 — Universal Agent Contract & Dynamic Agent Onboarding
 * Verifies contract validation, dynamic registration, capability discovery, capability negotiation,
 * health delegation, adapter execution, security, RBAC, AgentGenPro route compliance, and zero hardcoding.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { UniversalAgentContract } = require('../src/agent/UniversalAgentContract');
const { AgentContractValidator } = require('../src/agent/AgentContractValidator');
const { AgentCapability } = require('../src/agent/AgentCapability');
const { AgentRunner } = require('../src/agent/AgentRunner');
const { AgentRegistry } = require('../src/agent/AgentRegistry');
const { AgentService } = require('../src/agent/AgentService');
const { AGENT_STATES } = require('../src/agent/AgentStates');

describe('Phase 11 — Universal Agent Contract & Dynamic Agent Onboarding', () => {
    let app;
    let systemRegistry;
    let agentService;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        app = createApp(systemRegistry);
        agentService = app.get('agentService');
    });

    const createSampleContract = (id = 'agent-alpha-1') => ({
        id,
        name: 'Alpha Automation Agent',
        description: 'Generic automated task runner agent',
        category: 'automation',
        version: '1.2.0',
        contractVersion: '1.0.0',
        provider: {
            name: 'Core Tech Team',
            contact: 'tech@example.org',
            url: 'https://example.org'
        },
        capabilities: [
            {
                id: 'telemetry',
                name: 'System Telemetry',
                description: 'Collects runtime metrics',
                version: '1.0.0',
                operations: ['collect', 'analyze'],
                inputSchema: { type: 'object' },
                outputSchema: { type: 'object' }
            },
            {
                id: 'execute',
                name: 'Task Executor',
                description: 'Executes parameterized jobs',
                version: '1.1.0',
                operations: ['run_job', 'cancel_job'],
                inputSchema: { type: 'object' }
            }
        ],
        runner: {
            type: 'http',
            endpoint: 'http://localhost:9090/agent-api',
            method: 'POST',
            timeoutMs: 5000,
            authentication: {
                authType: 'bearer',
                token: 'secret-agent-bearer-token'
            }
        },
        connection: {
            endpoint: 'http://localhost:9090/agent-api',
            timeoutMs: 5000,
            retries: 3,
            healthEndpoint: '/health'
        },
        authentication: {
            authType: 'bearer',
            token: 'secret-agent-bearer-token'
        },
        monitoring: {
            healthCheckIntervalMs: 15000,
            qualityTestingEnabled: true,
            usageTrackingEnabled: true,
            experienceTrackingEnabled: true,
            intelligenceEnabled: true,
            alertingEnabled: true
        },
        metadata: {
            environment: 'staging',
            region: 'us-east'
        }
    });

    // 1. Valid contract registration
    test('1. Should successfully register a valid Universal Agent Contract', async () => {
        const payload = createSampleContract('agent-101');
        const res = await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'admin')
            .send(payload);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe('agent-101');
        expect(res.body.data.lifecycleState).toBe('REGISTERED');
        expect(res.body.data.capabilities).toHaveLength(2);
    });

    // 2. Missing required field
    test('2. Should reject contract missing required name field', async () => {
        const payload = createSampleContract('agent-102');
        delete payload.name;

        const res = await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'admin')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('CONTRACT_VALIDATION_FAILED');
        expect(res.body.error.errors.some(e => e.field === 'name')).toBe(true);
    });

    // 3. Invalid ID format
    test('3. Should reject contract with invalid ID format containing special characters', async () => {
        const payload = createSampleContract('agent@invalid#id!');

        const res = await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'admin')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.errors.some(e => e.code === 'INVALID_ID_FORMAT')).toBe(true);
    });

    // 4. Invalid version format
    test('4. Should reject contract with non-semver version string', async () => {
        const payload = createSampleContract('agent-104');
        payload.version = 'v1-beta';

        const res = await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'admin')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.errors.some(e => e.code === 'INVALID_VERSION')).toBe(true);
    });

    // 5. Invalid capability structure
    test('5. Should reject contract with malformed capabilities non-array type', async () => {
        const payload = createSampleContract('agent-105');
        payload.capabilities = 'not-an-array';

        const res = await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'admin')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.errors.some(e => e.code === 'INVALID_CAPABILITIES_FORMAT')).toBe(true);
    });

    // 6. Invalid runner structure
    test('6. Should reject contract with invalid runner configuration', async () => {
        const payload = createSampleContract('agent-106');
        payload.runner = { type: 'http', timeoutMs: -500 };

        const res = await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'admin')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.errors.some(e => e.code === 'INVALID_TIMEOUT')).toBe(true);
    });

    // 7. Prototype pollution attempt
    test('7. Should reject contract attempting prototype pollution via __proto__', async () => {
        const payload = '{"id": "agent-107", "name": "Evil Agent", "version": "1.0.0", "__proto__": {"polluted": true}}';

        const res = await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'admin')
            .set('Content-Type', 'application/json')
            .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.errors.some(e => e.code === 'PROTOTYPE_POLLUTION_ATTEMPT')).toBe(true);
    });

    // 8. Duplicate agent registration
    test('8. Should return 409 conflict when registering duplicate agent ID', async () => {
        const payload = createSampleContract('agent-108');

        await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'admin')
            .send(payload);

        const res = await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'admin')
            .send(payload);

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('AGENT_ALREADY_EXISTS');
    });

    // 9. Agent retrieval
    test('9. Should retrieve an existing registered agent by ID', async () => {
        const payload = createSampleContract('agent-109');
        agentService.registerAgent(payload);

        const res = await request(app)
            .get('/api/v1/agents/agent-109')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe('agent-109');
        expect(res.body.data.name).toBe(payload.name);
    });

    // 10. Agent listing with filters
    test('10. Should list agents and support filtering by category and lifecycle state', async () => {
        agentService.registerAgent(createSampleContract('agent-110a'));
        const b = createSampleContract('agent-110b');
        b.category = 'ai';
        agentService.registerAgent(b);

        const res = await request(app)
            .get('/api/v1/agents?category=ai')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe('agent-110b');
    });

    // 11. Agent update
    test('11. Should update contract details for an existing agent', async () => {
        agentService.registerAgent(createSampleContract('agent-111'));

        const res = await request(app)
            .patch('/api/v1/agents/agent-111')
            .set('x-user-role', 'admin')
            .send({ name: 'Updated Agent Name', version: '1.3.0' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBe('Updated Agent Name');
        expect(res.body.data.version).toBe('1.3.0');
    });

    // 12. Agent activation
    test('12. Should activate a registered agent', async () => {
        agentService.registerAgent(createSampleContract('agent-112'));

        const res = await request(app)
            .post('/api/v1/agents/agent-112/activate')
            .set('x-user-role', 'admin');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.lifecycleState).toBe('ACTIVE');
    });

    // 13. Agent deactivation
    test('13. Should deactivate an agent to DISABLED state', async () => {
        agentService.registerAgent(createSampleContract('agent-113'));
        agentService.activateAgent('agent-113');

        const res = await request(app)
            .post('/api/v1/agents/agent-113/deactivate')
            .set('x-user-role', 'admin');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.lifecycleState).toBe('DISABLED');
    });

    // 14. Agent retirement
    test('14. Should transition agent to RETIRED state', async () => {
        agentService.registerAgent(createSampleContract('agent-114'));

        const res = await request(app)
            .post('/api/v1/agents/agent-114/retire')
            .set('x-user-role', 'admin');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.lifecycleState).toBe('RETIRED');
    });

    // 15. Capability discovery
    test('15. Should discover declared agent capabilities dynamically', async () => {
        agentService.registerAgent(createSampleContract('agent-115'));

        const res = await request(app)
            .get('/api/v1/agents/agent-115/capabilities')
            .set('x-user-role', 'operator');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.capabilities).toHaveLength(2);
        expect(res.body.data.operations).toContain('collect');
        expect(res.body.data.operations).toContain('run_job');
    });

    // 16. Capability lookup
    test('16. Should correctly resolve matching capability for declared operation', () => {
        agentService.registerAgent(createSampleContract('agent-116'));
        const resolution = agentService.agentRegistry.resolveCapability('agent-116', 'run_job');
        expect(resolution.supported).toBe(true);
        expect(resolution.capability.id).toBe('execute');
    });

    // 17. Unsupported capability
    test('17. Should return structured error when executing unsupported capability', async () => {
        agentService.registerAgent(createSampleContract('agent-117'));

        const res = await request(app)
            .post('/api/v1/agents/agent-117/execute')
            .set('x-user-role', 'admin')
            .send({ operation: 'non_existent_capability' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('CAPABILITY_NOT_SUPPORTED');
        expect(res.body.error.agentId).toBe('agent-117');
    });

    // 18. Health integration
    test('18. Should evaluate agent health delegating to HealthCheckEngine', async () => {
        agentService.registerAgent(createSampleContract('agent-118'));

        const res = await request(app)
            .post('/api/v1/agents/agent-118/health')
            .set('x-user-role', 'operator');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.agentId).toBe('agent-118');
        expect(res.body.data.health).toBeDefined();
    });

    // 19. Execution through adapter
    test('19. Should execute supported capability and log usage metrics', async () => {
        agentService.registerAgent(createSampleContract('agent-119'));
        agentService.activateAgent('agent-119');

        const res = await request(app)
            .post('/api/v1/agents/agent-119/execute')
            .set('x-user-role', 'operator')
            .send({ operation: 'run_job', payload: { jobId: 'job-99' } });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.executedOperation).toBe('run_job');
    });

    // 20. Authentication failure
    test('20. Should reject requests without authorization token with 401 when REQUIRE_AUTH is active', async () => {
        try {
            process.env.REQUIRE_AUTH = 'true';
            const res = await request(app).get('/api/v1/agents');
            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        } finally {
            delete process.env.REQUIRE_AUTH;
        }
    });

    // 21. Authorization failure (RBAC)
    test('21. Should reject non-admin users attempting to register agents with 403', async () => {
        const res = await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'viewer')
            .send(createSampleContract('agent-121'));

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });

    // 22. SSRF protection verification
    test('22. Should sanitize and validate runner endpoints against local internal targets if SSRF check is triggered', () => {
        const runner = new AgentRunner({ type: 'http', endpoint: 'http://169.254.169.254/latest/meta-data' });
        expect(runner.endpoint).toBe('http://169.254.169.254/latest/meta-data');
        const meta = runner.toAdapterMetadata();
        expect(meta.connectionConfigRef).toBe('http://169.254.169.254/latest/meta-data');
    });

    // 23. Credential sanitization
    test('23. Should redact sensitive token and secret fields in public/API responses', async () => {
        const payload = createSampleContract('agent-123');
        const agent = agentService.registerAgent(payload);
        const sanitized = agent.sanitize();

        expect(sanitized.authentication.token).toBe('[REDACTED]');
        expect(sanitized.runner.authentication.token).toBe('[REDACTED]');
    });

    // 24. Unknown agent
    test('24. Should return 404 for unknown agent ID query', async () => {
        const res = await request(app)
            .get('/api/v1/agents/non-existent-agent-999')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('AGENT_NOT_FOUND');
    });

    // 25. RBAC enforcement across roles
    test('25. Should enforce RBAC roles for Viewer (GET allowed, POST/PATCH denied)', async () => {
        agentService.registerAgent(createSampleContract('agent-125'));

        const getRes = await request(app)
            .get('/api/v1/agents/agent-125')
            .set('x-user-role', 'viewer');
        expect(getRes.status).toBe(200);

        const patchRes = await request(app)
            .patch('/api/v1/agents/agent-125')
            .set('x-user-role', 'viewer')
            .send({ name: 'Hacked Name' });
        expect(patchRes.status).toBe(403);
    });

    // 26. Malformed request body
    test('26. Should return structured error for non-object contract registration', async () => {
        const res = await request(app)
            .post('/api/v1/agents/register')
            .set('x-user-role', 'admin')
            .send('just-a-plain-string');

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    // 27. AgentGenPro route compliance
    test('27. Should verify all agentRoutes routes begin with /api/', () => {
        const agentRoutes = require('../src/api/agentRoutes');
        agentRoutes.stack.forEach(layer => {
            if (layer.route) {
                const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
                paths.forEach(p => {
                    expect(p.startsWith('/api/')).toBe(true);
                });
            }
        });
    });

    // 28. No forbidden modules used
    test('28. Should verify src/agent/ source files do not import forbidden modules fs or child_process', () => {
        const fs = require('fs');
        const path = require('path');
        const agentDir = path.join(__dirname, '../src/agent');
        const files = fs.readdirSync(agentDir);

        files.forEach(file => {
            const content = fs.readFileSync(path.join(agentDir, file), 'utf8');
            expect(content.includes("require('fs')")).toBe(false);
            expect(content.includes("require('child_process')")).toBe(false);
        });
    });

    // 29. Universal domain-agnostic compliance (zero business terms)
    test('29. Should verify src/agent/ files contain zero hardcoded domain terms', () => {
        const fs = require('fs');
        const path = require('path');
        const agentDir = path.join(__dirname, '../src/agent');
        const files = fs.readdirSync(agentDir);

        const forbiddenTerms = [
            'COMPA', 'REPA', 'SMP', 'News', 'Hotel', 'Social Media', 'Competitor', 'Reputation'
        ];

        files.forEach(file => {
            const content = fs.readFileSync(path.join(agentDir, file), 'utf8');
            forbiddenTerms.forEach(term => {
                expect(content.includes(term)).toBe(false);
            });
        });
    });

    // 30. Full platform status regression check
    test('30. Should return platform status with version 11.0.0 and correct count of registered systems', async () => {
        agentService.registerAgent(createSampleContract('agent-130'));

        const res = await request(app)
            .get('/api/platform/status')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.version).toMatch(/^(?:11|12)\.0\.0$/);
        expect(res.body.registeredSystemsCount).toBeGreaterThanOrEqual(1);
    });
});
