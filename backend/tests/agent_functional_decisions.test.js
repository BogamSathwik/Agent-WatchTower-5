/**
 * Agent Functional Testing & Decisions Test Suite
 * Verifies controlled trial behavior (stubbed fetch — no network) and
 * evidence-based KEEP/REVIEW/RETIRE logic: no auto-actions, no fabrication,
 * insufficient evidence always yields REVIEW, single failures never retire.
 */

const request = require('supertest');
const express = require('express');
const { AgentFunctionalTester } = require('../src/registry/AgentFunctionalTesting');
const { AgentFunctionalDecider } = require('../src/registry/AgentFunctionalDecisions');
const {
    AgentFunctionalProfiler
} = require('../src/registry/AgentFunctionalProfiler');
const { AgentMasterRegistrySource } = require('../src/registry/AgentMasterRegistrySource');
const registryRouter = require('../src/api/registryRoutes');

function masterRow(overrides = {}) {
    return {
        ID: 22,
        FILENAME: 'x.html',
        AGENT_NAME: 'x',
        AGENT_SUMMARY: null,
        CATEGORY: 'Startups',
        USERID: 919,
        FIRMID: 5,
        IS_PUBLIC: 1,
        PUBLIC_URL: 'https://myblocks.in:11300/agents/public/Startups/x.html',
        FILE_SIZE_KB: '12.50',
        HAS_BACKEND: 0,
        VERIFIED: 'NO',
        INSRT_DTM: new Date('2026-03-02T13:36:54.000Z'),
        UPDATE_DTM: new Date('2026-03-06T07:26:18.000Z'),
        ...overrides
    };
}

const SI = { database: 'nrkindex_trn', table: 'AGENT_MASTER_REGISTRY' };
const toRec = (row) => AgentMasterRegistrySource.toEvaluationRecord(row, SI);

function stubFetch(handler) {
    return async (url) => handler(url);
}

function okResponse() {
    return { status: 200, url: null, headers: { get: () => 'text/html' }, text: async () => '<html></html>' };
}

function memberFixture(overrides = {}) {
    return {
        masterId: 22,
        userId: 919,
        firmId: 5,
        agentName: 'x',
        filename: 'x.html',
        category: 'Startups',
        publicUrl: 'https://myblocks.in:11300/agents/public/Startups/x.html',
        recordKind: 'CANDIDATE_AGENT',
        testable: true,
        testabilityReason: 'OK',
        agentType: 'WEB APP',
        health: 'HEALTHY',
        latencyMs: 200,
        capabilities: [],
        capabilityStatus: 'CAPABILITIES_NOT_EXPOSED',
        hasBackend: false,
        isPublic: true,
        verified: 'NO',
        evidenceStatus: 'EVALUATED',
        evaluatedAt: '2026-10-05T00:00:00.000Z',
        monitoring: null,
        incident: null,
        fingerprint: null,
        functionalExecutionStatus: 'FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED',
        ...overrides
    };
}

function evalFixture(overrides = {}) {
    return {
        masterId: 22,
        externallyTestable: true,
        testabilityReason: 'OK',
        agentType: 'WEB APP',
        reachability: { reachable: true, httpStatus: 200, latencyMs: 200, contentType: 'text/html', finalUrl: null, error: null },
        runtimeHealth: { state: 'HEALTHY', basis: 'x' },
        capabilityStatus: 'CAPABILITIES_NOT_EXPOSED',
        capabilities: [],
        ...overrides
    };
}

describe('Agent Functional Tester', () => {
    test('1. Reachability trials record real per-trial outcomes with summary stats', async () => {
        const tester = new AgentFunctionalTester({
            masterSource: { async getRecordById() { return toRec(masterRow()); } },
            persistenceManager: { async set() { return true; }, async get() { return null; } },
            fetchImpl: stubFetch(okResponse),
            trialCount: 3
        });
        const result = await tester.testMasterRecord(22);
        expect(result.reachabilityTrials).toHaveLength(3);
        expect(result.reachabilitySummary).toMatchObject({ trials: 3, successful: 3, failed: 0, successRate: 100 });
        expect(result.consistency).toBe('CONSISTENT_SUCCESS');
        expect(result.taskAssessment.executable).toBe(false);
        expect(result.taskAssessment.code).toBe('FUNCTIONAL_EXECUTION_NOT_AVAILABLE');
        expect(result.taskTrials).toEqual([]);
        expect(result.masterId).toBe(22);
        expect(result.userId).toBe(919);
        expect(result.firmId).toBe(5);
    });

    test('2. Failed trials are recorded honestly; non-testable records never probe', async () => {
        let probed = false;
        const failing = new AgentFunctionalTester({
            masterSource: { async getRecordById() { return toRec(masterRow()); } },
            persistenceManager: { async set() { return true; } },
            fetchImpl: stubFetch(async () => { probed = true; throw new Error('socket hang up'); }),
            trialCount: 2
        });
        const failed = await failing.testMasterRecord(22);
        expect(probed).toBe(true);
        expect(failed.reachabilitySummary).toMatchObject({ trials: 2, successful: 0, failed: 2 });
        expect(failed.consistency).toBe('CONSISTENT_FAILURE');

        probed = false;
        const rel = toRec(masterRow({ PUBLIC_URL: '/agents/x.html' }));
        const refused = new AgentFunctionalTester({
            masterSource: { async getRecordById() { return rel; } },
            persistenceManager: { async set() { return true; } },
            fetchImpl: stubFetch(async () => { probed = true; throw new Error('must not probe'); })
        });
        await expect(refused.testMasterRecord(22)).rejects.toMatchObject({ code: 'FUNCTIONAL_TEST_NOT_POSSIBLE' });
        expect(probed).toBe(false);
    });

    test('3. Task executability requires an observed safe interface', () => {
        expect(AgentFunctionalTester.assessExecutability({ record: toRec(masterRow()), evaluation: null }).code)
            .toBe('FUNCTIONAL_EXECUTION_NOT_AVAILABLE');
        expect(AgentFunctionalTester.assessExecutability({
            record: toRec(masterRow()),
            evaluation: { capabilityStatus: 'AVAILABLE', capabilities: [{ id: 'summarize' }] }
        }).code).toBe('FUNCTIONAL_EXECUTION_NOT_SUPPORTED');
    });
});

describe('Agent Functional Decider', () => {
    const D = AgentFunctionalDecider;

    function decide(memberOverrides = {}, extra = {}) {
        const member = memberFixture(memberOverrides);
        const fp = AgentFunctionalProfiler.fingerprintRecord(
            { masterId: member.masterId, userId: member.userId, firmId: member.firmId, agentName: member.agentName, filename: 'x.html', category: member.category, hasBackend: member.hasBackend, fileSizeKb: null, recordKind: member.recordKind },
            extra.evaluation || null
        );
        return D.decideForMember({
            member,
            fingerprint: fp,
            evaluation: extra.evaluation !== undefined ? extra.evaluation : evalFixture(),
            trials: extra.trials || null,
            peers: extra.peers || []
        });
    }

    test('4. Non-candidate and never-evaluated records yield REVIEW, never decisions', () => {
        const nonCandidate = decide({ recordKind: 'SUPPORTING_RESOURCE' }, { evaluation: null });
        expect(nonCandidate.decision).toBe('REVIEW');
        const neverEval = D.decideForMember({
            member: memberFixture({ agentType: 'NOT_EVALUATED', evidenceStatus: 'NOT_EVALUATED' }),
            fingerprint: null,
            evaluation: null,
            trials: null,
            peers: []
        });
        expect(neverEval.decision).toBe('REVIEW');
        expect(neverEval.codes).toContain('NOT_EVALUATED');
    });

    test('5. Non-testable records yield REVIEW with FUNCTIONAL_TEST_NOT_POSSIBLE', () => {
        const r = decide({ testable: false, testabilityReason: 'RELATIVE_URL_NO_HOST' }, {
            evaluation: { ...evalFixture(), externallyTestable: false, testabilityReason: 'RELATIVE_URL_NO_HOST' }
        });
        expect(r.decision).toBe('REVIEW');
        expect(r.codes).toContain('FUNCTIONAL_TEST_NOT_POSSIBLE');
        expect(r.reason).toMatch(/RELATIVE_URL_NO_HOST/);
    });

    test('6. Strong task evidence with no stronger peer yields KEEP with trial counts', () => {
        const r = decide({}, {
            trials: {
                taskTrials: Array.from({ length: 10 }, () => ({ successful: true })),
                taskAssessment: { executable: true, code: 'EXECUTABLE', reason: 'x' }
            }
        });
        expect(r.decision).toBe('KEEP');
        expect(r.reason).toMatch(/9\/10|10\/10/);
    });

    test('7. All-failed task trials with a stronger peer yield RETIRE; without one, REVIEW', () => {
        const failedTrials = {
            taskTrials: Array.from({ length: 10 }, () => ({ successful: false })),
            taskAssessment: { executable: true, code: 'EXECUTABLE', reason: 'x' }
        };
        const strongPeer = { masterId: 23, relation: 'FUNCTIONALLY_SIMILAR', score: 0.8, healthy: true, capsAvailable: true, openIncident: false, taskTrials: 10, taskSuccessRate: 100, health: 'HEALTHY' };
        const retire = decide({}, { trials: failedTrials, peers: [strongPeer] });
        expect(retire.decision).toBe('RETIRE');
        expect(retire.reason).toMatch(/10\/10|failed all 10/);
        expect(retire.reason).toMatch(/23/);
        const review = decide({}, { trials: failedTrials, peers: [] });
        expect(review.decision).toBe('REVIEW');
    });

    test('8. Single failed observation never retires', () => {
        const r = decide({ health: 'OFFLINE' }, {
            evaluation: {
                ...evalFixture(),
                reachability: { reachable: false, httpStatus: 0, latencyMs: 5000, error: 'REQUEST_TIMEOUT' },
                runtimeHealth: { state: 'OFFLINE', basis: 'x' }
            }
        });
        expect(r.decision).toBe('REVIEW');
        expect(r.codes).toContain('SINGLE_OBSERVATION');
    });

    test('9. Sustained monitored health with no stronger equivalent yields KEEP', () => {
        const r = decide({
            monitoring: { tracked: true, currentState: 'HEALTHY', connectivity: 'CONNECTED', lastCheckAt: '2026-10-05T00:00:00.000Z', availabilityPercentage: 98, totalChecksCount: 20 }
        }, {
            evaluation: evalFixture(),
            peers: [{ masterId: 30, relation: 'UNRELATED', score: 0.1, healthy: true, capsAvailable: false, openIncident: false, taskTrials: 0, taskSuccessRate: null, health: 'HEALTHY' }]
        });
        expect(r.decision).toBe('KEEP');
        expect(r.reason).toMatch(/98%.*20 checks|20 checks.*98%/);
    });

    test('10. Stronger near-identical peer turns KEEP into REVIEW, never silent KEEP', () => {
        const r = decide({
            monitoring: { tracked: true, currentState: 'HEALTHY', connectivity: 'CONNECTED', lastCheckAt: '2026-10-05T00:00:00.000Z', availabilityPercentage: 98, totalChecksCount: 20 }
        }, {
            evaluation: evalFixture(),
            peers: [{ masterId: 31, relation: 'POTENTIAL_DUPLICATE', score: 0.95, healthy: true, capsAvailable: true, openIncident: false, taskTrials: 4, taskSuccessRate: 100, health: 'HEALTHY' }]
        });
        // Self has no task evidence; the near-identical peer does — the peer
        // is clearly stronger, so silent KEEP is forbidden.
        expect(r.decision).toBe('REVIEW');
        expect(r.codes).toContain('STRONGER_ALTERNATIVE');
    });
});

describe('Functional report/test API routes', () => {
    function buildApp(rows) {
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            req.userRole = 'admin';
            req.tenantId = 'default-tenant';
            next();
        });
        app.set('agentMasterRegistrySource', {
            async listAllRecords() {
                return rows.map((r) => AgentMasterRegistrySource.toEvaluationRecord(r, SI));
            },
            async getRecordById(id) {
                const row = rows.find((r) => Number(r.ID) === Number(id));
                return row ? AgentMasterRegistrySource.toEvaluationRecord(row, SI) : null;
            }
        });
        app.set('persistenceManager', {
            async list() { return []; },
            async get() { return null; },
            async set() { return true; }
        });
        app.set('agentMonitoringService', { store: { listStatuses: () => [], getStatus: () => null } });
        app.use(registryRouter);
        return app;
    }

    const rows = [
        masterRow(),
        masterRow({ ID: 23, FILENAME: 'y.html', AGENT_NAME: 'career-helper', CATEGORY: 'Cindex', USERID: 1637 }),
        masterRow({ ID: 6, FILENAME: 'index.css', AGENT_NAME: 'index.css', CATEGORY: 'Pindex', USERID: 1616, PUBLIC_URL: '/agents/x.css' })
    ];

    test('11. Report returns fleet summary, group summaries, and decision table without decisions-by-default', async () => {
        const app = buildApp(rows);
        const res = await request(app).get('/api/v1/registry/functional/report');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.summary.totalRecords).toBe(3);
        expect(res.body.summary.testableUrls).toBe(2);
        expect(res.body.summary.nonTestableRecords).toBe(1);
        expect(res.body.summary.retireCount).toBe(0);
        expect(res.body.summary.keepCount).toBe(0);
        const allDecisions = [
            ...res.body.groups.flatMap((g) => g.members),
            ...res.body.unclassified
        ];
        expect(allDecisions.length).toBe(3);
        for (const m of allDecisions) {
            expect(m.masterId).toBeDefined();
            expect(m.userId).toBeDefined();
            expect(m.firmId).toBeDefined();
            expect(m.decision.decision).toBe('REVIEW');
            expect(typeof m.decision.reason).toBe('string');
        }
        expect(res.body.functionalExecutionStatus).toBe('FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED');
    });

    test('12. Test endpoint refuses non-testable records without probing', async () => {
        const app = buildApp(rows);
        const res = await request(app).post('/api/v1/registry/functional/test?ids=6');
        expect(res.status).toBe(200);
        expect(res.body.results[0].ok).toBe(false);
        expect(res.body.results[0].error.code).toBe('FUNCTIONAL_TEST_NOT_POSSIBLE');
    });
});
