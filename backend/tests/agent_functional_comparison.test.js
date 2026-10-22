/**
 * Agent Functional Comparison Test Suite
 * Verifies evidence-based fingerprinting, grouping, and comparison of
 * AGENT_MASTER_REGISTRY records: name-independence, duplicate restraint,
 * successor restraint, UNCLASSIFIED honesty, identity preservation, and the
 * functional API routes (stubbed services — no database, no network).
 */

const request = require('supertest');
const express = require('express');
const {
    AgentFunctionalProfiler,
    RELATIONS
} = require('../src/registry/AgentFunctionalProfiler');
const registryRouter = require('../src/api/registryRoutes');

function masterRow(overrides = {}) {
    return {
        ID: 55,
        FILENAME: 'career-suggestion-agent-2026-06-18_20260619_071250.html',
        AGENT_NAME: 'career-suggestion-agent-2026-06-18',
        AGENT_SUMMARY: null,
        CATEGORY: 'Cindex',
        USERID: 1637,
        FIRMID: 5,
        IS_PUBLIC: 1,
        PUBLIC_URL: 'https://myblocks.in:11300/agents/1637/Cindex/career-suggestion-agent-2026-06-18_20260619_071250.html',
        FILE_SIZE_KB: '10.00',
        HAS_BACKEND: 0,
        VERIFIED: 'NO',
        INSRT_DTM: new Date('2026-06-18T10:00:00.000Z'),
        UPDATE_DTM: new Date('2026-06-19T07:12:50.000Z'),
        ...overrides
    };
}

function stubSource(rows) {
    const { AgentMasterRegistrySource } = require('../src/registry/AgentMasterRegistrySource');
    return {
        async listAllRecords() {
            return rows.map((r) => AgentMasterRegistrySource.toEvaluationRecord(r, { database: 'nrkindex_trn', table: 'AGENT_MASTER_REGISTRY' }));
        },
        async getRecordById(id) {
            const row = rows.find((r) => Number(r.ID) === Number(id));
            if (!row) return null;
            return AgentMasterRegistrySource.toEvaluationRecord(row, { database: 'nrkindex_trn', table: 'AGENT_MASTER_REGISTRY' });
        }
    };
}

function buildTestApp(rows) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.userRole = 'admin';
        req.tenantId = 'default-tenant';
        next();
    });
    const { AgentMasterRegistrySource } = require('../src/registry/AgentMasterRegistrySource');
    void AgentMasterRegistrySource;
    app.set('agentMasterRegistrySource', stubSource(rows));
    app.set('persistenceManager', {
        async list() { return []; },
        async get() { return null; }
    });
    app.set('agentMonitoringService', { store: { listStatuses: () => [], getStatus: () => null } });
    app.use(registryRouter);
    return app;
}

const P = AgentFunctionalProfiler;
const fpOf = (row) => {
    const { AgentMasterRegistrySource } = require('../src/registry/AgentMasterRegistrySource');
    const rec = AgentMasterRegistrySource.toEvaluationRecord(row, {});
    return P.fingerprintRecord(rec, null);
};

describe('Agent Functional Profiler', () => {
    test('1. Different names with shared purpose group as similar (name-independent)', () => {
        const a = fpOf(masterRow());
        const b = fpOf(masterRow({ ID: 59, FILENAME: 'internship-matching-ai-2026-06-18_x.html', AGENT_NAME: 'internship-matching-ai-2026-06-18' }));
        const cmp = P.comparePair(a, b);
        expect(cmp.relation).toBe(RELATIONS.FUNCTIONALLY_SIMILAR);
        expect(cmp.reasons.join(' ')).toMatch(/Career & Employment/);
    });

    test('2. Identical names with different functions stay unrelated (name is not proof)', () => {
        const a = fpOf(masterRow({ ID: 1, FILENAME: 'hotel-booking.html', AGENT_NAME: 'helper', CATEGORY: 'Hotel', USERID: 1579 }));
        const b = fpOf(masterRow({ ID: 2, FILENAME: 'credit-risk.html', AGENT_NAME: 'helper', CATEGORY: 'Bindex', USERID: 1572 }));
        const cmp = P.comparePair(a, b);
        expect(cmp.relation).toBe(RELATIONS.UNRELATED);
    });

    test('3. Generic-only records stay unclassified, never forced into groups', () => {
        const fps = [
            fpOf(masterRow({ ID: 5, FILENAME: 'qa1.html', AGENT_NAME: 'index', CATEGORY: 'Pindex', USERID: 1616, FILE_SIZE_KB: null })),
            fpOf(masterRow({ ID: 8, FILENAME: 'qa2.html', AGENT_NAME: 'index', CATEGORY: 'Pindex', USERID: 1616, FILE_SIZE_KB: '4.37' }))
        ];
        const cmp = P.comparePair(fps[0], fps[1]);
        expect(cmp.relation).toBe(RELATIONS.INSUFFICIENT_EVIDENCE);
        const grouped = P.groupFingerprints(fps);
        expect(grouped.groups).toHaveLength(0);
        expect(grouped.unclassified.map((u) => u.masterId).sort()).toEqual([5, 8]);
    });

    test('4. Same-author iterations are variants at most — never successors from dates alone', () => {
        const a = fpOf(masterRow({ ID: 26, FILENAME: 'sql-a_20260306_114150.html', AGENT_NAME: 'sql reasoning data', CATEGORY: 'Pindex', USERID: 919, HAS_BACKEND: 1 }));
        const b = fpOf(masterRow({ ID: 28, FILENAME: 'sql-b_20260218_141255.html', AGENT_NAME: 'sql reasoning data', CATEGORY: 'Pindex', USERID: 919, HAS_BACKEND: 1 }));
        const cmp = P.comparePair(a, b);
        expect(cmp.relation).not.toBe(RELATIONS.POSSIBLE_SUCCESSOR);
        expect([RELATIONS.FUNCTIONALLY_SIMILAR, RELATIONS.POTENTIAL_VARIANT, RELATIONS.POTENTIAL_DUPLICATE, RELATIONS.INSUFFICIENT_EVIDENCE]).toContain(cmp.relation);
    });

    test('5. Cross-author identical fingerprints are similar, never exact duplicates', () => {
        const a = fpOf(masterRow({ ID: 71, FILENAME: 'a.html', AGENT_NAME: 'msme-credit-risk-agent-2026-06-22', CATEGORY: 'Bindex', USERID: 1572, HAS_BACKEND: 1 }));
        const b = fpOf(masterRow({ ID: 75, FILENAME: 'b.html', AGENT_NAME: 'msme-credit-risk-agent-2026-06-22', CATEGORY: 'Bindex', USERID: 1559, HAS_BACKEND: 1 }));
        const cmp = P.comparePair(a, b);
        expect(cmp.relation).not.toBe(RELATIONS.POTENTIAL_DUPLICATE);
        expect(cmp.relation).toBe(RELATIONS.FUNCTIONALLY_SIMILAR);
    });
});

describe('Functional comparison API routes', () => {
    const rows = [
        masterRow(),
        masterRow({ ID: 59, FILENAME: 'internship-matching-ai-2026-06-18_x.html', AGENT_NAME: 'internship-matching-ai-2026-06-18' }),
        masterRow({ ID: 5, FILENAME: 'i1.html', AGENT_NAME: 'index', CATEGORY: 'Pindex', USERID: 1616 }),
        masterRow({ ID: 6, FILENAME: 'index.css', AGENT_NAME: 'index.css', CATEGORY: 'Pindex', USERID: 1616 })
    ];

    test('6. GET groups returns evidence-based groups with identity preserved', async () => {
        const app = buildTestApp(rows);
        const res = await request(app).get('/api/v1/registry/functional/groups');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.totalRecords).toBe(4);
        const career = res.body.groups.find((g) => g.memberIds.includes(55) && g.memberIds.includes(59));
        expect(career).toBeDefined();
        expect(career.confidence).toMatch(/HIGH|MEDIUM|LOW/);
        const member = career.members.find((m) => m.masterId === 55);
        expect(member.userId).toBe(1637);
        expect(member.firmId).toBe(5);
        expect(member).toHaveProperty('functionalExecutionStatus', 'FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED');
        const unclassifiedIds = res.body.unclassified.map((u) => u.masterId);
        expect(unclassifiedIds).toContain(5);
        expect(unclassifiedIds).toContain(6);
    });

    test('7. GET compare returns pairs with reasons and observed-only candidate prep', async () => {
        const app = buildTestApp(rows);
        const res = await request(app).get('/api/v1/registry/functional/compare?ids=55,59,5');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.members).toHaveLength(3);
        for (const m of res.body.members) {
            expect(m).toHaveProperty('masterId');
            expect(m).toHaveProperty('userId');
            expect(m).toHaveProperty('firmId');
            expect(m).toHaveProperty('functionalExecutionStatus', 'FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED');
        }
        expect(res.body.pairs).toHaveLength(3);
        for (const p of res.body.pairs) {
            expect(Array.isArray(p.reasons)).toBe(true);
            expect(typeof p.score).toBe('number');
        }
        expect(res.body.functionalExecutionStatus).toBe('FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED');
        expect(res.body.bestCandidatePrep.note).toMatch(/not a quality verdict/i);
        expect(res.body.bestCandidatePrep).not.toHaveProperty('keep');
        expect(res.body.bestCandidatePrep).not.toHaveProperty('retire');
    });

    test('8. GET fingerprint exposes tokens, domains, and stored-evaluation presence', async () => {
        const app = buildTestApp(rows);
        const res = await request(app).get('/api/v1/registry/master/55/fingerprint');
        expect(res.status).toBe(200);
        expect(res.body.data.masterId).toBe(55);
        expect(res.body.data.tokens).toContain('career');
        expect(res.body.data.domains).toContain('CAREER');
        expect(res.body.data.storedEvaluationPresent).toBe(false);
    });

    test('9. Compare requires at least two valid IDs and 404s unknown rows', async () => {
        const app = buildTestApp(rows);
        const one = await request(app).get('/api/v1/registry/functional/compare?ids=55');
        expect(one.status).toBe(400);
        const missing = await request(app).get('/api/v1/registry/functional/compare?ids=55,999999');
        expect(missing.status).toBe(404);
    });
});
