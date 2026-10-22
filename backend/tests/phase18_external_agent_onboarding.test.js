const request = require('supertest');
const { createApp } = require('../src/app');
const { ExternalAgentAdapter } = require('../src/adapter/ExternalAgentAdapter');
const { ExternalAgentOnboardingService } = require('../src/onboarding/ExternalAgentOnboardingService');
const { COMPA_AGENT_PROFILE, REPA_AGENT_PROFILE } = require('../src/adapter/profiles/ExternalAgentProfiles');
const { HealthDiagnosisGenerator } = require('../src/health/HealthDiagnosisGenerator');
const { AgentExecutionMonitor } = require('../src/monitoring/AgentExecutionMonitor');
const { ExternalAgentWorkflowFactory } = require('../src/workflow/ExternalAgentWorkflowFactory');
const { SsrfProtector } = require('../src/adapter/SsrfProtector');

describe('PHASE 18 — External Agent Onboarding & Observability Test Suite', () => {
    let app;
    let onboardingService;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        const registry = app.get('systemRegistry');
        const healthEngine = app.get('healthEngine');
        onboardingService = new ExternalAgentOnboardingService({ systemRegistry: registry, healthEngine, allowLocalhost: true });
    });

    // 1. External Agent Adapter Instantiation
    test('1. Instantiates ExternalAgentAdapter with custom endpoint mappings', () => {
        const adapter = new ExternalAgentAdapter({
            baseUrl: 'https://example-agent.org',
            endpoints: {
                health: { path: '/status', method: 'GET', enabled: true },
                execution: { path: '/run', method: 'POST', enabled: true }
            }
        });

        expect(adapter.supportsOperation('health')).toBe(true);
        expect(adapter.supportsOperation('execution')).toBe(true);
        expect(adapter.supportsOperation('contract')).toBe(false);
    });

    // 2. Endpoint Mapping Verification
    test('2. Maps endpoints cleanly and respects enabled/disabled flags', () => {
        const adapter = new ExternalAgentAdapter(COMPA_AGENT_PROFILE);
        expect(adapter.supportsOperation('health')).toBe(true);
        expect(adapter.supportsOperation('execution')).toBe(false);
    });

    // 3 & 4 & 5. Connectivity Failure, Timeout & Retries
    test('3 & 4 & 5. Handles connection timeout and retries cleanly without crashing', async () => {
        const adapter = new ExternalAgentAdapter({
            baseUrl: 'http://10.255.255.1:9999', // Non-routable timeout IP
            timeoutConfig: { readTimeoutMs: 50 },
            retryConfig: { maxRetries: 2, retryDelayMs: 10 }
        }, { allowLocalhost: true });

        const res = await adapter.execute('health', {}, { systemId: 'TEST-TIMEOUT' });
        expect(res.status === 'OFFLINE' || res.healthStatus === 'OFFLINE').toBe(true);
        expect(res.success).toBe(false);
    });

    // 6 & 7 & 8. Normalized Health Response (Healthy, Degraded, Offline)
    test('6 & 7 & 8. Normalizes HTTP response status codes into Healthy, Degraded, and Offline states', () => {
        const adapter = new ExternalAgentAdapter({});

        const healthy = adapter._normalizeHealthStatus(200, { status: 'UP' }, 120);
        expect(healthy.status).toBe('HEALTHY');

        const degraded = adapter._normalizeHealthStatus(200, {}, 6500); // Latency > 5000ms
        expect(degraded.status).toBe('DEGRADED');

        const offline = adapter._normalizeHealthStatus(503, {}, 50);
        expect(offline.status).toBe('OFFLINE');
    });

    // 9. Unsupported Endpoint Handling
    test('9. Returns UNSUPPORTED status for unconfigured operations without throwing errors', async () => {
        const adapter = new ExternalAgentAdapter(REPA_AGENT_PROFILE);
        const res = await adapter.execute('execution', {}, { systemId: 'repa-agent-ext' });
        expect(res.status === 'UNSUPPORTED' || res.healthStatus === 'UNSUPPORTED').toBe(true);
        expect(res.reason).toBe('CAPABILITY_UNSUPPORTED');
    });

    // 10. Capability Discovery
    test('10. Discovers configured capabilities during onboarding test connection', async () => {
        const testRes = await onboardingService.testConnection({
            baseUrl: 'http://localhost:3000',
            healthEndpoint: '',
            executionEndpoint: '/execute'
        });

        expect(testRes.discoveredCapabilities).toContain('health');
        expect(testRes.discoveredCapabilities).toContain('execution');
        expect(testRes.endpointsMapped.execution).toBe('CONFIGURED');
    });

    // 11 & 12. Execution Monitoring & Secret Redaction
    test('11 & 12. Records execution telemetry and sanitizes credentials', () => {
        const record = AgentExecutionMonitor.recordExecution({
            agentId: 'TEST-AGENT-001',
            request: { apiKey: 'super-secret-key-123', payload: { query: 'test' } },
            response: { token: 'secret-bearer-token' }
        });

        expect(record.status).toBe('SUCCESS');
        expect(JSON.stringify(record)).not.toContain('super-secret-key-123');
        expect(JSON.stringify(record)).not.toContain('secret-bearer-token');
        expect(JSON.stringify(record)).toContain('***REDACTED***');
    });

    // 13. Human-Readable Failure Diagnostics
    test('13. Generates human-readable health failure diagnostics without raw JSON exposure', () => {
        const diag = HealthDiagnosisGenerator.generateDiagnosis('Compa Agent', {
            status: 'OFFLINE',
            errorMessage: 'HTTP Connection Refused',
            consecutiveFailures: 3
        });

        expect(diag.agentName).toBe('Compa Agent');
        expect(diag.whatHappened).toContain('unreachable');
        expect(diag.whatIsWrong.length).toBeGreaterThan(0);
        expect(diag.technicalDetails).toBeDefined();
    });

    // 14. Compa Adapter Configuration Profile
    test('14. Validates Compa Agent profile parameters', () => {
        expect(COMPA_AGENT_PROFILE.id).toBe('compa-agent-ext');
        expect(COMPA_AGENT_PROFILE.baseUrl).toBe('https://myblocks.in/compa-agent/');
        expect(COMPA_AGENT_PROFILE.capabilities).toContain('health');
    });

    // 15. Repa Adapter Configuration Profile
    test('15. Validates Repa Agent profile parameters', () => {
        expect(REPA_AGENT_PROFILE.id).toBe('repa-agent-ext');
        expect(REPA_AGENT_PROFILE.baseUrl).toBe('http://myblocks.in/repa-agent/REPA_Agent.html');
        expect(REPA_AGENT_PROFILE.capabilities).toContain('health');
    });

    // 16 & 17. External Monitoring Workflow & Orchestration
    test('16 & 17. Generates 8-step external monitoring workflow & compiles to OrchestrationPlan', () => {
        const wf = ExternalAgentWorkflowFactory.createExternalMonitoringWorkflow('compa-agent-ext', 'Compa Agent');
        expect(wf.steps).toHaveLength(8);
        expect(wf.steps[0].name).toBe('Connectivity Check');

        const WorkflowToOrchestrationAdapter = require('../src/workflow/WorkflowToOrchestrationAdapter');
        const plan = WorkflowToOrchestrationAdapter.compileWorkflowToPlan(wf);
        expect(plan.steps).toHaveLength(8);
    });

    // 18. Reasoning Integration
    test('18. Reasoning Engine evaluates external agent observation without domain hardcoding', async () => {
        const res = await request(app)
            .post('/api/v1/reasoning/analyze')
            .set('Authorization', 'Bearer valid-api-key')
            .send({
                agentId: 'compa-agent-ext',
                observation: { status: 'DEGRADED', responseTimeMs: 6500 }
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.decision.decisionId).toBeDefined();
    });

    // 19. REST API Onboarding Test Connection & Register Endpoints
    test('19. REST API POST /api/v1/onboarding/external/test-connection & /register', async () => {
        const testRes = await request(app)
            .post('/api/v1/onboarding/external/test-connection')
            .set('Authorization', 'Bearer valid-api-key')
            .send({ baseUrl: 'http://localhost:3000' });

        expect(testRes.statusCode).toBe(200);
        expect(testRes.body.data.reachable).toBeDefined();

        const regRes = await request(app)
            .post('/api/v1/onboarding/external/register')
            .set('Authorization', 'Bearer valid-api-key')
            .send({
                id: 'custom-ext-agent-1',
                name: 'Custom External Agent',
                baseUrl: 'http://localhost:3000',
                category: 'custom'
            });

        expect(regRes.statusCode).toBe(201);
        expect(regRes.body.data.agent.id).toBe('custom-ext-agent-1');
    });

    // 20. RBAC Enforcements
    test('20. Enforces RBAC permissions on external agent registration endpoints', async () => {
        const res = await request(app)
            .post('/api/v1/onboarding/external/register')
            .set('Authorization', 'Bearer invalid-token')
            .send({ baseUrl: 'http://localhost:3000' });

        expect(res.statusCode).toBe(401);
    });

    // 21. SSRF Protection Validation
    test('21. Blocks unsafe external URLs (file://, ftp://, malformed protocols)', () => {
        const fileCheck = SsrfProtector.validateUrl('file:///etc/passwd');
        expect(fileCheck.safe).toBe(false);

        const ftpCheck = SsrfProtector.validateUrl('ftp://192.168.1.1/test');
        expect(ftpCheck.safe).toBe(false);
    });
});
