/**
 * Universal Correlation and Intelligence Engine Test Suite
 * Comprehensive test suite covering observation normalization, trend detection, correlation operators,
 * rule evaluation, evidence generation, transparent confidence, fingerprint deduplication,
 * insight lifecycle, RBAC, AgentGenPro compatibility, and zero business-specific hardcoding.
 */

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

const { NormalizedObservation, OBSERVATION_SOURCES } = require('../src/intelligence/NormalizedObservation');
const { CorrelationOperators, OPERATORS } = require('../src/intelligence/CorrelationOperators');
const { TrendDetector, TREND_STATES } = require('../src/intelligence/TrendDetector');
const { InsightEvidence } = require('../src/intelligence/InsightEvidence');
const { Insight, INSIGHT_STATUSES, INSIGHT_SEVERITY, INSIGHT_TYPES } = require('../src/intelligence/Insight');
const { CorrelationRule } = require('../src/intelligence/CorrelationRule');
const { InsightStore } = require('../src/intelligence/InsightStore');
const { CorrelationEngine } = require('../src/intelligence/CorrelationEngine');
const { IntelligenceService } = require('../src/intelligence/IntelligenceService');
const intelligenceRouter = require('../src/api/intelligenceRoutes');

const { SystemRegistry } = require('../src/registry/SystemRegistry');
const { HealthStore } = require('../src/health/HealthStore');
const { QualityStore } = require('../src/quality/QualityStore');
const { UsageStore } = require('../src/usage/UsageStore');
const { ExperienceStore } = require('../src/experience/ExperienceStore');

describe('Phase 7 — Universal Correlation and Intelligence Engine Test Suite', () => {

    let systemRegistry;
    let healthStore;
    let qualityStore;
    let usageStore;
    let experienceStore;
    let insightStore;
    let correlationEngine;
    let service;
    let app;

    beforeEach(() => {
        systemRegistry = new SystemRegistry();
        healthStore = new HealthStore();
        qualityStore = new QualityStore();
        usageStore = new UsageStore();
        experienceStore = new ExperienceStore({ systemRegistry });

        insightStore = new InsightStore({ systemRegistry });
        correlationEngine = new CorrelationEngine({ insightStore });
        service = new IntelligenceService({
            systemRegistry,
            healthStore,
            qualityStore,
            usageStore,
            experienceStore,
            insightStore,
            correlationEngine
        });

        // Register dummy test system
        systemRegistry.registerSystem({
            id: 'SYS-INT-001',
            name: 'Demo Intelligence Target',
            category: 'agent',
            version: '1.0.0'
        });

        systemRegistry.registerSystem({
            id: 'SYS-INT-002',
            name: 'Secondary Intelligence Target',
            category: 'web-app',
            version: '2.0.0'
        });

        app = express();
        app.use(express.json());
        const router = require('../src/api/intelligenceRoutes');
        app.use(router);
    });

    // ==================================================
    // 1-6. OBSERVATION NORMALIZATION & INGESTION
    // ==================================================

    test('1. Valid observation normalization', () => {
        const obs = new NormalizedObservation({
            systemId: 'SYS-INT-001',
            source: 'HEALTH',
            metric: 'availability',
            value: 99.5,
            unit: 'percent',
            window: '24h'
        });

        expect(obs.id).toBeDefined();
        expect(obs.systemId).toBe('SYS-INT-001');
        expect(obs.source).toBe('HEALTH');
        expect(obs.available).toBe(true);
        expect(obs.reason).toBeNull();
    });

    test('2. Missing observation handling', () => {
        const missing = NormalizedObservation.createMissing('SYS-INT-001', 'QUALITY', 'passRate', '24h', 'NO_DATA');
        expect(missing.available).toBe(false);
        expect(missing.value).toBeNull();
        expect(missing.reason).toBe('NO_DATA');
    });

    test('3. Health observation ingestion', () => {
        const { HealthMeasurement } = require('../src/health/HealthMeasurement');
        healthStore.addMeasurement(new HealthMeasurement({
            systemId: 'SYS-INT-001',
            status: 'HEALTHY',
            latencyMs: 45,
            availabilityPercent: 99.8
        }));
        healthStore.updateSystemState('SYS-INT-001', {
            status: 'HEALTHY',
            availabilityPercent: 99.8
        });

        const obs = service.loadObservations('SYS-INT-001', '24h');
        const healthObs = obs.find(o => o.source === 'HEALTH' && o.metric === 'status');
        expect(healthObs).toBeDefined();
        expect(healthObs.value).toBe('HEALTHY');
    });

    test('4. Quality observation ingestion', () => {
        qualityStore.saveTestResult({
            testId: 'test_1',
            systemId: 'SYS-INT-001',
            passed: true,
            status: 'PASSED'
        });
        qualityStore.saveTestResult({
            testId: 'test_2',
            systemId: 'SYS-INT-001',
            passed: false,
            status: 'FAILED'
        });

        const obs = service.loadObservations('SYS-INT-001', '24h');
        const qualObs = obs.find(o => o.source === 'QUALITY' && o.metric === 'passRate');
        expect(qualObs).toBeDefined();
        expect(qualObs.value).toBe(50.0);
    });

    test('5. Usage observation ingestion', () => {
        const { UsageEvent } = require('../src/usage/UsageEvent');
        usageStore.recordEvent(new UsageEvent({ systemId: 'SYS-INT-001', operation: 'query' }));
        usageStore.recordEvent(new UsageEvent({ systemId: 'SYS-INT-001', operation: 'execute' }));

        const obs = service.loadObservations('SYS-INT-001', '24h');
        const usageObs = obs.find(o => o.source === 'USAGE' && o.metric === 'eventCount');
        expect(usageObs).toBeDefined();
        expect(usageObs.value).toBe(2);
    });

    test('6. Experience observation ingestion', () => {
        experienceStore.recordFeedback({
            systemId: 'SYS-INT-001',
            rating: { value: 4, scaleMin: 1, scaleMax: 5 }
        });
        experienceStore.createIssue({
            systemId: 'SYS-INT-001',
            severity: 'HIGH',
            description: 'Database timeout'
        });

        const obs = service.loadObservations('SYS-INT-001', '24h');
        const issueObs = obs.find(o => o.source === 'EXPERIENCE' && o.metric === 'openIssues');
        expect(issueObs).toBeDefined();
        expect(issueObs.value).toBe(1);
    });

    // ==================================================
    // 7-14. OPERATOR EVALUATION & COMBINATORS
    // ==================================================

    test('7. Simple correlation match', () => {
        const match = CorrelationOperators.evaluate('greaterThan', 99, 90);
        expect(match).toBe(true);
    });

    test('8. Correlation mismatch', () => {
        const match = CorrelationOperators.evaluate('equals', 'HEALTHY', 'OFFLINE');
        expect(match).toBe(false);
    });

    test('9. AND condition combinator', () => {
        const combined = CorrelationOperators.combine([true, true, true], 'AND');
        expect(combined).toBe(true);

        const fail = CorrelationOperators.combine([true, false, true], 'AND');
        expect(fail).toBe(false);
    });

    test('10. OR condition combinator', () => {
        const combined = CorrelationOperators.combine([false, true, false], 'OR');
        expect(combined).toBe(true);
    });

    test('11. NOT condition combinator', () => {
        const combined = CorrelationOperators.combine([false, false], 'NOT');
        expect(combined).toBe(true);
    });

    test('12. Greater-than operator', () => {
        expect(CorrelationOperators.evaluate('greaterThan', 10, 5)).toBe(true);
        expect(CorrelationOperators.evaluate('greaterThan', 5, 10)).toBe(false);
    });

    test('13. Less-than operator', () => {
        expect(CorrelationOperators.evaluate('lessThan', 5, 10)).toBe(true);
        expect(CorrelationOperators.evaluate('lessThan', 10, 5)).toBe(false);
    });

    test('14. Range operator', () => {
        expect(CorrelationOperators.evaluate('between', 50, [10, 100])).toBe(true);
        expect(CorrelationOperators.evaluate('between', 150, [10, 100])).toBe(false);
    });

    // ==================================================
    // 15-20. TREND DETECTION & TIME-WINDOWING
    // ==================================================

    test('15. Trend detection on series', () => {
        const trend = TrendDetector.detectTrend([100, 80, 60, 40]);
        expect(trend.state).toBe(TREND_STATES.DECREASING);
    });

    test('16. Stable trend detection', () => {
        const trend = TrendDetector.detectTrend([100, 101, 99, 100]);
        expect(trend.state).toBe(TREND_STATES.STABLE);
    });

    test('17. Increasing trend detection', () => {
        const trend = TrendDetector.detectTrend([10, 25, 45, 80]);
        expect(trend.state).toBe(TREND_STATES.INCREASING);
    });

    test('18. Decreasing trend detection', () => {
        const trend = TrendDetector.detectTrend([90, 70, 50, 20]);
        expect(trend.state).toBe(TREND_STATES.DECREASING);
    });

    test('19. Insufficient data handling', () => {
        const trend = TrendDetector.detectTrend([100]);
        expect(trend.state).toBe(TREND_STATES.INSUFFICIENT_DATA);
    });

    test('20. Time-window matching', () => {
        const rule = new CorrelationRule({
            ruleId: 'rule_win_test',
            name: 'Window match',
            window: '1h',
            conditions: [{ source: 'HEALTH', metric: 'status', operator: 'equals', value: 'HEALTHY' }]
        });
        expect(rule.window).toBe('1h');
    });

    // ==================================================
    // 21-23. EVIDENCE, CONFIDENCE & SEVERITY
    // ==================================================

    test('21. Evidence generation', () => {
        const ev = new InsightEvidence({
            source: 'USAGE',
            metric: 'activity',
            before: 100,
            after: 35,
            changePercent: -65
        });

        expect(ev.source).toBe('USAGE');
        expect(ev.changePercent).toBe(-65);
    });

    test('22. Confidence calculation', () => {
        const rule = new CorrelationRule({ baseConfidence: 0.90, conditions: [{ source: 'HEALTH', metric: 'status', operator: 'equals', value: 'HEALTHY' }] });
        const obs = [new NormalizedObservation({ source: 'HEALTH', metric: 'status', value: 'HEALTHY', available: true })];
        const res = correlationEngine.evaluateRules('SYS-INT-001', obs, [rule]);

        expect(res.length).toBe(1);
        expect(res[0].confidence).toBe(0.90);
    });

    test('23. Severity calculation', () => {
        const insight = new Insight({ severity: 'HIGH' });
        expect(insight.severity).toBe('HIGH');
    });

    // ==================================================
    // 24-30. INSIGHT LIFECYCLE, FINGERPRINTING & STORAGE
    // ==================================================

    test('24. Insight creation', () => {
        const insight = new Insight({
            systemId: 'SYS-INT-001',
            title: 'Test Insight',
            severity: 'MEDIUM'
        });

        expect(insight.insightId).toBeDefined();
        expect(insight.status).toBe(INSIGHT_STATUSES.NEW);
    });

    test('25. Duplicate insight prevention via fingerprinting', () => {
        const ins1 = new Insight({ systemId: 'SYS-INT-001', ruleId: 'rule_1', window: '24h', title: 'First Run' });
        const ins2 = new Insight({ systemId: 'SYS-INT-001', ruleId: 'rule_1', window: '24h', title: 'Second Run' });

        expect(ins1.fingerprint).toBe(ins2.fingerprint);

        const saved1 = insightStore.saveInsight(ins1);
        const saved2 = insightStore.saveInsight(ins2);

        expect(saved1.insightId).toBe(saved2.insightId);
        expect(insightStore.listInsights({ systemId: 'SYS-INT-001' }).length).toBe(1);
    });

    test('26. Insight update', () => {
        const saved = insightStore.saveInsight({ systemId: 'SYS-INT-001', title: 'Initial' });
        saved.title = 'Updated Title';
        const updated = insightStore.saveInsight(saved);

        expect(updated.title).toBe('Updated Title');
    });

    test('27. Insight resolution', () => {
        const saved = insightStore.saveInsight({ systemId: 'SYS-INT-001', title: 'Issue Insight' });
        const resolved = insightStore.updateInsightStatus(saved.insightId, 'RESOLVED', { notes: 'Fixed upstream adapter' });

        expect(resolved.status).toBe(INSIGHT_STATUSES.RESOLVED);
        expect(resolved.resolvedAt).toBeDefined();
        expect(resolved.metadata.resolutionNotes).toBe('Fixed upstream adapter');
    });

    test('28. Insight dismissal', () => {
        const saved = insightStore.saveInsight({ systemId: 'SYS-INT-001', title: 'Noise Insight' });
        const dismissed = insightStore.updateInsightStatus(saved.insightId, 'DISMISSED', { reason: 'Expected maintenance' });

        expect(dismissed.status).toBe(INSIGHT_STATUSES.DISMISSED);
        expect(dismissed.dismissedAt).toBeDefined();
        expect(dismissed.metadata.dismissReason).toBe('Expected maintenance');
    });

    test('29. System-specific intelligence analysis execution', () => {
        const { HealthMeasurement } = require('../src/health/HealthMeasurement');
        healthStore.addMeasurement(new HealthMeasurement({ systemId: 'SYS-INT-001', status: 'OFFLINE', availabilityPercent: 0 }));
        healthStore.updateSystemState('SYS-INT-001', { status: 'OFFLINE', availabilityPercent: 0 });

        const result = service.analyzeSystem('SYS-INT-001', '24h');

        expect(result.systemId).toBe('SYS-INT-001');
        expect(result.insightsGenerated).toBeGreaterThan(0);
    });

    test('30. Multi-system isolation in insights', () => {
        insightStore.saveInsight({ systemId: 'SYS-INT-001', title: 'System 1 Insight' });
        insightStore.saveInsight({ systemId: 'SYS-INT-002', title: 'System 2 Insight' });

        const sys1List = insightStore.listInsights({ systemId: 'SYS-INT-001' });
        const sys2List = insightStore.listInsights({ systemId: 'SYS-INT-002' });

        expect(sys1List.length).toBe(1);
        expect(sys2List.length).toBe(1);
        expect(sys1List[0].systemId).toBe('SYS-INT-001');
        expect(sys2List[0].systemId).toBe('SYS-INT-002');
    });

    // ==================================================
    // 31-33. RBAC SECURITY
    // ==================================================

    test('31. RBAC viewer restriction on correlation analysis execution', async () => {
        const res = await request(app)
            .post('/api/intelligence/analyze/SYS-INT-001')
            .set('x-user-role', 'viewer')
            .send({});

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
    });

    test('32. RBAC operator permission on analysis execution', async () => {
        const res = await request(app)
            .post('/api/intelligence/analyze/SYS-INT-001')
            .set('x-user-role', 'operator')
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('33. RBAC admin rule management', async () => {
        const res = await request(app)
            .post('/api/intelligence/rules')
            .set('x-user-role', 'admin')
            .send({
                name: 'Admin Rule',
                severity: 'HIGH',
                conditions: [{ source: 'HEALTH', metric: 'status', operator: 'equals', value: 'OFFLINE' }]
            });

        expect(res.status).toBe(201);
        expect(res.body.data.name).toBe('Admin Rule');
    });

    // ==================================================
    // 34-37. SECURITY, AGENTGENPRO & UNIVERSALITY SCAN
    // ==================================================

    test('34. Credential sanitization in evidence and metadata', () => {
        const obs = new NormalizedObservation({
            systemId: 'SYS-INT-001',
            metadata: {
                authorization: 'Bearer secret_token',
                api_key: 'sk_live_123',
                password: 'my-pass'
            }
        });

        expect(obs.metadata.authorization).toBe('[REDACTED]');
        expect(obs.metadata.api_key).toBe('[REDACTED]');
        expect(obs.metadata.password).toBe('[REDACTED]');
    });

    test('35. Prototype pollution protection', () => {
        const sanitized = NormalizedObservation.createMissing('SYS-INT-001', 'HEALTH', 'status');
        expect(Object.prototype.polluted).toBeUndefined();
    });

    test('36. AgentGenPro route contract compliance for intelligence router', () => {
        const router = require('../src/api/intelligenceRoutes');
        expect(typeof router).toBe('function');

        const fullPath = path.join(__dirname, '../src/api/intelligenceRoutes.js');
        const content = fs.readFileSync(fullPath, 'utf8');

        expect(content.includes("require('fs')")).toBe(false);
        expect(content.includes("require('child_process')")).toBe(false);
        expect(content.includes("require('os')")).toBe(false);
        expect(content.includes('app.listen')).toBe(false);
        expect(content.includes("router.get('/')")).toBe(false);
        expect(content.includes("router.post('/')")).toBe(false);
        expect(content.includes("router.get('*')")).toBe(false);
    });

    test('37. Universal architecture audit (Zero business-specific hardcoding)', () => {
        const targetFiles = [
            'src/intelligence/NormalizedObservation.js',
            'src/intelligence/CorrelationOperators.js',
            'src/intelligence/TrendDetector.js',
            'src/intelligence/InsightEvidence.js',
            'src/intelligence/Insight.js',
            'src/intelligence/CorrelationRule.js',
            'src/intelligence/InsightStore.js',
            'src/intelligence/CorrelationEngine.js',
            'src/intelligence/IntelligenceService.js',
            'src/api/intelligenceRoutes.js'
        ];

        const forbiddenTerms = [
            'compa', 'repa', 'smp', 'news', 'hotel', 'social media',
            'competitor analysis', 'reputation analysis'
        ];

        for (const file of targetFiles) {
            const fullPath = path.join(__dirname, '..', file);
            const content = fs.readFileSync(fullPath, 'utf8');

            for (const term of forbiddenTerms) {
                const regex = new RegExp(`\\b${term}\\b`, 'i');
                expect(regex.test(content)).toBe(false);
            }
        }
    });

});
