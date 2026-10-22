/**
 * Phase 28 — Agent Watchtower Command Center & Advanced Operational Intelligence Test Suite
 * Minimum 40 tests covering all Phase 28 requirements.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { AgentWatchtowerCommandCenterService } = require('../src/commandcenter/AgentWatchtowerCommandCenterService');

describe('PHASE 28 — Agent Watchtower Command Center Suite', () => {
    let app;
    let monitoringService;
    let agentRegistry;
    let dependencyService;
    let graphService;
    let rootCauseAnalyzer;
    let blastRadiusAnalyzer;
    let knowledgeGraphService;
    let knowledgeBuilder;
    let investigationService;
    let searchService;
    let commandCenterService;

    beforeEach(() => {
        app = createApp({ environment: 'test' });
        agentRegistry = app.get('systemRegistry');
        monitoringService = app.get('agentMonitoringService');
        dependencyService = app.get('agentDependencyService');
        graphService = app.get('dependencyGraphService');
        rootCauseAnalyzer = app.get('rootCauseAnalyzer');
        blastRadiusAnalyzer = app.get('blastRadiusAnalyzer');
        knowledgeGraphService = app.get('agentKnowledgeGraphService');
        knowledgeBuilder = app.get('knowledgeGraphBuilder');
        investigationService = app.get('investigationContextService');
        searchService = app.get('operationalSearchService');
        commandCenterService = app.get('commandCenterService');
    });

    afterEach(() => {
        if (monitoringService && typeof monitoringService.stopAll === 'function') {
            monitoringService.stopAll();
        }
    });

    test('1. Command Center Service initializes correctly', () => {
        expect(commandCenterService).toBeDefined();
        expect(commandCenterService.attentionEngine).toBeDefined();
        expect(commandCenterService.scorecardService).toBeDefined();
        expect(commandCenterService.changeFeedService).toBeDefined();
        expect(commandCenterService.narrativeService).toBeDefined();
    });

    test('2. Overview aggregation returns complete snapshot', () => {
        const overview = commandCenterService.getOverview({ tenantId: 'tenant-1' });
        expect(overview).toHaveProperty('scorecard');
        expect(overview).toHaveProperty('attentionItems');
        expect(overview).toHaveProperty('activeIncidents');
        expect(overview).toHaveProperty('agentSummary');
        expect(overview).toHaveProperty('recentChanges');
        expect(overview).toHaveProperty('narrative');
    });

    test('3. Operational Scorecard computes agent health counts accurately', () => {
        monitoringService.store.saveStatus('AGENT-A', { status: 'HEALTHY' }, 'tenant-1');
        monitoringService.store.saveStatus('AGENT-B', { status: 'DEGRADED' }, 'tenant-1');
        monitoringService.store.saveStatus('AGENT-C', { status: 'OFFLINE' }, 'tenant-1');

        const scorecard = commandCenterService.scorecardService.getScorecard({ tenantId: 'tenant-1' });
        expect(scorecard.totalAgents).toBe(3);
        expect(scorecard.healthyAgents).toBe(1);
        expect(scorecard.degradedAgents).toBe(1);
        expect(scorecard.offlineAgents).toBe(1);
    });

    test('4. Operator Attention Engine highlights degraded and offline agents', () => {
        monitoringService.store.saveStatus('AGENT-FAIL', { status: 'OFFLINE' }, 'tenant-1');
        const items = commandCenterService.getAttentionItems({ tenantId: 'tenant-1' });
        expect(items.length).toBeGreaterThan(0);
        expect(items.some(i => i.agentId === 'AGENT-FAIL' && i.type === 'AGENT_OFFLINE')).toBe(true);
    });

    test('5. Operator Attention Engine handles severity ordering (CRITICAL > HIGH > MEDIUM)', () => {
        monitoringService.store.saveStatus('AGENT-DEG', { status: 'DEGRADED' }, 'tenant-1');
        monitoringService.store.saveStatus('AGENT-OFF', { status: 'OFFLINE' }, 'tenant-1');
        const items = commandCenterService.getAttentionItems({ tenantId: 'tenant-1' });
        expect(items[0].severity).toBe('CRITICAL');
    });

    test('6. Active Incidents summary connects root-cause candidates', () => {
        dependencyService.registerDependency({ sourceAgentId: 'AGENT-X', targetAgentId: 'AGENT-Y', tenantId: 'tenant-1' });
        monitoringService.store.saveStatus('AGENT-X', { status: 'DEGRADED' }, 'tenant-1');
        monitoringService.store.saveStatus('AGENT-Y', { status: 'OFFLINE' }, 'tenant-1');

        const inc = monitoringService.store.saveIncident({
            agentId: 'AGENT-X',
            severity: 'CRITICAL',
            status: 'OPEN',
            triggerType: 'HEALTH_FAILURE'
        }, 'tenant-1');

        const active = commandCenterService.getActiveIncidents({ tenantId: 'tenant-1' });
        expect(active.length).toBe(1);
        expect(active[0].incidentId).toBe(inc.incidentId || inc.id);
        expect(active[0].evidenceStatus).toBeDefined();
    });

    test('7. Risk Summary returns status NOT_AVAILABLE when risk engine is missing', () => {
        const noRiskService = new AgentWatchtowerCommandCenterService({ monitoringService });
        const summary = noRiskService.getRiskSummary({ tenantId: 'tenant-1' });
        expect(summary.status).toBe('NOT_AVAILABLE');
    });

    test('8. Anomaly Summary returns status NOT_AVAILABLE when anomaly service is missing', () => {
        const noAnomService = new AgentWatchtowerCommandCenterService({ monitoringService });
        const summary = noAnomService.getAnomalySummary({ tenantId: 'tenant-1' });
        expect(summary.status).toBe('NOT_AVAILABLE');
    });

    test('9. Dependency Impact summary includes graph metrics', () => {
        dependencyService.registerDependency({ sourceAgentId: 'AGENT-1', targetAgentId: 'AGENT-2', tenantId: 'tenant-1' });
        const impact = commandCenterService.getDependencyImpact({ tenantId: 'tenant-1' });
        expect(impact.status).toBe('OPERATIONAL');
        expect(impact.totalDependencies).toBeGreaterThan(0);
        expect(impact.edges.some(e => e.sourceAgentId === 'AGENT-1' && e.targetAgentId === 'AGENT-2')).toBe(true);
    });

    test('10. Running Remediations list contains in-progress actions', () => {
        if (!monitoringService.store.remediations) {
            monitoringService.store.remediations = new Map();
        }
        monitoringService.store.remediations.set('REM-100', {
            remediationId: 'REM-100',
            agentId: 'AGENT-1',
            status: 'IN_PROGRESS',
            action: 'RESTART',
            tenantId: 'tenant-1',
            createdAt: new Date().toISOString()
        });
        const rems = commandCenterService.getRunningRemediations({ tenantId: 'tenant-1' });
        expect(rems.length).toBe(1);
        expect(rems[0].action).toBe('RESTART');
    });

    test('11. Operational Change Feed produces chronological event stream', () => {
        monitoringService.store.saveStatus('AGENT-1', { status: 'HEALTHY' }, 'tenant-1');
        monitoringService.store.saveIncident({ agentId: 'AGENT-1', severity: 'HIGH', status: 'OPEN' }, 'tenant-1');

        const feed = commandCenterService.getRecentChanges({ tenantId: 'tenant-1' });
        expect(feed.length).toBeGreaterThan(0);
        expect(feed[0]).toHaveProperty('eventId');
        expect(feed[0]).toHaveProperty('origin');
    });

    test('12. Operational Narrative generates structured sections with CONFIRMED/INFERRED tags', () => {
        monitoringService.store.saveStatus('AGENT-A', { status: 'HEALTHY' }, 'tenant-1');
        monitoringService.store.saveStatus('AGENT-B', { status: 'OFFLINE' }, 'tenant-1');

        const nar = commandCenterService.narrativeService.generateNarrative({ tenantId: 'tenant-1' });
        expect(nar).toHaveProperty('whatIsHappening');
        expect(nar).toHaveProperty('whatIsBad');
        expect(nar.whatIsBad.some(b => b.tag === 'CONFIRMED')).toBe(true);
    });

    test('13. Operational Narrative handles specific incident context', () => {
        const inc = monitoringService.store.saveIncident({
            agentId: 'AGENT-FAIL',
            severity: 'CRITICAL',
            status: 'OPEN',
            triggerType: 'LATENCY_SPIKE'
        }, 'tenant-1');

        const incId = inc.incidentId || inc.id;
        const nar = commandCenterService.narrativeService.generateNarrative({
            incidentId: incId,
            tenantId: 'tenant-1'
        });
        expect(nar.title).toContain(incId);
        expect(nar.whatIsHappening.length).toBeGreaterThan(0);
    });

    test('14. Agent 360 Summary provides comprehensive agent view', () => {
        monitoringService.store.saveStatus('AGENT-360', { status: 'HEALTHY' }, 'tenant-1');
        const summary = commandCenterService.getAgentSummary('AGENT-360', { tenantId: 'tenant-1' });
        expect(summary.identity.agentId).toBe('AGENT-360');
        expect(summary.health.status).toBe('HEALTHY');
        expect(summary).toHaveProperty('dependencies');
    });

    test('15. Agent 360 returns NOT_FOUND status for non-existent agent', () => {
        const summary = commandCenterService.getAgentSummary('NON-EXISTENT-AGENT', { tenantId: 'tenant-1' });
        expect(summary.status).toBe('NOT_FOUND');
    });

    test('16. Truthful Compa External Agent handling without fake execution support', () => {
        monitoringService.store.saveStatus('compa-agent-ext', {
            status: 'HEALTHY',
            metadata: { isExternal: true }
        }, 'tenant-1');
        const summary = commandCenterService.getAgentSummary('compa-agent-ext', { tenantId: 'tenant-1' });
        expect(summary.identity.isExternal).toBe(true);
        expect(summary.identity.executionSupport).toBe('UNSUPPORTED');
        expect(summary.identity.externalNote).toContain('unsupported');
    });

    test('17. Truthful Repa External Agent handling without fake execution support', () => {
        monitoringService.store.saveStatus('repa-agent-ext', {
            status: 'HEALTHY',
            metadata: { isExternal: true }
        }, 'tenant-1');
        const summary = commandCenterService.getAgentSummary('repa-agent-ext', { tenantId: 'tenant-1' });
        expect(summary.identity.isExternal).toBe(true);
        expect(summary.identity.executionSupport).toBe('UNSUPPORTED');
    });

    test('18. GET /api/v1/command-center/overview returns 200 OK', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/overview')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('scorecard');
    });

    test('19. GET /api/v1/command-center/attention returns attention items', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/attention')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('20. GET /api/v1/command-center/incidents returns active incidents', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/incidents')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('21. GET /api/v1/command-center/agents returns agent health matrix', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/agents')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('22. GET /api/v1/command-center/risks returns risk summary', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/risks')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
    });

    test('23. GET /api/v1/command-center/anomalies returns anomaly summary', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/anomalies')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
    });

    test('24. GET /api/v1/command-center/dependencies returns dependency impact', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/dependencies')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
    });

    test('25. GET /api/v1/command-center/automations returns running automations', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/automations')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
    });

    test('26. GET /api/v1/command-center/remediations returns running remediations', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/remediations')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
    });

    test('27. GET /api/v1/command-center/activity returns recent activity feed', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/activity')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
    });

    test('28. GET /api/v1/command-center/changes returns change feed', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/changes')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
    });

    test('29. GET /api/v1/command-center/summary returns system summary', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/summary')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
        expect(res.body.platform).toContain('Command Center');
    });

    test('30. GET /api/v1/command-center/agents/:id returns agent detail summary', async () => {
        monitoringService.store.saveStatus('TEST-AGENT-100', { status: 'HEALTHY' }, 'tenant-1');

        const res = await request(app)
            .get('/api/v1/command-center/agents/TEST-AGENT-100')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');
        expect(res.status).toBe(200);
        expect(res.body.identity.agentId).toBe('TEST-AGENT-100');
    });

    test('31. Multi-tenant isolation: Tenant A cannot see Tenant B command center records', async () => {
        monitoringService.store.saveStatus('AGENT-TENANT-A', { status: 'DEGRADED' }, 'tenant-A');
        monitoringService.store.saveStatus('AGENT-TENANT-B', { status: 'OFFLINE' }, 'tenant-B');

        const resA = await request(app)
            .get('/api/v1/command-center/agents')
            .set('X-Tenant-ID', 'tenant-A')
            .set('X-User-Role', 'VIEWER');

        expect(resA.status).toBe(200);
        expect(resA.body.some(a => a.agentId === 'AGENT-TENANT-A')).toBe(true);
        expect(resA.body.some(a => a.agentId === 'AGENT-TENANT-B')).toBe(false);
    });

    test('32. RBAC Enforcement: Unauthenticated / Invalid Role requests are rejected', async () => {
        const res = await request(app)
            .get('/api/v1/command-center/overview')
            .set('X-User-Role', 'INVALID_ROLE');
        expect(res.status).toBe(403);
    });

    test('33. Secret parameters (apiKey, token, password) are redacted in API responses', async () => {
        monitoringService.store.saveStatus('SECRET-AGENT', {
            status: 'HEALTHY',
            metadata: { apiKey: 'SUPER_SECRET_123', password: 'PASSWORD_456' }
        }, 'tenant-1');

        const res = await request(app)
            .get('/api/v1/command-center/agents/SECRET-AGENT')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');

        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).not.toContain('SUPER_SECRET_123');
        expect(JSON.stringify(res.body)).not.toContain('PASSWORD_456');
    });

    test('34. X-Correlation-ID is preserved in Command Center responses', async () => {
        const cid = 'CORRELATION-ID-CC-999';
        const res = await request(app)
            .get('/api/v1/command-center/overview')
            .set('X-Correlation-ID', cid)
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');

        expect(res.status).toBe(200);
        expect(res.headers['x-correlation-id']).toBe(cid);
    });

    test('35. TEST-AGENT Topology Scenario (A -> B -> C): Cascading failure Command Center summary', () => {
        const tenantId = 'tenant-topology';
        monitoringService.store.saveStatus('TEST-AGENT-A', { status: 'HEALTHY' }, tenantId);
        monitoringService.store.saveStatus('TEST-AGENT-B', { status: 'HEALTHY' }, tenantId);
        monitoringService.store.saveStatus('TEST-AGENT-C', { status: 'HEALTHY' }, tenantId);

        dependencyService.registerDependency({ sourceAgentId: 'TEST-AGENT-A', targetAgentId: 'TEST-AGENT-B', tenantId });
        dependencyService.registerDependency({ sourceAgentId: 'TEST-AGENT-B', targetAgentId: 'TEST-AGENT-C', tenantId });

        // Controlled failure: C goes OFFLINE
        monitoringService.store.saveStatus('TEST-AGENT-C', { status: 'OFFLINE' }, tenantId);
        monitoringService.store.saveStatus('TEST-AGENT-B', { status: 'DEGRADED' }, tenantId);
        monitoringService.store.saveStatus('TEST-AGENT-A', { status: 'DEGRADED' }, tenantId);

        monitoringService.store.saveIncident({
            agentId: 'TEST-AGENT-C',
            severity: 'CRITICAL',
            status: 'OPEN',
            triggerType: 'HEALTH_FAILURE'
        }, tenantId);

        const activeIncs = commandCenterService.getActiveIncidents({ tenantId });
        expect(activeIncs.length).toBeGreaterThan(0);

        const attentionItems = commandCenterService.getAttentionItems({ tenantId });
        expect(attentionItems.length).toBeGreaterThan(0);

        const nar = commandCenterService.narrativeService.generateNarrative({ tenantId });
        expect(nar.whatIsBad.some(b => b.text.includes('OFFLINE'))).toBe(true);
    });

    test('36. TEST-AGENT Topology Scenario (A -> B -> C): Cascading recovery Command Center summary', () => {
        const tenantId = 'tenant-topology-rec';
        monitoringService.store.saveStatus('TEST-AGENT-C', { status: 'OFFLINE' }, tenantId);
        const inc = monitoringService.store.saveIncident({
            agentId: 'TEST-AGENT-C',
            severity: 'CRITICAL',
            status: 'OPEN'
        }, tenantId);

        // Recover C -> B -> A
        monitoringService.store.saveStatus('TEST-AGENT-C', { status: 'HEALTHY' }, tenantId);
        monitoringService.store.saveStatus('TEST-AGENT-B', { status: 'HEALTHY' }, tenantId);
        monitoringService.store.saveStatus('TEST-AGENT-A', { status: 'HEALTHY' }, tenantId);

        if (monitoringService.store.incidents && inc) {
            const storedInc = monitoringService.store.incidents.get(inc.incidentId || inc.id);
            if (storedInc) storedInc.status = 'RESOLVED';
        }

        const activeIncs = commandCenterService.getActiveIncidents({ tenantId });
        expect(activeIncs.length).toBe(0);

        const scorecard = commandCenterService.scorecardService.getScorecard({ tenantId });
        expect(scorecard.offlineAgents).toBe(0);
        expect(scorecard.degradedAgents).toBe(0);
        expect(scorecard.healthyAgents).toBe(3);
    });

    test('37. Investigation Highlights aggregates root-cause and evidence for active incidents', () => {
        monitoringService.store.saveIncident({
            agentId: 'AGENT-TEST-HIGHLIGHT',
            severity: 'HIGH',
            status: 'OPEN'
        }, 'tenant-1');

        const highlights = commandCenterService.getInvestigationHighlights({ tenantId: 'tenant-1' });
        expect(highlights.length).toBeGreaterThan(0);
        expect(highlights.some(h => h.agentId === 'AGENT-TEST-HIGHLIGHT')).toBe(true);
    });

    test('38. Search Integration handles deterministic operational searches via Command Center API', async () => {
        monitoringService.store.saveStatus('SEARCHABLE-AGENT-999', { status: 'HEALTHY' }, 'tenant-1');

        const res = await request(app)
            .get('/api/v1/knowledge/search?q=SEARCHABLE-AGENT-999')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');

        expect(res.status).toBe(200);
        expect(res.body.data.results.agents.some(r => r.agentId === 'SEARCHABLE-AGENT-999')).toBe(true);
    });

    test('39. Phase 27 Knowledge Graph REST endpoints remain 100% operational', async () => {
        const res = await request(app)
            .get('/api/v1/knowledge/graph')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty('nodes');
        expect(res.body.data).toHaveProperty('edges');
    });

    test('40. Phase 26 Dependency Intelligence endpoints remain 100% operational', async () => {
        const res = await request(app)
            .get('/api/v1/dependencies/graph')
            .set('X-Tenant-ID', 'tenant-1')
            .set('X-User-Role', 'VIEWER');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty('nodes');
        expect(res.body.data).toHaveProperty('edges');
    });
});
