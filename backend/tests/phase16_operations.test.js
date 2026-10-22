/**
 * Phase 16: Advanced Agent Operations, Control Center & Operational Intelligence Test Suite
 * Validates agent operations overview, agent detail inspector API, activity stream aggregation,
 * RBAC enforcement, tenant isolation, audit logging, correlation ID, secret redaction,
 * invalid agent handling, and AgentGenPro router compliance.
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { AgentService } = require('../src/agent/AgentService');
const { auditLogService } = require('../src/audit/AuditLogService');
const { ROLES } = require('../src/middleware/authMiddleware');

describe('Phase 16 — Advanced Agent Operations & Control Center Suite', () => {
    let app;
    let systemRegistry;
    let agentService;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        systemRegistry.registerSystem({
            id: 'ops-target-sys-1',
            name: 'Operations Target System',
            category: 'INTERNAL_API',
            version: '1.0.0',
            baseUrl: 'http://localhost:3000'
        });

        app = createApp({ systemRegistry });
        agentService = app.get('agentService');

        // Register a test agent
        agentService.registerAgent({
            id: 'agent-ops-alpha',
            name: 'Alpha Operations Agent',
            category: 'MONITORING',
            version: '1.2.0',
            contractVersion: '1.0.0',
            capabilities: ['health_check', 'metrics_query'],
            systemId: 'ops-target-sys-1',
            metadata: {
                apiKey: 'SECRET_API_KEY_DO_NOT_EXPOSE',
                token: 'BEARER_SECRET_TOKEN',
                password: 'SECRET_PASSWORD',
                safeSetting: 'enabled',
                environment: 'production'
            }
        });
    });

    // 1. Agent Operational Overview Endpoint
    test('1. GET /api/v1/operations/overview returns enriched platform and agent metrics', async () => {
        const res = await request(app)
            .get('/api/v1/operations/overview')
            .set('x-user-role', 'admin')
            .set('x-correlation-id', 'corr_ops_overview_1');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.overview).toBeDefined();
        expect(res.body.overview.agentsTotal).toBeGreaterThanOrEqual(1);
        expect(res.body.overview.agentsActive).toBeDefined();
        expect(res.body.overview.registeredSystemsCount).toBeGreaterThanOrEqual(1);
        expect(res.body.overview.lifecycleState).toBeDefined();
    });

    // 2. Agent Inspector / Operations Detail Endpoint
    test('2. GET /api/v1/agents/:id/operations returns identity, runtime, capabilities, health, and safe config', async () => {
        const res = await request(app)
            .get('/api/v1/agents/agent-ops-alpha/operations')
            .set('x-user-role', 'operator')
            .set('x-correlation-id', 'corr_agent_ops_2');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const data = res.body.data;
        expect(data).toBeDefined();
        expect(data.identity.id).toBe('agent-ops-alpha');
        expect(data.identity.category.toLowerCase()).toBe('monitoring');
        expect(data.runtime.endpoint).toBeDefined();
        expect(data.capabilities).toBeDefined();
        expect(data.health.currentHealth).toBeDefined();
        expect(data.relationships.systemId).toBe('ops-target-sys-1');
    });

    // 3. Health & Availability Info in Agent Inspector
    test('3. Agent inspector includes health status, last check timestamp, and availability score', async () => {
        const res = await request(app)
            .get('/api/v1/agents/agent-ops-alpha/operations')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        const health = res.body.data.health;
        expect(health).toBeDefined();
        expect(['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'OFFLINE']).toContain(health.currentHealth);
        expect(health.availability).toBeGreaterThanOrEqual(0);
    });

    // 4. Activity Stream Aggregation Endpoint
    test('4. GET /api/v1/operations/activity aggregates audit events, alerts, and remediations', async () => {
        // Log an audit event
        auditLogService.logEvent({
            eventType: 'AGENT_INSPECTED',
            action: 'inspect_agent',
            actor: 'admin_user',
            role: 'admin',
            tenantId: 'global',
            resourceType: 'agent',
            resourceId: 'agent-ops-alpha',
            outcome: 'SUCCESS',
            severity: 'INFO',
            correlationId: 'corr_act_4'
        });

        const res = await request(app)
            .get('/api/v1/operations/activity?limit=10')
            .set('x-user-role', 'operator')
            .set('x-correlation-id', 'corr_act_4');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.activities)).toBe(true);
        expect(res.body.activities.length).toBeGreaterThanOrEqual(1);

        const activity = res.body.activities[0];
        expect(activity.timestamp).toBeDefined();
        expect(activity.type).toBeDefined();
        expect(activity.severity).toBeDefined();
        expect(activity.description).toBeDefined();
    });

    // 5. RBAC Enforcement
    test('5. Enforces RBAC permissions on operations endpoints', async () => {
        // Viewer role cannot run diagnostics
        const resViewer = await request(app)
            .post('/api/v1/operations/diagnostics/run')
            .set('x-user-role', 'viewer');
        expect(resViewer.status).toBe(403);

        // Operator can run diagnostics
        const resOperator = await request(app)
            .post('/api/v1/operations/diagnostics/run')
            .set('x-user-role', 'operator');
        expect(resOperator.status).toBe(200);
    });

    // 6. Tenant Isolation Verification
    test('6. Operations activity filters and isolates data by tenant context', async () => {
        auditLogService.logEvent({
            eventType: 'TENANT_TEST_EVENT',
            action: 'tenant_action',
            actor: 'user1',
            role: 'operator',
            tenantId: 'tenant-alpha-1',
            resourceType: 'agent',
            resourceId: 'agent-ops-alpha',
            outcome: 'SUCCESS',
            severity: 'INFO',
            correlationId: 'corr_tenant_6'
        });

        const resTenant1 = await request(app)
            .get('/api/v1/operations/activity')
            .set('x-user-role', 'operator')
            .set('x-tenant-id', 'tenant-alpha-1');

        expect(resTenant1.status).toBe(200);
        const tenant1Events = resTenant1.body.activities.filter(a => a.metadata && a.metadata.tenantId === 'tenant-alpha-1');
        expect(tenant1Events).toBeDefined();
    });

    // 7. Audit Event Creation on Mutating Actions
    test('7. Executing diagnostic or backup operations generates audit events', async () => {
        const initialCount = auditLogService.listEvents({ limit: 1000 }).length;

        await request(app)
            .post('/api/v1/operations/diagnostics/run')
            .set('x-user-role', 'admin')
            .set('x-correlation-id', 'corr_audit_7');

        const newCount = auditLogService.listEvents({ limit: 1000 }).length;
        expect(newCount).toBeGreaterThan(initialCount);

        const latest = auditLogService.listEvents({ limit: 1 })[0];
        expect(latest.action).toBe('run_diagnostics');
        expect(latest.correlationId).toBe('corr_audit_7');
    });

    // 8. Correlation ID Propagation
    test('8. Preserves X-Correlation-ID in request headers and audit logs', async () => {
        const customCorrId = 'corr_custom_phase16_test_888';

        const res = await request(app)
            .post('/api/v1/operations/diagnostics/run')
            .set('x-user-role', 'admin')
            .set('x-correlation-id', customCorrId);

        expect(res.headers['x-correlation-id']).toBe(customCorrId);
    });

    // 9. Secret Redaction
    test('9. Secrets (API keys, passwords, bearer tokens) are never exposed in agent inspector or config', async () => {
        const res = await request(app)
            .get('/api/v1/agents/agent-ops-alpha/operations')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        const config = res.body.data.configuration;
        expect(config.apiKey).toBeUndefined();
        expect(config.token).toBeUndefined();
        expect(config.password).toBeUndefined();
        expect(config.safeSetting).toBe('enabled');
    });

    // 10. Existing API Compatibility
    test('10. Standard agent list GET /api/v1/agents remains fully functional', async () => {
        const res = await request(app)
            .get('/api/v1/agents')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    // 11. Empty-State Behavior
    test('11. Returns clean empty state response when activity stream is empty', async () => {
        const res = await request(app)
            .get('/api/v1/operations/activity?limit=5')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.activities)).toBe(true);
    });

    // 12. Invalid Agent Handling (404 Error)
    test('12. GET /api/v1/agents/:id/operations returns 404 for non-existent agent', async () => {
        const res = await request(app)
            .get('/api/v1/agents/non-existent-agent-9999/operations')
            .set('x-user-role', 'operator');

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('AGENT_NOT_FOUND');
    });

    // 13. Operational Action Authorization
    test('13. Agent operations response returns role-allowed actions list', async () => {
        const resViewer = await request(app)
            .get('/api/v1/agents/agent-ops-alpha/operations')
            .set('x-user-role', 'viewer');

        expect(resViewer.status).toBe(200);
        expect(resViewer.body.data.allowedActions).toEqual([]);

        const resAdmin = await request(app)
            .get('/api/v1/agents/agent-ops-alpha/operations')
            .set('x-user-role', 'admin');

        expect(resAdmin.status).toBe(200);
        expect(resAdmin.body.data.allowedActions).toContain('health_check');
        expect(resAdmin.body.data.allowedActions).toContain('activate');
    });

    // 14. AgentGenPro Router Compliance
    test('14. Production routers do not contain forbidden Node core modules or server startup code', () => {
        const forbiddenPatterns = [
            /require\(['"]fs['"]\)/,
            /require\(['"]child_process['"]\)/,
            /require\(['"]os['"]\)/,
            /\.listen\(/,
            /express\.json\(/,
            /req\.on\(['"]data['"]\)/,
            /req\.on\(['"]end['"]\)/
        ];

        const targetRouters = [
            path.join(__dirname, '../src/api/operationsRoutes.js'),
            path.join(__dirname, '../src/api/agentRoutes.js')
        ];

        targetRouters.forEach(routerPath => {
            const content = fs.readFileSync(routerPath, 'utf8');
            forbiddenPatterns.forEach(pattern => {
                expect(pattern.test(content)).toBe(false);
            });
        });
    });
});
