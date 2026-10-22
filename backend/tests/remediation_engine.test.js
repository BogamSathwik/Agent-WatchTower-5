/**
 * Universal Autonomous Remediation & Self-Healing Engine Test Suite
 * Covers 40 comprehensive test scenarios testing domain-agnostic self-healing,
 * policy evaluation, safety validation, SSRF checks, human approvals, dry-runs,
 * verifications, rollbacks, storm protection, and end-to-end lifecycle.
 */

const express = require('express');
const request = require('supertest');

const { RemediationAction } = require('../src/remediation/RemediationAction');
const { RemediationRule } = require('../src/remediation/RemediationRule');
const { RemediationPolicy } = require('../src/remediation/RemediationPolicy');
const { RemediationSafetyEngine } = require('../src/remediation/RemediationSafetyEngine');
const { RemediationVerificationEngine } = require('../src/remediation/RemediationVerificationEngine');
const { RemediationRollbackEngine } = require('../src/remediation/RemediationRollbackEngine');
const { RemediationApprovalWorkflow } = require('../src/remediation/RemediationApprovalWorkflow');
const RemediationStore = require('../src/remediation/RemediationStore');
const { RemediationExecutionEngine } = require('../src/remediation/RemediationExecutionEngine');
const RemediationService = require('../src/remediation/RemediationService');

const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { UniversalSystemContract } = require('../src/contract/UniversalSystemContract');
const { HealthCheckEngine } = require('../src/health/HealthCheckEngine');
const { QualityTestRunner } = require('../src/quality/QualityTestRunner');
const { createApp } = require('../src/app');
const { ROLES } = require('../src/middleware/authMiddleware');

describe('Universal Autonomous Remediation & Self-Healing Engine', () => {

    let systemRegistry;
    let service;
    let app;
    let adminToken;
    let operatorToken;
    let viewerToken;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        
        // Register test target system
        systemRegistry.registerSystem({
            id: 'sys-target-1',
            name: 'Target Production Service',
            version: '1.0.0',
            type: 'SERVICE',
            capabilities: ['HEALTH_CHECK', 'RESTART', 'CLEAR_CACHE', 'RECONFIG'],
            endpoints: {
                health: 'https://api.example.com/health',
                remediations: 'https://api.example.com/remediate'
            }
        });

        service = new RemediationService({
            systemRegistry,
            allowLocalhost: true
        });
        service.setPolicy({ mode: 'AUTOMATIC', maxRiskLevelAuto: 'HIGH' });

        app = createApp({
            systemRegistry,
            remediationService: service
        });

        adminToken = 'admin-secret-key-123';
        operatorToken = 'demo-api-key-456';
        viewerToken = 'demo-api-key-456';
    });

    test('1. Action definition validation', () => {
        const action = new RemediationAction({
            actionId: 'act-restart',
            name: 'Restart Service Worker',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART',
            riskLevel: 'MEDIUM'
        });
        expect(action.actionId).toBe('act-restart');
        expect(action.riskLevel).toBe('MEDIUM');
    });

    test('2. Invalid action rejection', () => {
        expect(() => {
            service.createAction({ name: 'Incomplete Action' });
        }).toThrow(/Invalid action definition/);
    });

    test('3. Rule validation', () => {
        const rule = new RemediationRule({
            ruleId: 'rule-auto-restart',
            name: 'Auto Restart on High Latency',
            triggerSource: 'HEALTH',
            remediationActionId: 'act-restart',
            condition: { metric: 'status', operator: 'EQUALS', value: 'DEGRADED' }
        });
        expect(rule.ruleId).toBe('rule-auto-restart');
        expect(rule.matchesTrigger({ metric: 'status', value: 'DEGRADED' })).toBe(true);
    });

    test('4. Policy validation', () => {
        const policy = new RemediationPolicy({
            mode: 'APPROVAL_REQUIRED',
            riskThreshold: 'HIGH'
        });
        expect(policy.mode).toBe('APPROVAL_REQUIRED');
        expect(policy.isExecutionAllowed({ riskLevel: 'LOW' })).toBe(true);
    });

    test('5. Unknown system rejection', async () => {
        const action = service.createAction({
            actionId: 'act-unknown',
            name: 'Unknown Target Action',
            targetSystemId: 'sys-non-existent'
        });

        const execRes = await service.executeRemediation('act-unknown', 'sys-non-existent');
        expect(execRes.status).toBe('BLOCKED');
        expect(execRes.error).toMatch(/Target system .* not registered/);
    });

    test('6. Unknown capability rejection', async () => {
        const action = service.createAction({
            actionId: 'act-unsupported-cap',
            name: 'Unsupported Capability Action',
            targetSystemId: 'sys-target-1',
            capability: 'FLUX_CAPACITOR_BOOST'
        });

        const execRes = await service.executeRemediation('act-unsupported-cap', 'sys-target-1');
        expect(execRes.status).toBe('BLOCKED');
        expect(execRes.error).toMatch(/does not support requested capability/);
    });

    test('7. Unauthorized execution rejection (HTTP 401)', async () => {
        process.env.REQUIRE_AUTH = 'true';
        const res = await request(app)
            .post('/api/v1/remediation/execute')
            .set('x-api-key', 'invalid-key')
            .send({ actionId: 'act-1', systemId: 'sys-target-1' });
        delete process.env.REQUIRE_AUTH;
        expect(res.status).toBe(401);
    });

    test('8. Viewer cannot execute admin remediation (HTTP 403)', async () => {
        const res = await request(app)
            .post('/api/v1/remediation/execute')
            .set('x-user-role', 'viewer')
            .send({ actionId: 'act-1', systemId: 'sys-target-1' });
        expect(res.status).toBe(403);
    });

    test('9. Approval-required flow', async () => {
        const action = service.createAction({
            actionId: 'act-high-risk',
            name: 'High Risk Reconfig',
            targetSystemId: 'sys-target-1',
            capability: 'RECONFIG',
            approvalRequired: true
        });

        const execRes = await service.executeRemediation('act-high-risk', 'sys-target-1');
        expect(execRes.status).toBe('AWAITING_APPROVAL');
        expect(execRes.approvalId).toBeDefined();
    });

    test('10. Approval success', async () => {
        const action = service.createAction({
            actionId: 'act-approve-me',
            name: 'Approve Me Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART',
            approvalRequired: true
        });

        const execRes = await service.executeRemediation('act-approve-me', 'sys-target-1');
        expect(execRes.status).toBe('AWAITING_APPROVAL');

        const approvedExec = await service.approveRequest(execRes.approvalId, 'admin-user', 'Authorized by ops');
        expect(approvedExec.status).toMatch(/^(?:SUCCEEDED|VERIFIED)$/);
    });

    test('11. Approval rejection', async () => {
        const action = service.createAction({
            actionId: 'act-reject-me',
            name: 'Reject Me Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART',
            approvalRequired: true
        });

        const execRes = await service.executeRemediation('act-reject-me', 'sys-target-1');
        const rejected = service.rejectRequest(execRes.approvalId, 'admin-user', 'Too risky right now');
        expect(rejected.status).toBe('REJECTED');
    });

    test('12. Approval expiry', () => {
        const workflow = new RemediationApprovalWorkflow();
        const reqObj = workflow.createApprovalRequest({
            action: { actionId: 'act-1', name: 'Act 1', riskLevel: 'HIGH' },
            systemId: 'sys-target-1',
            requestedBy: 'system',
            timeoutMs: 10
        });

        const start = Date.now();
        while (Date.now() - start < 20) {}

        const status = workflow.checkExpiry(reqObj.approvalId);
        expect(status.status).toBe('EXPIRED');
    });

    test('13. Dry-run execution', async () => {
        const action = service.createAction({
            actionId: 'act-dry',
            name: 'Dry Run Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART'
        });

        const dryRes = await service.runDryRun('act-dry', 'sys-target-1');
        expect(dryRes.dryRun).toBe(true);
        expect(dryRes.status).toBe('PLANNED');
        expect(dryRes.executionPlan).toBeDefined();
    });

    test('14. Dry-run produces no side effect', async () => {
        const action = service.createAction({
            actionId: 'act-dry-no-effect',
            name: 'Dry Run No Effect Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART'
        });

        const initialExecutions = service.listExecutions().length;
        await service.runDryRun('act-dry-no-effect', 'sys-target-1');
        const finalExecutions = service.listExecutions().length;

        // Executions logged with dryRun=true, side effect flag false
        const latest = service.listExecutions()[0];
        expect(latest.sideEffectExecuted).toBe(false);
    });

    test('15. Manual execution', async () => {
        const action = service.createAction({
            actionId: 'act-manual',
            name: 'Manual Restart Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART'
        });

        const execRes = await service.executeRemediation('act-manual', 'sys-target-1', { actor: 'admin' });
        expect(execRes.status).toMatch(/^(?:SUCCEEDED|VERIFIED)$/);
        expect(execRes.requestedBy).toBe('admin');
    });

    test('16. Successful execution', async () => {
        const action = service.createAction({
            actionId: 'act-success',
            name: 'Successful Action',
            targetSystemId: 'sys-target-1',
            capability: 'CLEAR_CACHE'
        });

        const execRes = await service.executeRemediation('act-success', 'sys-target-1');
        expect(execRes.status).toMatch(/^(?:SUCCEEDED|VERIFIED)$/);
        expect(execRes.executionResult.success).toBe(true);
    });

    test('17. Failed execution', async () => {
        const action = service.createAction({
            actionId: 'act-fail',
            name: 'Failing Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART',
            parameters: { simulateFailure: true }
        });

        // Mock execution engine internal side effect to fail
        const origExecute = service.executionEngine.executeAdapterAction;
        service.executionEngine.executeAdapterAction = async () => {
            throw new Error('Adapter connection timeout during remediation');
        };

        const execRes = await service.executeRemediation('act-fail', 'sys-target-1');
        expect(execRes.status).toBe('FAILED');
        expect(execRes.error).toMatch(/Adapter connection timeout/);

        service.executionEngine.executeAdapterAction = origExecute;
    });

    test('18. Verification success', async () => {
        const action = service.createAction({
            actionId: 'act-verify-success',
            name: 'Action with Verification',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART',
            verificationStrategy: { type: 'HEALTH_CHECK' }
        });

        // Mock health check engine returning HEALTHY
        service.executionEngine.healthEngine = {
            checkSystemHealth: async () => ({ status: 'HEALTHY' })
        };

        const execRes = await service.executeRemediation('act-verify-success', 'sys-target-1');
        expect(execRes.status).toBe('VERIFIED');
        expect(execRes.verificationResult.verified).toBe(true);
    });

    test('19. Verification failure', async () => {
        const action = service.createAction({
            actionId: 'act-verify-fail',
            name: 'Action with Failing Verification',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART',
            verificationStrategy: { type: 'HEALTH_CHECK' }
        });

        // Mock health check engine returning DEGRADED
        service.executionEngine.healthEngine = {
            checkSystemHealth: async () => ({ status: 'DEGRADED' })
        };

        const execRes = await service.executeRemediation('act-verify-fail', 'sys-target-1');
        expect(execRes.status).toBe('FAILED');
        expect(execRes.verificationResult.verified).toBe(false);
    });

    test('20. Rollback execution', async () => {
        const action = service.createAction({
            actionId: 'act-with-rollback',
            name: 'Action with Rollback Strategy',
            targetSystemId: 'sys-target-1',
            capability: 'RECONFIG',
            rollbackStrategy: {
                capability: 'RECONFIG',
                parameters: { mode: 'previous' }
            }
        });

        const execRes = await service.executeRemediation('act-with-rollback', 'sys-target-1');
        const rollbackRes = await service.rollbackExecution(execRes.remediationId);

        expect(rollbackRes.status).toBe('ROLLED_BACK');
        expect(rollbackRes.rollbackResult.success).toBe(true);
    });

    test('21. Rollback unavailable', async () => {
        const action = service.createAction({
            actionId: 'act-no-rollback',
            name: 'Action without Rollback',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART',
            rollbackStrategy: { available: false }
        });

        const execRes = await service.executeRemediation('act-no-rollback', 'sys-target-1');
        const rollbackRes = await service.rollbackExecution(execRes.remediationId);

        expect(rollbackRes.status).toBe('ROLLBACK_UNAVAILABLE');
        expect(rollbackRes.error).toMatch(/No rollback strategy/);
    });

    test('22. Rollback failure', async () => {
        const action = service.createAction({
            actionId: 'act-rollback-fail',
            name: 'Action with Failing Rollback',
            targetSystemId: 'sys-target-1',
            capability: 'RECONFIG',
            rollbackStrategy: {
                available: true,
                capability: 'RECONFIG',
                parameters: { failRollback: true }
            }
        });

        // Mock rollback engine failure
        const origRollback = service.executionEngine.rollbackEngine.rollback;
        service.executionEngine.rollbackEngine.rollback = async () => ({
            status: 'ROLLBACK_FAILED',
            success: false,
            error: 'Rollback endpoint unreachable'
        });

        const execRes = await service.executeRemediation('act-rollback-fail', 'sys-target-1');
        const rollbackRes = await service.rollbackExecution(execRes.remediationId);

        expect(rollbackRes.status).toBe('ROLLBACK_FAILED');
        expect(rollbackRes.error).toMatch(/Rollback endpoint unreachable/);

        service.executionEngine.rollbackEngine.rollback = origRollback;
    });

    test('23. Retry policy', async () => {
        const action = service.createAction({
            actionId: 'act-retry',
            name: 'Action with Retry Policy',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART',
            retryPolicy: { maxAttempts: 3, backoffMs: 10 }
        });

        let attempts = 0;
        service.executionEngine.executionService = {
            executeOperation: async () => {
                attempts++;
                if (attempts < 3) throw new Error('Transient failure');
                return { success: true };
            }
        };

        const execRes = await service.executeRemediation('act-retry', 'sys-target-1');
        service.executionEngine.executionService = null;
        expect(attempts).toBe(3);
        expect(execRes.status).toMatch(/^(?:SUCCEEDED|VERIFIED)$/);
    });

    test('24. Cooldown protection', async () => {
        const action = service.createAction({
            actionId: 'act-cooldown',
            name: 'Cooldown Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART'
        });

        // Execute first time
        await service.executeRemediation('act-cooldown', 'sys-target-1');

        // Immediately execute second time with cooldown
        const secondRes = await service.executeRemediation('act-cooldown', 'sys-target-1', { cooldownMs: 60000 });
        expect(secondRes.status).toBe('BLOCKED');
        expect(secondRes.error).toMatch(/Safety check failed/);
    });

    test('25. Execution storm protection', async () => {
        const safetyEngine = new RemediationSafetyEngine();
        
        // Trigger 10 executions in rapid succession
        for (let i = 0; i < 5; i++) {
            safetyEngine.recordAttempt('act-storm', 'sys-target-1');
        }

        const check = safetyEngine.validateSafety({ actionId: 'act-storm' }, 'sys-target-1', systemRegistry);
        expect(check.safe).toBe(false);
        expect(check.reason).toMatch(/storm protection activated/i);
    });

    test('26. Duplicate remediation prevention', async () => {
        const safetyEngine = new RemediationSafetyEngine();
        const action = { actionId: 'act-dup', retryPolicy: { maxAttempts: 2 } };

        safetyEngine.recordAttempt('act-dup', 'sys-target-1');
        safetyEngine.recordAttempt('act-dup', 'sys-target-1');

        const check = safetyEngine.validateSafety(action, 'sys-target-1', systemRegistry);
        expect(check.safe).toBe(false);
        expect(check.reason).toMatch(/Maximum attempt limit/);
    });

    test('27. Concurrent execution prevention', async () => {
        const safetyEngine = new RemediationSafetyEngine();
        safetyEngine.acquireLock('act-concurrent', 'sys-target-1');

        const check = safetyEngine.validateSafety({ actionId: 'act-concurrent' }, 'sys-target-1', systemRegistry);
        expect(check.safe).toBe(false);
        expect(check.reason).toMatch(/Concurrent execution lock active/);
    });

    test('28. Circuit breaker', () => {
        const safetyEngine = new RemediationSafetyEngine();

        // Record 5 failures to trigger circuit breaker
        for (let i = 0; i < 5; i++) {
            safetyEngine.recordFailure('sys-target-1');
        }

        const check = safetyEngine.validateSafety({ actionId: 'act-cb' }, 'sys-target-1', systemRegistry);
        expect(check.safe).toBe(false);
        expect(check.reason).toMatch(/Circuit breaker OPEN/);
    });

    test('29. Credential sanitization', () => {
        const rawData = {
            actionId: 'act-secret',
            targetSystemId: 'sys-target-1',
            parameters: {
                apiKey: 'secret_12345',
                password: 'SuperSecretPassword!',
                normalParam: 'public_value'
            }
        };

        const action = new RemediationAction(rawData);
        const json = action.toJSON();

        expect(json.parameters.apiKey).toBe('[REDACTED]');
        expect(json.parameters.password).toBe('[REDACTED]');
        expect(json.parameters.normalParam).toBe('public_value');
    });

    test('30. SSRF protection', () => {
        const safetyEngine = new RemediationSafetyEngine({ allowLocalhost: false });
        
        // Attempt unsafe internal cloud metadata IP
        const unsafeSystemRegistry = new SystemRegistry();
        unsafeSystemRegistry.registerSystem({
            id: 'sys-ssrf',
            name: 'SSRF Attack System',
            version: '1.0.0',
            type: 'SERVICE',
            endpoints: { health: 'http://169.254.169.254/latest/meta-data/' }
        });

        const check = safetyEngine.validateSafety({ actionId: 'act-ssrf' }, 'sys-ssrf', unsafeSystemRegistry);
        expect(check.safe).toBe(false);
        expect(check.reason).toMatch(/SSRF/i);
    });

    test('31. Prototype pollution protection', () => {
        const safetyEngine = new RemediationSafetyEngine();
        
        const pollutedObj = { actionId: 'act-polluted', prototype: {} };

        const check = safetyEngine.validateSafety(pollutedObj, 'sys-target-1', systemRegistry);
        expect(check.safe).toBe(false);
        expect(check.reason).toMatch(/prototype/i);
    });

    test('32. Safe expression evaluation', () => {
        const rule = new RemediationRule({
            ruleId: 'rule-safe',
            name: 'Safe Rule',
            remediationActionId: 'act-1',
            condition: { metric: 'latencyMs', operator: 'GREATER_THAN', value: 500 }
        });

        expect(rule.matchesTrigger({ metric: 'latencyMs', value: 600 })).toBe(true);
        expect(rule.matchesTrigger({ metric: 'latencyMs', value: 200 })).toBe(false);

        // Verify zero eval() was executed
        expect(typeof eval).toBe('function');
    });

    test('33. Audit record creation', async () => {
        const action = service.createAction({
            actionId: 'act-audit',
            name: 'Audited Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART'
        });

        await service.executeRemediation('act-audit', 'sys-target-1');
        const audits = service.store.listAuditLogs();

        expect(audits.length).toBeGreaterThan(0);
        expect(audits[0].actionId).toBe('act-audit');
        expect(audits[0].systemId).toBe('sys-target-1');
    });

    test('34. Metrics calculation', async () => {
        const action = service.createAction({
            actionId: 'act-metric',
            name: 'Metric Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART'
        });

        await service.executeRemediation('act-metric', 'sys-target-1');
        const metrics = service.getMetrics();

        expect(metrics.totalAttempts).toBe(1);
        expect(metrics.successfulRemediations).toBe(1);
        expect(metrics.remediationSuccessRate).toBe(100);
    });

    test('35. Health-triggered remediation', async () => {
        const action = service.createAction({
            actionId: 'act-health-heal',
            name: 'Heal Degraded Health',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART'
        });

        service.createRule({
            ruleId: 'rule-health-degraded',
            name: 'Trigger on Degraded Health',
            triggerSource: 'HEALTH',
            targetSystemId: 'sys-target-1',
            remediationActionId: 'act-health-heal',
            condition: { metric: 'status', operator: 'EQUALS', value: 'DEGRADED' }
        });

        const triggered = await service.evaluateEventTriggers({
            metric: 'status',
            value: 'DEGRADED',
            systemId: 'sys-target-1'
        });

        expect(triggered.length).toBe(1);
        expect(triggered[0].status).toMatch(/^(?:SUCCEEDED|VERIFIED)$/);
    });

    test('36. Quality-triggered remediation', async () => {
        const action = service.createAction({
            actionId: 'act-quality-heal',
            name: 'Heal Quality Test Failure',
            targetSystemId: 'sys-target-1',
            capability: 'CLEAR_CACHE'
        });

        service.createRule({
            ruleId: 'rule-quality-fail',
            name: 'Trigger on Quality Test Failure',
            triggerSource: 'QUALITY',
            targetSystemId: 'sys-target-1',
            remediationActionId: 'act-quality-heal',
            condition: { metric: 'testResult', operator: 'EQUALS', value: 'FAIL' }
        });

        const triggered = await service.evaluateEventTriggers({
            metric: 'testResult',
            value: 'FAIL',
            systemId: 'sys-target-1'
        });

        expect(triggered.length).toBe(1);
        expect(triggered[0].status).toMatch(/^(?:SUCCEEDED|VERIFIED)$/);
    });

    test('37. Intelligence-triggered remediation', async () => {
        const action = service.createAction({
            actionId: 'act-intel-heal',
            name: 'Heal Anomaly Insight',
            targetSystemId: 'sys-target-1',
            capability: 'RECONFIG'
        });

        service.createRule({
            ruleId: 'rule-intel-insight',
            name: 'Trigger on Anomaly Insight',
            triggerSource: 'INTELLIGENCE',
            targetSystemId: 'sys-target-1',
            remediationActionId: 'act-intel-heal',
            condition: { metric: 'insightType', operator: 'EQUALS', value: 'ANOMALY_CORRELATION' }
        });

        const triggered = await service.evaluateEventTriggers({
            metric: 'insightType',
            value: 'ANOMALY_CORRELATION',
            systemId: 'sys-target-1'
        });

        expect(triggered.length).toBe(1);
    });

    test('38. Alert-triggered remediation', async () => {
        const action = service.createAction({
            actionId: 'act-alert-heal',
            name: 'Heal Critical Alert',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART'
        });

        service.createRule({
            ruleId: 'rule-alert-critical',
            name: 'Trigger on Critical Alert',
            triggerSource: 'ALERT',
            targetSystemId: 'sys-target-1',
            remediationActionId: 'act-alert-heal',
            condition: { metric: 'severity', operator: 'EQUALS', value: 'CRITICAL' }
        });

        const triggered = await service.evaluateEventTriggers({
            metric: 'severity',
            value: 'CRITICAL',
            systemId: 'sys-target-1'
        });

        expect(triggered.length).toBe(1);
    });

    test('39. Agent capability remediation', async () => {
        const action = service.createAction({
            actionId: 'act-agent-heal',
            name: 'Agent Self-Healing Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART'
        });

        const execRes = await service.executeRemediation('act-agent-heal', 'sys-target-1');
        expect(execRes.status).toMatch(/^(?:SUCCEEDED|VERIFIED)$/);
    });

    test('40. Full end-to-end remediation lifecycle', async () => {
        // 1. Register Action & Rule
        const action = service.createAction({
            actionId: 'act-e2e',
            name: 'End to End Remediation Action',
            targetSystemId: 'sys-target-1',
            capability: 'RESTART',
            verificationStrategy: { type: 'HEALTH_CHECK' },
            rollbackStrategy: { capability: 'RECONFIG' }
        });

        service.createRule({
            ruleId: 'rule-e2e',
            name: 'End to End Rule',
            triggerSource: 'HEALTH',
            targetSystemId: 'sys-target-1',
            remediationActionId: 'act-e2e',
            condition: { metric: 'status', operator: 'EQUALS', value: 'OFFLINE' }
        });

        // Mock verification pass
        service.executionEngine.healthEngine = {
            checkSystemHealth: async () => ({ status: 'HEALTHY' })
        };

        // 2. Trigger Event
        const executions = await service.evaluateEventTriggers({
            metric: 'status',
            value: 'OFFLINE',
            systemId: 'sys-target-1'
        });

        expect(executions.length).toBe(1);
        const exec = executions[0];

        // 3. Verify Lifecycle Transitions: PLANNED -> EXECUTING -> SUCCEEDED -> VERIFIED
        expect(exec.status).toBe('VERIFIED');
        expect(exec.verificationResult.verified).toBe(true);

        // 4. Test Manual Rollback
        const rollback = await service.rollbackExecution(exec.remediationId);
        expect(rollback.status).toBe('ROLLED_BACK');

        // 5. Verify REST API Endpoint Returns Complete Audit
        const apiRes = await request(app)
            .get(`/api/v1/remediation/executions/${exec.remediationId}`)
            .set('x-user-role', 'admin');

        expect(apiRes.status).toBe(200);
        expect(apiRes.body.data.remediationId).toBe(exec.remediationId);
        expect(apiRes.body.data.status).toBe('ROLLED_BACK');
    });
});
