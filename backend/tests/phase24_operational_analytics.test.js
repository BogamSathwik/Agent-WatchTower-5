/**
 * Phase 24 — Agent Performance Optimization, Capacity Intelligence & Operational Analytics Test Suite
 * Validates operational analytics engine, agent performance scorecards, trends, reliability metrics,
 * recurring problem detection, operator attention engine, capacity intelligence, agent comparison,
 * snapshots, persistence, tenant isolation, RBAC, Compa/Repa/TEST-AGENT-001 analytics, and regressions.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const OperationalAnalyticsService = require('../src/analytics/OperationalAnalyticsService');
const { AgentPerformanceAnalyzer } = require('../src/analytics/AgentPerformanceAnalyzer');
const { CapacityIntelligenceService } = require('../src/analytics/CapacityIntelligenceService');
const { RecurringProblemAnalyzer } = require('../src/analytics/RecurringProblemAnalyzer');
const { OperatorAttentionService } = require('../src/analytics/OperatorAttentionService');
const { PersistenceManager } = require('../src/persistence/PersistenceManager');

describe('PHASE 24 — Operational Analytics, Capacity Intelligence & Performance Optimization', () => {
    let app;
    let monitoringService;
    let analyticsService;
    let remediationService;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        monitoringService = app.get('agentMonitoringService');
        analyticsService = app.get('operationalAnalyticsService');
        remediationService = app.get('remediationService');
    });

    afterAll(() => {
        if (monitoringService) {
            monitoringService.stopAll();
        }
    });

    // 1. Platform overview
    test('1. Returns platform overview aggregating monitored agents, health states, incidents, and remediations', async () => {
        const res = await request(app)
            .get('/api/v1/analytics/overview?range=24h')
            .set('x-tenant-id', 'test-tenant-p24')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('monitoredAgents');
        expect(res.body.data).toHaveProperty('healthyAgents');
        expect(res.body.data).toHaveProperty('degradedAgents');
        expect(res.body.data).toHaveProperty('offlineAgents');
        expect(res.body.data).toHaveProperty('totalMonitoringChecks');
        expect(res.body.data).toHaveProperty('availability');
    });

    // 2. Agent performance
    test('2. Generates agent performance scorecard for a monitored agent', async () => {
        const agentId = 'p24-perf-agent-01';
        const tenantId = 'test-tenant-p24';

        // Add mock probe records
        for (let i = 1; i <= 10; i++) {
            monitoringService.store.addCheckRecord(agentId, {
                healthState: 'HEALTHY',
                durationMs: 150 + i * 10,
                success: true
            }, tenantId);
        }

        const res = await request(app)
            .get(`/api/v1/analytics/agents/${agentId}/performance?range=24h`)
            .set('x-tenant-id', tenantId)
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.agentId).toBe(agentId);
        expect(res.body.data.checkCount).toBe(10);
        expect(res.body.data.availability).toBe('100%');
    });

    // 3. Average latency
    test('3. Calculates exact average latency from historical check samples', () => {
        const agentId = 'avg-latency-agent';
        monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 200, success: true });
        monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 300, success: true });

        const perf = analyticsService.getAgentPerformance(agentId, '24h', 'default-tenant');
        expect(perf.averageLatency).toBe(200);
    });

    // 4. P95 latency
    test('4. Calculates p95 latency accurately from sorted latency samples', () => {
        const agentId = 'p95-latency-agent';
        for (let i = 1; i <= 20; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: i * 10, success: true });
        }

        const perf = analyticsService.getAgentPerformance(agentId, '24h', 'default-tenant');
        expect(perf.p95Latency).toBeGreaterThanOrEqual(180);
    });

    // 5. Availability
    test('5. Calculates availability percentage correctly based on successful vs failed checks', () => {
        const agentId = 'avail-calc-agent';
        // 8 healthy, 2 failed
        for (let i = 0; i < 8; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }
        for (let i = 0; i < 2; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'OFFLINE', durationMs: 5000, success: false });
        }

        const perf = analyticsService.getAgentPerformance(agentId, '24h', 'default-tenant');
        expect(perf.availability).toBe('80%');
        expect(perf.failureRate).toBe('20%');
    });

    // 6. Failure rate
    test('6. Reports failure rate percentage matching failed probes', () => {
        const agentId = 'fail-rate-agent';
        monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        monitoringService.store.addCheckRecord(agentId, { healthState: 'OFFLINE', durationMs: 5000, success: false });

        const perf = analyticsService.getAgentPerformance(agentId, '24h', 'default-tenant');
        expect(perf.failureRate).toBe('50%');
    });

    // 7. Incident frequency
    test('7. Measures incident frequency over the requested time window', () => {
        const agentId = 'inc-freq-agent';
        monitoringService.store.saveIncident({
            id: 'INC-FREQ-01',
            agentId,
            tenantId: 'default-tenant',
            startedAt: new Date().toISOString(),
            status: 'OPEN',
            severity: 'HIGH'
        });

        const perf = analyticsService.getAgentPerformance(agentId, '24h', 'default-tenant');
        expect(perf.incidentCount).toBeGreaterThanOrEqual(1);
        expect(perf.incidentFrequency).toContain('/hr');
    });

    // 8. Recovery duration
    test('8. Computes average recovery duration for resolved incidents', () => {
        const agentId = 'rec-dur-agent';
        const now = Date.now();
        monitoringService.store.saveIncident({
            id: 'INC-REC-01',
            agentId,
            tenantId: 'default-tenant',
            startedAt: new Date(now - 30000).toISOString(),
            recoveredAt: new Date(now).toISOString(),
            status: 'RESOLVED',
            durationMs: 30000
        });

        const perf = analyticsService.getAgentPerformance(agentId, '24h', 'default-tenant');
        expect(perf.averageRecoveryTime).toBe('30s');
    });

    // 9. Performance trends
    test('9. Detects IMPROVING, STABLE, or DEGRADED performance trends', () => {
        const agentId = 'trend-degraded-agent';
        // Older records (fast)
        const oldTime = new Date(Date.now() - 3600000 * 5).toISOString();
        const midTime = new Date(Date.now() - 3600000 * 4).toISOString();
        monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true, timestamp: oldTime });
        monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true, timestamp: midTime });

        // Recent records (degraded)
        const recent1 = new Date(Date.now() - 60000).toISOString();
        const recent2 = new Date(Date.now() - 10000).toISOString();
        monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 400, success: true, timestamp: recent1 });
        monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 500, success: true, timestamp: recent2 });

        const trends = analyticsService.getAgentTrends(agentId, '24h', 'default-tenant');
        expect(['DEGRADED', 'DEGRADING']).toContain(trends.latencyTrend);
        expect(trends.explanation).toContain('increased from');
    });

    // 10. Reliability metrics
    test('10. Compiles reliability metrics including MTTR and pattern summary', async () => {
        const agentId = 'reliability-agent';
        monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 120, success: true });

        const res = await request(app)
            .get(`/api/v1/analytics/agents/${agentId}/reliability?range=30d`)
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('availability');
        expect(res.body.data).toHaveProperty('incidentFrequency');
        expect(res.body.data).toHaveProperty('recurringIncidentPatterns');
    });

    // 11. Recurring problem detection
    test('11. Detects recurring latency degradation or offline incident patterns', () => {
        const agentId = 'recurring-prob-agent';
        // Add 3 slow latency checks
        for (let i = 0; i < 3; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 2000, success: true });
        }

        const problems = analyticsService.getRecurringProblems('default-tenant', agentId);
        expect(problems.length).toBeGreaterThan(0);
        expect(problems[0].problemType).toBe('REPEATED_LATENCY_DEGRADATION');
        expect(problems[0].occurrences).toBeGreaterThanOrEqual(2);
    });

    // 12. Operator attention
    test('12. OperatorAttentionService provides explicit reasons for required attention', () => {
        const agentId = 'attention-agent';
        monitoringService.store.saveStatus(agentId, {
            currentState: 'OFFLINE',
            consecutiveFailures: 3,
            availabilityPercentage: 70
        });

        const attention = analyticsService.getOperatorAttention('default-tenant');
        const item = attention.items.find(i => i.agentId === agentId);

        expect(item).toBeDefined();
        expect(item.attentionRequired).toBe(true);
        expect(item.reasons.length).toBeGreaterThan(0);
        expect(item.recommendedActions.length).toBeGreaterThan(0);
    });

    // 13. Recommendations
    test('13. Generates evidence-based operational recommendations', async () => {
        const res = await request(app)
            .get('/api/v1/analytics/recommendations')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    // 14. Activity analysis
    test('14. Analyzes hourly activity distribution for period analysis', async () => {
        const res = await request(app)
            .get('/api/v1/analytics/activity?range=24h')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('hourlyDistribution');
        expect(res.body.data).toHaveProperty('recentActivityTrend');
    });

    // 15. Capacity analysis
    test('15. Capacity Intelligence Service states NOT_AVAILABLE without fabricating hardware metrics', async () => {
        const res = await request(app)
            .get('/api/v1/analytics/capacity?agentId=TEST-AGENT-001')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.capacityAvailable).toBe(false);
        expect(res.body.data.message).toContain('Capacity metrics are not available');
        expect(res.body.data.infrastructureMetrics.cpuUsage).toBe('NOT_AVAILABLE');
        expect(res.body.data.infrastructureMetrics.memoryUsage).toBe('NOT_AVAILABLE');
    });

    // 16. Agent comparison
    test('16. Compares multiple agents on measurable fields without declaring a winner', async () => {
        const agentA = 'comp-agent-a';
        const agentB = 'comp-agent-b';
        monitoringService.store.addCheckRecord(agentA, { healthState: 'HEALTHY', durationMs: 100, success: true });
        monitoringService.store.addCheckRecord(agentB, { healthState: 'HEALTHY', durationMs: 250, success: true });

        const res = await request(app)
            .get(`/api/v1/analytics/compare?agents=${agentA},${agentB}`)
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.agentCount).toBe(2);
        expect(res.body.data.disclaimer).toContain('without ranking or declaring winners');
    });

    // 17. Insufficient-data behavior
    test('17. Fresh agent with zero history returns INSUFFICIENT_DATA status gracefully', () => {
        const freshAgent = 'brand-new-unprobed-agent';
        const perf = analyticsService.getAgentPerformance(freshAgent, '24h', 'default-tenant');

        expect(perf.status).toBe('INSUFFICIENT_DATA');
        expect(perf.availability).toBe('INSUFFICIENT_DATA');
        expect(perf.averageLatency).toBe('INSUFFICIENT_DATA');
        expect(perf.recentPerformanceTrend).toBe('INSUFFICIENT_DATA');
    });

    // 18. Unavailable-metric behavior
    test('18. Hardware capacity request returns NOT_AVAILABLE message', () => {
        const cap = analyticsService.getCapacityIntelligence('TEST-AGENT-001', 'default-tenant');
        expect(cap.infrastructureMetrics.cpuUsage).toBe('NOT_AVAILABLE');
        expect(cap.infrastructureMetrics.memoryUsage).toBe('NOT_AVAILABLE');
    });

    // 19. No fabricated metrics
    test('19. Ensures analytics engine does not invent fake CPU, memory, or throughput values', () => {
        const cap = analyticsService.getCapacityIntelligence(null, 'default-tenant');
        expect(cap.hardwareMetrics.cpuUsage).toBe('NOT_AVAILABLE');
        expect(cap.hardwareMetrics.tokenUsage).toBe('NOT_AVAILABLE');
    });

    // 20. Historical snapshot
    test('20. Creates and retrieves aggregate historical analytics snapshots', async () => {
        const createRes = await request(app)
            .post('/api/v1/analytics/snapshots')
            .set('x-tenant-id', 'test-tenant-snap')
            .expect(200);

        expect(createRes.body.success).toBe(true);
        expect(createRes.body.data).toHaveProperty('snapshotId');

        const listRes = await request(app)
            .get('/api/v1/analytics/snapshots')
            .set('x-tenant-id', 'test-tenant-snap')
            .expect(200);

        expect(listRes.body.success).toBe(true);
        expect(listRes.body.data.length).toBeGreaterThan(0);
    });

    // 21. Persistence survival
    test('21. Historical analytics snapshot survives persistence manager reload', () => {
        const pm = new PersistenceManager();
        const testService = new OperationalAnalyticsService({ persistenceManager: pm });

        const snap = testService.createHistoricalSnapshot('tenant-persist-test');
        expect(snap.snapshotId).toBeDefined();

        const storedList = testService.listHistoricalSnapshots('tenant-persist-test');
        expect(storedList.length).toBe(1);
        expect(storedList[0].snapshotId).toBe(snap.snapshotId);
    });

    // 22. Tenant isolation
    test('22. Enforces multi-tenant boundary: Tenant A cannot access Tenant B analytics', () => {
        monitoringService.store.addCheckRecord('agent-tenant-a', { healthState: 'HEALTHY', durationMs: 90, success: true }, 'tenant-A');
        monitoringService.store.addCheckRecord('agent-tenant-b', { healthState: 'HEALTHY', durationMs: 400, success: true }, 'tenant-B');

        const perfA = analyticsService.getAgentPerformance('agent-tenant-a', '24h', 'tenant-A');
        const perfB = analyticsService.getAgentPerformance('agent-tenant-a', '24h', 'tenant-B');

        expect(perfA.checkCount).toBe(1);
        expect(perfB.checkCount).toBe(0);
        expect(perfB.status).toBe('INSUFFICIENT_DATA');
    });

    // 23. RBAC
    test('23. Preserves RBAC permissions on analytics endpoints', async () => {
        const res = await request(app)
            .get('/api/v1/analytics/overview')
            .set('x-role', 'viewer')
            .expect(200);

        expect(res.body.success).toBe(true);
    });

    // 24. Correlation IDs
    test('24. Preserves X-Correlation-ID header across analytics API requests', async () => {
        const customCorr = 'corr_test_p24_999';
        const res = await request(app)
            .get('/api/v1/analytics/overview')
            .set('x-correlation-id', customCorr)
            .expect(200);

        expect(res.headers['x-correlation-id']).toBe(customCorr);
    });

    // 25. Compa analytics
    test('25. Evaluates COMPA external agent analytics accurately without fabricated metrics', async () => {
        monitoringService.store.addCheckRecord('COMPA', { healthState: 'HEALTHY', durationMs: 180, success: true });

        const res = await request(app)
            .get('/api/v1/analytics/agents/COMPA/performance')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.agentId).toBe('COMPA');
        expect(res.body.data.availability).toBe('100%');
    });

    // 26. Repa analytics
    test('26. Evaluates REPA external agent analytics accurately', async () => {
        monitoringService.store.addCheckRecord('REPA', { healthState: 'HEALTHY', durationMs: 220, success: true });

        const res = await request(app)
            .get('/api/v1/analytics/agents/REPA/performance')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.agentId).toBe('REPA');
    });

    // 27. TEST-AGENT-001 analytics
    test('27. Analyzes TEST-AGENT-001 observable performance behavior', async () => {
        monitoringService.store.addCheckRecord('TEST-AGENT-001', { healthState: 'HEALTHY', durationMs: 150, success: true });

        const res = await request(app)
            .get('/api/v1/analytics/agents/TEST-AGENT-001/performance')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.agentId).toBe('TEST-AGENT-001');
    });

    // 28. Degraded state
    test('28. Reflects DEGRADED state in agent performance scorecards', () => {
        const agentId = 'degraded-test-agent';
        monitoringService.store.saveStatus(agentId, { currentState: 'DEGRADED' });
        monitoringService.store.addCheckRecord(agentId, { healthState: 'DEGRADED', durationMs: 1800, success: true });

        const attention = analyticsService.getOperatorAttention('default-tenant');
        const item = attention.items.find(i => i.agentId === agentId);

        expect(item).toBeDefined();
        expect(item.reasons.some(r => r.includes('DEGRADED'))).toBe(true);
    });

    // 29. Offline state
    test('29. Reflects OFFLINE state and updates failure rate', () => {
        const agentId = 'offline-test-agent';
        monitoringService.store.saveStatus(agentId, { currentState: 'OFFLINE' });
        monitoringService.store.addCheckRecord(agentId, { healthState: 'OFFLINE', durationMs: 5000, success: false });

        const perf = analyticsService.getAgentPerformance(agentId, '24h', 'default-tenant');
        expect(perf.failureRate).toBe('100%');
    });

    // 30. Recovery state
    test('30. Restores TEST-AGENT-001 and verified agents to HEALTHY state after testing', () => {
        monitoringService.store.saveStatus('TEST-AGENT-001', { currentState: 'HEALTHY', consecutiveFailures: 0 });
        const status = monitoringService.store.getStatus('TEST-AGENT-001');
        expect(status.currentState).toBe('HEALTHY');
    });

    // 31. Regression against Phase 22
    test('31. Regression test: Phase 22 persistent historical monitoring endpoints remain operational', async () => {
        const res = await request(app)
            .get('/api/v1/monitoring/agents/TEST-AGENT-001/history?range=24h')
            .expect(200);

        expect(res.body.success).toBe(true);
    });

    // 32. Regression against Phase 23
    test('32. Regression test: Phase 23 predictive risk engine endpoints remain operational', async () => {
        const res = await request(app)
            .get('/api/v1/intelligence/agents/TEST-AGENT-001/risk')
            .expect(200);

        expect(res.body.success).toBe(true);
    });
});
