const request = require('supertest');
const { createApp } = require('../src/app');
const { ReasoningEngine } = require('../src/reasoning/ReasoningEngine');

describe('Phase 17 — Reasoning Engine Test Suite', () => {
    let app;
    let engine;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        engine = new ReasoningEngine();
    });

    test('1. Runs deterministic OBSERVE -> ANALYZE -> PLAN -> DECIDE cycle', async () => {
        const { decision, trace } = await engine.analyzeAndPlan('TEST-AGENT-001', {
            observation: 'Agent health check latency elevated to 3500ms',
            healthState: 'DEGRADED'
        }, { execute: false });

        expect(decision.decisionId).toBeDefined();
        expect(decision.status).toBe('ACTION_PROPOSED');
        expect(decision.analysis).toContain('degraded');
        expect(decision.options.length).toBeGreaterThan(0);
        expect(decision.confidence).toBe(0.95);
        expect(trace.steps.length).toBeGreaterThanOrEqual(5);
    });

    test('2. Secret redaction removes sensitive credentials from reasoning trace', async () => {
        const { trace } = await engine.analyzeAndPlan('TEST-AGENT-001', {
            observation: 'Telemetry payload',
            token: 'secret-bearer-token-12345',
            apiKey: 'super-secret-key'
        }, { execute: false });

        const traceStr = JSON.stringify(trace);
        expect(traceStr).not.toContain('secret-bearer-token-12345');
        expect(traceStr).not.toContain('super-secret-key');
        expect(traceStr).toContain('***REDACTED***');
    });

    test('3. REST API POST /api/v1/reasoning/analyze returns structured decision and trace', async () => {
        const res = await request(app)
            .post('/api/v1/reasoning/analyze')
            .set('Authorization', 'Bearer valid-api-key')
            .send({
                agentId: 'TEST-AGENT-001',
                observation: { healthState: 'HEALTHY' }
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.decision.decisionId).toBeDefined();
        expect(res.body.data.decision.status).toBeDefined();
    });

    test('4. REST API GET /api/v1/reasoning/traces lists historical traces', async () => {
        const res = await request(app)
            .get('/api/v1/reasoning/traces')
            .set('Authorization', 'Bearer valid-api-key');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});
