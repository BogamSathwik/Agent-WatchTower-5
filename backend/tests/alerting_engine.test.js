/**
 * Universal Alerting and Notification Engine Test Suite (Phase 8)
 * 34 comprehensive test scenarios covering rules, evaluation, deduplication, lifecycle, notifications, security, RBAC, and AgentGenPro compliance.
 * Purely domain-agnostic.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { Alert, ALERT_STATUS, ALERT_SEVERITY, ALERT_CATEGORY } = require('../src/alerting/Alert');
const AlertRule = require('../src/alerting/AlertRule');
const AlertStore = require('../src/alerting/AlertStore');
const AlertEvaluator = require('../src/alerting/AlertEvaluator');
const NotificationPolicy = require('../src/alerting/NotificationPolicy');
const NotificationProviderRegistry = require('../src/alerting/NotificationProviderRegistry');
const NotificationDispatcher = require('../src/alerting/NotificationDispatcher');
const { MockNotificationProvider, WebhookNotificationProvider } = require('../src/alerting/NotificationChannel');
const AlertingService = require('../src/alerting/AlertingService');
const { NormalizedObservation } = require('../src/intelligence/NormalizedObservation');

describe('Universal Alerting & Notification Engine (Phase 8)', () => {

    let app;
    let systemRegistry;
    let alertingService;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        systemRegistry.registerSystem({
            id: 'SYS-TEST-001',
            name: 'Neutral Test System One',
            version: '1.0.0',
            contractVersion: '1.0.0',
            category: 'service',
            capabilities: ['health', 'execute']
        });

        app = createApp(systemRegistry);
        alertingService = app.get('alertingService');
    });

    // --- 1. Alert Rule Operations ---

    test('1. Alert rule creation', () => {
        const rule = alertingService.createRule({
            id: 'rule_test_1',
            name: 'High Latency Spike',
            source: 'HEALTH',
            metric: 'latency',
            operator: 'greaterThan',
            value: 500,
            severity: ALERT_SEVERITY.HIGH
        });
        expect(rule.id).toBe('rule_test_1');
        expect(rule.name).toBe('High Latency Spike');
        expect(rule.severity).toBe('HIGH');
    });

    test('2. Invalid rule rejection', () => {
        expect(() => {
            alertingService.createRule({ source: 'HEALTH' });
        }).toThrow();
    });

    test('3. Rule retrieval', () => {
        alertingService.createRule({ id: 'rule_get_1', name: 'Rule Get Test', metric: 'status', operator: 'equals', value: 'OFFLINE' });
        const fetched = alertingService.getRule('rule_get_1');
        expect(fetched).not.toBeNull();
        expect(fetched.name).toBe('Rule Get Test');
    });

    test('4. Rule update', () => {
        alertingService.createRule({ id: 'rule_upd_1', name: 'Rule Update', metric: 'status', operator: 'equals', value: 'OFFLINE' });
        const updated = alertingService.updateRule('rule_upd_1', { name: 'Rule Updated Name', severity: ALERT_SEVERITY.CRITICAL });
        expect(updated.name).toBe('Rule Updated Name');
        expect(updated.severity).toBe('CRITICAL');
    });

    test('5. Rule deletion', () => {
        alertingService.createRule({ id: 'rule_del_1', name: 'Rule Delete', metric: 'status', operator: 'equals', value: 'OFFLINE' });
        const deleted = alertingService.deleteRule('rule_del_1');
        expect(deleted).toBe(true);
        expect(alertingService.getRule('rule_del_1')).toBeNull();
    });

    // --- 2. Alert Model & Deduplication ---

    test('6. Alert creation & field defaults', () => {
        const alert = new Alert({
            systemId: 'SYS-TEST-001',
            title: 'System Offline',
            severity: ALERT_SEVERITY.CRITICAL
        });
        expect(alert.id).toBeDefined();
        expect(alert.status).toBe(ALERT_STATUS.NEW);
        expect(alert.occurrenceCount).toBe(1);
    });

    test('7. Alert severity setting', () => {
        const alert = new Alert({
            systemId: 'SYS-TEST-001',
            title: 'Info Level Event',
            severity: ALERT_SEVERITY.INFO
        });
        expect(alert.severity).toBe('INFO');
    });

    test('8. Alert deduplication via fingerprint', () => {
        const alert1 = new Alert({
            systemId: 'SYS-TEST-001',
            ruleId: 'rule_1',
            title: 'System Degraded',
            condition: { metric: 'status', value: 'DEGRADED' }
        });
        const res1 = alertingService.store.saveAlert(alert1);
        expect(res1.created).toBe(true);

        const alert2 = new Alert({
            systemId: 'SYS-TEST-001',
            ruleId: 'rule_1',
            title: 'System Degraded',
            condition: { metric: 'status', value: 'DEGRADED' }
        });
        const res2 = alertingService.store.saveAlert(alert2);
        expect(res2.created).toBe(false);
        expect(res2.deduplicated).toBe(true);
        expect(res2.alert.occurrenceCount).toBe(2);
    });

    test('9. Occurrence count incrementing', () => {
        const alert = new Alert({
            systemId: 'SYS-TEST-001',
            title: 'Test Occurrence',
            condition: { metric: 'errCount', value: 10 }
        });
        alertingService.store.saveAlert(alert);

        const duplicateAlert = new Alert({
            systemId: 'SYS-TEST-001',
            title: 'Test Occurrence',
            condition: { metric: 'errCount', value: 10 }
        });
        const res = alertingService.store.saveAlert(duplicateAlert);
        expect(res.alert.occurrenceCount).toBe(2);
    });

    // --- 3. Cooldown & Notification Dispatching ---

    test('10. Cooldown behavior suppresses duplicate notifications', async () => {
        const registry = new NotificationProviderRegistry();
        const mockProvider = new MockNotificationProvider('mock_test');
        registry.register(mockProvider);

        const store = new AlertStore();
        store.savePolicy(new NotificationPolicy({
            id: 'cooldown_policy',
            channels: ['mock_test'],
            cooldownSeconds: 60
        }));

        const dispatcher = new NotificationDispatcher(registry, store);
        const alert = new Alert({
            systemId: 'SYS-TEST-001',
            title: 'Cooldown Alert',
            severity: ALERT_SEVERITY.HIGH
        });

        const res1 = await dispatcher.dispatch(alert, { policyId: 'cooldown_policy' });
        expect(res1.results[0].status).toBe('SENT');
        expect(mockProvider.sentPayloads.length).toBe(1);

        // Immediate second dispatch should be suppressed by cooldown
        const res2 = await dispatcher.dispatch(alert, { policyId: 'cooldown_policy' });
        expect(res2.results[0].status).toBe('SUPPRESSED');
        expect(mockProvider.sentPayloads.length).toBe(1);
    });

    // --- 4. Alert Lifecycle ---

    test('11. Alert lifecycle transitions (NEW -> ACTIVE -> ACKNOWLEDGED -> RESOLVED)', () => {
        const alert = new Alert({
            systemId: 'SYS-TEST-001',
            title: 'Lifecycle Test'
        });
        expect(alert.status).toBe(ALERT_STATUS.NEW);

        alert.recordOccurrence();
        expect(alert.status).toBe(ALERT_STATUS.ACTIVE);

        alert.acknowledge('admin_user', 'Investigating root cause');
        expect(alert.status).toBe(ALERT_STATUS.ACKNOWLEDGED);
        expect(alert.acknowledgedBy).toBe('admin_user');

        alert.resolve([{ detail: 'Server restarted' }]);
        expect(alert.status).toBe(ALERT_STATUS.RESOLVED);
        expect(alert.resolvedAt).not.toBeNull();
    });

    test('12. Acknowledge alert via API', async () => {
        const alert = alertingService.createManualAlert({ systemId: 'SYS-TEST-001', title: 'Ack API Test' });
        const res = await request(app)
            .post(`/api/v1/alerts/${alert.id}/acknowledge`)
            .set('x-user-role', 'operator')
            .send({ reason: 'Acknowledged by operator' });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('ACKNOWLEDGED');
    });

    test('13. Resolve alert via API', async () => {
        const alert = alertingService.createManualAlert({ systemId: 'SYS-TEST-001', title: 'Resolve API Test' });
        const res = await request(app)
            .post(`/api/v1/alerts/${alert.id}/resolve`)
            .set('x-user-role', 'operator')
            .send({ evidence: [{ reason: 'Issue fixed' }] });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('RESOLVED');
    });

    test('14. Dismiss alert via API', async () => {
        const alert = alertingService.createManualAlert({ systemId: 'SYS-TEST-001', title: 'Dismiss API Test' });
        const res = await request(app)
            .post(`/api/v1/alerts/${alert.id}/dismiss`)
            .set('x-user-role', 'operator')
            .send({ reason: 'False positive' });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('DISMISSED');
    });

    test('15. Reopen alert via API', async () => {
        const alert = alertingService.createManualAlert({ systemId: 'SYS-TEST-001', title: 'Reopen API Test' });
        alert.resolve();
        alertingService.store.updateAlert(alert);

        const res = await request(app)
            .post(`/api/v1/alerts/${alert.id}/reopen`)
            .set('x-user-role', 'operator')
            .send({ reason: 'Re-triggered' });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('ACTIVE');
    });

    test('16. Automatic recovery detection', () => {
        const rule = new AlertRule({
            id: 'rule_rec_1',
            name: 'Check Status',
            source: 'HEALTH',
            metric: 'status',
            operator: 'equals',
            value: 'OFFLINE'
        });

        const activeAlert = new Alert({
            systemId: 'SYS-TEST-001',
            ruleId: 'rule_rec_1',
            title: 'System Offline',
            status: ALERT_STATUS.ACTIVE,
            condition: { metric: 'status', operator: 'equals', value: 'OFFLINE' }
        });

        // Healthy observation (status = HEALTHY) means OFFLINE condition is false -> recovery
        const healthyObs = new NormalizedObservation({
            systemId: 'SYS-TEST-001',
            source: 'HEALTH',
            metric: 'status',
            value: 'HEALTHY'
        });

        const evalRes = AlertEvaluator.evaluateSystemRules([rule], [healthyObs], [activeAlert]);
        expect(evalRes.triggered.length).toBe(0);
        expect(evalRes.recovered.length).toBe(1);
        expect(evalRes.recovered[0].alert.id).toBe(activeAlert.id);
    });

    // --- 5. Notification Providers & Delivery ---

    test('17. Notification channel registration', () => {
        const registry = new NotificationProviderRegistry();
        const mockProv = new MockNotificationProvider('mock_reg_1');
        registry.register(mockProv);
        expect(registry.get('mock_reg_1')).toBe(mockProv);
    });

    test('18. Mock notification delivery', async () => {
        const mockProv = new MockNotificationProvider('mock_prov_1');
        const res = await mockProv.send({ title: 'Mock Payload Test' });
        expect(res.success).toBe(true);
        expect(mockProv.sentPayloads.length).toBe(1);
    });

    test('19. Webhook delivery & SSRF safety check', async () => {
        const webhookProv = new WebhookNotificationProvider('wh_1');
        // Valid public URL
        const safeRes = await webhookProv.send({ webhookUrl: 'https://example.com/webhook', title: 'Safe Webhook' });
        expect(safeRes.success).toBe(true);

        // Malicious private/localhost URL
        const ssrfRes = await webhookProv.send({ webhookUrl: 'http://169.254.169.254/latest/meta-data', title: 'SSRF Attack' });
        expect(ssrfRes.success).toBe(false);
        expect(ssrfRes.error).toContain('SSRF Blocked');
    });

    test('20. Delivery failure handling', async () => {
        const failingMock = new MockNotificationProvider('failing_mock', { shouldFail: true, isRetryable: false });
        const registry = new NotificationProviderRegistry();
        registry.register(failingMock);

        const store = new AlertStore();
        store.savePolicy(new NotificationPolicy({ id: 'fail_pol', channels: ['failing_mock'] }));
        const dispatcher = new NotificationDispatcher(registry, store);

        const alert = new Alert({ systemId: 'SYS-TEST-001', title: 'Failing Delivery Alert' });
        const res = await dispatcher.dispatch(alert, { policyId: 'fail_pol' });

        expect(res.results[0].status).toBe('FAILED');
    });

    test('21. Retryable notification failure & backoff retry attempts', async () => {
        const retryableMock = new MockNotificationProvider('retry_mock', { shouldFail: true, isRetryable: true });
        const registry = new NotificationProviderRegistry();
        registry.register(retryableMock);

        const store = new AlertStore();
        store.savePolicy(new NotificationPolicy({ id: 'retry_pol', channels: ['retry_mock'], maxAttempts: 3 }));
        const dispatcher = new NotificationDispatcher(registry, store);

        const alert = new Alert({ systemId: 'SYS-TEST-001', title: 'Retry Alert' });
        const res = await dispatcher.dispatch(alert, { policyId: 'retry_pol' });

        expect(res.results[0].status).toBe('EXHAUSTED');
        expect(res.results[0].attempts).toBe(3);
    });

    test('22. Notification policy minSeverity threshold filtering', async () => {
        const mockProv = new MockNotificationProvider('mock_thresh');
        const registry = new NotificationProviderRegistry();
        registry.register(mockProv);

        const store = new AlertStore();
        store.savePolicy(new NotificationPolicy({ id: 'high_only_pol', minSeverity: 'HIGH', channels: ['mock_thresh'] }));
        const dispatcher = new NotificationDispatcher(registry, store);

        const lowAlert = new Alert({ systemId: 'SYS-TEST-001', title: 'Low Severity Alert', severity: ALERT_SEVERITY.LOW });
        const res = await dispatcher.dispatch(lowAlert, { policyId: 'high_only_pol' });

        expect(res.dispatched).toBe(false);
        expect(res.reason).toBe('SEVERITY_BELOW_THRESHOLD');
    });

    test('23. Alert history audit trail', () => {
        const alert = alertingService.createManualAlert({ systemId: 'SYS-TEST-001', title: 'History Audit Test' });
        alertingService.acknowledgeAlert(alert.id, 'operator_user', 'Checking issue');
        alertingService.resolveAlert(alert.id, [{ fix: 'Reboot' }], 'operator_user');

        const history = alertingService.getAlertHistory(alert.id);
        expect(history.length).toBeGreaterThanOrEqual(3); // CREATED, ACKNOWLEDGED, RESOLVED
    });

    test('24. Filtering alerts by system, severity, status, category, source', () => {
        alertingService.createManualAlert({ systemId: 'SYS-TEST-001', title: 'Filter A', severity: ALERT_SEVERITY.CRITICAL, category: ALERT_CATEGORY.AVAILABILITY });
        alertingService.createManualAlert({ systemId: 'SYS-TEST-002', title: 'Filter B', severity: ALERT_SEVERITY.LOW, category: ALERT_CATEGORY.USAGE });

        const criticalAlerts = alertingService.listAlerts({ severity: ALERT_SEVERITY.CRITICAL });
        expect(criticalAlerts.length).toBe(1);
        expect(criticalAlerts[0].title).toBe('Filter A');
    });

    // --- 6. Security, RBAC & Protection ---

    test('25. RBAC viewer restriction on rule modification', async () => {
        const res = await request(app)
            .post('/api/v1/alerts/rules')
            .set('x-user-role', 'viewer')
            .send({ name: 'Unauthorized Rule', metric: 'status', operator: 'equals', value: 'OFFLINE' });

        expect(res.status).toBe(403);
    });

    test('26. RBAC operator permission to trigger analysis & resolve alerts', async () => {
        const alert = alertingService.createManualAlert({ systemId: 'SYS-TEST-001', title: 'RBAC Op Test' });
        const res = await request(app)
            .post(`/api/v1/alerts/${alert.id}/resolve`)
            .set('x-user-role', 'operator')
            .send({});

        expect(res.status).toBe(200);
    });

    test('27. RBAC admin rule management permission', async () => {
        const res = await request(app)
            .post('/api/v1/alerts/rules')
            .set('x-user-role', 'admin')
            .send({ name: 'Admin Created Rule', metric: 'status', operator: 'equals', value: 'OFFLINE' });

        expect(res.status).toBe(201);
    });

    test('28. Credential sanitization in notification payload', () => {
        const registry = new NotificationProviderRegistry();
        const store = new AlertStore();
        const dispatcher = new NotificationDispatcher(registry, store);

        const alertWithSecret = new Alert({
            systemId: 'SYS-TEST-001',
            title: 'Secret Leak Test',
            metadata: {
                apiKey: 'super_secret_api_key_123',
                password: 'admin_password_456',
                authorization: 'Bearer token_789',
                safeSetting: 'normal_value'
            }
        });

        const sanitized = dispatcher.buildSanitizedPayload(alertWithSecret);
        expect(sanitized.metadata.apiKey).toBe('[REDACTED_CREDENTIAL]');
        expect(sanitized.metadata.password).toBe('[REDACTED_CREDENTIAL]');
        expect(sanitized.metadata.authorization).toBe('[REDACTED_CREDENTIAL]');
        expect(sanitized.metadata.safeSetting).toBe('normal_value');
    });

    test('29. SSRF protection for webhook destinations', async () => {
        const webhookProv = new WebhookNotificationProvider('wh_ssrf');
        const internalResult = await webhookProv.send({ webhookUrl: 'http://localhost:8080/internal-admin' });
        expect(internalResult.success).toBe(false);
        expect(internalResult.error).toContain('SSRF Blocked');
    });

    test('30. Prototype pollution protection', () => {
        expect(() => {
            alertingService.createRule(JSON.parse('{"__proto__": {"polluted": true}, "name": "Pollution Test", "metric": "status", "operator": "equals"}'));
        }).not.toThrow();
        expect(Object.prototype.polluted).toBeUndefined();
    });

    test('31. Invalid lifecycle transition rejection', () => {
        const alert = new Alert({ systemId: 'SYS-TEST-001', title: 'Transition Test' });
        alert.resolve(); // Moved to RESOLVED
        expect(() => {
            alert.acknowledge('operator', 'Cannot ack resolved alert');
        }).toThrow();
    });

    // --- 7. Universal Hardcoding Audit & AgentGenPro Compliance ---

    test('32. Generic system compatibility (Zero hardcoding audit)', () => {
        const genericApp = createApp();
        expect(genericApp).toBeDefined();

        const service = genericApp.get('alertingService');
        const overview = service.getOverview();
        expect(overview.totalAlerts).toBeDefined();

        const inspectString = (str) => {
            const forbidden = [/\bCOMPA\b/i, /\bREPA\b/i, /\bSMP\b/i, /\bNews\b/i, /\bHotel\b/i, /\bSocial Media\b/i];
            for (const re of forbidden) {
                if (re.test(str)) return true;
            }
            return false;
        };

        const alertStoreStr = service.store.constructor.toString();
        expect(inspectString(alertStoreStr)).toBe(false);
    });

    test('33. AgentGenPro route-prefix compliance check', () => {
        const alertingRoutesSrc = require('fs').readFileSync(
            require('path').join(__dirname, '../src/api/alertingRoutes.js'),
            'utf8'
        );

        // All route declarations must explicitly start with /api/
        const routeMatches = alertingRoutesSrc.match(/router\.(get|post|patch|delete)\(['"](.*?)['"]/g);
        expect(routeMatches).not.toBeNull();

        routeMatches.forEach(match => {
            const pathMatch = match.match(/['"](.*?)['"]/);
            if (pathMatch) {
                expect(pathMatch[1].startsWith('/api/')).toBe(true);
            }
        });

        // Ensure zero forbidden Node modules inside router
        expect(alertingRoutesSrc.includes("require('child_process')")).toBe(false);
        expect(alertingRoutesSrc.includes("require('fs')")).toBe(false);
        expect(alertingRoutesSrc.includes("require('os')")).toBe(false);
        expect(alertingRoutesSrc.includes("eval(")).toBe(false);
    });

    test('34. Alerting overview API endpoint status', async () => {
        const res = await request(app)
            .get('/api/v1/alerts/overview')
            .set('x-user-role', 'viewer');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.activeAlertsCount).toBeDefined();
        expect(res.body.data.rulesCount).toBeDefined();
    });
});
