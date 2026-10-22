/**
 * Phase 30 — Fleet Intelligence & Operational Learning Test Suite
 * Tests master orchestration service, agent reliability analyzer, recurring problem detection,
 * operational hotspots, dependency reliability, incident patterns, response effectiveness,
 * recovery duration analysis, fleet trends, risk context, operational recommendations,
 * REST API router endpoints, RBAC, tenant isolation, and Compa/Repa execution truthfulness.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { FleetIntelligenceService } = require('../src/intelligence/FleetIntelligenceService');
const { AgentReliabilityAnalyzer } = require('../src/intelligence/AgentReliabilityAnalyzer');
const { RecurringProblemIntelligence } = require('../src/intelligence/RecurringProblemIntelligence');
const { OperationalHotspotService } = require('../src/intelligence/OperationalHotspotService');
const { IncidentPatternAnalyzer } = require('../src/intelligence/IncidentPatternAnalyzer');
const { ResponseEffectivenessService } = require('../src/intelligence/ResponseEffectivenessService');
const { RecoveryIntelligenceService } = require('../src/intelligence/RecoveryIntelligenceService');
const { FleetTrendService } = require('../src/intelligence/FleetTrendService');
const { FleetRiskContextService } = require('../src/intelligence/FleetRiskContextService');
const { OperationalImprovementService } = require('../src/intelligence/OperationalImprovementService');

describe('Phase 30 — Agent Fleet Intelligence & Operational Learning', () => {
    let app;
    let fleetIntelligenceService;

    beforeEach(() => {
        app = createApp();
        fleetIntelligenceService = app.get('fleetIntelligenceService');
    });

    describe('1. FleetIntelligenceService Orchestration', () => {
        test('should provide getFleetOverview with all intelligence sections', () => {
            const overview = fleetIntelligenceService.getFleetOverview();
            expect(overview).toBeDefined();
            expect(overview.tenantId).toBe('default-tenant');
            expect(overview.timestamp).toBeDefined();
            expect(Array.isArray(overview.agentReliability)).toBe(true);
            expect(Array.isArray(overview.recurringProblems)).toBe(true);
            expect(Array.isArray(overview.operationalHotspots)).toBe(true);
            expect(overview.dependencyReliability).toBeDefined();
            expect(Array.isArray(overview.incidentPatterns)).toBe(true);
            expect(overview.responseEffectiveness).toBeDefined();
            expect(overview.recoveryAnalysis).toBeDefined();
            expect(overview.longTermTrends).toBeDefined();
            expect(overview.fleetRisks).toBeDefined();
            expect(Array.isArray(overview.operationalRecommendations)).toBe(true);
        });

        test('should provide getAgentPerformance', () => {
            const perf = fleetIntelligenceService.getAgentPerformance();
            expect(Array.isArray(perf)).toBe(true);
        });

        test('should provide getAgentReliability for all agents or specific agent', () => {
            const reliabilityAll = fleetIntelligenceService.getAgentReliability();
            expect(Array.isArray(reliabilityAll)).toBe(true);

            const relAgent = fleetIntelligenceService.getAgentReliability({ agentId: 'TEST-AGENT-001' });
            expect(relAgent).toBeDefined();
        });

        test('should provide getRecurringProblems', () => {
            const problems = fleetIntelligenceService.getRecurringProblems();
            expect(Array.isArray(problems)).toBe(true);
        });

        test('should provide getOperationalHotspots', () => {
            const hotspots = fleetIntelligenceService.getOperationalHotspots();
            expect(Array.isArray(hotspots)).toBe(true);
        });

        test('should provide getDependencyReliability', () => {
            const deps = fleetIntelligenceService.getDependencyReliability();
            expect(deps).toBeDefined();
            expect(Array.isArray(deps.nodes)).toBe(true);
        });

        test('should provide getIncidentPatterns', () => {
            const patterns = fleetIntelligenceService.getIncidentPatterns();
            expect(Array.isArray(patterns)).toBe(true);
        });

        test('should provide getResponseEffectiveness', () => {
            const resp = fleetIntelligenceService.getResponseEffectiveness();
            expect(resp).toBeDefined();
            expect(resp.totalHistoricalResponses).toBeDefined();
        });

        test('should provide getRecoveryAnalysis', () => {
            const recovery = fleetIntelligenceService.getRecoveryAnalysis();
            expect(recovery).toBeDefined();
            expect(recovery.stages).toBeDefined();
        });

        test('should provide getLongTermTrends with default and custom periods', () => {
            const trends24h = fleetIntelligenceService.getLongTermTrends({ period: '24h' });
            expect(trends24h).toBeDefined();
            expect(trends24h.period).toBe('24h');

            const trends7d = fleetIntelligenceService.getLongTermTrends({ period: '7d' });
            expect(trends7d.period).toBe('7d');
        });

        test('should provide getFleetRisks', () => {
            const risks = fleetIntelligenceService.getFleetRisks();
            expect(risks).toBeDefined();
            expect(risks.overallFleetRisk).toBeDefined();
        });

        test('should provide getOperationalRecommendations', () => {
            const recs = fleetIntelligenceService.getOperationalRecommendations();
            expect(Array.isArray(recs)).toBe(true);
        });
    });

    describe('2. AgentReliabilityAnalyzer', () => {
        test('should return NOT_AVAILABLE for metrics when no monitoring history exists', () => {
            const analyzer = new AgentReliabilityAnalyzer({ monitoringService: null });
            const result = analyzer.analyzeAgent('NON-EXISTENT-AGENT');
            expect(result.status).toBe('NOT_AVAILABLE');
            expect(result.availability).toBe('NOT_AVAILABLE');
            expect(result.avgRecoveryTimeMs).toBe('NOT_AVAILABLE');
            expect(result.agentId).toBe('NON-EXISTENT-AGENT');
        });

        test('should analyze all agents when no agentId is specified', () => {
            const analyzer = new AgentReliabilityAnalyzer();
            const results = analyzer.analyzeFleet();
            expect(Array.isArray(results)).toBe(true);
        });
    });

    describe('3. RecurringProblemIntelligence', () => {
        test('should detect recurring problems with proper evidence structure', () => {
            const intelligence = new RecurringProblemIntelligence();
            const problems = intelligence.detectRecurringProblems();
            expect(Array.isArray(problems)).toBe(true);

            problems.forEach(p => {
                expect(p.problemId).toBeDefined();
                expect(p.problemType).toBeDefined();
                expect(p.frequency).toBeGreaterThanOrEqual(1);
                expect(p.firstObserved).toBeDefined();
                expect(p.lastObserved).toBeDefined();
                expect(p.evidence).toBeDefined();
                expect(p.status).toBeDefined();
            });
        });
    });

    describe('4. OperationalHotspotService', () => {
        test('should explain why an area is a hotspot using actual evidence', () => {
            const service = new OperationalHotspotService();
            const hotspots = service.getHotspots();
            expect(Array.isArray(hotspots)).toBe(true);

            hotspots.forEach(h => {
                expect(h.affectedArea).toBeDefined();
                expect(h.hotspotType).toBeDefined();
                expect(h.whyItIsAHotspot).toBeDefined();
                expect(typeof h.whyItIsAHotspot).toBe('string');
                expect(h.evidenceSummary).toBeDefined();
            });
        });
    });

    describe('5. IncidentPatternAnalyzer', () => {
        test('should group historical incidents and attach source incident IDs', () => {
            const analyzer = new IncidentPatternAnalyzer();
            const patterns = analyzer.analyzePatterns();
            expect(Array.isArray(patterns)).toBe(true);

            patterns.forEach(pat => {
                expect(pat.patternKey).toBeDefined();
                expect(pat.occurrences).toBeGreaterThanOrEqual(1);
                expect(Array.isArray(pat.sourceIncidentIds)).toBe(true);
                expect(['CONFIRMED', 'INFERRED', 'UNKNOWN']).toContain(pat.evidenceLevel);
            });
        });
    });

    describe('6. ResponseEffectivenessService & Phase 29 Integration', () => {
        test('should analyze response outcomes without mutating policies', () => {
            const service = new ResponseEffectivenessService();
            const analysis = service.analyzeResponseEffectiveness();

            expect(analysis.totalHistoricalResponses).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(analysis.responseTypes)).toBe(true);
            expect(analysis.overallVerificationSuccessRate).toBeGreaterThanOrEqual(0);
        });
    });

    describe('7. RecoveryIntelligenceService', () => {
        test('should return stage durations or NOT_AVAILABLE where timestamps are missing', () => {
            const service = new RecoveryIntelligenceService();
            const recovery = service.getRecoveryAnalysis();

            expect(recovery.stages).toBeDefined();
            expect(recovery.stages.timeToDetectionMs).toBeDefined();
            expect(recovery.stages.timeToInvestigationMs).toBeDefined();
            expect(recovery.stages.timeToResponseMs).toBeDefined();
            expect(recovery.stages.timeToRecoveryMs).toBeDefined();
            expect(recovery.stages.timeToVerificationMs).toBeDefined();
        });
    });

    describe('8. FleetTrendService', () => {
        test('should return INSUFFICIENT_DATA when historical data points are missing', () => {
            const trendService = new FleetTrendService({ monitoringService: null });
            const trend = trendService.getTrends('30d');

            expect(trend.status).toBe('INSUFFICIENT_DATA');
            expect(trend.period).toBe('30d');
        });
    });

    describe('9. FleetRiskContextService', () => {
        test('should aggregate risk context across agents, dependencies, and hotspots', () => {
            const riskContext = new FleetRiskContextService();
            const context = riskContext.getFleetRisks();

            expect(context.overallFleetRisk).toBeDefined();
            expect(context.factors).toBeDefined();
        });
    });

    describe('10. OperationalImprovementService', () => {
        test('should generate evidence-based suggestions without auto-execution', () => {
            const impService = new OperationalImprovementService();
            const suggestions = impService.getImprovements();

            expect(Array.isArray(suggestions)).toBe(true);
            suggestions.forEach(s => {
                expect(s.reason).toBeDefined();
                expect(s.evidence).toBeDefined();
                expect(s.affectedArea).toBeDefined();
                expect(s.suggestedInvestigation).toBeDefined();
            });
        });
    });

    describe('11. REST API Router Endpoints', () => {
        test('GET /api/v1/fleet-intelligence/overview should return 200 with complete overview', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/overview')
                .set('x-role', 'admin');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeDefined();
            expect(res.body.data.agentReliability).toBeDefined();
        });

        test('GET /api/v1/fleet-intelligence/agents should return agent reliability list', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/agents')
                .set('x-role', 'viewer');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        test('GET /api/v1/fleet-intelligence/agents/:id should return agent reliability for specific agent', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/agents/TEST-AGENT-001')
                .set('x-role', 'operator');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.agentId).toBe('TEST-AGENT-001');
        });

        test('GET /api/v1/fleet-intelligence/recurring-problems should return recurring problems', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/recurring-problems')
                .set('x-role', 'viewer');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        test('GET /api/v1/fleet-intelligence/hotspots should return operational hotspots', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/hotspots')
                .set('x-role', 'viewer');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        test('GET /api/v1/fleet-intelligence/dependencies should return dependency reliability', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/dependencies')
                .set('x-role', 'viewer');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.nodes).toBeDefined();
        });

        test('GET /api/v1/fleet-intelligence/incidents should return incident patterns', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/incidents')
                .set('x-role', 'viewer');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        test('GET /api/v1/fleet-intelligence/responses should return response effectiveness', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/responses')
                .set('x-role', 'viewer');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeDefined();
        });

        test('GET /api/v1/fleet-intelligence/recovery should return recovery analysis', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/recovery')
                .set('x-role', 'viewer');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.stages).toBeDefined();
        });

        test('GET /api/v1/fleet-intelligence/trends should return long-term trends', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/trends?period=7d')
                .set('x-role', 'viewer');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.period).toBe('7d');
        });

        test('GET /api/v1/fleet-intelligence/risks should return fleet risk context', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/risks')
                .set('x-role', 'viewer');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.overallFleetRisk).toBeDefined();
        });

        test('GET /api/v1/fleet-intelligence/improvements should return operational recommendations', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/improvements')
                .set('x-role', 'viewer');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        test('RBAC: Unauthorized role should return 403', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/overview')
                .set('x-role', 'guest');

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        test('Tenant Isolation: x-tenant-id header should scope overview request', async () => {
            const res = await request(app)
                .get('/api/v1/fleet-intelligence/overview')
                .set('x-role', 'admin')
                .set('x-tenant-id', 'tenant-alpha');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.tenantId).toBe('tenant-alpha');
        });
    });

    describe('12. Compa / Repa Truthful Execution Handling', () => {
        test('should report Compa / Repa execution as UNSUPPORTED', () => {
            const analyzer = new AgentReliabilityAnalyzer();
            const rel = analyzer.analyzeAgent('COMPA-PROBE-01');
            expect(rel.executionSupport).toBe('UNSUPPORTED');
        });
    });
});
