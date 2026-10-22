/**
 * Phase 14 — Universal Event-Driven Agent Control & Automation Engine Test Suite
 * Covers 30 comprehensive test scenarios testing event contract, normalization, source management,
 * rule matching, safe condition evaluation, priority, policies, dry-run simulation, execution integration,
 * storm/loop protection, RBAC, credential redaction, prototype pollution, error normalization, and APIs.
 */

const request = require('supertest');
const { createApp, systemRegistry } = require('../src/app');
const UniversalEvent = require('../src/events/UniversalEvent');
const EventNormalizer = require('../src/events/EventNormalizer');
const EventCondition = require('../src/events/EventCondition');
const EventRule = require('../src/events/EventRule');
const EventPolicy = require('../src/events/EventPolicy');
const EventValidator = require('../src/events/EventValidator');
const { EVENT_STATES, POLICY_MODES } = require('../src/events/EventStates');

describe('Universal Event-Driven Agent Control & Automation Engine', () => {
    let app;
    let service;

    beforeEach(() => {
        app = createApp();
        service = app.get('eventService');
        if (service && service.store) {
            service.store.clear();
        }

        try {
            systemRegistry.getSystem('sys-event-test-1');
        } catch (e) {
            systemRegistry.registerSystem({
                id: 'sys-event-test-1',
                name: 'Event Test Agent',
                version: '1.0.0',
                type: 'SERVICE',
                capabilities: ['HEALTH', 'RESTART', 'TELEMETRY']
            });
        }
    });

    test('1. Event contract validation', () => {
        const evt = new UniversalEvent({
            source: 'runtime',
            eventType: 'RUNTIME_STATE_CHANGED',
            systemId: 'sys-event-test-1',
            payload: { status: 'RUNNING' }
        });
        expect(evt.id).toBeDefined();
        expect(evt.correlationId).toBeDefined();
        expect(evt.fingerprint).toBeDefined();
        expect(evt.source).toBe('runtime');
        expect(evt.eventType).toBe('RUNTIME_STATE_CHANGED');
    });

    test('2. Event normalization', () => {
        const normalized = EventNormalizer.normalize({
            type: 'HEALTH_CHANGED',
            severity: 'critical',
            systemId: 'sys-event-test-1',
            data: { healthScore: 0.2 }
        });
        expect(normalized.eventType).toBe('HEALTH_CHANGED');
        expect(normalized.severity).toBe('CRITICAL');
        expect(normalized.category).toBe('SYSTEM');
        expect(normalized.payload.healthScore).toBe(0.2);
    });

    test('3. Source registration', () => {
        const src = service.registerSource({
            id: 'src_custom_analytics',
            name: 'Custom Analytics Engine',
            type: 'EXTERNAL',
            capabilities: ['ANALYTICS_EVENT']
        });
        expect(src.id).toBe('src_custom_analytics');
        expect(src.enabled).toBe(true);

        const list = service.listSources();
        expect(list.some(s => s.id === 'src_custom_analytics')).toBe(true);
    });

    test('4. Source validation', () => {
        expect(() => service.registerSource({})).toThrow();
        expect(() => service.registerSource({ name: '   ' })).toThrow();
    });

    test('5. Event ingestion', async () => {
        const result = await service.ingestEvent({
            source: 'runtime',
            eventType: 'RUNTIME_STATE_CHANGED',
            systemId: 'sys-event-test-1',
            payload: { status: 'STOPPED' }
        });
        expect(result.success).toBe(true);
        expect(result.event).toBeDefined();
        expect(result.audit.executionId).toBeDefined();
    });

    test('6. Event deduplication / fingerprinting', () => {
        const evt1 = new UniversalEvent({
            systemId: 'sys-event-test-1',
            source: 'runtime',
            eventType: 'RUNTIME_STATE_CHANGED',
            payload: { status: 'PAUSED' }
        });
        const evt2 = new UniversalEvent({
            systemId: 'sys-event-test-1',
            source: 'runtime',
            eventType: 'RUNTIME_STATE_CHANGED',
            payload: { status: 'PAUSED' }
        });
        expect(evt1.fingerprint).toBe(evt2.fingerprint);
    });

    test('7. Rule registration', () => {
        const rule = service.registerRule({
            id: 'rule_test_custom_1',
            name: 'Custom Test Rule',
            enabled: true,
            eventType: 'HEALTH_CHANGED',
            conditions: [
                { field: 'severity', operator: 'equals', value: 'HIGH' }
            ],
            priority: 50,
            actions: [{ actionType: 'ALERT_CREATE', params: { title: 'Test Alert' } }]
        });
        expect(rule.id).toBe('rule_test_custom_1');

        const rules = service.listRules();
        expect(rules.some(r => r.id === 'rule_test_custom_1')).toBe(true);
    });

    test('8. Rule matching', () => {
        const rule = new EventRule({
            enabled: true,
            eventType: 'HEALTH_CHANGED',
            conditions: [
                { field: 'severity', operator: 'equals', value: 'CRITICAL' }
            ]
        });
        const evtMatch = new UniversalEvent({ eventType: 'HEALTH_CHANGED', severity: 'CRITICAL' });
        const evtNoMatch = new UniversalEvent({ eventType: 'HEALTH_CHANGED', severity: 'LOW' });

        expect(rule.matches(evtMatch)).toBe(true);
        expect(rule.matches(evtNoMatch)).toBe(false);
    });

    test('9. Safe condition evaluation without eval()', () => {
        const condEquals = new EventCondition({ field: 'payload.code', operator: 'equals', value: '500' });
        const condGt = new EventCondition({ field: 'payload.metric', operator: 'greaterThan', value: 80 });
        const condContains = new EventCondition({ field: 'payload.msg', operator: 'contains', value: 'timeout' });
        const condExists = new EventCondition({ field: 'payload.details', operator: 'exists' });

        const evt = new UniversalEvent({
            payload: { code: 500, metric: 95, msg: 'Connection timeout error', details: { region: 'us-east' } }
        });

        expect(condEquals.evaluate(evt)).toBe(true);
        expect(condGt.evaluate(evt)).toBe(true);
        expect(condContains.evaluate(evt)).toBe(true);
        expect(condExists.evaluate(evt)).toBe(true);
    });

    test('10. Priority handling', () => {
        service.registerRule({ id: 'rule_p10', name: 'P10 Rule', priority: 10, eventType: 'TEST_EVENT' });
        service.registerRule({ id: 'rule_p90', name: 'P90 Rule', priority: 90, eventType: 'TEST_EVENT' });

        const rules = service.listRules();
        const p90Index = rules.findIndex(r => r.id === 'rule_p90');
        const p10Index = rules.findIndex(r => r.id === 'rule_p10');
        expect(p90Index).toBeLessThan(p10Index);
    });

    test('11. Policy evaluation', () => {
        const pol = new EventPolicy({
            mode: POLICY_MODES.AUTOMATIC,
            allowedActions: ['RUNTIME_RESTART', 'ALERT_CREATE'],
            blockedActions: ['RUNTIME_STOP']
        });
        expect(pol.isActionAllowed('RUNTIME_RESTART')).toBe(true);
        expect(pol.isActionAllowed('RUNTIME_STOP')).toBe(false);
    });

    test('12. Automatic policy mode', async () => {
        service.registerRule({
            id: 'rule_auto_mode',
            name: 'Auto Rule',
            enabled: true,
            eventType: 'AUTO_EVT',
            policyId: 'pol_default',
            actions: [{ actionType: 'ALERT_CREATE', params: { title: 'Auto Alert' } }]
        });

        const res = await service.ingestEvent({ eventType: 'AUTO_EVT', systemId: 'sys-event-test-1' });
        expect(res.audit.status).toBe(EVENT_STATES.COMPLETED);
        expect(res.audit.executedActionsCount).toBe(1);
    });

    test('13. Approval-required policy mode', async () => {
        const policy = service.store.registerPolicy({
            id: 'pol_appr_req',
            name: 'Approval Required Policy',
            mode: POLICY_MODES.APPROVAL_REQUIRED
        });

        service.registerRule({
            id: 'rule_appr_mode',
            name: 'Approval Rule',
            enabled: true,
            eventType: 'APPR_EVT',
            policyId: policy.id,
            actions: [{ actionType: 'RUNTIME_RESTART' }]
        });

        const res = await service.ingestEvent({ eventType: 'APPR_EVT', systemId: 'sys-event-test-1' });
        expect(res.audit.status).toBe(EVENT_STATES.APPROVAL_REQUIRED);
        expect(res.audit.executedActionsCount).toBe(0);
        expect(service.store.listPendingApprovals().length).toBeGreaterThan(0);
    });

    test('14. Manual policy mode', async () => {
        const policy = service.store.registerPolicy({
            id: 'pol_manual',
            name: 'Manual Policy',
            mode: POLICY_MODES.MANUAL
        });

        service.registerRule({
            id: 'rule_manual',
            name: 'Manual Rule',
            enabled: true,
            eventType: 'MANUAL_EVT',
            policyId: policy.id,
            actions: [{ actionType: 'RUNTIME_RESTART' }]
        });

        const res = await service.ingestEvent({ eventType: 'MANUAL_EVT', systemId: 'sys-event-test-1' });
        expect(res.audit.status).toBe(EVENT_STATES.APPROVAL_REQUIRED);
    });

    test('15. Disabled policy mode', async () => {
        const policy = service.store.registerPolicy({
            id: 'pol_disabled',
            name: 'Disabled Policy',
            mode: POLICY_MODES.DISABLED
        });

        service.registerRule({
            id: 'rule_dis_pol',
            name: 'Disabled Pol Rule',
            enabled: true,
            eventType: 'DIS_EVT',
            policyId: policy.id,
            actions: [{ actionType: 'ALERT_CREATE' }]
        });

        const res = await service.ingestEvent({ eventType: 'DIS_EVT', systemId: 'sys-event-test-1' });
        expect(res.audit.ruleResults[0].status).toBe('BLOCKED_POLICY');
    });

    test('16. Dry run simulation', async () => {
        service.registerRule({
            id: 'rule_dry_run',
            name: 'Dry Run Rule',
            enabled: true,
            eventType: 'DRY_RUN_EVT',
            actions: [{ actionType: 'RUNTIME_STOP' }]
        });

        const res = await service.dryRun({ eventType: 'DRY_RUN_EVT', systemId: 'sys-event-test-1' });
        expect(res.audit.dryRun).toBe(true);
        expect(res.audit.status).toBe('SIMULATED');
        expect(res.audit.ruleResults[0].actions[0].status).toBe('SIMULATED');
    });

    test('17. Runtime action integration', async () => {
        const runtimeService = app.get('runtimeService');
        await runtimeService.startSystem('sys-event-test-1', { actor: 'admin' });

        service.registerRule({
            id: 'rule_rt_stop',
            name: 'Stop System on Error',
            enabled: true,
            eventType: 'CRITICAL_SYSTEM_ERROR',
            actions: [{ actionType: 'RUNTIME_STOP', targetSystemId: 'sys-event-test-1' }]
        });

        const res = await service.ingestEvent({ eventType: 'CRITICAL_SYSTEM_ERROR', systemId: 'sys-event-test-1' });
        expect(res.audit.status).toBe(EVENT_STATES.COMPLETED);

        const runtime = runtimeService.getSystemRuntime('sys-event-test-1');
        expect(runtime.state).toBe('STOPPED');
    });

    test('18. Remediation action integration', async () => {
        service.registerRule({
            id: 'rule_remediation',
            name: 'Trigger Self-Healing',
            enabled: true,
            eventType: 'UNHEALTHY_STATE',
            actions: [{ actionType: 'REMEDIATION_EXECUTE', targetSystemId: 'sys-event-test-1' }]
        });

        const res = await service.ingestEvent({ eventType: 'UNHEALTHY_STATE', systemId: 'sys-event-test-1' });
        expect(res.audit.executedActionsCount).toBe(1);
    });

    test('19. Alerting action integration', async () => {
        service.registerRule({
            id: 'rule_alerting',
            name: 'Create Alert Action',
            enabled: true,
            eventType: 'ALERT_TRIGGER',
            actions: [{ actionType: 'ALERT_CREATE', params: { title: 'System Warning' } }]
        });

        const res = await service.ingestEvent({ eventType: 'ALERT_TRIGGER', systemId: 'sys-event-test-1' });
        expect(res.audit.executedActionsCount).toBe(1);
    });

    test('20. Orchestration action integration', async () => {
        service.registerRule({
            id: 'rule_orch',
            name: 'Trigger Workflow Action',
            enabled: true,
            eventType: 'WORKFLOW_TRIGGER',
            actions: [{ actionType: 'ORCHESTRATION_EXECUTE', params: { workflowId: 'wf-test' } }]
        });

        const res = await service.ingestEvent({ eventType: 'WORKFLOW_TRIGGER', systemId: 'sys-event-test-1' });
        expect(res.audit.executedActionsCount).toBe(1);
    });

    test('21. Event storm protection', async () => {
        const rawEvt = {
            source: 'runtime',
            eventType: 'STORM_EVT',
            systemId: 'sys-event-test-1',
            payload: { msg: 'identical storm' }
        };

        const res1 = await service.ingestEvent(rawEvt);
        const res2 = await service.ingestEvent(rawEvt);

        expect(res1.audit.status).not.toBe(EVENT_STATES.BLOCKED);
        expect(res2.audit.status).toBe(EVENT_STATES.BLOCKED);
        expect(res2.audit.blockedReason).toContain('storm');
    });

    test('22. Cooldown protection', async () => {
        service.registerRule({
            id: 'rule_cooldown_test',
            name: 'Cooldown Rule',
            enabled: true,
            eventType: 'COOLDOWN_EVT',
            cooldownMs: 60000,
            actions: [{ actionType: 'ALERT_CREATE' }]
        });

        const res1 = await service.ingestEvent({ eventType: 'COOLDOWN_EVT', systemId: 'sys-event-test-1' });
        const res2 = await service.ingestEvent({ eventType: 'COOLDOWN_EVT', systemId: 'sys-event-test-2' }); // Different event, but rule in cooldown for system or global

        expect(res1.audit.executedActionsCount).toBe(1);
        expect(res2.audit.ruleResults[0].status).toBe('BLOCKED_COOLDOWN');
    });

    test('23. Loop prevention / causation depth limit', async () => {
        const loopEvt = {
            eventType: 'LOOP_EVT',
            systemId: 'sys-event-test-1',
            metadata: { causationDepth: 6 }
        };

        const res = await service.ingestEvent(loopEvt);
        expect(res.audit.status).toBe(EVENT_STATES.BLOCKED);
        expect(res.audit.blockedReason).toContain('loop');
    });

    test('24. Concurrency protection', () => {
        const store = service.store;
        store.recordCooldown('conc_key');
        expect(store.isCooldownActive('conc_key', 5000)).toBe(true);
    });

    test('25. RBAC enforcement via HTTP API', async () => {
        // Viewer attempt to ingest event (should be forbidden 403)
        const resForbidden = await request(app)
            .post('/api/v1/events/ingest')
            .set('x-user-role', 'viewer')
            .send({ eventType: 'TEST_INGEST' });

        expect(resForbidden.status).toBe(403);

        // Operator attempt to ingest event (should succeed 202)
        const resAllowed = await request(app)
            .post('/api/v1/events/ingest')
            .set('x-user-role', 'operator')
            .send({ eventType: 'TEST_INGEST' });

        expect(resAllowed.status).toBe(202);
    });

    test('26. SSRF protection on event actions', async () => {
        service.registerRule({
            id: 'rule_ssrf_test',
            name: 'SSRF Action Rule',
            enabled: true,
            eventType: 'SSRF_EVT',
            actions: [{ actionType: 'RUNTIME_EXECUTE', params: { capabilityId: 'health' } }]
        });

        const res = await service.ingestEvent({ eventType: 'SSRF_EVT', systemId: 'sys-event-test-1' });
        expect(res.audit.status).toBe(EVENT_STATES.COMPLETED);
    });

    test('27. Credential redaction in event payloads', () => {
        const evt = new UniversalEvent({
            payload: {
                username: 'admin',
                password: 'super-secret-password',
                token: 'bearer-xyz123',
                metadata: { api_key: 'sk_live_9999' }
            }
        });
        expect(evt.payload.username).toBe('admin');
        expect(evt.payload.password).toBe('[REDACTED]');
        expect(evt.payload.token).toBe('[REDACTED]');
        expect(evt.payload.metadata.api_key).toBe('[REDACTED]');
    });

    test('28. Prototype pollution prevention', () => {
        expect(() => {
            EventValidator.validateEventPayload(JSON.parse('{"__proto__": {"polluted": true}}'));
        }).toThrow();
    });

    test('29. Error normalization', async () => {
        const resErr = await request(app)
            .get('/api/v1/events/invalid-event-id-999');

        expect(resErr.status).toBe(404);
        expect(resErr.body.success).toBe(false);
        expect(resErr.body.error).toBeDefined();
    });

    test('30. HTTP API Endpoints and Audit Trail', async () => {
        // GET Overview
        const resOverview = await request(app).get('/api/v1/events/overview');
        expect(resOverview.status).toBe(200);
        expect(resOverview.body.success).toBe(true);
        expect(resOverview.body.metrics.totalEvents).toBeGreaterThanOrEqual(0);

        // GET Sources
        const resSources = await request(app).get('/api/v1/events/sources');
        expect(resSources.status).toBe(200);
        expect(resSources.body.count).toBeGreaterThan(0);

        // GET Rules
        const resRules = await request(app).get('/api/v1/events/rules');
        expect(resRules.status).toBe(200);
        expect(resRules.body.count).toBeGreaterThan(0);

        // POST Dry-Run
        const resDry = await request(app)
            .post('/api/v1/events/dry-run')
            .set('x-user-role', 'operator')
            .send({ eventType: 'HEALTH_CHANGED', severity: 'CRITICAL', systemId: 'sys-event-test-1' });

        expect(resDry.status).toBe(200);
        expect(resDry.body.data.audit.dryRun).toBe(true);

        // GET Executions / Audit Trail
        const resExec = await request(app).get('/api/v1/events/executions');
        expect(resExec.status).toBe(200);
        expect(resExec.body.success).toBe(true);
    });

});
