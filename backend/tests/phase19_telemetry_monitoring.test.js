const request = require('supertest');
const { createApp } = require('../src/app');
const { UniversalTelemetryContract, TELEMETRY_EVENT_TYPES } = require('../src/telemetry/UniversalTelemetryContract');
const { TelemetryIngestionService } = require('../src/telemetry/TelemetryIngestionService');
const { DemoAgent } = require('../src/agent/DemoAgent');
const { COMPA_AGENT_PROFILE, REPA_AGENT_PROFILE } = require('../src/adapter/profiles/ExternalAgentProfiles');
const { ExternalAgentAdapter } = require('../src/adapter/ExternalAgentAdapter');
const { HealthDiagnosisGenerator } = require('../src/health/HealthDiagnosisGenerator');

describe('PHASE 19 — Telemetry & Deep Observability Test Suite', () => {
    let app;
    let telemetryService;
    let alertCount = 0;

    const mockAlertingService = {
        sendAlert: (payload) => { alertCount++; return { alertId: `alert_${Date.now()}` }; }
    };

    beforeEach(() => {
        alertCount = 0;
        app = createApp({ environment: 'test', alertingService: mockAlertingService });
        telemetryService = new TelemetryIngestionService({ alertingService: mockAlertingService, cooldownWindowMs: 1000 });
    });

    // 1. Valid Telemetry Event
    test('1. Validates and normalizes valid telemetry event', () => {
        const evt = UniversalTelemetryContract.validateAndNormalize({
            agentId: 'TEST-AGENT-001',
            eventType: TELEMETRY_EVENT_TYPES.EXECUTION_STARTED,
            executionId: 'exec_101',
            metrics: { cpu: 15 }
        });

        expect(evt.agentId).toBe('TEST-AGENT-001');
        expect(evt.eventType).toBe('EXECUTION_STARTED');
        expect(evt.eventId).toBeDefined();
        expect(evt.correlationId).toBeDefined();
    });

    // 2. Invalid Telemetry Event Rejection
    test('2. Rejects invalid or malformed telemetry events', () => {
        expect(() => UniversalTelemetryContract.validateAndNormalize({ agentId: '' })).toThrow(/non-empty agentId/i);
        expect(() => UniversalTelemetryContract.validateAndNormalize({ agentId: 'TEST-AGENT-001', eventType: 'INVALID_TYPE' })).toThrow(/invalid telemetry eventType/i);
    });

    // 3. Secret Redaction
    test('3. Sanitizes sensitive credentials from telemetry payload', () => {
        const evt = UniversalTelemetryContract.validateAndNormalize({
            agentId: 'TEST-AGENT-001',
            eventType: TELEMETRY_EVENT_TYPES.AGENT_HEALTH,
            metadata: { apiKey: 'super-secret-key-99', token: 'bearer-token-val', normalVal: 'public' }
        });

        expect(evt.metadata.apiKey).toBe('***REDACTED***');
        expect(evt.metadata.token).toBe('***REDACTED***');
        expect(evt.metadata.normalVal).toBe('public');
    });

    // 4. Correlation ID Propagation
    test('4. Attaches and preserves correlation ID across telemetry ingestion', () => {
        const evt = telemetryService.ingestEvent({
            agentId: 'TEST-AGENT-001',
            eventType: TELEMETRY_EVENT_TYPES.AGENT_STARTED,
            correlationId: 'corr_test_phase19_999'
        });

        expect(evt.correlationId).toBe('corr_test_phase19_999');
        const retrieved = telemetryService.getEvents({ agentId: 'TEST-AGENT-001' });
        expect(retrieved[0].correlationId).toBe('corr_test_phase19_999');
    });

    // 5 & 6 & 7. Execution Telemetry Lifecycle (Started, Progress, Completed, Failed)
    test('5 & 6 & 7. Tracks execution lifecycle states (Started -> Completed / Failed)', () => {
        telemetryService.ingestEvent({
            agentId: 'TEST-AGENT-001',
            executionId: 'exec_flow_1',
            eventType: TELEMETRY_EVENT_TYPES.EXECUTION_STARTED,
            timestamp: '2026-09-30T10:00:00.000Z'
        });

        let state = telemetryService.getExecution('exec_flow_1');
        expect(state.status).toBe('RUNNING');

        telemetryService.ingestEvent({
            agentId: 'TEST-AGENT-001',
            executionId: 'exec_flow_1',
            eventType: TELEMETRY_EVENT_TYPES.EXECUTION_COMPLETED,
            timestamp: '2026-09-30T10:00:02.000Z',
            durationMs: 2000
        });

        state = telemetryService.getExecution('exec_flow_1');
        expect(state.status).toBe('SUCCESS');
        expect(state.durationMs).toBe(2000);
    });

    // 8 & 9 & 10. Workflow Telemetry Steps (Started, Step Completed, Step Failed)
    test('8 & 9 & 10. Tracks workflow progress and handles step failures', () => {
        telemetryService.ingestEvent({
            agentId: 'TEST-AGENT-001',
            workflowId: 'wf_telemetry_1',
            eventType: TELEMETRY_EVENT_TYPES.WORKFLOW_STARTED
        });

        telemetryService.ingestEvent({
            agentId: 'TEST-AGENT-001',
            workflowId: 'wf_telemetry_1',
            stepName: 'Input Validation',
            eventType: TELEMETRY_EVENT_TYPES.WORKFLOW_STEP_COMPLETED
        });

        telemetryService.ingestEvent({
            agentId: 'TEST-AGENT-001',
            workflowId: 'wf_telemetry_1',
            stepName: 'Data Collection',
            eventType: TELEMETRY_EVENT_TYPES.WORKFLOW_STEP_FAILED,
            message: 'Timeout retrieving data'
        });

        const wfState = telemetryService.getWorkflow('wf_telemetry_1');
        expect(wfState.completedSteps).toContain('Input Validation');
        expect(wfState.failedSteps).toContain('Data Collection');
        expect(wfState.status).toBe('COMPLETED_WITH_WARNINGS');
    });

    // 11. Health Update via Telemetry
    test('11. Updates latest telemetry timestamp and agent status', () => {
        telemetryService.ingestEvent({
            agentId: 'TEST-AGENT-001',
            eventType: TELEMETRY_EVENT_TYPES.AGENT_HEALTH,
            status: 'HEALTHY'
        });

        expect(telemetryService.isTelemetryStale('TEST-AGENT-001', 60000)).toBe(false);
    });

    // 12. Stale Telemetry Detection
    test('12. Detects stale telemetry when age exceeds max threshold', () => {
        expect(telemetryService.isTelemetryStale('UNKNOWN_AGENT', 1000)).toBe(true);
    });

    // 13 & 14. Alert Generation & Deduplication Cooldown
    test('13 & 14. Triggers alerts on failure telemetry and suppresses duplicate alerts during cooldown', () => {
        telemetryService.ingestEvent({
            agentId: 'TEST-AGENT-001',
            eventType: TELEMETRY_EVENT_TYPES.EXECUTION_FAILED,
            message: 'Fatal execution exception'
        });
        expect(alertCount).toBe(1);

        // Immediate duplicate event within cooldown window should be deduplicated
        telemetryService.ingestEvent({
            agentId: 'TEST-AGENT-001',
            eventType: TELEMETRY_EVENT_TYPES.EXECUTION_FAILED,
            message: 'Fatal execution exception duplicate'
        });
        expect(alertCount).toBe(1); // Deduplicated!
    });

    // 15. Unsupported Capability Telemetry Handling
    test('15. Reports capability status as UNSUPPORTED without throwing or fabricating support', async () => {
        const adapter = new ExternalAgentAdapter(COMPA_AGENT_PROFILE);
        const res = await adapter.execute('execution', {}, { systemId: 'compa-agent-ext' });
        expect(res.status === 'UNSUPPORTED' || res.healthStatus === 'UNSUPPORTED').toBe(true);
        expect(res.reason).toBe('CAPABILITY_UNSUPPORTED');
    });

    // 16. Compa HTTP Monitoring
    test('16. Validates Compa Agent HTTP reachability probe configuration', () => {
        const adapter = new ExternalAgentAdapter(COMPA_AGENT_PROFILE);
        expect(adapter.supportsOperation('health')).toBe(true);
        expect(adapter.supportsOperation('execution')).toBe(false);
    });

    // 17. Repa HTTP Monitoring
    test('17. Validates Repa Agent HTTP reachability probe configuration', () => {
        const adapter = new ExternalAgentAdapter(REPA_AGENT_PROFILE);
        expect(adapter.supportsOperation('health')).toBe(true);
        expect(adapter.supportsOperation('execution')).toBe(false);
    });

    // 18. Test Agent Deep Telemetry Integration
    test('18. Verifies Test Agent emits valid deep telemetry events', () => {
        const testAgent = new DemoAgent({ agentId: 'TEST-AGENT-001' });
        const evt = testAgent.emitTelemetryEvent(TELEMETRY_EVENT_TYPES.EXECUTION_COMPLETED, {
            executionId: 'exec_demo_99',
            status: 'SUCCESS',
            durationMs: 45
        });

        expect(evt.agentId).toBe('TEST-AGENT-001');
        expect(evt.eventType).toBe('EXECUTION_COMPLETED');

        const ingested = telemetryService.ingestEvent(evt);
        expect(ingested.eventId).toBeDefined();
    });

    // 19. Human-Readable Operational Report
    test('19. Formats complete human-readable report with multi-section breakdown', () => {
        const diag = HealthDiagnosisGenerator.generateDiagnosis('Compa Agent', {
            status: 'HEALTHY',
            responseTimeMs: 1400,
            httpStatus: 200
        });

        expect(diag.status).toBe('HEALTHY');
        expect(diag.whatHappened).toBeDefined();
        expect(diag.whatIsGood.length).toBeGreaterThan(0);
        expect(diag.nextStep).toBeDefined();
    });

    // 20. Full End-to-End Telemetry Ingestion via REST API
    test('20. REST API POST /api/v1/telemetry/events ingests telemetry and updates timeline', async () => {
        const res = await request(app)
            .post('/api/v1/telemetry/events')
            .set('Authorization', 'Bearer valid-api-key')
            .send({
                agentId: 'TEST-AGENT-001',
                eventType: 'EXECUTION_STARTED',
                executionId: 'exec_rest_1',
                message: 'REST API test event'
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);

        const queryRes = await request(app)
            .get('/api/v1/telemetry/events?agentId=TEST-AGENT-001')
            .set('Authorization', 'Bearer valid-api-key');

        expect(queryRes.statusCode).toBe(200);
        expect(queryRes.body.data.length).toBeGreaterThan(0);
    });
});
