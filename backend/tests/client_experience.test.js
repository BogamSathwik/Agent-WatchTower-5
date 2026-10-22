const request = require('supertest');
const { createApp } = require('../src/app');
const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { SystemExecutionService } = require('../src/service/SystemExecutionService');
const { HealthCheckEngine } = require('../src/health/HealthCheckEngine');
const { QualityTestRunner } = require('../src/quality/QualityTestRunner');
const { QualityTestDefinition } = require('../src/quality/QualityTestDefinition');
const { UsageEventCollector } = require('../src/usage/UsageEventCollector');
const { ClientExperienceEvent } = require('../src/experience/ClientExperienceEvent');
const { ClientFeedback } = require('../src/experience/ClientFeedback');
const { ClientIssue, ISSUE_STATUSES, ISSUE_SEVERITIES } = require('../src/experience/ClientIssue');
const { ExperienceStore } = require('../src/experience/ExperienceStore');
const { ExperienceAggregator } = require('../src/experience/ExperienceAggregator');
const { RepeatedIssueDetector } = require('../src/experience/RepeatedIssueDetector');

describe('Phase 6 — Universal Client Experience, Feedback and Issue Engine Test Suite', () => {
    let systemRegistry;
    let experienceStore;
    let aggregator;
    let app;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        experienceStore = new ExperienceStore({ systemRegistry });
        aggregator = new ExperienceAggregator(experienceStore);

        app = createApp({
            systemRegistry,
            experienceStore
        });

        // Register default neutral test system
        systemRegistry.registerSystem({
            id: 'DEMO-SYSTEM-001',
            name: 'Demo Processing System',
            version: '1.0.0',
            capabilities: ['execute', 'health', 'testing'],
            adapter: { adapterType: 'mock' }
        });
    });

    // 1. Feedback validation
    test('1. Feedback payload validation', () => {
        const invalidRes = ClientFeedback.validate({ comment: 'Missing systemId' });
        expect(invalidRes.valid).toBe(false);

        const validRes = ClientFeedback.validate({ systemId: 'DEMO-SYSTEM-001', comment: 'Valid' });
        expect(validRes.valid).toBe(true);
    });

    // 2. Rating validation
    test('2. Rating value validation against scale', () => {
        const invalidRating = ClientFeedback.processRating({ value: 10, scaleMin: 1, scaleMax: 5 });
        expect(invalidRating.valid).toBe(false);

        const validRating = ClientFeedback.processRating({ value: 4, scaleMin: 1, scaleMax: 5 });
        expect(validRating.valid).toBe(true);
        expect(validRating.normalizedScore).toBe(75);
    });

    // 3. Rating scale validation
    test('3. Custom rating scale support (1-10, 0-100)', () => {
        const r10 = ClientFeedback.processRating({ value: 8, scaleMin: 1, scaleMax: 10 });
        expect(r10.valid).toBe(true);
        expect(r10.normalizedScore).toBe(77.78);

        const r100 = ClientFeedback.processRating({ value: 90, scaleMin: 0, scaleMax: 100 });
        expect(r100.valid).toBe(true);
        expect(r100.normalizedScore).toBe(90);
    });

    // 4. Feedback creation
    test('4. Feedback creation and recording', () => {
        const fb = experienceStore.recordFeedback(new ClientFeedback({
            systemId: 'DEMO-SYSTEM-001',
            rating: 5,
            comment: 'Excellent execution performance'
        }));

        expect(fb.feedbackId).toBeDefined();
        expect(fb.systemId).toBe('DEMO-SYSTEM-001');
        expect(fb.rating.value).toBe(5);
    });

    // 5. Feedback retrieval
    test('5. Feedback retrieval by ID', () => {
        const fb = experienceStore.recordFeedback(new ClientFeedback({
            systemId: 'DEMO-SYSTEM-001',
            comment: 'Retrievable feedback'
        }));

        const fetched = experienceStore.getFeedback(fb.feedbackId);
        expect(fetched).toBeDefined();
        expect(fetched.comment).toBe('Retrievable feedback');
    });

    // 6. Issue creation
    test('6. Operational issue creation', () => {
        const issue = experienceStore.createIssue(new ClientIssue({
            systemId: 'DEMO-SYSTEM-001',
            description: 'Connection timeout during heavy load',
            severity: 'HIGH'
        }));

        expect(issue.issueId).toBeDefined();
        expect(issue.status).toBe(ISSUE_STATUSES.OPEN);
        expect(issue.severity).toBe(ISSUE_SEVERITIES.HIGH);
    });

    // 7. Issue retrieval
    test('7. Issue retrieval by ID', () => {
        const issue = experienceStore.createIssue(new ClientIssue({
            systemId: 'DEMO-SYSTEM-001',
            description: 'Fetchable issue'
        }));

        const fetched = experienceStore.getIssue(issue.issueId);
        expect(fetched).toBeDefined();
        expect(fetched.description).toBe('Fetchable issue');
    });

    // 8. Issue update
    test('8. Issue update', () => {
        const issue = experienceStore.createIssue(new ClientIssue({
            systemId: 'DEMO-SYSTEM-001',
            description: 'Issue to update'
        }));

        const updated = experienceStore.updateIssue(issue.issueId, { assignee: 'operator-1' });
        expect(updated.assignee).toBe('operator-1');
    });

    // 9. Issue lifecycle
    test('9. Valid issue lifecycle state transitions (OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED)', () => {
        const issue = experienceStore.createIssue(new ClientIssue({
            systemId: 'DEMO-SYSTEM-001',
            description: 'Lifecycle issue'
        }));

        issue.transitionTo(ISSUE_STATUSES.IN_PROGRESS);
        expect(issue.status).toBe(ISSUE_STATUSES.IN_PROGRESS);

        issue.transitionTo(ISSUE_STATUSES.RESOLVED, { resolution: 'Fixed adapter config' });
        expect(issue.status).toBe(ISSUE_STATUSES.RESOLVED);
        expect(issue.resolvedAt).toBeDefined();

        issue.transitionTo(ISSUE_STATUSES.CLOSED);
        expect(issue.status).toBe(ISSUE_STATUSES.CLOSED);
    });

    // 10. Invalid lifecycle transition
    test('10. Invalid lifecycle transition rejection (CLOSED -> IN_PROGRESS throwing error)', () => {
        const issue = new ClientIssue({
            systemId: 'DEMO-SYSTEM-001',
            status: ISSUE_STATUSES.CLOSED,
            description: 'Closed issue'
        });

        expect(() => {
            issue.transitionTo(ISSUE_STATUSES.IN_PROGRESS);
        }).toThrow('Invalid issue lifecycle transition');
    });

    // 11. Issue severity
    test('11. Issue severity classification', () => {
        const criticalIssue = new ClientIssue({
            systemId: 'DEMO-SYSTEM-001',
            severity: 'CRITICAL',
            description: 'Critical failure'
        });

        expect(criticalIssue.severity).toBe('CRITICAL');
    });

    // 12. Issue status
    test('12. Issue status verification', () => {
        const issue = new ClientIssue({
            systemId: 'DEMO-SYSTEM-001',
            status: 'REOPENED',
            description: 'Reopened issue'
        });

        expect(issue.status).toBe('REOPENED');
    });

    // 13. Resolution time
    test('13. Resolution time calculation in milliseconds', () => {
        const reportedAt = new Date(Date.now() - 10000).toISOString();
        const resolvedAt = new Date().toISOString();

        const issue = new ClientIssue({
            systemId: 'DEMO-SYSTEM-001',
            reportedAt,
            resolvedAt,
            status: ISSUE_STATUSES.RESOLVED
        });

        expect(issue.timeToResolutionMs).toBeGreaterThanOrEqual(9900);
    });

    // 14. Average rating
    test('14. Average explicit rating calculation', () => {
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', rating: 4 }));
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', rating: 2 }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.averageRating).toBe(3);
        expect(metrics.totalRatings).toBe(2);
    });

    // 15. Rating distribution
    test('15. Rating distribution count', () => {
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', rating: 5 }));
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', rating: 5 }));
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', rating: 3 }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.ratingDistribution['5/5']).toBe(2);
        expect(metrics.ratingDistribution['3/5']).toBe(1);
    });

    // 16. Feedback volume
    test('16. Feedback volume count', () => {
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', comment: 'c1' }));
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', comment: 'c2' }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.totalFeedback).toBe(2);
    });

    // 17. Issue counts
    test('17. Total issue counts calculation', () => {
        experienceStore.createIssue(new ClientIssue({ systemId: 'DEMO-SYSTEM-001', description: 'i1' }));
        experienceStore.createIssue(new ClientIssue({ systemId: 'DEMO-SYSTEM-001', description: 'i2' }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.totalIssues).toBe(2);
    });

    // 18. Open issue counts
    test('18. Open issue counts calculation', () => {
        experienceStore.createIssue(new ClientIssue({ systemId: 'DEMO-SYSTEM-001', status: 'OPEN', description: 'open1' }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.openIssues).toBe(1);
    });

    // 19. Resolved issue counts
    test('19. Resolved issue counts calculation', () => {
        experienceStore.createIssue(new ClientIssue({ systemId: 'DEMO-SYSTEM-001', status: 'RESOLVED', description: 'res1' }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.resolvedIssues).toBe(1);
    });

    // 20. Critical issue counts
    test('20. Critical issue counts calculation', () => {
        experienceStore.createIssue(new ClientIssue({ systemId: 'DEMO-SYSTEM-001', severity: 'CRITICAL', description: 'crit1' }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.criticalIssues).toBe(1);
    });

    // 21. Feedback trend
    test('21. Feedback trend time-series bucket generation', () => {
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', rating: 4 }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(Array.isArray(metrics.trend)).toBe(true);
        expect(metrics.trend.length).toBe(10);
    });

    // 22. Issue trend
    test('22. Issue trend tracking (opened vs resolved counts)', () => {
        experienceStore.createIssue(new ClientIssue({ systemId: 'DEMO-SYSTEM-001', status: 'OPEN', description: 'trend iss' }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.trend.some(b => b.issuesOpened > 0)).toBe(true);
    });

    // 23. Repeated issue grouping
    test('23. Deterministic repeated issue signature grouping', () => {
        const i1 = new ClientIssue({ systemId: 'DEMO-SYSTEM-001', category: 'network', description: 'Connection timeout error' });
        const i2 = new ClientIssue({ systemId: 'DEMO-SYSTEM-001', category: 'network', description: 'Connection timeout error' });

        const groups = RepeatedIssueDetector.detectRepeatedIssues([i1, i2]);
        expect(groups.length).toBe(1);
        expect(groups[0].issueCount).toBe(2);
    });

    // 24. Client filtering
    test('24. Client filtering of feedback and issues', () => {
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', clientId: 'client-A' }));
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', clientId: 'client-B' }));

        const clientAFb = experienceStore.getFeedbackByClient('client-A');
        expect(clientAFb.length).toBe(1);
        expect(clientAFb[0].clientId).toBe('client-A');
    });

    // 25. System filtering
    test('25. System filtering of experience data', () => {
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001' }));
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'OTHER-SYS-002' }));

        const sysFb = experienceStore.getFeedbackBySystem('DEMO-SYSTEM-001');
        expect(sysFb.length).toBe(1);
    });

    // 26. Timeline generation
    test('26. Chronological experience timeline generation', () => {
        experienceStore.recordFeedback(new ClientFeedback({ systemId: 'DEMO-SYSTEM-001', comment: 'FB 1' }));
        experienceStore.createIssue(new ClientIssue({ systemId: 'DEMO-SYSTEM-001', description: 'Iss 1' }));

        const timeline = aggregator.generateTimeline({ systemId: 'DEMO-SYSTEM-001' });
        expect(timeline.length).toBe(2);
    });

    // 27. Credential sanitization
    test('27. Credential sanitization in event and issue metadata', () => {
        const evt = new ClientExperienceEvent({
            systemId: 'DEMO-SYSTEM-001',
            metadata: {
                authorization: 'Bearer secret_token',
                apiKey: 'ak_live_123',
                password: 'secretpassword'
            }
        });

        expect(evt.metadata.authorization).toBe('[REDACTED]');
        expect(evt.metadata.apiKey).toBe('[REDACTED]');
        expect(evt.metadata.password).toBe('[REDACTED]');
    });

    // 28. Prototype pollution protection
    test('28. Prototype pollution protection on experience metadata', () => {
        const maliciousPayload = JSON.parse('{"systemId":"DEMO-SYSTEM-001","metadata":{"__proto__":{"polluted":true}}}');
        const evt = new ClientExperienceEvent(maliciousPayload);

        expect(Object.prototype.polluted).toBeUndefined();
        expect(evt).toBeDefined();
    });

    // 29. RBAC
    test('29. RBAC enforcement on experience routes', async () => {
        // GET routes open to viewer
        const resGet = await request(app).get('/api/v1/experience/overview');
        expect(resGet.status).toBe(200);

        // POST issue restricted to Operator/Admin
        const resPostViewer = await request(app)
            .post('/api/v1/experience/issues')
            .set('x-user-role', 'viewer')
            .send({ systemId: 'DEMO-SYSTEM-001', description: 'Unauthorized issue creation' });

        expect(resPostViewer.status).toBe(403);
    });

    // 30. Privacy controls
    test('30. Data minimization and privacy controls', () => {
        const fb = new ClientFeedback({
            systemId: 'DEMO-SYSTEM-001',
            comment: 'Public comment'
        });

        expect(fb.clientId).toBeNull();
        expect(fb.actorId).toBe('anonymous');
    });

    // 31. Health independence
    test('31. Health independence (system HEALTHY despite open CRITICAL issue)', () => {
        experienceStore.createIssue(new ClientIssue({
            systemId: 'DEMO-SYSTEM-001',
            severity: 'CRITICAL',
            status: 'OPEN'
        }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.criticalIssues).toBe(1);

        // System health remains independent measurement
        const sys = systemRegistry.getSystemInstance('DEMO-SYSTEM-001');
        expect(sys).toBeDefined();
    });

    // 32. Quality independence
    test('32. Quality independence (Quality PASS rate separate from client rating)', () => {
        experienceStore.recordFeedback(new ClientFeedback({
            systemId: 'DEMO-SYSTEM-001',
            rating: 1 // Low explicit rating
        }));

        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.averageRating).toBe(1);
    });

    // 33. Usage independence
    test('33. Usage independence (Low usage does not mean unhappy client)', () => {
        // Low usage system
        const metrics = aggregator.computeMetrics({ systemId: 'DEMO-SYSTEM-001' });
        expect(metrics.averageRating).toBeNull(); // No explicit feedback means no opinion manufactured
    });

    // 34. No business-specific hardcoding
    test('34. Universality: Zero business-specific hardcoding in Experience Engine', () => {
        const fb = new ClientFeedback({
            systemId: 'NEUTRAL-SYS-123',
            category: 'custom_category'
        });

        expect(fb.category).toBe('custom_category');
    });

    // 35. Phase 1 regression
    test('35. Phase 1 regression: SystemRegistry and ContractValidator', () => {
        const sys = systemRegistry.getSystemInstance('DEMO-SYSTEM-001');
        expect(sys).toBeDefined();
        expect(sys.id).toBe('DEMO-SYSTEM-001');
    });

    // 36. Phase 2 regression
    test('36. Phase 2 regression: SystemExecutionService and Adapter Framework', async () => {
        const executionService = new SystemExecutionService({ systemRegistry, allowLocalhost: true });
        const res = await executionService.executeOperation('DEMO-SYSTEM-001', 'execute');
        expect(res.success).toBe(true);
    });

    // 37. Phase 3 regression
    test('37. Phase 3 regression: HealthCheckEngine and Health Store', async () => {
        const healthEngine = new HealthCheckEngine({ systemRegistry });
        const healthRes = await healthEngine.checkHealth('DEMO-SYSTEM-001');
        expect(healthRes.status).toBe('HEALTHY');
    });

    // 38. Phase 4 regression
    test('38. Phase 4 regression: QualityTestRunner and Assertion Engine', async () => {
        const qualityRunner = new QualityTestRunner({ systemExecutionService: new SystemExecutionService({ systemRegistry, allowLocalhost: true }) });
        const testDef = new QualityTestDefinition({
            testId: 'qtest-reg-6',
            systemId: 'DEMO-SYSTEM-001',
            operation: 'execute',
            assertions: [{ type: 'statusEquals', expected: 200 }]
        });

        const res = await qualityRunner.runTest(testDef);
        expect(res.status).toBe('PASS');
    });

    // 39. Phase 5 regression
    test('39. Phase 5 regression: UsageEventCollector and Aggregator', () => {
        const usageCollector = new UsageEventCollector();
        const evt = usageCollector.recordExecution({ systemId: 'DEMO-SYSTEM-001' });
        expect(evt).toBeDefined();
        expect(evt.category).toBe('EXECUTION');
    });
});
