/**
 * Correlation ID Test Suite
 * Tests request correlation ID assignment, propagation, response header inclusion, and audit correlation tracking.
 */

const request = require('supertest');
const { createApp } = require('../src/app');

describe('Phase 15 — Request Correlation ID Test Suite', () => {
    let app;

    beforeEach(() => {
        app = createApp();
    });

    test('1. Server generates and returns X-Correlation-ID when omitted by client', async () => {
        const res = await request(app).get('/api/platform/status');

        expect(res.status).toBe(200);
        expect(res.headers['x-correlation-id']).toBeDefined();
        expect(res.headers['x-correlation-id']).toMatch(/^corr_/);
    });

    test('2. Server reuses valid X-Correlation-ID supplied by client', async () => {
        const customId = 'corr_custom_req_123456';
        const res = await request(app)
            .get('/api/platform/status')
            .set('x-correlation-id', customId);

        expect(res.status).toBe(200);
        expect(res.headers['x-correlation-id']).toBe(customId);
    });

    test('3. Correlation ID is attached to audit log records', async () => {
        const customCorr = 'corr_test_audit_999';
        // Trigger forbidden request to generate security audit log
        await request(app)
            .post('/api/v1/alerts/escalation-policies')
            .set('x-user-role', 'viewer')
            .set('x-correlation-id', customCorr)
            .send({ name: 'Denied Policy' });

        const resAudit = await request(app)
            .get('/api/v1/audit/events')
            .set('x-user-role', 'admin');

        expect(resAudit.status).toBe(200);
        const deniedEvt = resAudit.body.data.find(e => e.correlationId === customCorr);
        expect(deniedEvt).toBeDefined();
        expect(deniedEvt.outcome).toBe('DENIED');
        expect(deniedEvt.eventType).toBe('AUTHORIZATION_DENIED');
    });
});
