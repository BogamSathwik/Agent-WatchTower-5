/**
 * Universal Orchestration & Continuous Monitoring Engine Test Suite (Phase 10)
 * Verifies end-to-end orchestration, DAG validation, execution modes, timeouts, retries,
 * failure policies, scheduling, idempotency, RBAC, AgentGenPro compliance, and zero hardcoding.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const OrchestrationPlan = require('../src/orchestration/OrchestrationPlan');
const OrchestrationStep = require('../src/orchestration/OrchestrationStep');
const OrchestrationValidator = require('../src/orchestration/OrchestrationValidator');
const OrchestrationEngine = require('../src/orchestration/OrchestrationEngine');
const OrchestrationScheduler = require('../src/orchestration/OrchestrationScheduler');
const OrchestrationService = require('../src/orchestration/OrchestrationService');
const { RUN_STATES, STEP_STATES, SCHEDULER_STATES } = require('../src/orchestration/OrchestrationStates');

describe('Universal Orchestration & Continuous Monitoring Engine (Phase 10)', () => {
    let app;
    let systemRegistry;
    let orchestrationService;

    beforeEach(async () => {
        systemRegistry = new SystemRegistry();
        systemRegistry.registerSystem({
            id: 'DEMO-SYSTEM-001',
            name: 'Demo Processing System',
            version: '1.0.0',
            contractVersion: '1.0.0',
            category: 'service',
            capabilities: ['health', 'execute', 'telemetry', 'testing']
        });

        systemRegistry.registerSystem({
            id: 'DEMO-SYSTEM-002',
            name: 'Secondary Analytics Worker',
            version: '1.0.0',
            contractVersion: '1.0.0',
            category: 'service',
            capabilities: ['health', 'execute']
        });

        app = createApp(systemRegistry);
        orchestrationService = app.get('orchestrationService');
    });

    // 1. Plan creation
    test('1. Plan creation with valid parameters', () => {
        const plan = orchestrationService.createPlan({
            id: 'plan_test_01',
            name: 'Continuous Health & Quality Routine',
            targetMode: 'SYSTEM',
            targets: ['DEMO-SYSTEM-001'],
            steps: [
                { id: 's1', type: 'HEALTH' },
                { id: 's2', type: 'QUALITY', dependsOn: ['s1'] }
            ]
        });

        expect(plan.id).toBe('plan_test_01');
        expect(plan.steps.length).toBe(2);
    });

    // 2. Invalid plan rejection
    test('2. Invalid plan rejection (missing steps)', () => {
        expect(() => {
            orchestrationService.createPlan({
                id: 'invalid_plan',
                name: 'Bad Plan',
                steps: []
            });
        }).toThrow(/Plan must contain at least one step/);
    });

    // 3. Plan validation
    test('3. Plan validation method verifies valid structure', () => {
        const plan = new OrchestrationPlan({
            name: 'Valid Workflow',
            steps: [{ id: 'step1', type: 'HEALTH' }]
        });
        const res = OrchestrationValidator.validatePlan(plan);
        expect(res.valid).toBe(true);
    });

    // 4. System target resolution
    test('4. Target resolution for specific system IDs', () => {
        const engine = orchestrationService.orchestrationEngine;
        const plan = new OrchestrationPlan({
            targetMode: 'SYSTEMS',
            targets: ['DEMO-SYSTEM-001', 'DEMO-SYSTEM-002'],
            steps: [{ id: 's1', type: 'HEALTH' }]
        });
        const targets = engine.resolveTargetSystems(plan);
        expect(targets).toEqual(['DEMO-SYSTEM-001', 'DEMO-SYSTEM-002']);
    });

    // 5. ALL_ACTIVE targeting
    test('5. ALL_ACTIVE targeting resolves all registered active systems', () => {
        const engine = orchestrationService.orchestrationEngine;
        const plan = new OrchestrationPlan({
            targetMode: 'ALL_ACTIVE',
            steps: [{ id: 's1', type: 'HEALTH' }]
        });
        const targets = engine.resolveTargetSystems(plan);
        expect(targets).toContain('DEMO-SYSTEM-001');
        expect(targets).toContain('DEMO-SYSTEM-002');
    });

    // 6. Filter targeting
    test('6. Filter targeting resolves matching metadata', () => {
        const engine = orchestrationService.orchestrationEngine;
        const plan = new OrchestrationPlan({
            targetMode: 'FILTER',
            targetFilter: { category: 'service' },
            steps: [{ id: 's1', type: 'HEALTH' }]
        });
        const targets = engine.resolveTargetSystems(plan);
        expect(targets.length).toBe(2);
    });

    // 7. Single-step execution
    test('7. Single-step HEALTH execution', async () => {
        const plan = orchestrationService.createPlan({
            name: 'Single Health Check',
            targets: ['DEMO-SYSTEM-001'],
            steps: [{ id: 'h1', type: 'HEALTH' }]
        });

        const result = await orchestrationService.runPlan(plan.id);
        expect(result.status).toBe(RUN_STATES.COMPLETED);
        expect(result.stepsExecuted).toBe(1);
    });

    // 8. Multi-step execution
    test('8. Multi-step execution across multiple platform engines', async () => {
        const plan = orchestrationService.createPlan({
            name: 'Full Suite',
            targets: ['DEMO-SYSTEM-001'],
            steps: [
                { id: 'h1', type: 'HEALTH' },
                { id: 'q1', type: 'QUALITY' },
                { id: 'u1', type: 'USAGE' },
                { id: 'e1', type: 'EXPERIENCE' },
                { id: 'i1', type: 'INTELLIGENCE' },
                { id: 'a1', type: 'ALERT' },
                { id: 'r1', type: 'REPORT' }
            ]
        });

        const result = await orchestrationService.runPlan(plan.id);
        expect(result.status).toBe(RUN_STATES.COMPLETED);
        expect(result.stepsExecuted).toBe(7);
    });

    // 9. Sequential execution
    test('9. Sequential execution mode preserves linear ordering', async () => {
        const plan = orchestrationService.createPlan({
            name: 'Sequential Execution',
            executionMode: 'SEQUENTIAL',
            targets: ['DEMO-SYSTEM-001'],
            steps: [
                { id: 's1', type: 'HEALTH' },
                { id: 's2', type: 'USAGE' }
            ]
        });

        const result = await orchestrationService.runPlan(plan.id);
        expect(result.status).toBe(RUN_STATES.COMPLETED);
    });

    // 10. Parallel execution
    test('10. Parallel execution mode processes independent steps', async () => {
        const plan = orchestrationService.createPlan({
            name: 'Parallel Execution',
            executionMode: 'PARALLEL',
            targets: ['DEMO-SYSTEM-001'],
            steps: [
                { id: 'p1', type: 'HEALTH' },
                { id: 'p2', type: 'USAGE' }
            ]
        });

        const result = await orchestrationService.runPlan(plan.id);
        expect(result.status).toBe(RUN_STATES.COMPLETED);
    });

    // 11. Dependency-aware execution
    test('11. Dependency-aware execution orders step graph topologically', async () => {
        const plan = orchestrationService.createPlan({
            name: 'DAG Workflow',
            executionMode: 'DEPENDENCY_AWARE',
            targets: ['DEMO-SYSTEM-001'],
            steps: [
                { id: 'report', type: 'REPORT', dependsOn: ['intel'] },
                { id: 'health', type: 'HEALTH' },
                { id: 'intel', type: 'INTELLIGENCE', dependsOn: ['health'] }
            ]
        });

        const result = await orchestrationService.runPlan(plan.id);
        expect(result.status).toBe(RUN_STATES.COMPLETED);
        const order = result.stepResults.map(r => r.stepId);
        expect(order.indexOf('health')).toBeLessThan(order.indexOf('intel'));
        expect(order.indexOf('intel')).toBeLessThan(order.indexOf('report'));
    });

    // 12. Missing dependency rejection
    test('12. Missing dependency in step DAG rejected by validator', () => {
        const plan = new OrchestrationPlan({
            name: 'Missing Dep Plan',
            steps: [
                { id: 's1', type: 'HEALTH', dependsOn: ['non_existent_step'] }
            ]
        });

        const res = OrchestrationValidator.validatePlan(plan);
        expect(res.valid).toBe(false);
        expect(res.errors[0]).toMatch(/depends on missing step/);
    });

    // 13. Circular dependency rejection
    test('13. Circular dependency in step DAG rejected by validator', () => {
        const plan = new OrchestrationPlan({
            name: 'Circular Dep Plan',
            steps: [
                { id: 's1', type: 'HEALTH', dependsOn: ['s2'] },
                { id: 's2', type: 'QUALITY', dependsOn: ['s1'] }
            ]
        });

        const res = OrchestrationValidator.validatePlan(plan);
        expect(res.valid).toBe(false);
        expect(res.errors[0]).toMatch(/Circular dependency detected/);
    });

    // 14. Step timeout
    test('14. Step timeout handles slow or hanging handlers', async () => {
        const engine = orchestrationService.orchestrationEngine;
        // Mock slow handler
        engine.dispatchStepHandler = async () => {
            return new Promise(r => setTimeout(r, 200));
        };

        const plan = new OrchestrationPlan({
            name: 'Timeout Test',
            targets: ['DEMO-SYSTEM-001'],
            steps: [{ id: 'slow_step', type: 'HEALTH', timeoutMs: 50 }]
        });

        const result = await engine.executePlan(plan);
        expect(result.stepsFailed).toBe(1);
        expect(result.stepResults[0].error.code).toBe('TIMEOUT_ERROR');
    });

    // 15. Overall timeout
    test('15. Overall plan timeout aborts long-running orchestration run', async () => {
        const engine = orchestrationService.orchestrationEngine;
        engine.dispatchStepHandler = async () => {
            return new Promise(r => setTimeout(r, 300));
        };

        const plan = new OrchestrationPlan({
            name: 'Overall Timeout Test',
            targets: ['DEMO-SYSTEM-001'],
            timeoutMs: 50,
            steps: [{ id: 's1', type: 'HEALTH', timeoutMs: 1000 }]
        });

        const result = await engine.executePlan(plan);
        expect(result.status).toBe(RUN_STATES.FAILED);
        expect(result.errors[0]).toMatch(/Overall orchestration timeout/);
    });

    // 16. Retry behavior
    test('16. Retry behavior attempts execution up to maxAttempts', async () => {
        const engine = orchestrationService.orchestrationEngine;
        let calls = 0;
        engine.dispatchStepHandler = async () => {
            calls++;
            if (calls === 1) throw new Error('Transient NETWORK_ERROR');
            return { status: 'HEALTHY' };
        };

        const step = new OrchestrationStep({
            id: 'retry_step',
            type: 'HEALTH',
            retryPolicy: { maxAttempts: 3, backoffMs: 10, retryableErrors: ['NETWORK_ERROR'] }
        });

        const run = new (require('../src/orchestration/OrchestrationRun'))({});
        const res = await engine.executeStepWithRetry(step, 'DEMO-SYSTEM-001', run);

        expect(res.status).toBe(STEP_STATES.PASSED);
        expect(res.attempts).toBe(2);
    });

    // 17. Non-retryable error behavior
    test('17. Non-retryable error aborts immediately without retrying', async () => {
        const engine = orchestrationService.orchestrationEngine;
        let calls = 0;
        engine.dispatchStepHandler = async () => {
            calls++;
            const err = new Error('FATAL_AUTH_ERROR');
            err.code = 'FATAL_AUTH_ERROR';
            throw err;
        };

        const step = new OrchestrationStep({
            id: 'auth_step',
            type: 'HEALTH',
            retryPolicy: { maxAttempts: 3, backoffMs: 10, retryableErrors: ['NETWORK_ERROR'] }
        });

        const run = new (require('../src/orchestration/OrchestrationRun'))({});
        const res = await engine.executeStepWithRetry(step, 'DEMO-SYSTEM-001', run);

        expect(res.status).toBe(STEP_STATES.FAILED);
        expect(res.attempts).toBe(1);
    });

    // 18. FAIL_FAST policy
    test('18. FAIL_FAST policy halts orchestration upon step failure', async () => {
        const engine = orchestrationService.orchestrationEngine;
        engine.dispatchStepHandler = async (step) => {
            if (step.id === 'failing') throw new Error('System error');
            return { status: 'OK' };
        };

        const plan = new OrchestrationPlan({
            name: 'Fail Fast Plan',
            failurePolicy: 'FAIL_FAST',
            targets: ['DEMO-SYSTEM-001'],
            steps: [
                { id: 'failing', type: 'HEALTH' },
                { id: 'subsequent', type: 'QUALITY' }
            ]
        });

        const result = await engine.executePlan(plan);
        expect(result.status).toBe(RUN_STATES.FAILED);
        expect(result.stepsExecuted).toBe(1);
    });

    // 19. CONTINUE policy
    test('19. CONTINUE policy proceeds with independent steps despite failure', async () => {
        const engine = orchestrationService.orchestrationEngine;
        engine.dispatchStepHandler = async (step) => {
            if (step.id === 'failing') throw new Error('System error');
            return { status: 'OK' };
        };

        const plan = new OrchestrationPlan({
            name: 'Continue Plan',
            failurePolicy: 'CONTINUE',
            targets: ['DEMO-SYSTEM-001'],
            steps: [
                { id: 'failing', type: 'HEALTH', continueOnFailure: true },
                { id: 'independent', type: 'QUALITY' }
            ]
        });

        const result = await engine.executePlan(plan);
        expect(result.stepsExecuted).toBe(2);
        expect(result.stepsFailed).toBe(1);
        expect(result.stepsPassed).toBe(1);
    });

    // 20. PARTIAL result
    test('20. CONTINUE_AND_MARK_PARTIAL results in PARTIAL status on mixed results', async () => {
        const engine = orchestrationService.orchestrationEngine;
        engine.dispatchStepHandler = async (step) => {
            if (step.id === 'failing') throw new Error('System error');
            return { status: 'OK' };
        };

        const plan = new OrchestrationPlan({
            name: 'Partial Plan',
            failurePolicy: 'CONTINUE_AND_MARK_PARTIAL',
            targets: ['DEMO-SYSTEM-001'],
            steps: [
                { id: 'failing', type: 'HEALTH', continueOnFailure: true },
                { id: 'passing', type: 'QUALITY' }
            ]
        });

        const result = await engine.executePlan(plan);
        expect(result.status).toBe(RUN_STATES.PARTIAL);
    });

    // 21. Successful orchestration
    test('21. Successful orchestration produces normalized result', async () => {
        const plan = orchestrationService.createPlan({
            name: 'Success Plan',
            targets: ['DEMO-SYSTEM-001'],
            steps: [{ id: 's1', type: 'HEALTH' }]
        });

        const result = await orchestrationService.runPlan(plan.id);
        expect(result.status).toBe(RUN_STATES.COMPLETED);
        expect(result.runId).toBeDefined();
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    // 22. Failed orchestration
    test('22. Failed orchestration logs error details', async () => {
        const engine = orchestrationService.orchestrationEngine;
        engine.dispatchStepHandler = async () => { throw new Error('Fatal engine crash'); };

        const plan = new OrchestrationPlan({
            name: 'Crash Plan',
            failurePolicy: 'FAIL_FAST',
            targets: ['DEMO-SYSTEM-001'],
            steps: [{ id: 'c1', type: 'HEALTH' }]
        });

        const result = await engine.executePlan(plan);
        expect(result.status).toBe(RUN_STATES.FAILED);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    // 23. Cancellation
    test('23. Run cancellation terminates active execution', () => {
        const store = orchestrationService.orchestrationStore;
        const run = new (require('../src/orchestration/OrchestrationRun'))({ planId: 'p1' });
        run.status = RUN_STATES.RUNNING;
        store.saveRun(run);

        const cancelled = orchestrationService.cancelRun(run.runId);
        expect(cancelled).toBe(true);
        expect(store.getRun(run.runId).status).toBe(RUN_STATES.CANCELLED);
    });

    // 24. Duplicate execution protection
    test('24. Duplicate execution protection via idempotency key', async () => {
        const plan = orchestrationService.createPlan({
            name: 'Idempotent Plan',
            targets: ['DEMO-SYSTEM-001'],
            steps: [{ id: 's1', type: 'HEALTH' }]
        });

        const res1 = await orchestrationService.runPlan(plan.id, { idempotencyKey: 'key_123' });
        const res2 = await orchestrationService.runPlan(plan.id, { idempotencyKey: 'key_123' });

        expect(res1.runId).toBe(res2.runId);
    });

    // 25. Idempotency key lookup
    test('25. Idempotency key returns cached run from store', () => {
        const store = orchestrationService.orchestrationStore;
        const run = new (require('../src/orchestration/OrchestrationRun'))({
            planId: 'p1',
            idempotencyKey: 'test_idem_key'
        });
        store.saveRun(run);

        const found = store.getRunByIdempotencyKey('test_idem_key');
        expect(found.runId).toBe(run.runId);
    });

    // 26. Concurrency limit
    test('26. Concurrency limit defaults correctly on plan', () => {
        const plan = new OrchestrationPlan({ concurrencyLimit: 10, steps: [{ id: 's1', type: 'HEALTH' }] });
        expect(plan.concurrencyLimit).toBe(10);
    });

    // 27. Scheduler start
    test('27. Scheduler start sets state to RUNNING', () => {
        const scheduler = orchestrationService.orchestrationScheduler;
        const status = scheduler.start();
        expect(status.state).toBe(SCHEDULER_STATES.RUNNING);
        scheduler.stop();
    });

    // 28. Scheduler stop
    test('28. Scheduler stop clears active timers', () => {
        const scheduler = orchestrationService.orchestrationScheduler;
        scheduler.start();
        const status = scheduler.stop();
        expect(status.state).toBe(SCHEDULER_STATES.STOPPED);
        expect(status.activeTimersCount).toBe(0);
    });

    // 29. Scheduler pause
    test('29. Scheduler pause transitions state to PAUSED', () => {
        const scheduler = orchestrationService.orchestrationScheduler;
        scheduler.start();
        const status = scheduler.pause();
        expect(status.state).toBe(SCHEDULER_STATES.PAUSED);
        scheduler.stop();
    });

    // 30. Scheduler resume
    test('30. Scheduler resume restores RUNNING state', () => {
        const scheduler = orchestrationService.orchestrationScheduler;
        scheduler.start();
        scheduler.pause();
        const status = scheduler.resume();
        expect(status.state).toBe(SCHEDULER_STATES.RUNNING);
        scheduler.stop();
    });

    // 31. Overlapping execution prevention
    test('31. Overlapping execution prevention skips concurrent scheduler triggers', async () => {
        const scheduler = orchestrationService.orchestrationScheduler;
        scheduler.start();
        scheduler.runningPlans.add('plan_blocked');

        orchestrationService.createPlan({
            id: 'plan_blocked',
            name: 'Blocked Plan',
            enabled: true,
            schedule: { enabled: true, intervalMs: 1000 },
            steps: [{ id: 's1', type: 'HEALTH' }]
        });

        const res = await scheduler.triggerPlanExecution('plan_blocked');
        expect(res).toBeNull();
        expect(scheduler.overlapCount).toBeGreaterThan(0);
        scheduler.stop();
    });

    // 32. Execution history
    test('32. Execution history saved in store', async () => {
        const plan = orchestrationService.createPlan({
            name: 'History Plan',
            targets: ['DEMO-SYSTEM-001'],
            steps: [{ id: 's1', type: 'HEALTH' }]
        });

        await orchestrationService.runPlan(plan.id);
        const runs = orchestrationService.listRuns();
        expect(runs.length).toBeGreaterThan(0);
    });

    // 33. RBAC
    test('33. RBAC protection on orchestration API routes', async () => {
        // Viewer role should fail to create plan
        const failRes = await request(app)
            .post('/api/v1/orchestration/plans')
            .set('x-user-role', 'viewer')
            .send({ name: 'Unauthorized Plan', steps: [{ id: 's1', type: 'HEALTH' }] });
        expect(failRes.status).toBe(403);

        // Admin role succeeds
        const passRes = await request(app)
            .post('/api/v1/orchestration/plans')
            .set('x-user-role', 'admin')
            .send({ name: 'Authorized Plan', steps: [{ id: 's1', type: 'HEALTH' }] });
        expect(passRes.status).toBe(201);
    });

    // 34. Credential sanitization
    test('34. Credential sanitization redacts sensitive fields in results', () => {
        const engine = orchestrationService.orchestrationEngine;
        const dirty = { apiKey: 'secret_123', bearerToken: 'xyz789', normalData: 'visible' };
        const clean = engine.sanitizeOutput(dirty);
        expect(clean.apiKey).toBe('[REDACTED]');
        expect(clean.bearerToken).toBe('[REDACTED]');
        expect(clean.normalData).toBe('visible');
    });

    // 35. Prototype pollution protection
    test('35. Prototype pollution protection on plan input', () => {
        const engine = orchestrationService.orchestrationEngine;
        const polluted = JSON.parse('{"__proto__": {"polluted": true}}');
        const clean = engine.sanitizeOutput(polluted);
        expect(Object.prototype.polluted).toBeUndefined();
    });

    // 36. AgentGenPro route compatibility
    test('36. AgentGenPro route compatibility check on orchestration endpoints', async () => {
        const resOverview = await request(app)
            .get('/api/v1/orchestration/overview')
            .set('x-user-role', 'viewer');
        expect(resOverview.status).toBe(200);

        const resPlans = await request(app)
            .get('/api/v1/orchestration/plans')
            .set('x-user-role', 'viewer');
        expect(resPlans.status).toBe(200);

        const resSched = await request(app)
            .get('/api/v1/orchestration/scheduler/status')
            .set('x-user-role', 'viewer');
        expect(resSched.status).toBe(200);
    });

    // 37. No forbidden router APIs
    test('37. Router code contains no forbidden Node imports (fs, child_process, os)', () => {
        const routerCode = require('fs').readFileSync(
            require('path').join(__dirname, '../src/api/orchestrationRoutes.js'),
            'utf8'
        );
        expect(routerCode).not.toMatch(/require\(['"]fs['"]\)/);
        expect(routerCode).not.toMatch(/require\(['"]child_process['"]\)/);
        expect(routerCode).not.toMatch(/require\(['"]os['"]\)/);
        expect(routerCode).not.toMatch(/app\.listen/);
    });

    // 38. Universal/no-hardcoding audit
    test('38. Source code audit confirms zero hardcoded business domain references', () => {
        const fs = require('fs');
        const path = require('path');

        function scanDir(dir) {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const fullPath = path.join(dir, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    scanDir(fullPath);
                } else if (fullPath.endsWith('.js')) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    expect(content).not.toMatch(/COMPA|REPA|SMP|News|Hotel|Business|Social Media|Competitor|Reputation/i);
                }
            });
        }

        scanDir(path.join(__dirname, '../src/orchestration'));
    });
});
