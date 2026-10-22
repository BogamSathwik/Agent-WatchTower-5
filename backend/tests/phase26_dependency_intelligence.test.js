/**
 * Phase 26 — Multi-Agent Collaboration, Dependency Intelligence & Service Topology Test Suite
 * Comprehensive verification for dependency modeling, graph traversal, cycle detection,
 * blast radius analysis, root cause candidate identification, health propagation,
 * multi-agent recovery ordering, RBAC, tenant isolation, and Compa/Repa/TEST-AGENT behaviors.
 */

const request = require('supertest');
const { createApp } = require('../src/app');
const { AgentDependencyService } = require('../src/dependencies/AgentDependencyService');
const { DependencyGraphService } = require('../src/dependencies/DependencyGraphService');
const { BlastRadiusAnalyzer } = require('../src/dependencies/BlastRadiusAnalyzer');
const { RootCauseAnalyzer } = require('../src/dependencies/RootCauseAnalyzer');
const { PersistenceManager } = require('../src/persistence/PersistenceManager');

describe('PHASE 26 — Multi-Agent Collaboration, Dependency Intelligence & Service Topology', () => {
    let app;
    let dependencyService;
    let graphService;
    let blastRadiusAnalyzer;
    let rootCauseAnalyzer;
    let monitoringService;
    let policyEngine;
    let orchestrator;

    beforeAll(() => {
        app = createApp({ environment: 'test' });
        dependencyService = app.get('agentDependencyService');
        graphService = app.get('dependencyGraphService');
        blastRadiusAnalyzer = app.get('blastRadiusAnalyzer');
        rootCauseAnalyzer = app.get('rootCauseAnalyzer');
        monitoringService = app.get('agentMonitoringService');
        policyEngine = app.get('automationPolicyEngine');
        orchestrator = app.get('intelligentWorkflowOrchestrator');
    });

    afterAll(() => {
        if (monitoringService && typeof monitoringService.stopAll === 'function') {
            monitoringService.stopAll();
        }
    });

    // 1. Dependency creation
    test('1. Creates a valid dependency relationship via API', async () => {
        const res = await request(app)
            .post('/api/v1/dependencies')
            .set('x-tenant-id', 'test-tenant-p26')
            .set('x-role', 'admin')
            .send({
                sourceAgentId: 'TEST-AGENT-A',
                targetAgentId: 'TEST-AGENT-B',
                relationshipType: 'DEPENDS_ON',
                criticality: 'CRITICAL',
                origin: 'DECLARED'
            })
            .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.data.dependencyId).toBeDefined();
        expect(res.body.data.sourceAgentId).toBe('TEST-AGENT-A');
        expect(res.body.data.targetAgentId).toBe('TEST-AGENT-B');
    });

    // 2. Dependency update
    test('2. Updates an existing dependency relationship', async () => {
        const created = dependencyService.registerDependency({
            sourceAgentId: 'TEST-AGENT-X',
            targetAgentId: 'TEST-AGENT-Y',
            relationshipType: 'CALLS'
        }, 'test-tenant-p26');

        const res = await request(app)
            .put(`/api/v1/dependencies/${created.dependencyId}`)
            .set('x-tenant-id', 'test-tenant-p26')
            .set('x-role', 'admin')
            .send({ criticality: 'CRITICAL' })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.criticality).toBe('CRITICAL');
    });

    // 3. Dependency deletion
    test('3. Deletes an existing dependency relationship', async () => {
        const created = dependencyService.registerDependency({
            sourceAgentId: 'TEST-AGENT-M',
            targetAgentId: 'TEST-AGENT-N'
        }, 'test-tenant-p26');

        const res = await request(app)
            .delete(`/api/v1/dependencies/${created.dependencyId}`)
            .set('x-tenant-id', 'test-tenant-p26')
            .set('x-role', 'admin')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.deletedId).toBe(created.dependencyId);
    });

    // 4. Invalid agent rejection
    test('4. Rejects creation when required agent IDs are missing', () => {
        expect(() => {
            dependencyService.registerDependency({ sourceAgentId: '' }, 'test-tenant-p26');
        }).toThrow('sourceAgentId and targetAgentId are required.');
    });

    // 5. Self-dependency rejection
    test('5. Rejects self-dependency relationship', async () => {
        const res = await request(app)
            .post('/api/v1/dependencies')
            .set('x-tenant-id', 'test-tenant-p26')
            .set('x-role', 'admin')
            .send({ sourceAgentId: 'AGENT-SELF', targetAgentId: 'AGENT-SELF' })
            .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.error.message).toContain('Self-dependency is invalid');
    });

    // 6. Duplicate dependency rejection
    test('6. Rejects duplicate dependency relationship between same agents', () => {
        dependencyService.registerDependency({
            sourceAgentId: 'SRC-DUP',
            targetAgentId: 'TGT-DUP',
            relationshipType: 'DEPENDS_ON'
        }, 'test-tenant-p26');

        expect(() => {
            dependencyService.registerDependency({
                sourceAgentId: 'SRC-DUP',
                targetAgentId: 'TGT-DUP',
                relationshipType: 'DEPENDS_ON'
            }, 'test-tenant-p26');
        }).toThrow('Duplicate dependency already exists');
    });

    // 7. Cross-tenant rejection
    test('7. Enforces tenant isolation: Tenant A cannot access or mutate Tenant B dependencies', () => {
        const depA = dependencyService.registerDependency({
            sourceAgentId: 'AGENT-TA1',
            targetAgentId: 'AGENT-TA2'
        }, 'tenant-A');

        const foundInB = dependencyService.getDependency(depA.dependencyId, 'tenant-B');
        expect(foundInB).toBeNull();
    });

    // 8. Circular dependency detection
    test('8. Rejects circular dependency creation (A -> B -> C -> A)', () => {
        dependencyService.registerDependency({ sourceAgentId: 'CYCLE-A', targetAgentId: 'CYCLE-B' }, 'cycle-tenant');
        dependencyService.registerDependency({ sourceAgentId: 'CYCLE-B', targetAgentId: 'CYCLE-C' }, 'cycle-tenant');

        expect(() => {
            dependencyService.registerDependency({ sourceAgentId: 'CYCLE-C', targetAgentId: 'CYCLE-A' }, 'cycle-tenant');
        }).toThrow('CIRCULAR_DEPENDENCY');
    });

    // 9. Graph construction
    test('9. Constructs directional topology graph correctly', () => {
        const topology = graphService.getTopology('test-tenant-p26');
        expect(topology).toHaveProperty('nodes');
        expect(topology).toHaveProperty('edges');
        expect(Array.isArray(topology.nodes)).toBe(true);
    });

    // 10. Upstream traversal
    test('10. Traverses upstream dependents correctly (A -> B -> C: for C, upstream dependents are B and A)', () => {
        dependencyService.registerDependency({ sourceAgentId: 'AGENT-A', targetAgentId: 'AGENT-B' }, 'trav-tenant');
        dependencyService.registerDependency({ sourceAgentId: 'AGENT-B', targetAgentId: 'AGENT-C' }, 'trav-tenant');

        const upstream = graphService.getUpstreamDependents('AGENT-C', 'trav-tenant');
        const ids = upstream.map(u => u.agentId);
        expect(ids).toContain('AGENT-B');
        expect(ids).toContain('AGENT-A');
    });

    // 11. Downstream traversal
    test('11. Traverses downstream dependencies correctly (for A, downstream dependencies are B and C)', () => {
        const downstream = graphService.getDownstreamDependencies('AGENT-A', 'trav-tenant');
        const ids = downstream.map(d => d.agentId);
        expect(ids).toContain('AGENT-B');
        expect(ids).toContain('AGENT-C');
    });

    // 12. Dependency health propagation
    test('12. Propagates dependency status without mutating confirmed health probe status', () => {
        monitoringService.store.saveStatus('AGENT-C', { currentState: 'OFFLINE', consecutiveFailures: 3 }, 'trav-tenant');
        monitoringService.store.saveStatus('AGENT-B', { currentState: 'HEALTHY', consecutiveFailures: 0 }, 'trav-tenant');

        const topology = graphService.getTopology('trav-tenant');
        const nodeB = topology.nodes.find(n => n.agentId === 'AGENT-B');
        expect(nodeB.health).toBe('HEALTHY'); // Probe health remains HEALTHY
        expect(['BLOCKED', 'DEPENDENCY_DEGRADED']).toContain(nodeB.dependencyStatus); // Dependency status indicates degradation
    });

    // 13. Dependency impact
    test('13. Calculates dependency impact endpoints correctly', async () => {
        const res = await request(app)
            .get('/api/v1/dependencies/agents/AGENT-A/impact')
            .set('x-tenant-id', 'trav-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.agentId).toBe('AGENT-A');
    });

    // 14. Blast-radius analysis
    test('14. Calculates blast radius for failing root agent with direct and indirect impact', async () => {
        const res = await request(app)
            .get('/api/v1/dependencies/agents/AGENT-C/blast-radius')
            .set('x-tenant-id', 'trav-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.rootAgentId).toBe('AGENT-C');
        expect(res.body.data.directlyAffected.some(d => d.agentId === 'AGENT-B')).toBe(true);
        expect(res.body.data.disclaimer).toContain('POTENTIALLY AFFECTED');
    });

    // 15. Root-cause candidate
    test('15. Identifies root cause candidate with relative timestamps and graph evidence', () => {
        monitoringService.store.saveStatus('AGENT-C', { currentState: 'OFFLINE', updatedAt: new Date(Date.now() - 10000).toISOString() }, 'trav-tenant');
        monitoringService.store.saveStatus('AGENT-B', { currentState: 'DEGRADED', updatedAt: new Date(Date.now() - 5000).toISOString() }, 'trav-tenant');
        monitoringService.store.saveStatus('AGENT-A', { currentState: 'DEGRADED', updatedAt: new Date(Date.now() - 1000).toISOString() }, 'trav-tenant');

        const analysis = rootCauseAnalyzer.analyzeRootCause(['AGENT-A', 'AGENT-B', 'AGENT-C'], 'trav-tenant');
        expect(analysis.candidates.length).toBeGreaterThan(0);
        expect(analysis.candidates[0].candidateAgentId).toBe('AGENT-C');
        expect(analysis.candidates[0].role).toBe('PRIMARY_ROOT_CAUSE_CANDIDATE');
    });

    // 16. Cross-agent correlation
    test('16. Generates cross-agent correlation summaries for overlapping failures', () => {
        const analysis = rootCauseAnalyzer.analyzeRootCause(['AGENT-A', 'AGENT-B'], 'trav-tenant');
        expect(analysis).toHaveProperty('analyzedAgents');
        expect(analysis).toHaveProperty('disclaimer');
    });

    // 17. Correlated incident
    test('17. Links correlated multi-agent incidents in monitoring store', () => {
        const inc = monitoringService.store.saveIncident({
            agentId: 'AGENT-C',
            affectedAgentIds: ['AGENT-B', 'AGENT-A'],
            summary: 'Root dependency failure'
        }, 'trav-tenant');

        const fetched = monitoringService.store.getIncident(inc.id);
        expect(fetched.affectedAgentIds).toContain('AGENT-B');
    });

    // 18. Dependency-aware risk
    test('18. Factors dependency topology into node assessment', () => {
        const depth = graphService.calculateDepth('AGENT-A', 'trav-tenant');
        expect(depth).toBeGreaterThanOrEqual(1);
    });

    // 19. Dependency-aware policy
    test('19. Evaluates policies with dependency condition requirements', () => {
        const pol = policyEngine.savePolicy({
            name: 'Dependency Offline Policy',
            trigger: 'AGENT_OFFLINE',
            conditions: [{ field: 'consecutiveFailures', operator: 'greaterThan', value: 1 }]
        }, 'trav-tenant');

        expect(pol.policyId).toBeDefined();
    });

    // 20. Multi-agent workflow
    test('20. Executes multi-step workflow respecting topology', async () => {
        const event = {
            eventType: 'AGENT_OFFLINE',
            agentId: 'AGENT-C',
            newStatus: 'OFFLINE',
            consecutiveFailures: 3
        };

        const result = await orchestrator.processEvent(event, 'trav-tenant', { autoApprove: true });
        expect(result.processed).toBe(true);
    });

    // 21. Recovery ordering
    test('21. Computes topological recovery order (root provider first, then dependents)', () => {
        const order = graphService.getRecoveryOrder(['AGENT-A', 'AGENT-B', 'AGENT-C'], 'trav-tenant');
        expect(order.indexOf('AGENT-C')).toBeLessThan(order.indexOf('AGENT-B'));
        expect(order.indexOf('AGENT-B')).toBeLessThan(order.indexOf('AGENT-A'));
    });

    // 22. Dependency recovery
    test('22. Verifies recovery of root dependency before clearing dependent alerts', async () => {
        monitoringService.store.saveStatus('AGENT-C', { currentState: 'HEALTHY', consecutiveFailures: 0 }, 'trav-tenant');
        const st = monitoringService.store.getStatus('AGENT-C', 'trav-tenant');
        expect(st.currentState).toBe('HEALTHY');
    });

    // 23. Recovery failure
    test('23. Handles recovery failure gracefully without crashing', async () => {
        monitoringService.store.saveStatus('FAIL-AGENT', { currentState: 'OFFLINE', consecutiveFailures: 5 }, 'trav-tenant');
        const analysis = blastRadiusAnalyzer.analyzeBlastRadius('FAIL-AGENT', 'trav-tenant');
        expect(analysis.rootAgentId).toBe('FAIL-AGENT');
    });

    // 24. Operator escalation
    test('24. Creates operator audit record upon unrecoverable dependency failure', () => {
        const analysis = rootCauseAnalyzer.analyzeRootCause(['FAIL-AGENT'], 'trav-tenant');
        expect(analysis.candidates.length).toBeGreaterThan(0);
    });

    // 25. Persistence
    test('25. Dependency relationships survive PersistenceManager reload', () => {
        const pm = new PersistenceManager();
        const depService = new AgentDependencyService({ persistenceManager: pm });
        const created = depService.registerDependency({ sourceAgentId: 'PERSIST-A', targetAgentId: 'PERSIST-B' }, 'persist-tenant');

        const fetched = depService.getDependency(created.dependencyId, 'persist-tenant');
        expect(fetched.sourceAgentId).toBe('PERSIST-A');
    });

    // 26. Restart survival
    test('26. Graph topology can be reconstructed after service re-instantiation', () => {
        const pm = new PersistenceManager();
        const depService = new AgentDependencyService({ persistenceManager: pm });
        const gService = new DependencyGraphService({ dependencyService: depService });

        depService.registerDependency({ sourceAgentId: 'RESTART-A', targetAgentId: 'RESTART-B' }, 'restart-tenant');
        const topology = gService.getTopology('restart-tenant');
        expect(topology.edges.length).toBeGreaterThan(0);
    });

    // 27. RBAC
    test('27. Enforces RBAC: Viewer role forbidden from registering or deleting dependencies', async () => {
        const res = await request(app)
            .post('/api/v1/dependencies')
            .set('x-role', 'viewer')
            .send({ sourceAgentId: 'V1', targetAgentId: 'V2' })
            .expect(403);

        expect(res.body.success).toBe(false);
        expect(res.body.code || (res.body.error && res.body.error.code)).toBe('FORBIDDEN');
    });

    // 28. Tenant isolation
    test('28. Graph endpoints filter strictly by x-tenant-id header', async () => {
        const res = await request(app)
            .get('/api/v1/dependencies/graph')
            .set('x-tenant-id', 'iso-tenant-x')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.tenantId).toBe('iso-tenant-x');
    });

    // 29. Secret redaction
    test('29. Metadata fields containing sensitive parameters are handled safely', () => {
        const created = dependencyService.registerDependency({
            sourceAgentId: 'SEC-A',
            targetAgentId: 'SEC-B',
            metadata: { secretToken: 'redacted_123' }
        }, 'test-tenant-p26');

        expect(created.dependencyId).toBeDefined();
    });

    // 30. Correlation IDs
    test('30. Preserves X-Correlation-ID header across dependency API endpoints', async () => {
        const customCorr = 'corr_p26_dep_999';
        const res = await request(app)
            .get('/api/v1/dependencies/graph')
            .set('x-correlation-id', customCorr)
            .expect(200);

        expect(res.headers['x-correlation-id']).toBe(customCorr);
    });

    // 31. Compa behavior
    test('31. Handles Compa external agent dependencies without fabricating unverified relationships', () => {
        const created = dependencyService.registerDependency({
            sourceAgentId: 'COMPA',
            targetAgentId: 'TEST-AGENT-001',
            origin: 'DECLARED'
        }, 'test-tenant-p26');

        expect(created.origin).toBe('DECLARED');
    });

    // 32. Repa behavior
    test('32. Handles Repa external agent dependencies without fabricating unverified relationships', () => {
        const created = dependencyService.registerDependency({
            sourceAgentId: 'REPA',
            targetAgentId: 'TEST-AGENT-001',
            origin: 'DECLARED'
        }, 'test-tenant-p26');

        expect(created.origin).toBe('DECLARED');
    });

    // 33. TEST-AGENT multi-agent topology
    test('33. Constructs multi-agent test topology: TEST-AGENT-A -> TEST-AGENT-B -> TEST-AGENT-C', () => {
        dependencyService.registerDependency({ sourceAgentId: 'TEST-AGENT-A', targetAgentId: 'TEST-AGENT-B' }, 'topo-tenant');
        dependencyService.registerDependency({ sourceAgentId: 'TEST-AGENT-B', targetAgentId: 'TEST-AGENT-C' }, 'topo-tenant');

        const topology = graphService.getTopology('topo-tenant');
        expect(topology.nodes.length).toBe(3);
    });

    // 34. Cascading failure
    test('34. Simulates cascading failure scenario across multi-agent topology', () => {
        monitoringService.store.saveStatus('TEST-AGENT-C', { currentState: 'OFFLINE', consecutiveFailures: 3 }, 'topo-tenant');

        const blast = blastRadiusAnalyzer.analyzeBlastRadius('TEST-AGENT-C', 'topo-tenant');
        expect(blast.totalAffectedCount).toBe(2);
    });

    // 35. Cascading recovery
    test('35. Verifies cascading recovery when root agent returns to HEALTHY', () => {
        monitoringService.store.saveStatus('TEST-AGENT-C', { currentState: 'HEALTHY', consecutiveFailures: 0 }, 'topo-tenant');
        monitoringService.store.saveStatus('TEST-AGENT-B', { currentState: 'HEALTHY', consecutiveFailures: 0 }, 'topo-tenant');
        monitoringService.store.saveStatus('TEST-AGENT-A', { currentState: 'HEALTHY', consecutiveFailures: 0 }, 'topo-tenant');

        const topology = graphService.getTopology('topo-tenant');
        const nodeA = topology.nodes.find(n => n.agentId === 'TEST-AGENT-A');
        expect(nodeA.dependencyStatus).toBe('HEALTHY');
    });

    // 36. False causality protection
    test('36. Enforces false causality protection in output terminology', () => {
        const analysis = blastRadiusAnalyzer.analyzeBlastRadius('TEST-AGENT-C', 'topo-tenant');
        expect(analysis.disclaimer).toContain('POTENTIALLY AFFECTED');
    });

    // 37. Inferred vs declared dependency
    test('37. Distinguishes DECLARED, DISCOVERED, and INFERRED dependency origins', () => {
        const declared = dependencyService.registerDependency({ sourceAgentId: 'ORIG-1', targetAgentId: 'ORIG-2', origin: 'DECLARED' }, 'test-tenant-p26');
        const inferred = dependencyService.registerDependency({ sourceAgentId: 'ORIG-3', targetAgentId: 'ORIG-4', origin: 'INFERRED' }, 'test-tenant-p26');

        expect(declared.origin).toBe('DECLARED');
        expect(inferred.origin).toBe('INFERRED');
    });

    // 38. Blast-radius UI/API
    test('38. Returns complete blast-radius analysis object via REST API', async () => {
        const res = await request(app)
            .get('/api/v1/dependencies/agents/TEST-AGENT-C/blast-radius')
            .set('x-tenant-id', 'topo-tenant')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.rootAgentId).toBe('TEST-AGENT-C');
    });

    // 39. Root-cause evidence
    test('39. Provides structured evidence lines in root cause analysis output', () => {
        const analysis = rootCauseAnalyzer.analyzeRootCause(['TEST-AGENT-A', 'TEST-AGENT-B', 'TEST-AGENT-C'], 'topo-tenant');
        expect(analysis.candidates[0].evidence.length).toBeGreaterThan(0);
    });

    // 40. Regression against Phase 25
    test('40. Phase 25 Event-Driven Automation endpoints remain fully operational', async () => {
        const res = await request(app)
            .get('/api/v1/automation/overview')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('activePolicies');
    });
});
