/**
 * Audit Engine Test Suite
 * Tests central audit log recording, tenant-aware filtering, secret metadata redaction,
 * security event counting, and audit log API endpoints.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { AuditLogService } = require('../src/audit/AuditLogService');

describe('Phase 15 — Central Audit Log Service Test Suite', () => {
    let app;
    let auditService;

    beforeEach(() => {
        auditService = new AuditLogService();
        app = createApp();
    });

    test('1. AuditLogService logs events and redacts metadata secrets', () => {
        const evt = auditService.logEvent({
            eventType: 'AGENT_REGISTERED',
            action: 'register_agent',
            actor: 'admin',
            tenantId: 'tenant-a',
            metadata: {
                agentId: 'ag-100',
                apiKey: 'super-secret-api-key',
                password: 'my-password'
            }
        });

        expect(evt.id).toMatch(/^aud_/);
        expect(evt.metadata.agentId).toBe('ag-100');
        expect(evt.metadata.apiKey).toBe('[REDACTED]');
        expect(evt.metadata.password).toBe('[REDACTED]');
    });

    test('2. AuditLogService filters events by tenant and severity', () => {
        auditService.logEvent({ eventType: 'SYS_1', tenantId: 'tenant-1', severity: 'INFO' });
        auditService.logEvent({ eventType: 'SYS_2', tenantId: 'tenant-2', severity: 'CRITICAL', outcome: 'DENIED' });

        const tenant1Evts = auditService.listEvents({ tenantId: 'tenant-1' });
        expect(tenant1Evts.length).toBe(1);
        expect(tenant1Evts[0].tenantId).toBe('tenant-1');

        const deniedEvts = auditService.listEvents({ outcome: 'DENIED' });
        expect(deniedEvts.length).toBe(1);
    });

    test('3. GET /api/v1/audit/overview returns audit statistics', async () => {
        const res = await request(app)
            .get('/api/v1/audit/overview')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('totalEvents');
        expect(res.body.data).toHaveProperty('securityEvents');
    });

    test('4. GET /api/v1/audit/events returns tenant audit log list', async () => {
        const res = await request(app)
            .get('/api/v1/audit/events')
            .set('x-user-role', 'operator')
            .set('x-tenant-id', 'tenant-dev');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('5. GET /api/v1/audit/export is restricted to Admin role', async () => {
        const resViewer = await request(app)
            .get('/api/v1/audit/export')
            .set('x-user-role', 'viewer');
        expect(resViewer.status).toBe(403);

        const resAdmin = await request(app)
            .get('/api/v1/audit/export')
            .set('x-user-role', 'admin');
        expect(resAdmin.status).toBe(200);
        expect(resAdmin.body.data).toHaveProperty('records');
    });
});
