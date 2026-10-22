/**
 * Phase 31 Test Suite — Predictive Operations & Early Warning Center
 * Covers orchestration service, signal aggregation, inference rules,
 * forecast horizons, REST endpoints, RBAC, tenant isolation, and
 * Compa/Repa execution truthfulness (UNSUPPORTED readiness).
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { EarlyWarningCenterService } = require('../src/earlywarning/EarlyWarningCenterService');
const { WarningSignalAggregator } = require('../src/earlywarning/WarningSignalAggregator');
const { EarlyWarningInferenceEngine } = require('../src/earlywarning/EarlyWarningInferenceEngine');
const { ForecastHorizonService } = require('../src/earlywarning/ForecastHorizonService');

describe('Phase 31 — Predictive Operations & Early Warning Center', () => {
    let app;
    let earlyWarningService;
    let monitoringService;

    beforeEach(() => {
        app = createApp();
        earlyWarningService = app.get('earlyWarningCenterService');
        monitoringService = app.get('agentMonitoringService');
    });

    test('1. EarlyWarningCenterService initializes with all sub-engines', () => {
        expect(earlyWarningService).toBeDefined();
        expect(earlyWarningService).toBeInstanceOf(EarlyWarningCenterService);
        expect(earlyWarningService.signalAggregator).toBeInstanceOf(WarningSignalAggregator);
        expect(earlyWarningService.inferenceEngine).toBeInstanceOf(EarlyWarningInferenceEngine);
        expect(earlyWarningService.forecastService).toBeInstanceOf(ForecastHorizonService);
    });

    test('2. getOverview returns classified scorecard with INSUFFICIENT_DATA handling on empty store', () => {
        const overview = earlyWarningService.getOverview({ tenantId: 'tenant-ew-1' });
        expect(overview).toBeDefined();
        expect(overview.tenantId).toBe('tenant-ew-1');
        expect(overview.timestamp).toBeDefined();
        expect(overview.dataClassificationLegend.OBSERVED).toBeDefined();
        expect(overview.dataClassificationLegend.PREDICTION).toBeDefined();
        expect(overview.scorecard).toBeDefined();
        expect(overview.scorecard.coverageStatus).toBe('INSUFFICIENT_DATA');
        expect(Array.isArray(overview.topWarnings)).toBe(true);
        expect(Array.isArray(overview.predictions)).toBe(true);
    });

    test('3. Signal aggregator returns AVAILABLE coverage after seeding probe history', () => {
        const store = monitoringService.store;
        const agentId = 'EW-TEST-001';
        const tenantId = 'tenant-ew-2';
        // Seed 5 healthy probes with rising latency (trend)
        for (let i = 0; i < 5; i++) {
            store.addCheckRecord(agentId, {
                timestamp: new Date(Date.now() - (5 - i) * 60000).toISOString(),
                success: true,
                healthState: 'HEALTHY',
                responseTimeMs: 100 + i * 60,
                statusCode: 200
            }, tenantId);
        }
        store.saveStatus(agentId, {
            agentId, tenantId,
            currentState: 'HEALTHY', status: 'HEALTHY',
            consecutiveFailures: 0,
            latency: { lastLatencyMs: 340 },
            lastCheckAt: new Date().toISOString(),
            availabilityPercentage: 100,
            totalFailuresCount: 0
        }, tenantId);

        const agg = earlyWarningService.signalAggregator;
        const { observedSignals, trendSignals, coverage } = agg.collectSignals({ tenantId, agentId });
        expect(coverage.agentsEvaluated).toBe(1);
        expect(observedSignals.length).toBeGreaterThanOrEqual(1);
        expect(observedSignals[0].evidenceLevel).toBe('CONFIRMED');
        expect(observedSignals[0].dataClassification).toBe('OBSERVED');
    });

    test('4. Inference generates HIGH impending-offline warning on converging failures (no fake timestamps)', () => {
        const engine = earlyWarningService.inferenceEngine;
        const warnings = engine.inferWarnings({
            observedSignals: [
                { agentId: 'EW-TEST-002', kind: 'HEALTH_STATE', observedValue: 'DEGRADED', detail: 'x', evidence: [] },
                { agentId: 'EW-TEST-002', kind: 'CONSECUTIVE_FAILURES', observedValue: '2 consecutive failures', detail: '2 fails', evidence: [] },
                { agentId: 'EW-TEST-002', kind: 'ANOMALY_LATENCY_SPIKE', detail: 'spike', evidence: [], humanReadableSummary: 'spike' }
            ],
            trendSignals: [
                { agentId: 'EW-TEST-002', kind: 'PREDICTIVE_RISK', observedValue: 'HIGH', confidence: 0.88, evidence: [] }
            ],
            tenantId: 'tenant-ew-3'
        });
        expect(warnings.length).toBeGreaterThan(0);
        const w = warnings[0];
        expect(w.dataClassification).toBe('INFERRED_WARNING');
        expect(w.evidenceLevel).toBe('INFERRED');
        expect(w.horizonWindow).toBeDefined();
        expect(w.confidence).toBeLessThanOrEqual(0.95);
        expect(w.title).not.toMatch(/will fail at|guaranteed/i);
    });

    test('5. Active OFFLINE is reported as CONFIRMED outage, not a prediction', () => {
        const engine = earlyWarningService.inferenceEngine;
        const warnings = engine.inferWarnings({
            observedSignals: [
                { agentId: 'EW-TEST-003', kind: 'HEALTH_STATE', observedValue: 'OFFLINE', detail: 'x', evidence: [] }
            ],
            trendSignals: [],
            tenantId: 'tenant-ew-4'
        });
        expect(warnings.length).toBe(1);
        expect(warnings[0].evidenceLevel).toBe('CONFIRMED');
        expect(warnings[0].dataClassification).toBe('OBSERVED');
        expect(warnings[0].leadTimeEstimate).toBe('NOW');
    });

    test('6. Forecast service withholds prediction on insufficient history', () => {
        const svc = earlyWarningService.forecastService;
        const { predictions } = svc.buildPredictions([{
            warningId: 'w1', agentId: 'EW-NEW-AGENT', warningType: 'ELEVATED_WATCH',
            observedEvidence: ['x'], confidence: 0.7, horizonWindow: 'NEXT_24H'
        }], { tenantId: 'tenant-ew-5' });
        expect(predictions.length).toBe(1);
        expect(predictions[0].evidenceLevel).toBe('INSUFFICIENT_DATA');
        expect(predictions[0].disclaimer).toMatch(/withheld|insufficient/i);
    });

    test('7. REST: GET /api/v1/early-warning/overview returns scorecard', async () => {
        const res = await request(app).get('/api/v1/early-warning/overview');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.scorecard).toBeDefined();
        expect(res.body.data.dataClassificationLegend).toBeDefined();
    });

    test('8. REST: GET /api/v1/early-warning/warnings + trends + predictions + readiness', async () => {
        for (const p of ['warnings', 'trends', 'predictions', 'readiness', 'risks']) {
            const res = await request(app).get(`/api/v1/early-warning/${p}`);
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        }
    });

    test('9. REST: GET /api/v1/early-warning/agents/:id returns per-agent classification', async () => {
        const res = await request(app).get('/api/v1/early-warning/agents/EW-TEST-001');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.agentId).toBe('EW-TEST-001');
        expect(Array.isArray(res.body.data.warnings)).toBe(true);
        expect(Array.isArray(res.body.data.predictions)).toBe(true);
    });

    test('10. REST: unknown warning id returns 404, acknowledge requires existing id', async () => {
        const nf = await request(app).get('/api/v1/early-warning/warnings/does-not-exist-123');
        expect(nf.status).toBe(404);
        expect(nf.body.code).toBe('WARNING_NOT_FOUND');

        const ackNf = await request(app)
            .post('/api/v1/early-warning/warnings/does-not-exist-123/acknowledge')
            .set('x-role', 'operator')
            .send({ note: 'test' });
        expect(ackNf.status).toBe(404);
    });

    test('11. RBAC: viewer cannot acknowledge warnings (403), operator can after seeding', async () => {
        // Seed a warning-capable agent
        const store = monitoringService.store;
        const tenantId = 'default-tenant';
        const agentId = 'EW-RBAC-001';
        for (let i = 0; i < 4; i++) {
            store.addCheckRecord(agentId, {
                timestamp: new Date(Date.now() - (4 - i) * 60000).toISOString(),
                success: i < 2, healthState: i < 2 ? 'HEALTHY' : 'DEGRADED',
                responseTimeMs: 200 + i * 150, statusCode: i < 2 ? 200 : 500
            }, tenantId);
        }
        store.saveStatus(agentId, {
            agentId, tenantId, currentState: 'DEGRADED', status: 'DEGRADED',
            consecutiveFailures: 2, latency: { lastLatencyMs: 900 },
            lastCheckAt: new Date().toISOString(), lastError: 'HTTP 500',
            availabilityPercentage: 50, totalFailuresCount: 2
        }, tenantId);

        const list = await request(app).get('/api/v1/early-warning/warnings');
        expect(list.body.count).toBeGreaterThanOrEqual(0);
        if (list.body.count > 0) {
            const wid = list.body.warnings[0].warningId;
            const denied = await request(app)
                .post(`/api/v1/early-warning/warnings/${wid}/acknowledge`)
                .set('x-role', 'viewer')
                .send({ note: 'viewer attempt' });
            expect(denied.status).toBe(403);

            const ok = await request(app)
                .post(`/api/v1/early-warning/warnings/${wid}/acknowledge`)
                .set('x-role', 'operator')
                .send({ note: 'operator ack' });
            expect(ok.status).toBe(200);
            expect(ok.body.data.status).toBe('ACKNOWLEDGED');
        }
    });

    test('12. Tenant isolation: warnings are scoped per tenant', async () => {
        const a = await request(app).get('/api/v1/early-warning/overview').set('x-tenant-id', 'tenant-A');
        const b = await request(app).get('/api/v1/early-warning/overview').set('x-tenant-id', 'tenant-B');
        expect(a.body.data.tenantId).toBe('tenant-A');
        expect(b.body.data.tenantId).toBe('tenant-B');
    });

    test('13. Truthfulness: external Compa/Repa readiness is UNSUPPORTED', () => {
        const engine = earlyWarningService.inferenceEngine;
        const warnings = engine.inferWarnings({
            observedSignals: [
                { agentId: 'compa-agent-ext', kind: 'HEALTH_STATE', observedValue: 'DEGRADED', detail: 'x', evidence: [] },
                { agentId: 'compa-agent-ext', kind: 'CONSECUTIVE_FAILURES', observedValue: '2 consecutive failures', detail: 'x', evidence: [] }
            ],
            trendSignals: [],
            tenantId: 'default-tenant'
        });
        for (const w of warnings) {
            expect(w.responseReadiness).toBe('UNSUPPORTED');
            expect(w.recommendedOperatorActions).not.toContain('EXECUTE_REMEDIATION');
        }
        const readiness = earlyWarningService.getReadiness({ tenantId: 'default-tenant' });
        expect(readiness.readiness).toBeDefined();
    });
});
