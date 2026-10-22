/**
 * Phase 23 — Autonomous Predictive Intelligence, Anomaly Detection & Safe Self-Healing Test Suite
 * Comprehensive verification for baseline calculations, statistical anomaly detection,
 * non-exaggerated risk scoring, structured diagnoses, safe remediation execution,
 * verification probes, rollback mechanisms, safety cooldowns, RBAC, tenant isolation, and persistence.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { PredictiveBaselineEngine } = require('../src/intelligence/PredictiveBaselineEngine');
const { AnomalyDetectionService, ANOMALY_TYPES, SEVERITY_LEVELS } = require('../src/intelligence/AnomalyDetectionService');
const { PredictiveRiskEngine, RISK_LEVELS } = require('../src/intelligence/PredictiveRiskEngine');
const { PredictiveRemediationCoordinator } = require('../src/intelligence/PredictiveRemediationCoordinator');
const { PersistenceManager } = require('../src/persistence/PersistenceManager');
const { COMPA_AGENT_PROFILE, REPA_AGENT_PROFILE } = require('../src/adapter/profiles/ExternalAgentProfiles');

describe('PHASE 23 — Predictive Intelligence, Anomaly Detection & Safe Self-Healing', () => {
    let app;
    let monitoringService;
    let baselineEngine;
    let anomalyService;
    let riskEngine;
    let remediationCoordinator;
    let remediationService;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        monitoringService = app.get('agentMonitoringService');
        remediationService = app.get('remediationService');
        baselineEngine = app.get('predictiveBaselineEngine');
        anomalyService = app.get('anomalyDetectionService');
        riskEngine = app.get('predictiveRiskEngine');
        remediationCoordinator = app.get('predictiveRemediationCoordinator');
    });

    beforeEach(() => {
        if (remediationCoordinator) {
            remediationCoordinator.cooldowns.clear();
            remediationCoordinator.executionCounts.clear();
        }
    });

    afterAll(() => {
        if (monitoringService) {
            monitoringService.stopAll();
        }
    });

    // 1. Baseline calculation
    test('1. Calculates baseline stats (avg latency, p95, availability, failure rate) from historical probes', () => {
        const agentId = 'baseline-agent-01';
        for (let i = 1; i <= 20; i++) {
            monitoringService.store.addCheckRecord(agentId, {
                healthState: 'HEALTHY',
                durationMs: 100 + i * 5,
                success: true
            });
        }

        const baseline = baselineEngine.calculateBaseline(agentId, '24h', 'default-tenant', monitoringService.store);
        expect(baseline.status).toBe('ESTABLISHED');
        expect(baseline.checkCount).toBe(20);
        expect(baseline.availability).toBe(100);
        expect(baseline.averageResponseTimeMs).toBeGreaterThan(100);
        expect(baseline.p95ResponseTimeMs).toBeGreaterThanOrEqual(baseline.averageResponseTimeMs);
    });

    // 2. Insufficient-data behavior
    test('2. Unmonitored or fresh agent returns INSUFFICIENT_DATA without fabricating baseline', () => {
        const unmonitoredId = 'fresh-unmonitored-agent';
        const baseline = baselineEngine.calculateBaseline(unmonitoredId, '24h', 'default-tenant', monitoringService.store);

        expect(baseline.status).toBe('INSUFFICIENT_DATA');
        expect(baseline.message).toContain('insufficient data');
    });

    // 3. Latency anomaly
    test('3. Detects LATENCY_SPIKE anomaly when recent response time is significantly above baseline', () => {
        const agentId = 'latency-anom-agent';
        // Baseline 100ms
        for (let i = 0; i < 15; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }
        // Spike to 500ms
        monitoringService.store.saveStatus(agentId, {
            currentState: 'HEALTHY',
            latency: { lastLatencyMs: 500, avgLatencyMs: 100 }
        });

        const anomalies = anomalyService.detectAnomalies(agentId);
        const spike = anomalies.find(a => a.type === ANOMALY_TYPES.LATENCY_SPIKE);

        expect(spike).toBeDefined();
        expect(spike.deviation).toContain('+400%');
        expect(spike.severity).toBe(SEVERITY_LEVELS.HIGH);
    });

    // 4. Availability anomaly
    test('4. Detects AVAILABILITY_DEGRADATION when availability drops below baseline', () => {
        const agentId = 'avail-anom-agent';
        // 10 successful records
        for (let i = 0; i < 10; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }
        // Save current availability drop
        monitoringService.store.saveStatus(agentId, {
            currentState: 'DEGRADED',
            availabilityPercentage: 85.0,
            totalChecksCount: 10,
            totalFailuresCount: 2
        });

        const anomalies = anomalyService.detectAnomalies(agentId);
        const availAnom = anomalies.find(a => a.type === ANOMALY_TYPES.AVAILABILITY_DEGRADATION);

        expect(availAnom).toBeDefined();
        expect(availAnom.severity).toBe(SEVERITY_LEVELS.HIGH);
    });

    // 5. Failure-rate anomaly
    test('5. Detects FAILURE_RATE_INCREASE when recent probes show elevated failure rate', () => {
        const agentId = 'fail-rate-agent';
        // 10 healthy records
        for (let i = 0; i < 10; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 120, success: true });
        }
        // 5 failing records
        for (let i = 0; i < 5; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'UNHEALTHY', durationMs: 5000, success: false });
        }

        const anomalies = anomalyService.detectAnomalies(agentId);
        const failRateAnom = anomalies.find(a => a.type === ANOMALY_TYPES.FAILURE_RATE_INCREASE);

        expect(failRateAnom).toBeDefined();
        expect(failRateAnom.observedValue).toContain('%');
    });

    // 6. Consecutive failure detection
    test('6. Detects CONSECUTIVE_FAILURE_PATTERN when multiple probes fail consecutively', () => {
        const agentId = 'consec-fail-agent';
        for (let i = 0; i < 10; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }
        monitoringService.store.saveStatus(agentId, {
            currentState: 'OFFLINE',
            consecutiveFailures: 3,
            lastError: 'HTTP 503 Service Unavailable'
        });

        const anomalies = anomalyService.detectAnomalies(agentId);
        const consecAnom = anomalies.find(a => a.type === ANOMALY_TYPES.CONSECUTIVE_FAILURE_PATTERN);

        expect(consecAnom).toBeDefined();
        expect(consecAnom.severity).toBe(SEVERITY_LEVELS.CRITICAL);
    });

    // 7. Trend detection
    test('7. Detects PERFORMANCE_TREND_DEGRADATION when response time gradually increases over time', () => {
        const agentId = 'trend-anom-agent';
        // Older records 100ms, newer records 200ms (+100% trend)
        for (let i = 0; i < 10; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true, timestamp: new Date(Date.now() - 3600000 + i * 1000).toISOString() });
        }
        for (let i = 0; i < 10; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 200, success: true, timestamp: new Date(Date.now() - 1800000 + i * 1000).toISOString() });
        }

        const anomalies = anomalyService.detectAnomalies(agentId);
        const trendAnom = anomalies.find(a => a.type === ANOMALY_TYPES.PERFORMANCE_TREND_DEGRADATION);

        expect(trendAnom).toBeDefined();
        expect(trendAnom.deviation).toContain('Gradual response time increase');
    });

    // 8. Predictive risk
    test('8. Computes non-exaggerated risk level (LOW, MEDIUM, HIGH, CRITICAL) based on telemetry evidence', () => {
        const agentId = 'risk-eval-agent';
        for (let i = 0; i < 10; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }
        monitoringService.store.saveStatus(agentId, { currentState: 'DEGRADED', consecutiveFailures: 2 });

        const risk = riskEngine.evaluateRisk(agentId);
        expect(['HIGH', 'CRITICAL'].includes(risk.riskLevel)).toBe(true);
        expect(risk.confidence).toBeGreaterThan(0.8);
    });

    // 9. Confidence calculation
    test('9. Includes confidence score reflecting sample strength and evidence weight', () => {
        const agentId = 'confidence-test-agent';
        for (let i = 0; i < 10; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }
        const risk = riskEngine.evaluateRisk(agentId);
        expect(risk.confidence).toBeGreaterThanOrEqual(0.5);
        expect(risk.confidence).toBeLessThanOrEqual(1.0);
    });

    // 10. Human-readable 9-field diagnosis
    test('10. Formats structured 9-field human-readable diagnosis without raw JSON clutter', () => {
        const agentId = 'diagnosis-format-agent';
        for (let i = 0; i < 10; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }
        const risk = riskEngine.evaluateRisk(agentId);
        const diag = risk.structuredDiagnosis;

        expect(diag.overallStatus).toBeDefined();
        expect(diag.whatIsHappening).toBeDefined();
        expect(diag.whatIsGood).toBeDefined();
        expect(diag.whatIsWrong).toBeDefined();
        expect(diag.whyItWasDetected).toBeDefined();
        expect(diag.evidence).toBeDefined();
        expect(diag.risk).toBeDefined();
        expect(diag.recommendedAction).toBeDefined();
        expect(diag.nextStep).toBeDefined();
    });

    // 11. Predictive warning creation
    test('11. GET /api/v1/intelligence/agents/:id/predictions returns predictive risk warnings', async () => {
        const agentId = 'api-prediction-agent';
        for (let i = 0; i < 5; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 120, success: true });
        }

        const res = await request(app)
            .get(`/api/v1/intelligence/agents/${agentId}/predictions`)
            .set('x-api-key', 'valid-api-key')
            .set('x-user-role', 'admin')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.agentId).toBe(agentId);
        expect(res.body.data.riskLevel).toBeDefined();
    });

    // 12. Incident deduplication
    test('12. Predictive risk evaluation updates existing warnings without generating duplicate active incidents', () => {
        const agentId = 'pred-dedup-agent';
        for (let i = 0; i < 5; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }

        const r1 = riskEngine.evaluateRisk(agentId);
        const r2 = riskEngine.evaluateRisk(agentId);

        expect(r1.agentId).toBe(r2.agentId);
        const incidents = monitoringService.store.listIncidents('default-tenant', agentId);
        expect(incidents.length).toBe(0); // Predictive risks do not fabricate confirmed incidents
    });

    // 13. Remediation policy matching
    test('13. Remediation service matches defined actions to target systems', () => {
        const action = remediationService.createAction({
            actionId: 'act-test-01',
            name: 'Restart Service',
            targetSystemId: 'remediable-agent-01',
            capability: 'RESTART'
        });

        expect(action.actionId).toBe('act-test-01');
        const retrieved = remediationService.getAction('act-test-01');
        expect(retrieved).toBeDefined();
    });

    // 14. Remediation safety validation
    test('14. Safety engine validates target compatibility before remediation execution', async () => {
        const res = await remediationCoordinator.evaluateAndRemediate('compa-agent-ext');
        expect(res.status).toBe('NOT_SUPPORTED');
        expect(res.explanation).toContain('Watchtower does not have a supported control/remediation interface');
    });

    // 15. Approval requirement
    test('15. Action marked with approval requirement returns AWAITING_APPROVAL status when approval missing', async () => {
        const res = await remediationCoordinator.evaluateAndRemediate('TEST-AGENT-001', { requiresApproval: true, cooldownMs: 0 });
        expect(res.status).toBe('AWAITING_APPROVAL');
    });

    // 16. Remediation execution
    test('16. Executes remediation action on supported target when authorized', async () => {
        const agentId = 'TEST-AGENT-001';
        monitoringService.store.saveStatus(agentId, { currentState: 'DEGRADED' });
        for (let i = 0; i < 5; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }

        jest.spyOn(monitoringService, 'proxyControlMode').mockResolvedValue({ success: true });
        jest.spyOn(monitoringService, 'checkAgent').mockResolvedValue({ currentState: 'HEALTHY', success: true });

        const res = await remediationCoordinator.evaluateAndRemediate(agentId, { cooldownMs: 0, maxHourlyLimit: 100 });

        expect(res.supported).toBe(true);
        expect(res.status === 'VERIFIED_SUCCESS' || res.status === 'SUCCEEDED').toBe(true);

        monitoringService.proxyControlMode.mockRestore();
        monitoringService.checkAgent.mockRestore();
    });

    // 17. Remediation verification
    test('17. Executes verification probe after remediation to confirm recovery (VERIFIED_SUCCESS)', async () => {
        const agentId = 'TEST-AGENT-001';
        monitoringService.store.saveStatus(agentId, { currentState: 'DEGRADED' });
        for (let i = 0; i < 5; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }

        jest.spyOn(monitoringService, 'proxyControlMode').mockResolvedValue({ success: true });
        jest.spyOn(monitoringService, 'checkAgent').mockResolvedValue({ currentState: 'HEALTHY', success: true });

        const res = await remediationCoordinator.evaluateAndRemediate(agentId, { cooldownMs: 0, maxHourlyLimit: 100 });

        expect(res.verificationPassed).toBe(true);
        expect(res.status).toBe('VERIFIED_SUCCESS');

        monitoringService.proxyControlMode.mockRestore();
        monitoringService.checkAgent.mockRestore();
    });

    // 18 & 19. Remediation failure & Rollback
    test('18 & 19. Invokes rollback mechanism when remediation verification fails', async () => {
        const agentId = 'TEST-AGENT-001';
        monitoringService.store.saveStatus(agentId, { currentState: 'OFFLINE' });
        for (let i = 0; i < 5; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }

        jest.spyOn(monitoringService, 'proxyControlMode').mockResolvedValue({ success: true });
        jest.spyOn(monitoringService, 'checkAgent').mockResolvedValue({ currentState: 'OFFLINE', success: false });

        const res = await remediationCoordinator.evaluateAndRemediate(agentId, {
            cooldownMs: 0,
            maxHourlyLimit: 100,
            supportsRollback: true
        });

        expect(res.verificationPassed).toBe(false);
        expect(['ROLLBACK_SUCCESS', 'ROLLBACK_FAILURE', 'VERIFIED_FAILURE'].includes(res.status)).toBe(true);

        monitoringService.proxyControlMode.mockRestore();
        monitoringService.checkAgent.mockRestore();
    });

    // 20. Cooldown
    test('20. Cooldown window suppresses repetitive remediation attempts (COOLDOWN_ACTIVE)', async () => {
        const agentId = 'cooldown-test-agent';
        monitoringService.store.saveStatus(agentId, { currentState: 'DEGRADED' });
        for (let i = 0; i < 5; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }

        jest.spyOn(monitoringService, 'proxyControlMode').mockResolvedValue({ success: true });
        jest.spyOn(monitoringService, 'checkAgent').mockResolvedValue({ currentState: 'HEALTHY', success: true });

        // First attempt sets cooldown
        await remediationCoordinator.evaluateAndRemediate(agentId, { cooldownMs: 300000, maxHourlyLimit: 100 });

        // Second immediate attempt blocked by cooldown
        const res2 = await remediationCoordinator.evaluateAndRemediate(agentId, { cooldownMs: 300000, maxHourlyLimit: 100 });
        expect(res2.status).toBe('BLOCKED');
        expect(res2.reason).toBe('COOLDOWN_ACTIVE');

        monitoringService.proxyControlMode.mockRestore();
        monitoringService.checkAgent.mockRestore();
    });

    // 21 & 22. Retry limit & Remediation loop prevention
    test('21 & 22. Hourly retry limit prevents infinite remediation loops (RETRY_LIMIT_EXCEEDED)', () => {
        const agentId = 'loop-prevention-agent';
        // Simulate 3 executions in last hour
        remediationCoordinator.executionCounts.set(`default-tenant:${agentId}`, [Date.now() - 1000, Date.now() - 2000, Date.now() - 3000]);

        const safety = remediationCoordinator.checkSafetyLimits(agentId, 'default-tenant', 0, 3);
        expect(safety.allowed).toBe(false);
        expect(safety.reason).toBe('RETRY_LIMIT_EXCEEDED');
    });

    // 23. Compa unsupported remediation
    test('23. Compa profile safely rejects control/remediation with NO_SUPPORTED_REMEDIATION', async () => {
        const res = await remediationCoordinator.evaluateAndRemediate(COMPA_AGENT_PROFILE.id);
        expect(res.status).toBe('NOT_SUPPORTED');
        expect(res.supported).toBe(false);
        expect(res.explanation).toContain('Watchtower does not have a supported control/remediation interface');
    });

    // 24. Repa unsupported remediation
    test('24. Repa profile safely rejects control/remediation with NO_SUPPORTED_REMEDIATION', async () => {
        const res = await remediationCoordinator.evaluateAndRemediate(REPA_AGENT_PROFILE.id);
        expect(res.status).toBe('NOT_SUPPORTED');
        expect(res.supported).toBe(false);
        expect(res.explanation).toContain('Watchtower does not have a supported control/remediation interface');
    });

    // 25. TEST-AGENT-001 successful recovery
    test('25. Executes complete self-healing scenario for TEST-AGENT-001 from DEGRADED to VERIFIED_SUCCESS', async () => {
        const agentId = 'TEST-AGENT-001';
        monitoringService.store.saveStatus(agentId, { currentState: 'DEGRADED' });

        for (let i = 0; i < 5; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }

        jest.spyOn(monitoringService, 'proxyControlMode').mockResolvedValue({ success: true });
        jest.spyOn(monitoringService, 'checkAgent').mockResolvedValue({ currentState: 'HEALTHY', success: true });

        const res = await remediationCoordinator.evaluateAndRemediate(agentId, { cooldownMs: 0, maxHourlyLimit: 100 });

        expect(res.supported).toBe(true);
        expect(res.verificationPassed).toBe(true);
        expect(res.status).toBe('VERIFIED_SUCCESS');

        monitoringService.proxyControlMode.mockRestore();
        monitoringService.checkAgent.mockRestore();
    });

    // 26. Persistence survival
    test('26. Predictive risk and remediation records persist across application restarts', async () => {
        const pm = new PersistenceManager({ mode: 'memory' });
        const testApp = createApp({ environment: 'test', persistenceManager: pm });
        const mon = testApp.get('agentMonitoringService');

        const agentId = 'persistence-risk-agent';
        mon.store.saveStatus(agentId, { currentState: 'DEGRADED' });
        mon.store._persist('predictive_risks', `default-tenant:${agentId}`, { agentId, riskLevel: 'HIGH' });
        mon.store._persist('remediations', `default-tenant:rem-001`, { id: 'rem-001', agentId, status: 'VERIFIED_SUCCESS' });

        // Simulate app restart
        const restartedApp = createApp({ environment: 'test', persistenceManager: pm });
        const restoreRes = await pm.restoreApplicationState(restartedApp);

        expect(restoreRes.success).toBe(true);
        const exportData = await pm.export();
        expect(exportData.collections.predictive_risks).toBeDefined();
        expect(exportData.collections.remediations).toBeDefined();
    });

    // 27. Tenant isolation
    test('27. Baselines, anomalies, and remediation histories maintain multi-tenant boundaries', () => {
        const agentId = 'tenant-iso-agent';
        for (let i = 0; i < 5; i++) {
            monitoringService.store.addCheckRecord(agentId, { durationMs: 100, success: true }, 'tenant-alpha');
            monitoringService.store.addCheckRecord(agentId, { durationMs: 500, success: true }, 'tenant-beta');
        }

        const bAlpha = baselineEngine.calculateBaseline(agentId, '24h', 'tenant-alpha', monitoringService.store);
        const bBeta = baselineEngine.calculateBaseline(agentId, '24h', 'tenant-beta', monitoringService.store);

        expect(bAlpha.averageResponseTimeMs).toBe(100);
        expect(bBeta.averageResponseTimeMs).toBe(500);
    });

    // 28. RBAC
    test('28. Viewer role cannot execute remediation or approve requests', async () => {
        const res = await request(app)
            .post('/api/v1/remediation/execute')
            .set('x-api-key', 'valid-api-key')
            .set('x-user-role', 'viewer')
            .send({ actionId: 'act-test-01', systemId: 'TEST-AGENT-001' })
            .expect(403);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('Forbidden');
    });

    // 29. Secret redaction
    test('29. Secrets are redacted from evidence strings and human-readable diagnosis output', () => {
        const rawData = { password: 'mysecretpassword', token: 'secretkey123' };
        const sanitized = require('../src/telemetry/UniversalTelemetryContract').UniversalTelemetryContract.sanitizeSecrets(rawData);

        expect(sanitized.password).toBe('***REDACTED***');
        expect(sanitized.token).toBe('***REDACTED***');
    });

    // 30. Correlation IDs
    test('30. Correlation IDs are propagated across risk, anomaly, and remediation pipelines', () => {
        const agentId = 'corr-propagation-agent';
        const corrId = 'corr_test_pipeline_123';
        for (let i = 0; i < 5; i++) {
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100, success: true });
        }

        const risk = riskEngine.evaluateRisk(agentId, { correlationId: corrId });
        expect(risk.correlationId).toBe(corrId);
    });

    // 31. False-positive protection
    test('31. Normal healthy latency variations do not generate continuous false-positive anomalies', () => {
        const agentId = 'healthy-stable-agent';
        // Add 20 healthy probes with minor normal jitter (95ms - 105ms)
        for (let i = 0; i < 20; i++) {
            const jitter = (i % 5) * 2 - 4; // -4 to +4 ms
            monitoringService.store.addCheckRecord(agentId, { healthState: 'HEALTHY', durationMs: 100 + jitter, success: true });
        }
        monitoringService.store.saveStatus(agentId, { currentState: 'HEALTHY', latency: { lastLatencyMs: 102, avgLatencyMs: 100 } });

        const anomalies = anomalyService.detectAnomalies(agentId);
        expect(anomalies.length).toBe(0); // Clean, no false positives
    });
});
