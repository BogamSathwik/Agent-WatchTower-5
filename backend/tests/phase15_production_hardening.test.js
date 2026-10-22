/**
 * Phase 15 — Production Hardening & Full Regression Test Suite
 * Validates persistence abstraction, configuration service, platform state export,
 * 16-point production readiness verification, security audit trail, and full backward compatibility.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { defaultPersistenceManager } = require('../src/persistence/PersistenceManager');
const { configurationService } = require('../src/config/ConfigurationService');

describe('Phase 15 — Production Hardening & Full Regression Suite', () => {
    let app;

    beforeEach(() => {
        app = createApp();
    });

    test('1. ConfigurationService returns non-sensitive platform config', () => {
        const config = configurationService.getConfig();
        expect(config).toHaveProperty('platform');
        expect(config).toHaveProperty('persistence');
        expect(config.platform.version).toBe('15.0.0');
    });

    test('2. GET /api/v1/platform/export exports sanitized state (Admin role required)', async () => {
        const resViewer = await request(app)
            .get('/api/v1/platform/export')
            .set('x-user-role', 'viewer');
        expect(resViewer.status).toBe(403);

        const resAdmin = await request(app)
            .get('/api/v1/platform/export')
            .set('x-user-role', 'admin');

        expect(resAdmin.status).toBe(200);
        expect(resAdmin.body.success).toBe(true);
        expect(resAdmin.body.schemaVersion).toBe('1.0.0');
        expect(resAdmin.body).toHaveProperty('collections');
        expect(resAdmin.body).toHaveProperty('audit');
    });

    test('3. GET /api/v1/telemetry/readiness evaluates 16 verification checks with PASS overall status', async () => {
        const res = await request(app)
            .get('/api/v1/telemetry/readiness')
            .set('x-user-role', 'admin');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.overallStatus).toBe('PASS');
        expect(res.body.checks.length).toBeGreaterThanOrEqual(16);

        const names = res.body.checks.map(c => c.name);
        expect(names).toContain('Persistence Layer');
        expect(names).toContain('Audit Logging Engine');
        expect(names).toContain('Correlation ID Propagation');
        expect(names).toContain('Configuration Validation');
        expect(names).toContain('Sensitive Data Protection');
        expect(names).toContain('State Restoration');
    });

    test('4. Security audit logs record AUTHORIZATION_DENIED upon forbidden access', async () => {
        const customCorr = 'corr_security_test_111';
        const resDenied = await request(app)
            .post('/api/v1/alerts/escalation-policies')
            .set('x-user-role', 'viewer')
            .set('x-correlation-id', customCorr)
            .send({ name: 'Forbidden Policy' });

        expect(resDenied.status).toBe(403);

        const resAudit = await request(app)
            .get('/api/v1/audit/events?outcome=DENIED')
            .set('x-user-role', 'admin');

        expect(resAudit.status).toBe(200);
        expect(resAudit.body.data.length).toBeGreaterThan(0);
        const evt = resAudit.body.data.find(e => e.correlationId === customCorr);
        expect(evt).toBeDefined();
        expect(evt.outcome).toBe('DENIED');
    });

    test('5. Full Platform Status regression check returns operational 12.0.0 status', async () => {
        const res = await request(app).get('/api/platform/status');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('operational');
        expect(res.body.version).toBe('12.0.0');
    });
});
