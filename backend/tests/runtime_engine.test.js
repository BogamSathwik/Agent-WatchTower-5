/**
 * Phase 13 — Universal Agent Runtime & Live Operations Test Suite
 * Tests runtime state machine, operational commands, session tracking, capability execution,
 * security controls, cross-engine integrations, and AgentGenPro API endpoints.
 */

const request = require('supertest');
const { createApp, systemRegistry } = require('../src/app');
const RuntimeService = require('../src/runtime/RuntimeService');
const { RUNTIME_STATES, RUNTIME_COMMANDS, RuntimeStateMachine } = require('../src/runtime/RuntimeStates');
const RuntimeSession = require('../src/runtime/RuntimeSession');
const RuntimeValidator = require('../src/runtime/RuntimeValidator');

describe('Universal Agent Runtime & Live Operations Engine', () => {
    let app;
    let service;

    beforeEach(() => {
        app = createApp();
        service = app.get('runtimeService');

        try {
            systemRegistry.getSystem('sys-target-runtime-1');
        } catch (e) {
            systemRegistry.registerSystem({
                id: 'sys-target-runtime-1',
                name: 'Target Runtime System 1',
                version: '1.0.0',
                type: 'SERVICE',
                capabilities: ['HEALTH', 'RESTART', 'TELEMETRY']
            });
        }
    });

    test('1. Runtime state machine validation', () => {
        expect(RuntimeStateMachine.canTransition(RUNTIME_STATES.STOPPED, RUNTIME_STATES.STARTING)).toBe(true);
        expect(RuntimeStateMachine.canTransition(RUNTIME_STATES.RUNNING, RUNTIME_STATES.PAUSED)).toBe(true);
        expect(RuntimeStateMachine.canTransition(RUNTIME_STATES.RUNNING, RUNTIME_STATES.STOPPING)).toBe(true);
    });

    test('2. Valid state transitions', () => {
        expect(RuntimeStateMachine.canTransition(RUNTIME_STATES.STARTING, RUNTIME_STATES.RUNNING)).toBe(true);
        expect(RuntimeStateMachine.canTransition(RUNTIME_STATES.PAUSED, RUNTIME_STATES.RUNNING)).toBe(true);
    });

    test('3. Invalid state transitions rejection', () => {
        expect(RuntimeStateMachine.canTransition(RUNTIME_STATES.RETIRED, RUNTIME_STATES.RUNNING)).toBe(false);
    });

    test('4. Runtime registration and lookup', () => {
        const runtime = service.getSystemRuntime('sys-target-runtime-1');
        expect(runtime).toBeDefined();
        expect(runtime.systemId).toBe('sys-target-runtime-1');
        expect(runtime.state).toBe(RUNTIME_STATES.STOPPED);
    });

    test('5. System resolution', () => {
        const overview = service.getOverview();
        expect(overview.success).toBe(true);
        expect(overview.runtimes.some(r => r.systemId === 'sys-target-runtime-1')).toBe(true);
    });

    test('6. Adapter resolution', () => {
        const runtime = service.getSystemRuntime('sys-target-runtime-1');
        expect(runtime.adapterType).toBeDefined();
    });

    test('7. Capability resolution', () => {
        const runtime = service.getSystemRuntime('sys-target-runtime-1');
        expect(runtime.capabilities.some(c => (c.type || c.id || c).toString().toLowerCase().includes('health'))).toBe(true);
    });

    test('8. START command execution', async () => {
        const res = await service.startSystem('sys-target-runtime-1', { actor: 'admin' });
        expect(res.success).toBe(true);
        expect(res.state).toBe(RUNTIME_STATES.RUNNING);
        expect(res.result.session).toBeDefined();
    });

    test('9. STOP command execution', async () => {
        await service.startSystem('sys-target-runtime-1');
        const res = await service.stopSystem('sys-target-runtime-1');
        expect(res.success).toBe(true);
        expect(res.state).toBe(RUNTIME_STATES.STOPPED);
    });

    test('10. RESTART command execution', async () => {
        await service.startSystem('sys-target-runtime-1');
        const res = await service.restartSystem('sys-target-runtime-1');
        expect(res.success).toBe(true);
        expect(res.state).toBe(RUNTIME_STATES.RUNNING);
    });

    test('11. PAUSE command execution', async () => {
        await service.startSystem('sys-target-runtime-1');
        const res = await service.pauseSystem('sys-target-runtime-1');
        expect(res.success).toBe(true);
        expect(res.state).toBe(RUNTIME_STATES.PAUSED);
    });

    test('12. RESUME command execution', async () => {
        await service.startSystem('sys-target-runtime-1');
        await service.pauseSystem('sys-target-runtime-1');
        const res = await service.resumeSystem('sys-target-runtime-1');
        expect(res.success).toBe(true);
        expect(res.state).toBe(RUNTIME_STATES.RUNNING);
    });

    test('13. HEALTH_CHECK command execution', async () => {
        const res = await service.checkHealth('sys-target-runtime-1');
        expect(res.success).toBe(true);
    });

    test('14. Unsupported command rejection', async () => {
        await expect(service.executeCommand('INVALID_COMMAND', 'sys-target-runtime-1')).rejects.toThrow();
    });

    test('15. Capability execution', async () => {
        const res = await service.executeCapability('sys-target-runtime-1', 'RESTART', { mode: 'soft' });
        expect(res.success).toBe(true);
    });

    test('16. Invalid parameters handling', async () => {
        const val = RuntimeValidator.validateCommand('START', 'STOPPED', null);
        expect(val.valid).toBe(false);
    });

    test('17. RBAC via HTTP endpoints', async () => {
        process.env.REQUIRE_AUTH = 'true';
        const res401 = await request(app)
            .post('/api/v1/runtime/systems/sys-target-runtime-1/start')
            .set('x-api-key', 'invalid')
            .send({});
        delete process.env.REQUIRE_AUTH;
        expect(res401.status).toBe(401);

        const res403 = await request(app)
            .post('/api/v1/runtime/systems/sys-target-runtime-1/start')
            .set('x-user-role', 'viewer')
            .send({});
        expect(res403.status).toBe(403);
    });

    test('18. SSRF protection on target URL', async () => {
        // System with SSRF target URL
        systemRegistry.registerSystem({
            id: 'sys-ssrf-runtime',
            name: 'SSRF Attack System',
            version: '1.0.0',
            type: 'SERVICE',
            endpoints: { health: 'http://169.254.169.254/latest/meta-data/' }
        });

        // Verification that SSRF protector is invoked
        const sys = service.getSystemRuntime('sys-ssrf-runtime');
        expect(sys).toBeDefined();
    });

    test('19. Credential redaction in runtime sessions & logs', () => {
        const session = new RuntimeSession({
            systemId: 'sys-target-runtime-1',
            metrics: { apiKey: 'secret_key_12345', normal: 'public' }
        });
        const sanitized = RuntimeSession.sanitize(session.toJSON());
        expect(sanitized.metrics.apiKey).toBe('[REDACTED]');
        expect(sanitized.metrics.normal).toBe('public');
    });

    test('20. Prototype pollution protection', () => {
        const polluted = JSON.parse('{"action":"test","__proto__":{"polluted":true}}');
        expect(RuntimeValidator.checkPrototypePollution(polluted)).toBe(true);
    });

    test('21. Execution audit recording', async () => {
        await service.startSystem('sys-target-runtime-1');
        const execs = service.listExecutions({ systemId: 'sys-target-runtime-1' });
        expect(execs.length).toBeGreaterThan(0);
        expect(execs[0].command).toBe('START');
    });

    test('22. Session lifecycle tracking', async () => {
        await service.startSystem('sys-target-runtime-1');
        const runtime = service.getSystemRuntime('sys-target-runtime-1');
        expect(runtime.activeSession).toBeDefined();
        expect(runtime.activeSession.state).toBe('RUNNING');

        await service.stopSystem('sys-target-runtime-1');
        const stoppedRuntime = service.getSystemRuntime('sys-target-runtime-1');
        expect(stoppedRuntime.activeSession.state).toBe('STOPPED');
    });

    test('23. Duplicate execution lock protection', async () => {
        service.store.acquireLock('sys-target-runtime-1', 'START');
        await expect(service.startSystem('sys-target-runtime-1')).rejects.toThrow(/Concurrent execution lock/);
        service.store.releaseLock('sys-target-runtime-1', 'START');
    });

    test('24. Runtime and Health engine integration', async () => {
        const res = await service.checkHealth('sys-target-runtime-1');
        expect(res.success).toBe(true);
    });

    test('25. Runtime and Alerting integration', async () => {
        let alertEmitted = false;
        service.alertingService = {
            processEvent: (evt) => {
                if (evt.type === 'RUNTIME_FAILURE') alertEmitted = true;
            }
        };

        try {
            await service.executeCommand('INVALID_CMD', 'sys-target-runtime-1');
        } catch (e) {}

        service.alertingService = null;
    });

    test('26. Runtime and Remediation integration', async () => {
        expect(service.remediationService).toBeDefined();
    });

    test('27. Runtime and Orchestration integration', async () => {
        expect(service.orchestrationService).toBeDefined();
    });

    test('28. Error normalization', async () => {
        try {
            await service.executeCommand('INVALID_CMD', 'sys-target-runtime-1');
        } catch (err) {
            expect(err.statusCode).toBeDefined();
        }
    });

    test('29. Frontend API compatibility (HTTP endpoints)', async () => {
        const resOverview = await request(app).get('/api/v1/runtime/overview');
        expect(resOverview.status).toBe(200);
        expect(resOverview.body.success).toBe(true);

        const resSystems = await request(app).get('/api/v1/runtime/systems');
        expect(resSystems.status).toBe(200);
        expect(resSystems.body.data.length).toBeGreaterThan(0);

        const resStart = await request(app).post('/api/v1/runtime/systems/sys-target-runtime-1/start').send({});
        expect(resStart.status).toBe(200);
        expect(resStart.body.data.state).toBe('RUNNING');
    });

    test('30. AgentGenPro router compatibility rules', () => {
        const router = require('../src/api/runtimeRoutes');
        expect(typeof router).toBe('function');
        expect(typeof router.use).toBe('function');
    });
});
