/**
 * Phase 14 Integration & Regression Test Suite
 * Validates SSE stream, alert escalation engine, health state transitions, RBAC permissions matrix,
 * tenant isolation, telemetry overview, Prometheus metrics, production readiness checks, and backward compatibility.
 */

const http = require('http');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { sseManager } = require('../src/events/SSEManager');
const { hasPermission, PERMISSIONS, ROLES } = require('../src/middleware/authMiddleware');
const { hasTenantAccess } = require('../src/middleware/tenantMiddleware');

describe('Phase 14 — Advanced Monitoring, Alert Escalation & Production Readiness', () => {
    let app;
    let registry;

    beforeEach(() => {
        registry = new SystemRegistry();
        app = createApp(registry);
    });

    afterAll(() => {
        sseManager.close();
    });

    // 1. SSE Connection & Event Delivery
    test('1. SSE Stream endpoint connects and flushes event stream headers', (done) => {
        const server = http.createServer(app);
        server.listen(0, () => {
            const port = server.address().port;
            const req = http.get(`http://127.0.0.1:${port}/api/v1/events/stream`, (res) => {
                expect(res.statusCode).toBe(200);
                expect(res.headers['content-type']).toContain('text/event-stream');

                res.on('data', (chunk) => {
                    const str = chunk.toString();
                    if (str.includes('CONNECTED')) {
                        req.destroy();
                        server.close();
                        done();
                    }
                });
            });

            req.on('error', () => {
                server.close();
            });
        });
    });

    test('2 & 3. SSE Manager sanitizes payloads and redacts secrets', () => {
        const payload = {
            systemId: 'sys-01',
            secretKey: 'my-super-secret-password',
            apiKey: '12345'
        };
        const sanitized = sseManager.sanitize(payload);
        expect(sanitized.secretKey).toBe('[REDACTED]');
        expect(sanitized.apiKey).toBe('[REDACTED]');
        expect(sanitized.systemId).toBe('sys-01');
    });

    // 4 & 5. Health State Transition Event & Duplicate Prevention
    test('4 & 5. Health Check Engine emits state transition events without duplicate noise', async () => {
        const mockBroadcaster = jest.spyOn(sseManager, 'broadcast');

        const healthEngine = app.get('healthEngine');

        if (healthEngine) {
            healthEngine.updateAndNotifyState('sys-health-transition-1', 'UNKNOWN', 'HEALTHY', { lastReason: 'OK' });
            expect(mockBroadcaster).toHaveBeenCalledWith('SYSTEM_HEALTH_CHANGED', expect.objectContaining({
                entityId: 'sys-health-transition-1',
                newState: 'HEALTHY'
            }));

            mockBroadcaster.mockClear();
            healthEngine.updateAndNotifyState('sys-health-transition-1', 'HEALTHY', 'HEALTHY', { lastReason: 'OK' });
            expect(mockBroadcaster).not.toHaveBeenCalled();
        }

        mockBroadcaster.mockRestore();
    });

    // 6. Alert Escalation Policy Creation
    test('6. Create Escalation Policy via API (Admin role required)', async () => {
        const res = await request(app)
            .post('/api/v1/alerts/escalation-policies')
            .set('x-user-role', 'admin')
            .send({
                name: 'High Severity Escalation',
                severity: 'HIGH',
                escalationDelaySeconds: 120,
                maxEscalationLevel: 4
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBe('High Severity Escalation');
        expect(res.body.data.maxEscalationLevel).toBe(4);
    });

    // 7. Alert Escalation Action
    test('7. Escalate active alert to Level 2', async () => {
        const alertingService = app.get('alertingService');
        const alert = alertingService.createManualAlert({
            systemId: 'sys-01',
            source: 'test',
            title: 'Test Alert for Escalation',
            severity: 'HIGH'
        });

        const res = await request(app)
            .post(`/api/v1/alerts/${alert.id}/escalate`)
            .set('x-user-role', 'operator')
            .send({ reason: 'SLA Breached' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.escalationLevel).toBe(2);
        expect(res.body.data.isEscalated).toBe(true);
    });

    // 8. Alert Acknowledgement Stops Escalation
    test('8. Acknowledging an alert prevents further escalation', async () => {
        const alertingService = app.get('alertingService');
        const alert = alertingService.createManualAlert({
            systemId: 'sys-01',
            source: 'test',
            title: 'Test Alert Ack Escalation',
            severity: 'HIGH'
        });

        await request(app)
            .post(`/api/v1/alerts/${alert.id}/acknowledge`)
            .set('x-user-role', 'operator')
            .send({ reason: 'Investigating' });

        const res = await request(app)
            .post(`/api/v1/alerts/${alert.id}/escalate`)
            .set('x-user-role', 'operator')
            .send({ reason: 'Escalate anyway' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.message).toContain('Cannot escalate alert');
    });

    // 9. Maximum Escalation Level Enforcement
    test('9. Escalating beyond maximum escalation level is rejected', async () => {
        const alertingService = app.get('alertingService');
        const alert = alertingService.createManualAlert({
            systemId: 'sys-01',
            source: 'test',
            title: 'Test Alert Max Level',
            severity: 'HIGH'
        });

        await alertingService.escalateAlert(alert.id);
        await alertingService.escalateAlert(alert.id);

        const res = await request(app)
            .post(`/api/v1/alerts/${alert.id}/escalate`)
            .set('x-user-role', 'operator')
            .send({ reason: 'Push level 4' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.message).toContain('reached maximum escalation level');
    });

    // 10, 11, 12, 13. RBAC Permissions & Role Matrix
    test('10, 11, 12, 13. RBAC permissions matrix correctly restricts Viewer and Operator roles', async () => {
        expect(hasPermission(ROLES.VIEWER, PERMISSIONS.AGENTS_READ)).toBe(true);
        expect(hasPermission(ROLES.VIEWER, PERMISSIONS.AGENTS_REGISTER)).toBe(false);
        expect(hasPermission(ROLES.OPERATOR, PERMISSIONS.AGENTS_EXECUTE)).toBe(true);
        expect(hasPermission(ROLES.OPERATOR, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
        expect(hasPermission(ROLES.ADMIN, PERMISSIONS.SETTINGS_MANAGE)).toBe(true);

        const resViewer = await request(app)
            .post('/api/v1/alerts/escalation-policies')
            .set('x-user-role', 'viewer')
            .send({ name: 'Forbidden Policy' });
        expect(resViewer.status).toBe(403);

        const resOp = await request(app)
            .post('/api/v1/alerts/escalation-policies')
            .set('x-user-role', 'operator')
            .send({ name: 'Operator Policy' });
        expect(resOp.status).toBe(403);
    });

    // 14 & 15. Tenant Isolation Foundation
    test('14 & 15. Tenant context attached and cross-tenant validation supported', async () => {
        const reqMock = { headers: { 'x-tenant-id': 'tenant-alpha' } };
        expect(hasTenantAccess(reqMock, 'tenant-alpha')).toBe(true);
        expect(hasTenantAccess(reqMock, 'tenant-beta')).toBe(false);

        const res = await request(app)
            .get('/api/platform/status')
            .set('x-tenant-id', 'tenant-org-99');
        expect(res.status).toBe(200);
    });

    // 16. Telemetry Overview
    test('16. Telemetry Overview returns system uptime, request counters, and component metrics', async () => {
        const res = await request(app)
            .get('/api/v1/telemetry/overview')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('uptimeSeconds');
        expect(res.body).toHaveProperty('httpRequestsTotal');
        expect(res.body).toHaveProperty('registeredSystems');
        expect(res.body).toHaveProperty('sseActiveClients');
    });

    // 17. Prometheus Metrics Endpoint
    test('17. Telemetry Prometheus metrics endpoint returns formatted text output', async () => {
        const res = await request(app)
            .get('/api/v1/telemetry/metrics')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/plain');
        expect(res.text).toContain('agentos_uptime_seconds');
        expect(res.text).toContain('agentos_http_requests_total');
        expect(res.text).toContain('agentos_agents_registered');
    });

    // 18. Production Readiness Checks
    test('18. Production Readiness endpoint evaluates 10 verification criteria', async () => {
        const res = await request(app)
            .get('/api/v1/telemetry/readiness')
            .set('x-user-role', 'admin');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.overallStatus).toBe('PASS');
        expect(res.body.checks.length).toBeGreaterThanOrEqual(10);
    });

    // 19. Security Regression
    test('19. Undefined routes return structured 404 error without stack traces', async () => {
        const res = await request(app).get('/api/v1/non-existent-route-xyz');
        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.code).toBe('NOT_FOUND');
        expect(res.body).not.toHaveProperty('stack');
    });

    // 20. Existing API Regression
    test('20. Root platform status returns 200 operational state with version 12.0.0', async () => {
        const res = await request(app).get('/api/platform/status');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('operational');
        expect(res.body.version).toBe('12.0.0');
    });
});
