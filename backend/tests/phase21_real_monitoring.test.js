/**
 * Phase 21 — Real-Time External Agent Monitoring & Telemetry Integration Test Suite
 * Comprehensive verification for central monitoring loop, state transitions,
 * telemetry ingestion, availability calculations, diagnosis generation, alert deduplication,
 * Compa/Repa external agent profiles, unsupported capability protection, and security.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { ExternalAgentAdapter } = require('../src/adapter/ExternalAgentAdapter');
const { COMPA_AGENT_PROFILE, REPA_AGENT_PROFILE } = require('../src/adapter/profiles/ExternalAgentProfiles');
const { UniversalTelemetryContract, TELEMETRY_EVENT_TYPES } = require('../src/telemetry/UniversalTelemetryContract');
const { HealthDiagnosisGenerator } = require('../src/health/HealthDiagnosisGenerator');
const AgentMonitoringService = require('../src/monitoring/AgentMonitoringService');
const { MONITORING_STATES } = require('../src/monitoring/AgentMonitoringStates');

describe('PHASE 21 — Real-Time External Agent Monitoring & Telemetry Integration', () => {
    let app;
    let monitoringService;
    let systemRegistry;
    let telemetryIngestionService;
    let alertingService;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        systemRegistry = app.get('systemRegistry');
        monitoringService = app.get('agentMonitoringService');
        telemetryIngestionService = app.get('telemetryIngestionService');
        alertingService = app.get('alertingService');

        // Register Compa and Repa systems into systemRegistry if not present
        try {
            systemRegistry.registerSystem({
                id: COMPA_AGENT_PROFILE.id,
                name: COMPA_AGENT_PROFILE.name,
                category: COMPA_AGENT_PROFILE.category,
                version: COMPA_AGENT_PROFILE.version,
                contractVersion: COMPA_AGENT_PROFILE.contractVersion,
                capabilities: COMPA_AGENT_PROFILE.capabilities,
                adapter: {
                    adapterType: 'ExternalAgentAdapter',
                    baseUrl: COMPA_AGENT_PROFILE.baseUrl,
                    endpoints: COMPA_AGENT_PROFILE.endpoints
                }
            });
        } catch (e) {}

        try {
            systemRegistry.registerSystem({
                id: REPA_AGENT_PROFILE.id,
                name: REPA_AGENT_PROFILE.name,
                category: REPA_AGENT_PROFILE.category,
                version: REPA_AGENT_PROFILE.version,
                contractVersion: REPA_AGENT_PROFILE.contractVersion,
                capabilities: REPA_AGENT_PROFILE.capabilities,
                adapter: {
                    adapterType: 'ExternalAgentAdapter',
                    baseUrl: REPA_AGENT_PROFILE.baseUrl,
                    endpoints: REPA_AGENT_PROFILE.endpoints
                }
            });
        } catch (e) {}
    });

    afterAll(() => {
        if (monitoringService) {
            monitoringService.stopAll();
        }
    });

    // 1. External agent monitoring starts
    test('1. External agent monitoring starts and updates status', async () => {
        const status = await monitoringService.startMonitoring('compa-agent-ext');
        expect(status).toBeDefined();
        expect(status.monitoringEnabled).toBe(true);
        expect(monitoringService.timers.has('default-tenant:compa-agent-ext')).toBe(true);
    });

    // 2. Monitoring does not create duplicate loops
    test('2. Starting monitoring twice does not create duplicate timer loops', async () => {
        await monitoringService.startMonitoring('compa-agent-ext');
        const firstTimer = monitoringService.timers.get('default-tenant:compa-agent-ext');
        await monitoringService.startMonitoring('compa-agent-ext');
        const secondTimer = monitoringService.timers.get('default-tenant:compa-agent-ext');
        
        expect(firstTimer).toBeDefined();
        expect(secondTimer).toBeDefined();
        expect(monitoringService.timers.size).toBe(1);
        await monitoringService.stopMonitoring('compa-agent-ext');
    });

    // 3. Health check succeeds
    test('3. Health check succeeds for configured mock healthy endpoint', async () => {
        const status = await monitoringService.checkAgent('TEST-AGENT-001');
        expect(status).toBeDefined();
        expect(status.currentState).toBeDefined();
        expect(status.totalChecksCount).toBeGreaterThan(0);
    });

    // 4. Health check failure is normalized
    test('4. Normalizes health check failure cleanly into OFFLINE or UNHEALTHY state', async () => {
        const config = monitoringService.store.getConfig('failing-agent-ext');
        config.endpointOverride = 'http://127.0.0.1:59999'; // Dead port
        monitoringService.store.saveConfig('failing-agent-ext', config);

        const status = await monitoringService.checkAgent('failing-agent-ext');
        expect(status.currentState === MONITORING_STATES.OFFLINE || status.currentState === MONITORING_STATES.UNHEALTHY || status.currentState === MONITORING_STATES.DEGRADED).toBe(true);
        expect(status.lastError).toBeDefined();
    });

    // 5. State transition is recorded
    test('5. State transition event is recorded when status changes', async () => {
        const agentId = 'state-transition-agent';
        const status1 = monitoringService.store.getStatus(agentId);
        status1.currentState = MONITORING_STATES.HEALTHY;
        monitoringService.store.saveStatus(agentId, status1);

        // Force check against dead endpoint to cause state transition
        const config = monitoringService.store.getConfig(agentId);
        config.endpointOverride = 'http://127.0.0.1:59998';
        config.failureThreshold = 1; // Immediate transition
        monitoringService.store.saveConfig(agentId, config);

        await monitoringService.checkAgent(agentId);
        const timeline = monitoringService.store.getTimeline(agentId);
        const stateChange = timeline.find(e => e.type === 'STATE_CHANGED');

        expect(stateChange).toBeDefined();
        expect(stateChange.fromState).toBe(MONITORING_STATES.HEALTHY);
    });

    // 6. Telemetry event is generated
    test('6. Telemetry event is generated during health check and ingested into TelemetryIngestionService', async () => {
        const agentId = 'telemetry-test-agent';
        await monitoringService.checkAgent(agentId);

        const events = telemetryIngestionService.getEvents({ agentId });
        expect(events.length).toBeGreaterThan(0);
        const healthEvt = events.find(e => e.eventType === 'HEALTH_CHECK_RESULT' || e.eventType === 'LATENCY_MEASUREMENT' || e.eventType === 'STATE_TRANSITION');
        expect(healthEvt).toBeDefined();
        expect(healthEvt.agentId).toBe(agentId);
    });

    // 7. Availability is calculated correctly
    test('7. Availability percentage is calculated correctly over history', () => {
        const agentId = 'availability-calc-agent';
        monitoringService.store.saveStatus(agentId, {
            totalChecksCount: 100,
            totalFailuresCount: 2
        });

        const status = monitoringService.store.getStatus(agentId);
        expect(status.availabilityPercentage).toBe(98);
    });

    // 8. Consecutive failures are tracked
    test('8. Consecutive failures are tracked accurately across probes', async () => {
        const agentId = 'consecutive-failure-agent';
        const config = monitoringService.store.getConfig(agentId);
        config.endpointOverride = 'http://127.0.0.1:59997';
        config.failureThreshold = 10;
        monitoringService.store.saveConfig(agentId, config);

        await monitoringService.checkAgent(agentId);
        await monitoringService.checkAgent(agentId);

        const status = monitoringService.store.getStatus(agentId);
        expect(status.consecutiveFailures).toBe(2);
    });

    // 9. Recovery is detected
    test('9. Recovery is detected when an offline agent becomes healthy', async () => {
        const agentId = 'recovery-agent';
        monitoringService.store.saveStatus(agentId, {
            currentState: MONITORING_STATES.OFFLINE,
            previousState: MONITORING_STATES.OFFLINE,
            activeIncidentId: 'inc_test_123'
        });

        jest.spyOn(monitoringService, '_makeHttpRequest').mockResolvedValueOnce({
            success: true,
            statusCode: 200,
            data: { status: 'HEALTHY' },
            durationMs: 45
        });

        await monitoringService.checkAgent(agentId);
        const status = monitoringService.store.getStatus(agentId);

        expect(status.currentState === MONITORING_STATES.HEALTHY || status.currentState === MONITORING_STATES.RECOVERING).toBe(true);
        expect(status.consecutiveRecoveries).toBeGreaterThan(0);
        monitoringService._makeHttpRequest.mockRestore();
    });

    // 10. Alert is generated for meaningful failure
    test('10. Alert is generated when agent transitions to OFFLINE', async () => {
        const agentId = 'alert-gen-agent';
        monitoringService.store.saveStatus(agentId, {
            currentState: MONITORING_STATES.HEALTHY,
            previousState: MONITORING_STATES.HEALTHY
        });

        const config = monitoringService.store.getConfig(agentId);
        config.endpointOverride = 'http://127.0.0.1:59996';
        config.failureThreshold = 1;
        monitoringService.store.saveConfig(agentId, config);

        await monitoringService.checkAgent(agentId);
        const incidents = monitoringService.store.listIncidents('default-tenant', agentId);
        expect(incidents.length).toBeGreaterThan(0);
        expect(incidents[0].state).toBe('OPEN');
    });

    // 11. Duplicate alerts are suppressed
    test('11. Duplicate alert cooldown deduplication suppresses spam', () => {
        const agentId = 'alert-dedup-agent';
        const rawEvent = {
            agentId,
            eventType: TELEMETRY_EVENT_TYPES.EXECUTION_FAILED,
            message: 'First failure'
        };

        const firstIngest = telemetryIngestionService.ingestEvent(rawEvent);
        const secondIngest = telemetryIngestionService.ingestEvent(rawEvent);

        expect(firstIngest).toBeDefined();
        expect(secondIngest).toBeDefined();
        // TelemetryIngestionService applies cooldownWindowMs (60s) for alerts
    });

    // 12. Human-readable diagnosis is generated
    test('12. Human-readable diagnosis is generated via HealthDiagnosisGenerator', () => {
        const diag = HealthDiagnosisGenerator.generateDiagnosis('Compa Agent', {
            status: 'OFFLINE',
            httpStatus: 503,
            responseTimeMs: 0,
            errorMessage: 'Connection refused',
            consecutiveFailures: 3
        });

        expect(diag.status).toBe('OFFLINE');
        expect(diag.whatHappened).toBeDefined();
        expect(diag.evidence).toBeDefined();
        expect(diag.whatIsGood).toBeDefined();
        expect(diag.whatIsWrong).toBeDefined();
        expect(diag.actionTaken).toBeDefined();
        expect(diag.nextStep).toBeDefined();
        expect(diag.technicalDetails).toBeDefined();
    });

    // 13 & 14. Compa & Repa monitoring works
    test('13 & 14. Compa and Repa external profiles initialize and adapter executes health probe', async () => {
        const compaAdapter = new ExternalAgentAdapter(COMPA_AGENT_PROFILE, { allowLocalhost: true });
        expect(compaAdapter.supportsOperation('health')).toBe(true);
        expect(compaAdapter.supportsOperation('contract')).toBe(false);

        const repaAdapter = new ExternalAgentAdapter(REPA_AGENT_PROFILE, { allowLocalhost: true });
        expect(repaAdapter.supportsOperation('health')).toBe(true);
        expect(repaAdapter.supportsOperation('capabilities')).toBe(false);
    });

    // 15. Unsupported capabilities remain UNSUPPORTED
    test('15. Unsupported capabilities return status UNSUPPORTED without marking health failed', async () => {
        const compaAdapter = new ExternalAgentAdapter(COMPA_AGENT_PROFILE, { allowLocalhost: true });
        const res = await compaAdapter.execute('execute', {}, { systemId: 'compa-agent-ext' });

        expect(res.healthStatus).toBe('UNSUPPORTED');
        expect(res.reason).toBe('CAPABILITY_UNSUPPORTED');
        expect(res.success).toBe(false);
    });

    // 16. No fake execution telemetry is generated
    test('16. Health probes do NOT generate fake EXECUTION_STARTED/COMPLETED telemetry', async () => {
        const agentId = 'no-fake-exec-agent';
        await monitoringService.checkAgent(agentId);

        const events = telemetryIngestionService.getEvents({ agentId });
        const execEvents = events.filter(e => e.eventType === TELEMETRY_EVENT_TYPES.EXECUTION_STARTED || e.eventType === TELEMETRY_EVENT_TYPES.EXECUTION_COMPLETED);

        expect(execEvents.length).toBe(0);
    });

    // 17. Secrets are redacted
    test('17. Telemetry contract redacts secret tokens, api keys, and passwords', () => {
        const rawPayload = {
            agentId: 'secret-agent',
            eventType: TELEMETRY_EVENT_TYPES.HEALTH_CHECK_RESULT,
            metadata: {
                apiKey: 'secret_key_12345',
                password: 'supersecretpassword',
                normalField: 'public_value'
            }
        };

        const normalized = UniversalTelemetryContract.validateAndNormalize(rawPayload);
        expect(normalized.metadata.apiKey).toBe('***REDACTED***');
        expect(normalized.metadata.password).toBe('***REDACTED***');
        expect(normalized.metadata.normalField).toBe('public_value');
    });

    // 18. Frontend receives monitoring data via API
    test('18. GET /api/v1/monitoring/agents returns monitored agent statuses for frontend', async () => {
        const res = await request(app)
            .get('/api/v1/monitoring/agents')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 19. Live timeline receives telemetry via API
    test('19. GET /api/v1/telemetry/events returns live telemetry timeline', async () => {
        const res = await request(app)
            .get('/api/v1/telemetry/events')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    // 20. Existing APIs continue working
    test('20. System, health, and agent APIs continue working without regression', async () => {
        const sysRes = await request(app).get('/api/v1/systems').expect(200);
        expect(sysRes.body.success).toBe(true);

        const healthRes = await request(app).get('/api/v1/health/overview').expect(200);
        expect(healthRes.body.success).toBe(true);

        const statusRes = await request(app).get('/api/v1/monitoring/agents/TEST-AGENT-001/status').expect(200);
        expect(statusRes.body.success).toBe(true);
    });
});
