/**
 * Agent Master Registry Source Test Suite
 * Verifies read-only mapping of nrkindex_trn.AGENT_MASTER_REGISTRY rows into
 * Watchtower evaluation records: identity preservation, honest
 * classification, PUBLIC_URL-only testability, and monitor-contract building.
 * Uses inline fixtures shaped like the real rows plus a stub read service —
 * never touches a real database and never fabricates health data.
 */

const {
    AgentMasterRegistrySource,
    RECORD_KINDS
} = require('../src/registry/AgentMasterRegistrySource');

function masterRow(overrides = {}) {
    return {
        ID: 22,
        FILENAME: 'book_title_isbn_tracking_20260302_133654.html',
        AGENT_NAME: 'book_title_isbn_tracking_20260302_133654.html',
        AGENT_SUMMARY: null,
        CATEGORY: 'Startups',
        USERID: 919,
        FIRMID: 5,
        IS_PUBLIC: 1,
        PUBLIC_URL: 'https://myblocks.in:11300/agents/public/Startups/book_title_isbn_tracking_20260302_133654.html',
        FILE_SIZE_KB: '12.50',
        HAS_BACKEND: 0,
        VERIFIED: 'NO',
        INSRT_DTM: new Date('2026-03-02T13:36:54.000Z'),
        UPDATE_DTM: new Date('2026-03-06T07:26:18.000Z'),
        ...overrides
    };
}

function stubReadService(rows) {
    return {
        config: { database: 'nrkindex_trn' },
        async queryTable(table, options = {}) {
            if (table !== 'AGENT_MASTER_REGISTRY') throw new Error(`unexpected table ${table}`);
            if (options.filters && options.filters.ID !== undefined) {
                return rows.filter((r) => Number(r.ID) === Number(options.filters.ID)).slice(0, options.limit || 1);
            }
            const limit = options.limit || 100;
            const offset = options.offset || 0;
            return rows.slice(offset, offset + limit);
        },
        async countRows(table) {
            if (table !== 'AGENT_MASTER_REGISTRY') throw new Error(`unexpected table ${table}`);
            return rows.length;
        }
    };
}

describe('Agent Master Registry Source', () => {
    test('1. Evaluation record preserves exact database identity and columns', () => {
        const rec = AgentMasterRegistrySource.toEvaluationRecord(masterRow(), { database: 'nrkindex_trn', table: 'AGENT_MASTER_REGISTRY' });
        expect(rec.masterId).toBe(22);
        expect(rec.userId).toBe(919);
        expect(rec.firmId).toBe(5);
        expect(rec.agentName).toBe('book_title_isbn_tracking_20260302_133654.html');
        expect(rec.filename).toBe('book_title_isbn_tracking_20260302_133654.html');
        expect(rec.summary).toBeNull();
        expect(rec.category).toBe('Startups');
        expect(rec.isPublic).toBe(true);
        expect(rec.hasBackend).toBe(false);
        expect(rec.verified).toBe('NO');
        expect(rec.fileSizeKb).toBe(12.5);
        expect(rec.publicUrl).toBe('https://myblocks.in:11300/agents/public/Startups/book_title_isbn_tracking_20260302_133654.html');
        expect(rec.source).toEqual({ database: 'nrkindex_trn', table: 'AGENT_MASTER_REGISTRY' });
    });

    test('2. Non-HTML filenames classify as supporting resources with evidence', () => {
        for (const filename of ['index.css', 'app.js', 'report_8492', 'seo']) {
            const rec = AgentMasterRegistrySource.toEvaluationRecord(masterRow({ ID: 7, FILENAME: filename, AGENT_NAME: filename }), {});
            expect(rec.recordKind).toBe(RECORD_KINDS.SUPPORTING_RESOURCE);
            expect(rec.kindEvidence.length).toBeGreaterThan(0);
            expect(rec.masterId).toBe(7);
        }
    });

    test('3. Relative, missing, and loopback PUBLIC_URLs are not externally testable and never rewritten', () => {
        const rel = AgentMasterRegistrySource.toEvaluationRecord(masterRow({ PUBLIC_URL: '/agents/1572/Startups/COMPA_x.html' }), {});
        expect(rel.urlValid).toBe(false);
        expect(rel.externallyTestable).toBe(false);
        expect(rel.testabilityReason).toBe('RELATIVE_URL_NO_HOST');
        expect(rel.publicUrl).toBe('/agents/1572/Startups/COMPA_x.html');

        const missing = AgentMasterRegistrySource.toEvaluationRecord(masterRow({ PUBLIC_URL: null }), {});
        expect(missing.externallyTestable).toBe(false);
        expect(missing.testabilityReason).toBe('MISSING_URL');

        const loopback = AgentMasterRegistrySource.toEvaluationRecord(masterRow({ PUBLIC_URL: 'http://localhost:11300/y.html' }), {});
        expect(loopback.externallyTestable).toBe(false);
        expect(loopback.testabilityReason).toBe('LOOPBACK_HOST');
    });

    test('4. Monitor contract uses the exact PUBLIC_URL and embeds master identity', () => {
        const rec = AgentMasterRegistrySource.toEvaluationRecord(masterRow(), {});
        const contract = AgentMasterRegistrySource.buildMonitorContract(rec);
        expect(contract.id).toBe('amr-22');
        expect(contract.connection.endpoint).toBe('https://myblocks.in:11300/agents/public/Startups/book_title_isbn_tracking_20260302_133654.html');
        expect(contract.metadata.masterRegistryId).toBe(22);
        expect(contract.metadata.masterUserId).toBe(919);
        expect(contract.metadata.masterFirmId).toBe(5);
        expect(contract.metadata.masterFilename).toBe('book_title_isbn_tracking_20260302_133654.html');
        expect(contract.metadata.source).toBe('AGENT_MASTER_REGISTRY');
    });

    test('5. Monitor contract refuses non-testable records instead of substituting URLs', () => {
        const rel = AgentMasterRegistrySource.toEvaluationRecord(masterRow({ PUBLIC_URL: '/agents/x.html' }), {});
        expect(() => AgentMasterRegistrySource.buildMonitorContract(rel)).toThrow(/not externally testable/);
    });

    test('6. listRecords filters, paginates, and getRecordById resolves via read service only', async () => {
        const rows = [
            masterRow(),
            masterRow({ ID: 6, FILENAME: 'index.css', AGENT_NAME: 'index.css', PUBLIC_URL: '/agents/1616/Pindex/index.css', USERID: 1616, CATEGORY: 'Pindex' }),
            masterRow({ ID: 29, USERID: 1572, CATEGORY: 'Startups', HAS_BACKEND: 1, IS_PUBLIC: 0 })
        ];
        const source = new AgentMasterRegistrySource({ readService: stubReadService(rows) });

        const page = await source.listRecords({ limit: 2 });
        expect(page.total).toBe(3);
        expect(page.totalRows).toBe(3);
        expect(page.records).toHaveLength(2);
        expect(page.records[0].masterId).toBe(22);

        const supporting = await source.listRecords({ kind: 'SUPPORTING_RESOURCE' });
        expect(supporting.total).toBe(1);
        expect(supporting.records[0].masterId).toBe(6);

        const testable = await source.listRecords({ testable: 'true' });
        expect(testable.total).toBe(2);

        const byUser = await source.listRecords({ userId: '1616' });
        expect(byUser.total).toBe(1);

        const found = await source.getRecordById(29);
        expect(found.masterId).toBe(29);
        expect(found.userId).toBe(1572);

        const missing = await source.getRecordById(999999);
        expect(missing).toBeNull();
    });

    test('7. Source reports unavailable without a read service (never throws on construct)', async () => {
        const source = new AgentMasterRegistrySource({ readService: null });
        expect(source.isAvailable()).toBe(false);
        await expect(source.listRecords()).rejects.toMatchObject({ code: 'MASTER_REGISTRY_UNAVAILABLE' });
        await expect(source.getRecordById(1)).rejects.toMatchObject({ code: 'MASTER_REGISTRY_UNAVAILABLE' });
    });
});

const { AgentMasterEvaluator, EVALUATIONS_COLLECTION } = require('../src/registry/AgentMasterEvaluator');

function stubFetch(handler) {
    return async (url, options = {}) => handler(url, options);
}

function jsonResponse(doc, { status = 200, url = null } = {}) {
    const text = JSON.stringify(doc);
    return {
        status,
        url,
        headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
        text: async () => text
    };
}

function htmlResponse(html, { status = 200 } = {}) {
    return {
        status,
        url: null,
        headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
        text: async () => html
    };
}

function stubSource(record) {
    return {
        async getRecordById() { return record; }
    };
}

function stubPersistence(captured) {
    return {
        async set(collection, key, value) {
            captured.push({ collection, key, value });
            return value;
        },
        async get() { return null; }
    };
}

const TESTABLE_ROW = {
    ID: 22,
    FILENAME: 'book_title_isbn_tracking_20260302_133654.html',
    AGENT_NAME: 'book_title_isbn_tracking_20260302_133654.html',
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
    UPDATE_DTM: new Date('2026-03-06T07:26:18.000Z')
};

describe('Agent Master Evaluator', () => {
    test('8. HTML page with no agent interface classifies as WEB APP with observed evidence', async () => {
        const captured = [];
        const evaluator = new AgentMasterEvaluator({
            masterSource: stubSource(AgentMasterRegistrySource.toEvaluationRecord(TESTABLE_ROW, {})),
            persistenceManager: stubPersistence(captured),
            fetchImpl: stubFetch(async (url) => {
                if (url.endsWith('/capabilities')) return { status: 404, url: null, headers: { get: () => 'text/html' }, text: async () => '<html><body>Not found</body></html>' };
                return htmlResponse('<html><head><title>Career Assistant</title></head><body><h1>AI Career Bot</h1><form><input name="q"></form></body></html>');
            })
        });
        const result = await evaluator.evaluateMasterRecord(22);
        expect(result.agentType).toBe('WEB APP');
        expect(result.reachability.reachable).toBe(true);
        expect(result.capabilityStatus).toBe('CAPABILITIES_NOT_EXPOSED');
        expect(result.evidence.length).toBeGreaterThanOrEqual(3);
        expect(result.masterId).toBe(22);
        expect(result.userId).toBe(919);
        expect(result.firmId).toBe(5);
        expect(captured).toHaveLength(1);
        expect(captured[0].collection).toBe(EVALUATIONS_COLLECTION);
        expect(captured[0].key).toBe('22');
    });

    test('9. Machine-readable task/capability API classifies as AGENT (name words alone never suffice)', async () => {
        const captured = [];
        const evaluator = new AgentMasterEvaluator({
            masterSource: stubSource(AgentMasterRegistrySource.toEvaluationRecord(TESTABLE_ROW, {})),
            persistenceManager: stubPersistence(captured),
            fetchImpl: stubFetch(async (url) => {
                if (url.endsWith('/capabilities')) {
                    return jsonResponse({ capabilities: [{ id: 'execute', operations: ['execute'] }] });
                }
                return jsonResponse({ service: 'agent', tasks: [], version: '1.0.0' });
            })
        });
        const result = await evaluator.evaluateMasterRecord(22);
        expect(result.agentType).toBe('AGENT');
        expect(result.capabilityStatus).toBe('AVAILABLE');
        expect(result.capabilities).toHaveLength(1);
    });

    test('10. Unreachable URL classifies as UNKNOWN without fabrication', async () => {
        const captured = [];
        const evaluator = new AgentMasterEvaluator({
            masterSource: stubSource(AgentMasterRegistrySource.toEvaluationRecord(TESTABLE_ROW, {})),
            persistenceManager: stubPersistence(captured),
            fetchImpl: stubFetch(async () => {
                const err = new Error('fetch failed');
                err.name = 'TypeError';
                throw err;
            })
        });
        const result = await evaluator.evaluateMasterRecord(22);
        expect(result.agentType).toBe('UNKNOWN');
        expect(result.reachability.reachable).toBe(false);
        expect(result.runtimeHealth.state).toBe('OFFLINE');
        expect(result.monitoring).toBeNull();
        expect(result.incident).toBeNull();
        expect(captured).toHaveLength(1);
    });

    test('11. Non-testable records are refused before any probe', async () => {
        const rel = AgentMasterRegistrySource.toEvaluationRecord({ ...TESTABLE_ROW, PUBLIC_URL: '/agents/x.html' }, {});
        let probed = false;
        const evaluator = new AgentMasterEvaluator({
            masterSource: stubSource(rel),
            persistenceManager: stubPersistence([]),
            fetchImpl: stubFetch(async () => { probed = true; throw new Error('must not probe'); })
        });
        await expect(evaluator.evaluateMasterRecord(22)).rejects.toMatchObject({ code: 'MASTER_RECORD_NOT_TESTABLE' });
        expect(probed).toBe(false);
    });
});
