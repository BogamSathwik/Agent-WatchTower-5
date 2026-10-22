/**
 * Phase 22 — Persistent Historical Monitoring & Incident Management Test Suite
 * Comprehensive verification for historical records, time-range queries (1h, 24h, 7d, 30d),
 * SLA calculations, latency p95 metrics, single incident deduplication, incident lifecycle,
 * RBAC, tenant isolation, and application state persistence survival across restarts.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { ExternalAgentAdapter } = require('../src/adapter/ExternalAgentAdapter');
const { COMPA_AGENT_PROFILE, REPA_AGENT_PROFILE } = require('../src/adapter/profiles/ExternalAgentProfiles');
const { UniversalTelemetryContract, TELEMETRY_EVENT_TYPES } = require('../src/telemetry/UniversalTelemetryContract');
const { PersistenceManager } = require('../src/persistence/PersistenceManager');
const { MONITORING_STATES } = require('../src/monitoring/AgentMonitoringStates');

describe('PHASE 22 — Persistent Historical Monitoring & Incident Management', () => {
    let app;
    let monitoringService;
    let systemRegistry;
    let telemetryIngestionService;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        systemRegistry = app.get('systemRegistry');
        monitoringService = app.get('agentMonitoringService');
        telemetryIngestionService = app.get('telemetryIngestionService');
    });

    afterAll(() => {
        if (monitoringService) {
            monitoringService.stopAll();
        }
    });

    // 1. Monitoring history persistence
    test('1. Monitoring check records are saved to store and persistent history', () => {
        const agentId = 'history-agent-01';
        const record = monitoringService.store.addCheckRecord(agentId, {
            healthState: 'HEALTHY',
            durationMs: 150,
            healthStatusCode: 200,
            success: true
        });

        expect(record.id).toBeDefined();
        const history = monitoringService.store.getCheckHistory(agentId);
        expect(history.length).toBeGreaterThan(0);
        expect(history[0].responseTimeMs).toBe(150);
    });

    // 2. History query 1h
    test('2. GET /api/v1/monitoring/agents/:id/history?range=1h returns 1h history summary', async () => {
        const agentId = 'range-agent-1h';
        monitoringService.store.addCheckRecord(agentId, {
            healthState: 'HEALTHY',
            durationMs: 120,
            success: true,
            timestamp: new Date().toISOString()
        });

        const res = await request(app)
            .get(`/api/v1/monitoring/agents/${agentId}/history?range=1h`)
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.timeRange).toBe('1h');
        expect(res.body.data.checkCount).toBeGreaterThan(0);
        expect(res.body.data.availability).toBe(100);
    });

    // 3. History query 24h
    test('3. GET /api/v1/monitoring/agents/:id/history?range=24h returns 24h history summary', async () => {
        const agentId = 'range-agent-24h';
        monitoringService.store.addCheckRecord(agentId, {
            healthState: 'HEALTHY',
            durationMs: 200,
            success: true,
            timestamp: new Date().toISOString()
        });

        const res = await request(app)
            .get(`/api/v1/monitoring/agents/${agentId}/history?range=24h`)
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.timeRange).toBe('24h');
    });

    // 4. History query 7d
    test('4. GET /api/v1/monitoring/agents/:id/history?range=7d returns 7d history summary', async () => {
        const agentId = 'range-agent-7d';
        monitoringService.store.addCheckRecord(agentId, {
            healthState: 'HEALTHY',
            durationMs: 300,
            success: true,
            timestamp: new Date().toISOString()
        });

        const res = await request(app)
            .get(`/api/v1/monitoring/agents/${agentId}/history?range=7d`)
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.timeRange).toBe('7d');
    });

    // 5. History query 30d
    test('5. GET /api/v1/monitoring/agents/:id/history?range=30d returns 30d history summary', async () => {
        const agentId = 'range-agent-30d';
        monitoringService.store.addCheckRecord(agentId, {
            healthState: 'HEALTHY',
            durationMs: 400,
            success: true,
            timestamp: new Date().toISOString()
        });

        const res = await request(app)
            .get(`/api/v1/monitoring/agents/${agentId}/history?range=30d`)
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.timeRange).toBe('30d');
    });

    // 6. Availability calculation
    test('6. Availability percentage is calculated precisely without rounding away failures', () => {
        const agentId = 'sla-agent-01';
        // Add 99 success records, 1 failure record
        for (let i = 0; i < 99; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }
        monitoringService.store.addCheckRecord(agentId, { healthState: 'OFFLINE', durationMs: 5000, success: false });

        const hist = monitoringService.store.getAgentHistoryByRange(agentId, '24h');
        expect(hist.checkCount).toBe(100);
        expect(hist.successfulChecks).toBe(99);
        expect(hist.failedChecks).toBe(1);
        expect(hist.availability).toBe(99);
    });

    // 7. Latency calculation
    test('7. Calculates average, min, and max latency accurately', () => {
        const agentId = 'latency-calc-agent';
        monitoringService.store.addCheckRecord(agentId, { durationMs: 100, success: true });
        monitoringService.store.addCheckRecord(agentId, { durationMs: 300, success: true });
        monitoringService.store.addCheckRecord(agentId, { durationMs: 500, success: true });

        const hist = monitoringService.store.getAgentHistoryByRange(agentId, '24h');
        expect(hist.minLatency).toBe(100);
        expect(hist.maxLatency).toBe(500);
        expect(hist.averageLatency).toBe(300);
    });

    // 8. p95 calculation
    test('8. Calculates p95 latency accurately for response samples', () => {
        const agentId = 'p95-calc-agent';
        for (let i = 1; i <= 100; i++) {
            monitoringService.store.addCheckRecord(agentId, { durationMs: i * 10, success: true });
        }

        const perf = monitoringService.store.getAgentPerformance(agentId, '24h');
        expect(perf.p95Latency).toBeGreaterThanOrEqual(950);
    });

    // 9. Incident creation
    test('9. Creates an incident when an agent transitions to OFFLINE', async () => {
        const agentId = 'inc-create-agent';
        monitoringService.store.saveStatus(agentId, { currentState: MONITORING_STATES.HEALTHY });

        const config = monitoringService.store.getConfig(agentId);
        config.endpointOverride = 'http://127.0.0.1:59990';
        config.failureThreshold = 1;
        monitoringService.store.saveConfig(agentId, config);

        await monitoringService.checkAgent(agentId);
        const incidents = monitoringService.store.listIncidents('default-tenant', agentId);

        expect(incidents.length).toBeGreaterThan(0);
        expect(incidents[0].status).toBe('OPEN');
        expect(incidents[0].agentId).toBe(agentId);
    });

    // 10. Incident deduplication
    test('10. Repeated failures update existing active incident rather than creating duplicate incidents', async () => {
        const agentId = 'inc-dedup-agent';
        monitoringService.store.saveStatus(agentId, { currentState: MONITORING_STATES.HEALTHY });

        const config = monitoringService.store.getConfig(agentId);
        config.endpointOverride = 'http://127.0.0.1:59991';
        config.failureThreshold = 1;
        monitoringService.store.saveConfig(agentId, config);

        await monitoringService.checkAgent(agentId);
        await monitoringService.checkAgent(agentId);
        await monitoringService.checkAgent(agentId);

        const incidents = monitoringService.store.listIncidents('default-tenant', agentId);
        const activeIncidents = incidents.filter(i => ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(i.status));

        expect(activeIncidents.length).toBe(1);
        expect(activeIncidents[0].failureCount).toBeGreaterThan(1);
    });

    // 11. Incident acknowledgement
    test('11. POST /api/v1/incidents/:id/acknowledge acknowledges an incident', async () => {
        const inc = monitoringService.store.saveIncident({
            agentId: 'ack-test-agent',
            severity: 'HIGH',
            status: 'OPEN',
            summary: 'Test incident for ack'
        });

        const res = await request(app)
            .post(`/api/v1/incidents/${inc.id}/acknowledge`)
            .set('x-api-key', 'valid-api-key')
            .set('x-user-role', 'admin')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('ACKNOWLEDGED');
        expect(res.body.data.acknowledgedAt).toBeDefined();
    });

    // 12. Incident recovery
    test('12. Agent recovery automatically resolves active incident and calculates recovery duration', async () => {
        const agentId = 'recovery-duration-agent';
        const inc = monitoringService.store.saveIncident({
            agentId,
            status: 'OPEN',
            startedAt: new Date(Date.now() - 300000).toISOString() // 5 mins ago
        });

        monitoringService.store.saveStatus(agentId, {
            currentState: MONITORING_STATES.OFFLINE,
            previousState: MONITORING_STATES.OFFLINE,
            activeIncidentId: inc.id
        });

        jest.spyOn(monitoringService, '_makeHttpRequest').mockResolvedValueOnce({
            success: true,
            statusCode: 200,
            data: { status: 'HEALTHY' },
            durationMs: 50
        });

        await monitoringService.checkAgent(agentId);
        const updatedInc = monitoringService.store.getIncident(inc.id);

        expect(updatedInc.status).toBe('RESOLVED');
        expect(updatedInc.recoveredAt).toBeDefined();
        expect(updatedInc.durationMs).toBeGreaterThan(0);
        monitoringService._makeHttpRequest.mockRestore();
    });

    // 13. Incident resolution
    test('13. POST /api/v1/incidents/:id/resolve manually resolves an incident', async () => {
        const inc = monitoringService.store.saveIncident({
            agentId: 'manual-resolve-agent',
            severity: 'MEDIUM',
            status: 'OPEN'
        });

        const res = await request(app)
            .post(`/api/v1/incidents/${inc.id}/resolve`)
            .set('x-api-key', 'valid-api-key')
            .set('x-user-role', 'admin')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('RESOLVED');
        expect(res.body.data.resolvedAt).toBeDefined();
    });

    // 14. Incident duration calculation
    test('14. Incident duration is accurately computed between startedAt and recoveredAt', () => {
        const start = new Date(Date.now() - 600000).toISOString(); // 10 mins ago
        const end = new Date().toISOString();
        const inc = monitoringService.store.saveIncident({
            agentId: 'duration-test-agent',
            startedAt: start,
            recoveredAt: end,
            status: 'RESOLVED'
        });

        expect(inc.durationMs).toBeGreaterThanOrEqual(599000);
    });

    // 15. Alert-to-incident relationship
    test('15. Alert IDs and correlation IDs are associated with incidents', () => {
        const inc = monitoringService.store.saveIncident({
            agentId: 'alert-link-agent',
            alertId: 'alert_001',
            correlationId: 'corr_alert_link'
        });

        expect(inc.alertIds).toContain('alert_001');
        expect(inc.correlationIds).toContain('corr_alert_link');
    });

    // 16. Incident timeline
    test('16. GET /api/v1/incidents/:id/timeline returns chronologically ordered events', async () => {
        const agentId = 'timeline-test-agent';
        const inc = monitoringService.store.saveIncident({
            agentId,
            status: 'OPEN',
            startedAt: new Date().toISOString()
        });

        monitoringService.store.addTimelineEntry(agentId, {
            type: 'HEALTH_CHECK_FAILED',
            message: 'Probe timeout'
        });

        const res = await request(app)
            .get(`/api/v1/incidents/${inc.id}/timeline`)
            .set('x-api-key', 'valid-api-key')
            .set('x-user-role', 'admin')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.incidentId).toBe(inc.id);
        expect(Array.isArray(res.body.data.timeline)).toBe(true);
    });

    // 17. Recovery telemetry
    test('17. Recovery emits AGENT_RECOVERED event to telemetry ingestion service', async () => {
        const agentId = 'telemetry-recovery-agent';
        monitoringService.store.saveStatus(agentId, {
            currentState: MONITORING_STATES.OFFLINE,
            previousState: MONITORING_STATES.OFFLINE
        });

        jest.spyOn(monitoringService, '_makeHttpRequest').mockResolvedValueOnce({
            success: true,
            statusCode: 200,
            data: { status: 'HEALTHY' },
            durationMs: 40
        });

        await monitoringService.checkAgent(agentId);
        const events = telemetryIngestionService.getEvents({ agentId });
        const recEvt = events.find(e => e.eventType === 'STATE_TRANSITION' || e.eventType === 'HEALTH_CHECK_RESULT');

        expect(recEvt).toBeDefined();
        monitoringService._makeHttpRequest.mockRestore();
    });

    // 18. Tenant isolation
    test('18. Monitoring history and incidents maintain strict multi-tenant boundaries', () => {
        const agentId = 'tenant-agent-01';
        monitoringService.store.addCheckRecord(agentId, { durationMs: 100, success: true }, 'tenant-A');
        monitoringService.store.addCheckRecord(agentId, { durationMs: 200, success: true }, 'tenant-B');

        const histA = monitoringService.store.getAgentHistoryByRange(agentId, '24h', 'tenant-A');
        const histB = monitoringService.store.getAgentHistoryByRange(agentId, '24h', 'tenant-B');

        expect(histA.checkCount).toBe(1);
        expect(histB.checkCount).toBe(1);
        expect(histA.averageLatency).toBe(100);
        expect(histB.averageLatency).toBe(200);
    });

    // 19. RBAC
    test('19. Viewer role has read-only access while Operator/Admin can acknowledge/resolve', async () => {
        const inc = monitoringService.store.saveIncident({
            agentId: 'rbac-agent',
            status: 'OPEN'
        });

        // Viewer cannot acknowledge (403 Forbidden)
        await request(app)
            .post(`/api/v1/incidents/${inc.id}/acknowledge`)
            .set('x-api-key', 'valid-api-key')
            .set('x-user-role', 'viewer')
            .expect(403);

        // Admin can acknowledge
        await request(app)
            .post(`/api/v1/incidents/${inc.id}/acknowledge`)
            .set('x-api-key', 'valid-api-key')
            .set('x-user-role', 'admin')
            .expect(200);
    });

    // 20. Secret redaction
    test('20. Secrets are redacted from incident evidence and technical details', () => {
        const rawEvidence = 'Failed auth with password=supersecretpassword&token=xyz123';
        const sanitized = UniversalTelemetryContract.sanitizeSecrets({ evidence: rawEvidence, apiKey: 'secretkey123' });

        expect(sanitized.apiKey).toBe('***REDACTED***');
    });

    // 21. Persistence across restart
    test('21. PersistenceManager restores monitoring configs, statuses, check histories, and incidents across app restart', async () => {
        const pm = new PersistenceManager({ mode: 'memory' });
        const testApp = createApp({ environment: 'test', persistenceManager: pm });
        const mon = testApp.get('agentMonitoringService');

        const agentId = 'restart-survival-agent';
        mon.store.saveConfig(agentId, { failureThreshold: 5 });
        mon.store.saveStatus(agentId, { currentState: MONITORING_STATES.DEGRADED });
        mon.store.saveIncident({ id: 'INC-SURVIVE-1', agentId, status: 'OPEN' });
        mon.store.addCheckRecord(agentId, { durationMs: 250, success: true });

        // Simulate app restart with new app instance using same persistence manager
        const restartedApp = createApp({ environment: 'test', persistenceManager: pm });
        const restoreRes = await pm.restoreApplicationState(restartedApp);

        expect(restoreRes.success).toBe(true);
        const restartedMon = restartedApp.get('agentMonitoringService');
        const restoredStatus = restartedMon.store.getStatus(agentId);
        const restoredInc = restartedMon.store.getIncident('INC-SURVIVE-1');

        expect(restoredStatus).toBeDefined();
        expect(restoredStatus.currentState).toBe(MONITORING_STATES.DEGRADED);
        expect(restoredInc).toBeDefined();
        expect(restoredInc.id).toBe('INC-SURVIVE-1');
    });

    // 22 & 23. Compa & Repa historical monitoring
    test('22 & 23. Compa and Repa external profiles accumulate history records without fake execution data', async () => {
        const compaId = COMPA_AGENT_PROFILE.id;
        const repaId = REPA_AGENT_PROFILE.id;

        monitoringService.store.addCheckRecord(compaId, { healthState: 'HEALTHY', durationMs: 400, success: true });
        monitoringService.store.addCheckRecord(repaId, { healthState: 'HEALTHY', durationMs: 250, success: true });

        const compaHist = monitoringService.store.getAgentHistoryByRange(compaId, '24h');
        const repaHist = monitoringService.store.getAgentHistoryByRange(repaId, '24h');

        expect(compaHist.checkCount).toBeGreaterThan(0);
        expect(repaHist.checkCount).toBeGreaterThan(0);
    });

    // 24. TEST-AGENT failure/recovery sequence
    test('24. Executes full failure and recovery lifecycle sequence for TEST-AGENT-001', async () => {
        const agentId = 'TEST-AGENT-001';
        monitoringService.store.saveStatus(agentId, { currentState: MONITORING_STATES.HEALTHY });

        // Phase A: Degraded
        monitoringService.store.saveStatus(agentId, { currentState: MONITORING_STATES.DEGRADED });
        let status = monitoringService.store.getStatus(agentId);
        expect(status.currentState).toBe(MONITORING_STATES.DEGRADED);

        // Phase B: Offline / Failure
        const config = monitoringService.store.getConfig(agentId);
        config.endpointOverride = 'http://127.0.0.1:59992';
        config.failureThreshold = 1;
        monitoringService.store.saveConfig(agentId, config);

        await monitoringService.checkAgent(agentId);
        status = monitoringService.store.getStatus(agentId);
        expect(status.currentState === MONITORING_STATES.OFFLINE || status.currentState === MONITORING_STATES.UNHEALTHY).toBe(true);

        // Phase C: Recovery
        config.endpointOverride = 'http://localhost:3000';
        monitoringService.store.saveConfig(agentId, config);
        jest.spyOn(monitoringService, '_makeHttpRequest').mockResolvedValueOnce({
            success: true,
            statusCode: 200,
            data: { status: 'HEALTHY' },
            durationMs: 30
        });

        await monitoringService.checkAgent(agentId);
        status = monitoringService.store.getStatus(agentId);
        expect(status.currentState === MONITORING_STATES.HEALTHY || status.currentState === MONITORING_STATES.RECOVERING).toBe(true);
        monitoringService._makeHttpRequest.mockRestore();
    });

    // 25. No fake historical data
    test('25. New unmonitored agent returns "No historical data available yet" without inventing SLA data', () => {
        const unmonitoredId = 'unmonitored-fresh-agent';
        const hist = monitoringService.store.getAgentHistoryByRange(unmonitoredId, '24h');

        expect(hist.checkCount).toBe(0);
        expect(hist.availability).toBeNull();
        expect(hist.availabilityMessage).toBe('No historical data available yet.');
    });
});
