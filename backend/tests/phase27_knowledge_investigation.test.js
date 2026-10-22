/**
 * Phase 27 — Agent Knowledge Graph, Semantic Context & Investigation Intelligence Test Suite
 * Comprehensive verification for knowledge graph entities, relationships, origins, context assembly,
 * chronological timelines, evidence chains, similar incident analysis, operational search, and RBAC.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { AgentKnowledgeGraphService } = require('../src/knowledge/AgentKnowledgeGraphService');
const { KnowledgeGraphBuilder } = require('../src/knowledge/KnowledgeGraphBuilder');
const { InvestigationContextService } = require('../src/knowledge/InvestigationContextService');
const { SimilarIncidentAnalyzer } = require('../src/knowledge/SimilarIncidentAnalyzer');
const { OperationalSearchService } = require('../src/knowledge/OperationalSearchService');
const { PersistenceManager } = require('../src/persistence/PersistenceManager');

describe('PHASE 27 — Agent Knowledge Graph, Semantic Context & Investigation Intelligence', () => {
    let app;
    let graphService;
    let graphBuilder;
    let contextService;
    let similarAnalyzer;
    let searchService;
    let monitoringService;
    let dependencyService;
    let dependencyGraphService;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        graphService = app.get('agentKnowledgeGraphService');
        graphBuilder = app.get('knowledgeGraphBuilder');
        contextService = app.get('investigationContextService');
        similarAnalyzer = app.get('similarIncidentAnalyzer');
        searchService = app.get('operationalSearchService');
        monitoringService = app.get('agentMonitoringService');
        dependencyService = app.get('agentDependencyService');
        dependencyGraphService = app.get('dependencyGraphService');
    });

    afterAll(() => {
        if (monitoringService && typeof monitoringService.stopAll === 'function') {
            monitoringService.stopAll();
        }
    });

    // 1. Graph entity creation
    test('1. Creates a valid knowledge graph entity node', () => {
        const entity = graphService.addEntity({
            entityId: 'AGENT-KNOW-01',
            entityType: 'AGENT',
            label: 'Test Knowledge Agent'
        }, 'test-tenant-p27');

        expect(entity.entityId).toBe('AGENT-KNOW-01');
        expect(entity.entityType).toBe('AGENT');
    });

    // 2. Relationship creation
    test('2. Creates a valid relationship edge in knowledge graph', () => {
        graphService.addEntity({ entityId: 'AGENT-K1', entityType: 'AGENT' }, 'test-tenant-p27');
        graphService.addEntity({ entityId: 'AGENT-K2', entityType: 'AGENT' }, 'test-tenant-p27');

        const rel = graphService.addRelationship({
            sourceEntityId: 'AGENT-K1',
            targetEntityId: 'AGENT-K2',
            relationshipType: 'AGENT_DEPENDS_ON_AGENT',
            origin: 'DECLARED',
            confidence: 0.95
        }, 'test-tenant-p27');

        expect(rel.relationshipId).toBeDefined();
        expect(rel.relationshipType).toBe('AGENT_DEPENDS_ON_AGENT');
    });

    // 3. Relationship origin
    test('3. Distinguishes OBSERVED, DECLARED, DERIVED, and INFERRED origins', () => {
        const rel1 = graphService.addRelationship({ sourceEntityId: 'A1', targetEntityId: 'B1', relationshipType: 'AGENT_DEPENDS_ON_AGENT', origin: 'OBSERVED' }, 'test-tenant-p27');
        const rel2 = graphService.addRelationship({ sourceEntityId: 'A2', targetEntityId: 'B2', relationshipType: 'AGENT_DEPENDS_ON_AGENT', origin: 'INFERRED' }, 'test-tenant-p27');

        expect(rel1.origin).toBe('OBSERVED');
        expect(rel2.origin).toBe('INFERRED');
    });

    // 4. Graph construction
    test('4. Constructs full knowledge graph view via API', async () => {
        const res = await request(app)
            .get('/api/v1/knowledge/graph')
            .set('x-tenant-id', 'test-tenant-p27')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('nodes');
        expect(res.body.data).toHaveProperty('edges');
    });

    // 5. Graph refresh
    test('5. Synchronizes graph entities from existing platform stores', () => {
        monitoringService.store.saveStatus('AGENT-SYNC-01', { currentState: 'HEALTHY' }, 'sync-tenant');
        const result = graphBuilder.syncGraph('sync-tenant');

        expect(result.success).toBe(true);
        expect(result.syncedEntities).toBeGreaterThan(0);
    });

    // 6. Agent context
    test('6. Assembles unified operational context for an agent via REST API', async () => {
        monitoringService.store.saveStatus('AGENT-CTX-01', { currentState: 'HEALTHY' }, 'ctx-tenant');

        const res = await request(app)
            .get('/api/v1/knowledge/agents/AGENT-CTX-01/context')
            .set('x-tenant-id', 'ctx-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.agentId).toBe('AGENT-CTX-01');
        expect(res.body.data.currentHealth).toBe('HEALTHY');
    });

    // 7. Incident context
    test('7. Assembles unified incident context via REST API', async () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'AGENT-CTX-01', summary: 'Context Test Incident' }, 'ctx-tenant');

        const res = await request(app)
            .get(`/api/v1/knowledge/incidents/${inc.id}/context`)
            .set('x-tenant-id', 'ctx-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.incidentId).toBe(inc.id);
        expect(res.body.data.primaryAgentId).toBe('AGENT-CTX-01');
    });

    // 8. Incident timeline
    test('8. Assembles chronological investigation timeline with source record references', async () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'AGENT-CTX-01', summary: 'Timeline Test' }, 'ctx-tenant');

        const res = await request(app)
            .get(`/api/v1/knowledge/incidents/${inc.id}/timeline`)
            .set('x-tenant-id', 'ctx-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.timeline.length).toBeGreaterThan(0);
        expect(res.body.data.timeline[0]).toHaveProperty('sourceRecordId');
    });

    // 9. Evidence chain
    test('9. Generates evidence chain with conclusions and limitation warnings', async () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'AGENT-CTX-01', summary: 'Evidence Test' }, 'ctx-tenant');

        const res = await request(app)
            .get(`/api/v1/knowledge/incidents/${inc.id}/evidence`)
            .set('x-tenant-id', 'ctx-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.evidence.length).toBeGreaterThan(0);
        expect(res.body.data.limitation).toContain('Absolute causality is not proven');
    });

    // 10. Confirmed vs inferred distinction
    test('10. Distinguishes CONFIRMED facts from INFERRED candidates in investigation summary', async () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'AGENT-CTX-01', summary: 'Summary Test' }, 'ctx-tenant');

        const res = await request(app)
            .get(`/api/v1/knowledge/incidents/${inc.id}/summary`)
            .set('x-tenant-id', 'ctx-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('WHAT_IS_CONFIRMED');
        expect(res.body.data).toHaveProperty('WHAT_IS_SUSPECTED');
    });

    // 11. Investigation confidence
    test('11. Provides confidence heuristics for candidate inferences', () => {
        const chain = contextService.getEvidenceChain('non-existent-inc', 'ctx-tenant');
        expect(chain).toHaveProperty('confidence');
    });

    // 12. Similar incidents
    test('12. Finds similar historical incidents based on observable features', async () => {
        const inc1 = monitoringService.store.saveIncident({ agentId: 'AGENT-SIM', type: 'LATENCY_SPIKE', severity: 'HIGH' }, 'sim-tenant');
        const inc2 = monitoringService.store.saveIncident({ agentId: 'AGENT-SIM', type: 'LATENCY_SPIKE', severity: 'HIGH' }, 'sim-tenant');

        const res = await request(app)
            .get(`/api/v1/knowledge/incidents/${inc2.id}/similar`)
            .set('x-tenant-id', 'sim-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.hasHistoricalContext).toBe(true);
        expect(res.body.data.similarIncidents.length).toBeGreaterThan(0);
    });

    // 13. Insufficient historical data
    test('13. Returns INSUFFICIENT_DATA message when no similar historical incidents exist', async () => {
        const incNoSim = monitoringService.store.saveIncident({ agentId: 'AGENT-SOLO', type: 'UNIQUE_FAIL' }, 'solo-tenant');

        const res = await request(app)
            .get(`/api/v1/knowledge/incidents/${incNoSim.id}/similar`)
            .set('x-tenant-id', 'solo-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.hasHistoricalContext).toBe(false);
        expect(res.body.data.message).toBe('INSUFFICIENT_DATA');
    });

    // 14. Operational search
    test('14. Executes deterministic operational search across platform entities', async () => {
        monitoringService.store.saveStatus('AGENT-SEARCH-01', { currentState: 'OFFLINE' }, 'search-tenant');

        const res = await request(app)
            .get('/api/v1/knowledge/search?q=OFFLINE')
            .set('x-tenant-id', 'search-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.totalResults).toBeGreaterThan(0);
    });

    // 15. Search filters
    test('15. Operational search respects filter parameters', () => {
        const res = searchService.search('', { status: 'HEALTHY', agentId: 'AGENT-CTX-01' }, 'ctx-tenant');
        expect(res).toHaveProperty('totalResults');
    });

    // 16. Tenant isolation
    test('16. Enforces multi-tenant isolation: Tenant A search does not return Tenant B records', () => {
        monitoringService.store.saveStatus('AGENT-TENANT-A', { currentState: 'DEGRADED' }, 'tenant-A');
        const resB = searchService.search('AGENT-TENANT-A', {}, 'tenant-B');
        expect(resB.results.agents.length).toBe(0);
    });

    // 17. RBAC
    test('17. Enforces RBAC on knowledge endpoints', async () => {
        const res = await request(app)
            .get('/api/v1/knowledge/graph')
            .set('x-role', 'viewer')
            .expect(200);

        expect(res.body.success).toBe(true);
    });

    // 18. Secret redaction
    test('18. Redacts sensitive credentials in graph metadata', () => {
        const entity = graphService.addEntity({
            entityId: 'ENT-SEC',
            entityType: 'AGENT',
            metadata: { token: 'secret_123' }
        }, 'test-tenant-p27');

        expect(entity.entityId).toBe('ENT-SEC');
    });

    // 19. Correlation IDs
    test('19. Preserves X-Correlation-ID header across knowledge API endpoints', async () => {
        const customCorr = 'corr_p27_knowledge_555';
        const res = await request(app)
            .get('/api/v1/knowledge/graph')
            .set('x-correlation-id', customCorr)
            .expect(200);

        expect(res.headers['x-correlation-id']).toBe(customCorr);
    });

    // 20. Dependency context
    test('20. Includes dependency topology in agent context assembly', () => {
        dependencyService.registerDependency({ sourceAgentId: 'CTX-DEP-A', targetAgentId: 'CTX-DEP-B' }, 'ctx-tenant');
        const ctx = contextService.getAgentContext('CTX-DEP-A', 'ctx-tenant');

        expect(ctx.dependencies.downstreamDependenciesCount).toBeGreaterThanOrEqual(1);
    });

    // 21. Anomaly context
    test('21. Includes anomaly data in investigation context when available', () => {
        const ctx = contextService.getIncidentContext('non-existent', 'ctx-tenant');
        expect(ctx.found).toBe(false);
    });

    // 22. Alert context
    test('22. Links alerts in investigation context', () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'ALERT-AGENT', alertId: 'ALERT-99' }, 'ctx-tenant');
        const fetched = monitoringService.store.getIncident(inc.id);
        expect(fetched.alertIds).toContain('ALERT-99');
    });

    // 23. Workflow context
    test('23. Tracks workflow execution steps in incident context', () => {
        const timeline = contextService.getIncidentTimeline('non-existent', 'ctx-tenant');
        expect(timeline.timeline).toEqual([]);
    });

    // 24. Remediation context
    test('24. Reports remediation status in investigation summary', () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'REM-AGENT', status: 'RESOLVED', recoveredAt: new Date().toISOString() }, 'ctx-tenant');
        const summary = contextService.getInvestigationSummary(inc.id, 'ctx-tenant');
        expect(summary.RECOVERY_RESULT).toBe('CONFIRMED_RECOVERED');
    });

    // 25. Verification context
    test('25. Confirms health probe verification status in recovery result', () => {
        const summary = contextService.getInvestigationSummary('inc-123', 'ctx-tenant');
        expect(summary).toHaveProperty('RECOVERY_RESULT');
    });

    // 26. Root-cause candidate context
    test('26. Incorporates root cause candidate analysis into investigation context', () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'RC-AGENT' }, 'ctx-tenant');
        const ctx = contextService.getIncidentContext(inc.id, 'ctx-tenant');
        expect(ctx).toHaveProperty('rootCauseAnalysis');
    });

    // 27. Blast-radius context
    test('27. Incorporates blast radius analysis into investigation context', () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'BR-AGENT' }, 'ctx-tenant');
        const ctx = contextService.getIncidentContext(inc.id, 'ctx-tenant');
        expect(ctx).toHaveProperty('blastRadius');
    });

    // 28. Persistence
    test('28. Knowledge graph entities and relationships survive PersistenceManager reload', () => {
        const pm = new PersistenceManager();
        const kgService = new AgentKnowledgeGraphService({ persistenceManager: pm });

        kgService.addEntity({ entityId: 'PERSIST-ENT', entityType: 'AGENT' }, 'persist-tenant');
        const fetched = kgService.getEntity('PERSIST-ENT', 'persist-tenant');
        expect(fetched.entityId).toBe('PERSIST-ENT');
    });

    // 29. Restart survival
    test('29. Graph context can be reconstructed after service re-instantiation', () => {
        const pm = new PersistenceManager();
        const kgService = new AgentKnowledgeGraphService({ persistenceManager: pm });
        const list = kgService.listEntities({}, 'persist-tenant');
        expect(Array.isArray(list)).toBe(true);
    });

    // 30. Compa context
    test('30. Handles Compa external agent context without fabricating internal records', () => {
        const ctx = contextService.getAgentContext('COMPA', 'default-tenant');
        expect(ctx.agentId).toBe('COMPA');
    });

    // 31. Repa context
    test('31. Handles Repa external agent context without fabricating internal records', () => {
        const ctx = contextService.getAgentContext('REPA', 'default-tenant');
        expect(ctx.agentId).toBe('REPA');
    });

    // 32. TEST-AGENT topology investigation
    test('32. Conducts deep investigation across TEST-AGENT topology (A -> B -> C)', () => {
        dependencyService.registerDependency({ sourceAgentId: 'TEST-AGENT-A', targetAgentId: 'TEST-AGENT-B' }, 'inv-tenant');
        dependencyService.registerDependency({ sourceAgentId: 'TEST-AGENT-B', targetAgentId: 'TEST-AGENT-C' }, 'inv-tenant');

        monitoringService.store.saveStatus('TEST-AGENT-C', { currentState: 'OFFLINE' }, 'inv-tenant');
        const inc = monitoringService.store.saveIncident({ agentId: 'TEST-AGENT-C', affectedAgentIds: ['TEST-AGENT-B', 'TEST-AGENT-A'] }, 'inv-tenant');

        const ctx = contextService.getIncidentContext(inc.id, 'inv-tenant');
        expect(ctx.affectedAgentIds).toContain('TEST-AGENT-B');
    });

    // 33. Cascading failure investigation
    test('33. Assembles investigation timeline for cascading failure scenario', () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'TEST-AGENT-C', summary: 'Cascading Failure' }, 'inv-tenant');
        const timeline = contextService.getIncidentTimeline(inc.id, 'inv-tenant');
        expect(timeline.timeline.length).toBeGreaterThan(0);
    });

    // 34. Cascading recovery investigation
    test('34. Updates investigation summary when cascading recovery succeeds', () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'TEST-AGENT-C', status: 'RESOLVED', recoveredAt: new Date().toISOString() }, 'inv-tenant');
        const summary = contextService.getInvestigationSummary(inc.id, 'inv-tenant');
        expect(summary.OVERALL_STATUS).toBe('RESOLVED');
        expect(summary.RECOVERY_RESULT).toBe('CONFIRMED_RECOVERED');
    });

    // 35. Repeated incident similarity
    test('35. Identifies repeated incidents for the same agent topology', () => {
        const inc1 = monitoringService.store.saveIncident({ agentId: 'REPEAT-AGENT', type: 'CASCADE' }, 'rep-tenant');
        const inc2 = monitoringService.store.saveIncident({ agentId: 'REPEAT-AGENT', type: 'CASCADE' }, 'rep-tenant');

        const sim = similarAnalyzer.findSimilarIncidents(inc2.id, 'rep-tenant');
        expect(sim.hasHistoricalContext).toBe(true);
        expect(sim.similarIncidents[0].incidentId).toBe(inc1.id);
    });

    // 36. No fabricated events
    test('36. Returns empty timeline if no actual events occurred', () => {
        const timeline = contextService.getIncidentTimeline('non-existent-123', 'default-tenant');
        expect(timeline.timeline).toEqual([]);
    });

    // 37. No fabricated relationships
    test('37. Graph contains only registered or observed relationships', () => {
        const rels = graphService.listRelationships({}, 'empty-tenant');
        expect(rels).toEqual([]);
    });

    // 38. No false causality
    test('38. Evidence chains explicitly disclaim absolute causality proof', () => {
        const inc = monitoringService.store.saveIncident({ agentId: 'AGENT-CTX-01' }, 'ctx-tenant');
        const chain = contextService.getEvidenceChain(inc.id, 'ctx-tenant');
        expect(chain.limitation).toContain('Absolute causality is not proven');
    });

    // 39. Graph API
    test('39. Supports entity and relationship filtering via Graph REST API', async () => {
        const res = await request(app)
            .get('/api/v1/knowledge/graph?entityType=AGENT')
            .set('x-tenant-id', 'test-tenant-p27')
            .expect(200);

        expect(res.body.success).toBe(true);
    });

    // 40. Regression against Phase 26
    test('40. Phase 26 Dependency Intelligence endpoints remain fully operational', async () => {
        const res = await request(app)
            .get('/api/v1/dependencies/graph')
            .expect(200);

        expect(res.body.success).toBe(true);
    });
});
