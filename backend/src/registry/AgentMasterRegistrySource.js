/**
 * Agent Master Registry Source — read-only integration with the existing
 * `nrkindex_trn.AGENT_MASTER_REGISTRY` table (the authoritative agent master).
 *
 * HARD CONSTRAINTS:
 * - Issues ONLY SELECT statements through the existing read-only database
 *   access service. NEVER creates/alters/drops tables and NEVER inserts,
 *   updates, or deletes AGENT_MASTER_REGISTRY rows.
 * - External testing uses ONLY the stored PUBLIC_URL, verbatim. FILENAME is
 *   metadata and is never turned into a URL. Relative, missing, loopback, or
 *   SSRF-sensitive URLs are reported as not externally testable — never
 *   rewritten or substituted.
 * - Every evaluation record preserves the exact database identity:
 *   ID (masterId), USERID (masterUserId), FIRMID (masterFirmId).
 * - No fake data: unavailable information is carried as null / UNKNOWN with
 *   explicit reasons. Unknown is never converted into healthy.
 */

const { SsrfProtector } = require('../adapter/SsrfProtector');

const MASTER_TABLE = 'AGENT_MASTER_REGISTRY';
const MASTER_DATABASE = process.env.DB_DATABASE || 'nrkindex_trn';

// Filename extensions that indicate an HTML agent document. Anything else
// (css, js, extension-less resource names, endpoint-like names) is treated
// as a supporting/resource record, with the evidence recorded.
const AGENT_DOCUMENT_EXTENSIONS = new Set(['html', 'htm']);

const RECORD_KINDS = Object.freeze({
    CANDIDATE_AGENT: 'CANDIDATE_AGENT',
    SUPPORTING_RESOURCE: 'SUPPORTING_RESOURCE',
    INSUFFICIENT_INFORMATION: 'INSUFFICIENT_INFORMATION'
});

function toNullableString(value) {
    if (value === null || value === undefined) return null;
    const s = String(value);
    return s.length > 0 ? s : null;
}

function toNullableInt(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isInteger(n) ? n : null;
}

function toNullableNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function toNullableBool(value) {
    if (value === null || value === undefined || value === '') return null;
    return Number(value) === 1;
}

function toIsoString(value) {
    if (value === null || value === undefined || value === '') return null;
    try {
        const d = value instanceof Date ? value : new Date(value);
        const t = d.getTime();
        if (!Number.isFinite(t)) return null;
        return d.toISOString();
    } catch (_) {
        return null;
    }
}

function filenameExtension(filename) {
    if (!filename || typeof filename !== 'string') return '';
    const base = filename.split('/').pop();
    const dot = base.lastIndexOf('.');
    if (dot <= 0 || dot === base.length - 1) return '';
    return base.slice(dot + 1).toLowerCase();
}

class AgentMasterRegistrySource {
    constructor(options = {}) {
        // Existing read-only database access (MySqlReadAccessService in mysql
        // mode). Null when the app runs in memory/file mode.
        this.readService = options.readService || options.databaseService || null;
        this._rowsCache = null;
        this._rowsCacheTime = 0;
        this._rowsCacheTtlMs = options.cacheTtlMs || 60000;
        this._fetchInflight = null;
    }

    isAvailable() {
        return Boolean(this.readService && typeof this.readService.queryTable === 'function');
    }

    _assertAvailable() {
        if (!this.isAvailable()) {
            const err = new Error('Agent Master Registry is unavailable: application is not running in mysql persistence mode.');
            err.statusCode = 503;
            err.code = 'MASTER_REGISTRY_UNAVAILABLE';
            throw err;
        }
    }

    getSourceInfo() {
        let database = MASTER_DATABASE;
        try {
            if (this.readService && this.readService.config && this.readService.config.database) {
                database = this.readService.config.database;
            }
        } catch (_) {}
        return { database, table: MASTER_TABLE };
    }

    /**
     * Validate a stored PUBLIC_URL without modifying it.
     * Returns { url (exact preserved value or null), urlValid, externallyTestable, testabilityReason }.
     * Reasons: MISSING_URL | MALFORMED_URL | UNSUPPORTED_PROTOCOL |
     *          LOOPBACK_HOST | SSRF_SENSITIVE_HOST | RELATIVE_URL_NO_HOST | OK
     */
    static validatePublicUrl(publicUrl) {
        const raw = toNullableString(publicUrl);
        if (!raw) {
            return { url: null, urlValid: false, externallyTestable: false, testabilityReason: 'MISSING_URL' };
        }
        const trimmed = raw.trim();
        if (!trimmed) {
            return { url: raw, urlValid: false, externallyTestable: false, testabilityReason: 'MISSING_URL' };
        }
        let parsed = null;
        try {
            parsed = new URL(trimmed);
        } catch (_) {
            // Not an absolute URL (e.g. "/agents/1572/Startups/x.html").
            // Never prepend a guessed host: report as-is, not testable.
            return { url: raw, urlValid: false, externallyTestable: false, testabilityReason: 'RELATIVE_URL_NO_HOST' };
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { url: raw, urlValid: false, externallyTestable: false, testabilityReason: 'UNSUPPORTED_PROTOCOL' };
        }
        // Reuse the platform's existing SSRF protection: loopback, private,
        // and cloud-metadata hosts are never external test targets.
        try {
            const verdict = SsrfProtector.validateUrl(trimmed, { allowLocalhost: false });
            if (!verdict.safe) {
                const msg = String((verdict && verdict.error) || '');
                const reason = /loopback|localhost|127\.|0\.0\.0\.0|::1/i.test(msg)
                    ? 'LOOPBACK_HOST'
                    : 'SSRF_SENSITIVE_HOST';
                return { url: raw, urlValid: true, externallyTestable: false, testabilityReason: reason };
            }
        } catch (_) {
            return { url: raw, urlValid: true, externallyTestable: false, testabilityReason: 'SSRF_SENSITIVE_HOST' };
        }
        return { url: raw, urlValid: true, externallyTestable: true, testabilityReason: 'OK' };
    }

    /**
     * Classify a master row from database evidence only.
     * Returns { kind, evidence[] }. Never guesses beyond the evidence.
     */
    static classifyRow(row) {
        const evidence = [];
        const filename = toNullableString(row.FILENAME);
        const agentName = toNullableString(row.AGENT_NAME);
        const ext = filenameExtension(filename || '');

        if (!filename && !agentName) {
            evidence.push('row has neither FILENAME nor AGENT_NAME');
            return { kind: RECORD_KINDS.INSUFFICIENT_INFORMATION, evidence };
        }
        if (ext && !AGENT_DOCUMENT_EXTENSIONS.has(ext)) {
            evidence.push(`filename extension '${ext}' is not an HTML agent document`);
            return { kind: RECORD_KINDS.SUPPORTING_RESOURCE, evidence };
        }
        if (!ext) {
            evidence.push('filename has no agent-document extension');
            return { kind: RECORD_KINDS.SUPPORTING_RESOURCE, evidence };
        }
        evidence.push(`HTML agent document '${filename}'`);
        if (agentName) evidence.push('agent name present');
        else evidence.push('agent name missing; filename used as identity');
        return { kind: RECORD_KINDS.CANDIDATE_AGENT, evidence };
    }

    /**
     * Map one AGENT_MASTER_REGISTRY row to a Watchtower evaluation record.
     * Preserves every registry column; missing values stay null/unknown.
     */
    static toEvaluationRecord(row, sourceInfo) {
        const classification = AgentMasterRegistrySource.classifyRow(row);
        const urlCheck = AgentMasterRegistrySource.validatePublicUrl(row.PUBLIC_URL);
        return {
            // Exact database identity — never dropped downstream.
            masterId: toNullableInt(row.ID),
            userId: toNullableInt(row.USERID),
            firmId: toNullableInt(row.FIRMID),
            // Registry attributes (verbatim, null when absent).
            agentName: toNullableString(row.AGENT_NAME),
            filename: toNullableString(row.FILENAME),
            summary: toNullableString(row.AGENT_SUMMARY),
            category: toNullableString(row.CATEGORY),
            isPublic: toNullableBool(row.IS_PUBLIC),
            publicUrl: urlCheck.url,
            fileSizeKb: toNullableNumber(row.FILE_SIZE_KB),
            hasBackend: toNullableBool(row.HAS_BACKEND),
            verified: toNullableString(row.VERIFIED),
            insertDtm: toIsoString(row.INSRT_DTM),
            updateDtm: toIsoString(row.UPDATE_DTM),
            // Honest classification + URL assessment (evidence included).
            recordKind: classification.kind,
            kindEvidence: classification.evidence,
            urlValid: urlCheck.urlValid,
            externallyTestable: urlCheck.externallyTestable,
            testabilityReason: urlCheck.testabilityReason,
            // Filled by callers that consult live monitoring; null means unknown.
            monitoring: null,
            source: {
                database: (sourceInfo && sourceInfo.database) || MASTER_DATABASE,
                table: MASTER_TABLE
            }
        };
    }

    /**
     * Build a Universal Agent Contract payload that onboards one master
     * record into the existing Watchtower registration + monitoring flow.
     * The ONLY endpoint used is the record's exact PUBLIC_URL. Throws when
     * the record is not externally testable (caller maps to 422).
     */
    static buildMonitorContract(record) {
        if (!record || !record.externallyTestable || !record.publicUrl) {
            const err = new Error(
                `Master record ${record && record.masterId !== null ? record.masterId : '(unknown)'} is not externally testable (${record && record.testabilityReason ? record.testabilityReason : 'UNKNOWN_REASON'}). Only the stored PUBLIC_URL may be used as a test target.`
            );
            err.statusCode = 422;
            err.code = 'MASTER_RECORD_NOT_TESTABLE';
            throw err;
        }
        const endpoint = String(record.publicUrl).trim();
        const name = (record.agentName && record.agentName.trim()) || `master-${record.masterId}`;
        return {
            id: `amr-${record.masterId}`,
            name,
            version: '1.0.0',
            description: `Agent Master Registry ID ${record.masterId} (USERID ${record.userId}, FIRMID ${record.firmId})`,
            category: (record.category && record.category.trim()) || 'external-master',
            capabilities: ['health'],
            connection: { endpoint },
            metadata: {
                masterRegistryId: record.masterId,
                masterUserId: record.userId,
                masterFirmId: record.firmId,
                masterFilename: record.filename,
                masterCategory: record.category,
                masterIsPublic: record.isPublic,
                masterHasBackend: record.hasBackend,
                masterVerified: record.verified,
                source: MASTER_TABLE,
                sourceDatabase: (record.source && record.source.database) || MASTER_DATABASE
            }
        };
    }

    invalidateCache() {
        this._rowsCache = null;
        this._rowsCacheTime = 0;
    }

    async _fetchAllRows(force = false) {
        this._assertAvailable();
        const now = Date.now();
        if (!force && this._rowsCache && (now - this._rowsCacheTime < this._rowsCacheTtlMs)) {
            return this._rowsCache;
        }
        if (this._fetchInflight) {
            return this._fetchInflight;
        }
        this._fetchInflight = (async () => {
            const rows = [];
            const pageSize = 1000;
            let offset = 0;
            for (;;) {
                const page = await this.readService.queryTable(MASTER_TABLE, {
                    orderBy: 'ID',
                    orderDir: 'ASC',
                    limit: pageSize,
                    offset
                });
                if (!Array.isArray(page) || page.length === 0) break;
                rows.push(...page);
                if (page.length < pageSize) break;
                offset += pageSize;
            }
            this._rowsCache = rows;
            this._rowsCacheTime = Date.now();
            return rows;
        })();
        try {
            return await this._fetchInflight;
        } finally {
            this._fetchInflight = null;
        }
    }

    /**
     * All evaluation records without pagination (for functional grouping).
     * Read-only; same mapping as listRecords.
     */
    async listAllRecords() {
        this._assertAvailable();
        const sourceInfo = this.getSourceInfo();
        return (await this._fetchAllRows())
            .map((row) => AgentMasterRegistrySource.toEvaluationRecord(row, sourceInfo));
    }

    /**
     * List evaluation records with optional filters + pagination.
     * Filters: kind, testable ('true'/'false'), category, userId, search
     * (matches agentName/filename, case-insensitive).
     */
    async listRecords(options = {}) {
        this._assertAvailable();
        const sourceInfo = this.getSourceInfo();
        const all = (await this._fetchAllRows()).map((row) => AgentMasterRegistrySource.toEvaluationRecord(row, sourceInfo));

        const kind = options.kind ? String(options.kind).toUpperCase() : null;
        const testable = options.testable === undefined || options.testable === null
            ? null
            : (String(options.testable).toLowerCase() === 'true');
        const category = options.category ? String(options.category).toLowerCase() : null;
        const userId = (options.userId !== undefined && options.userId !== null && options.userId !== '')
            ? Number(options.userId)
            : null;
        const search = options.search ? String(options.search).toLowerCase() : null;

        const filtered = all.filter((rec) => {
            if (kind && rec.recordKind !== kind) return false;
            if (testable !== null && rec.externallyTestable !== testable) return false;
            if (category && String(rec.category || '').toLowerCase() !== category) return false;
            if (userId !== null && !(Number.isInteger(userId) && rec.userId === userId)) return false;
            if (search) {
                const hay = `${rec.agentName || ''} ${rec.filename || ''}`.toLowerCase();
                if (!hay.includes(search)) return false;
            }
            return true;
        });

        const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
        const offset = Math.max(Number(options.offset) || 0, 0);
        return {
            records: filtered.slice(offset, offset + limit),
            total: filtered.length,
            totalRows: all.length,
            limit,
            offset,
            source: sourceInfo
        };
    }

    async getRecordById(id) {
        this._assertAvailable();
        const numericId = Number(id);
        if (!Number.isInteger(numericId) || numericId <= 0) {
            const err = new Error(`Invalid master record ID '${id}'.`);
            err.statusCode = 400;
            err.code = 'INVALID_MASTER_ID';
            throw err;
        }
        const rows = await this.readService.queryTable(MASTER_TABLE, {
            filters: { ID: numericId },
            limit: 1,
            offset: 0
        });
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return AgentMasterRegistrySource.toEvaluationRecord(rows[0], this.getSourceInfo());
    }

    async getStatus() {
        const info = this.getSourceInfo();
        if (!this.isAvailable()) {
            return { available: false, ...info, reason: 'MASTER_REGISTRY_UNAVAILABLE' };
        }
        try {
            const totalRows = await this.readService.countRows(MASTER_TABLE);
            return { available: true, ...info, totalRows };
        } catch (err) {
            return { available: false, ...info, reason: (err && err.message) || 'UNKNOWN' };
        }
    }
}

module.exports = {
    AgentMasterRegistrySource,
    RECORD_KINDS,
    MASTER_TABLE,
    MASTER_DATABASE
};
