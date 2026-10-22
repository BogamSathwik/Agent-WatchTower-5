/**
 * Agent Master Evaluator — real public-URL evaluation of
 * nrkindex_trn.AGENT_MASTER_REGISTRY records.
 *
 * HARD CONSTRAINTS:
 * - Probes ONLY the record's exact stored PUBLIC_URL, verbatim. Never the
 *   FILENAME, never a constructed/guessed URL, never a local file. Relative,
 *   missing, loopback, or SSRF-blocked URLs are not probed at all.
 * - Classification (AGENT / WEB APP / UNKNOWN) is evidence-based: only
 *   observed interfaces count. Words like "AI/Agent/Bot" in page text,
 *   HAS_BACKEND=1, HTTP 200 alone, or the agent name never prove AGENT.
 * - Reuses the existing AgentMonitoringService/Store for health context;
 *   it does NOT probe, does NOT duplicate the health state machine.
 * - Results persist through the existing Watchtower persistence
 *   architecture (agent_data collection `master_evaluations`). The master
 *   table is NEVER written (SELECT only, via AgentMasterRegistrySource).
 * - No fabrication: unreachable/unknown stays unreachable/unknown.
 */

const { AgentMasterRegistrySource } = require('./AgentMasterRegistrySource');

const EVALUATIONS_COLLECTION = 'master_evaluations';
const PROBE_TIMEOUT_MS = 8000;
const CAPABILITY_PROBE_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 262144;

const AGENT_TYPES = Object.freeze({
    AGENT: 'AGENT',
    WEB_APP: 'WEB APP',
    UNKNOWN: 'UNKNOWN'
});

function toIsoNow() {
    return new Date().toISOString();
}

class AgentMasterEvaluator {
    constructor(options = {}) {
        // Read-only master source (AgentMasterRegistrySource instance).
        this.masterSource = options.masterSource || options.source || null;
        // Existing Watchtower persistence (PersistenceManager) for results.
        this.persistenceManager = options.persistenceManager || options.persistence || null;
        // Existing monitoring service, read-only context (status/incidents).
        this.monitoringService = options.monitoringService || null;
        // Injectable fetch implementation (global fetch by default; stubbed in tests).
        this.fetchImpl = options.fetchImpl || options.fetch || null;
    }

    _fetch() {
        const fn = this.fetchImpl || (typeof fetch === 'function' ? fetch : null);
        if (!fn) {
            throw new Error('No fetch implementation available for URL evaluation.');
        }
        return fn;
    }

    async _fetchBounded(url, timeoutMs) {
        const fetchFn = this._fetch();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const startMs = Date.now();
        try {
            const res = await fetchFn(url, { signal: controller.signal, redirect: 'follow' });
            const latencyMs = Date.now() - startMs;
            const contentType = (res.headers && typeof res.headers.get === 'function')
                ? (res.headers.get('content-type') || '')
                : '';
            let text = '';
            try {
                if (res.body && typeof res.body.getReader === 'function') {
                    const reader = res.body.getReader();
                    const chunks = [];
                    let received = 0;
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        received += value ? value.length : 0;
                        if (received > MAX_BODY_BYTES) {
                            try { await reader.cancel(); } catch (_) {}
                            break;
                        }
                        if (value) chunks.push(Buffer.from(value));
                    }
                    text = Buffer.concat(chunks).toString('utf8');
                } else if (typeof res.text === 'function') {
                    const full = await res.text();
                    text = String(full).slice(0, MAX_BODY_BYTES);
                }
            } catch (_) {
                text = '';
            }
            return {
                ok: true,
                httpStatus: res.status,
                status2xx: res.status >= 200 && res.status < 300,
                latencyMs,
                contentType: String(contentType).split(';')[0].trim().toLowerCase(),
                finalUrl: (res.url && res.url !== url) ? res.url : null,
                bodyText: text,
                truncated: text.length >= MAX_BODY_BYTES
            };
        } catch (err) {
            const latencyMs = Date.now() - startMs;
            const name = err && err.name ? String(err.name) : '';
            const isTimeout = name === 'AbortError' || /abort|timeout/i.test((err && err.message) || '');
            return {
                ok: false,
                httpStatus: 0,
                status2xx: false,
                latencyMs,
                contentType: '',
                finalUrl: null,
                bodyText: '',
                truncated: false,
                error: isTimeout ? 'REQUEST_TIMEOUT' : ((err && err.message) || 'CONNECTION_FAILURE')
            };
        } finally {
            clearTimeout(timer);
        }
    }

    static _tryParseJson(text) {
        if (!text) return null;
        try {
            const parsed = JSON.parse(text);
            return (parsed && typeof parsed === 'object') ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    /**
     * Inspect a parsed JSON document for structural agent-interface markers.
     * Only structural evidence counts — never bare words.
     */
    static _jsonAgentMarkers(doc) {
        const markers = [];
        if (!doc || typeof doc !== 'object') return markers;
        const hasCapabilitiesArray = Array.isArray(doc.capabilities) && doc.capabilities.length > 0;
        if (hasCapabilitiesArray) markers.push('capabilities array present in response document');
        const tools = doc.tools || doc.functions;
        if (Array.isArray(tools) && tools.length > 0) markers.push('tool/function inventory present in response document');
        const taskLike = doc.task || doc.tasks || doc.job || doc.jobs || doc.execute || doc.run;
        if (taskLike !== undefined && taskLike !== null && taskLike !== '') markers.push('structured task object present in response document');
        if (doc.openapi || doc.swagger) markers.push('machine-readable API description present in response document');
        return markers;
    }

    static _looksLikeHtml(text, contentType) {
        if (contentType === 'text/html') return true;
        if (!text) return false;
        const head = text.slice(0, 2048).toLowerCase();
        return head.includes('<html') || head.includes('<!doctype html') || (head.includes('<head') && head.includes('<body'));
    }

    /**
     * Classify from observed evidence only. Returns { agentType, evidence[] }.
     */
    static classifyEvidence({ probe, capabilityProbe }) {
        const evidence = [];
        if (!probe || !probe.ok) {
            evidence.push(`Public URL unreachable${probe && probe.error ? `: ${probe.error}` : ''}`.trim());
            evidence.push('Insufficient evidence to classify application type');
            return { agentType: AGENT_TYPES.UNKNOWN, evidence };
        }

        evidence.push(`Public URL reachable (HTTP ${probe.httpStatus}, ${probe.latencyMs} ms)`);

        const jsonDoc = AgentMasterEvaluator._tryParseJson(probe.bodyText);
        const jsonMarkers = AgentMasterEvaluator._jsonAgentMarkers(jsonDoc);
        const capsDiscovered = Boolean(
            capabilityProbe && capabilityProbe.ok && capabilityProbe.discovered === true
        );
        if (capsDiscovered) {
            evidence.push(`Capability interface detected via existing discovery (${capabilityProbe.count} capabilit${capabilityProbe.count === 1 ? 'y' : 'ies'})`);
        }
        for (const marker of jsonMarkers) {
            evidence.push(`${marker} at the public URL`);
        }

        if (jsonMarkers.length > 0 || capsDiscovered) {
            if (probe.contentType === 'application/json' || jsonDoc) {
                evidence.push('Machine-readable agent API detected');
            }
            return { agentType: AGENT_TYPES.AGENT, evidence };
        }

        if (AgentMasterEvaluator._looksLikeHtml(probe.bodyText, probe.contentType)) {
            evidence.push('Public browser application detected (HTML document served)');
            evidence.push('No agent execution interface discovered');
            evidence.push(capsDiscovered
                ? 'Capability interface check completed'
                : 'No capability interface discovered');
            return { agentType: AGENT_TYPES.WEB_APP, evidence };
        }

        evidence.push(`Response content (${probe.contentType || 'unknown type'}) carries no identifiable agent interface`);
        evidence.push('Insufficient evidence to classify application type');
        return { agentType: AGENT_TYPES.UNKNOWN, evidence };
    }

    static _runtimeHealth(probe) {
        // URL-level runtime health ONLY — never a functional agent assessment.
        if (!probe || !probe.ok) {
            return { state: 'OFFLINE', basis: 'Public URL unreachable or timed out; URL-level observation only, not a functional agent assessment.' };
        }
        if (probe.httpStatus >= 500) {
            return { state: 'UNHEALTHY', basis: `Public URL returned HTTP ${probe.httpStatus}; URL-level observation only, not a functional agent assessment.` };
        }
        if (probe.httpStatus === 408 || probe.error === 'REQUEST_TIMEOUT') {
            return { state: 'OFFLINE', basis: 'Public URL request timed out; URL-level observation only, not a functional agent assessment.' };
        }
        if (!probe.status2xx) {
            return { state: 'DEGRADED', basis: `Public URL returned HTTP ${probe.httpStatus}; URL-level observation only, not a functional agent assessment.` };
        }
        return { state: 'HEALTHY', basis: 'Public URL returned HTTP 2xx; reachability only, not proof of agent functionality.' };
    }

    async _probeCapabilities(baseUrl) {
        // Existing Watchtower discovery convention on the PUBLIC_URL itself:
        // only an explicit JSON capabilities array counts as discovered.
        const target = `${String(baseUrl).replace(/\/$/, '')}/capabilities`;
        const res = await this._fetchBounded(target, CAPABILITY_PROBE_TIMEOUT_MS);
        if (!res.ok || !res.status2xx) {
            return { probed: true, discovered: false, count: 0, capabilities: [], httpStatus: res.httpStatus, error: res.error || null };
        }
        const doc = AgentMasterEvaluator._tryParseJson(res.bodyText);
        if (doc && Array.isArray(doc.capabilities) && doc.capabilities.length > 0) {
            return { probed: true, discovered: true, count: doc.capabilities.length, capabilities: doc.capabilities.slice(0, 50), httpStatus: res.httpStatus, error: null };
        }
        return { probed: true, discovered: false, count: 0, capabilities: [], httpStatus: res.httpStatus, error: null };
    }

    _monitoringContext(masterId) {
        // Read-only context from the canonical monitoring store, when the
        // master record is tracked as amr-<ID>. Null when untracked.
        try {
            const svc = this.monitoringService;
            if (!svc || !svc.store || typeof svc.store.getStatus !== 'function') return { monitoring: null, incident: null };
            const agentId = `amr-${masterId}`;
            const st = svc.store.getStatus(agentId, 'default-tenant');
            if (!st || !st.lastCheckAt) return { monitoring: null, incident: null };
            const monitoring = {
                tracked: true,
                agentId,
                currentState: st.currentState || 'UNKNOWN',
                connectivity: st.connectivity || 'UNKNOWN',
                lastCheckAt: st.lastCheckAt || null,
                latencyMs: (st.latency && st.latency.lastLatencyMs) || 0
            };
            let incident = null;
            try {
                const activeId = st.activeIncidentId || null;
                const inc = activeId && typeof svc.store.getIncident === 'function'
                    ? svc.store.getIncident(activeId)
                    : (typeof svc.store.findActiveIncident === 'function' ? svc.store.findActiveIncident(agentId, 'default-tenant') : null);
                if (inc) {
                    incident = {
                        id: inc.id || activeId,
                        status: inc.status || inc.state || 'UNKNOWN',
                        severity: inc.severity || 'UNKNOWN',
                        summary: inc.summary || null,
                        startedAt: inc.startedAt || null
                    };
                }
            } catch (_) {}
            return { monitoring, incident };
        } catch (_) {
            return { monitoring: null, incident: null };
        }
    }

    async _persistResult(result) {
        if (!this.persistenceManager) return false;
        try {
            if (typeof this.persistenceManager.set === 'function') {
                await this.persistenceManager.set(EVALUATIONS_COLLECTION, String(result.masterId), result);
                return true;
            }
        } catch (_) {}
        return false;
    }

    async getStoredEvaluation(masterId) {
        if (!this.persistenceManager || typeof this.persistenceManager.get !== 'function') return null;
        try {
            const stored = await this.persistenceManager.get(EVALUATIONS_COLLECTION, String(masterId));
            return stored === undefined ? null : stored;
        } catch (_) {
            return null;
        }
    }

    /**
     * Evaluate one master record end-to-end: load (SELECT only), probe the
     * exact PUBLIC_URL, classify from evidence, enrich with live monitoring
     * context when tracked, persist the result, return it.
     */
    async evaluateMasterRecord(masterId) {
        if (!this.masterSource || typeof this.masterSource.getRecordById !== 'function') {
            const err = new Error('Agent Master Registry source is not configured.');
            err.statusCode = 503;
            err.code = 'MASTER_REGISTRY_UNAVAILABLE';
            throw err;
        }
        const record = await this.masterSource.getRecordById(masterId);
        if (!record) {
            const err = new Error(`Agent Master record '${masterId}' not found`);
            err.statusCode = 404;
            err.code = 'MASTER_RECORD_NOT_FOUND';
            throw err;
        }
        if (!record.externallyTestable || !record.publicUrl) {
            const err = new Error(
                `Master record ${record.masterId} is not externally testable (${record.testabilityReason || 'UNKNOWN_REASON'}). Only the stored PUBLIC_URL may be used as a test target.`
            );
            err.statusCode = 422;
            err.code = 'MASTER_RECORD_NOT_TESTABLE';
            err.record = record;
            throw err;
        }

        const target = String(record.publicUrl).trim();
        const probe = await this._fetchBounded(target, PROBE_TIMEOUT_MS);
        const capabilityProbe = await this._probeCapabilities(target);
        const classification = AgentMasterEvaluator.classifyEvidence({ probe, capabilityProbe });
        const runtimeHealth = AgentMasterEvaluator._runtimeHealth(probe);
        const context = this._monitoringContext(record.masterId);

        const result = {
            masterId: record.masterId,
            userId: record.userId,
            firmId: record.firmId,
            agentName: record.agentName,
            filename: record.filename,
            summary: record.summary,
            category: record.category,
            isPublic: record.isPublic,
            hasBackend: record.hasBackend,
            verified: record.verified,
            fileSizeKb: record.fileSizeKb,
            insertDtm: record.insertDtm,
            updateDtm: record.updateDtm,
            publicUrl: record.publicUrl,
            urlValid: record.urlValid,
            externallyTestable: record.externallyTestable,
            testabilityReason: record.testabilityReason,
            recordKind: record.recordKind,
            evaluatedAt: toIsoNow(),
            evaluatedBy: 'watchtower-master-evaluator/1.0',
            reachability: {
                reachable: Boolean(probe.ok),
                httpStatus: probe.httpStatus || 0,
                latencyMs: probe.latencyMs || 0,
                contentType: probe.contentType || null,
                finalUrl: probe.finalUrl || null,
                truncatedBody: Boolean(probe.truncated),
                error: probe.error || null
            },
            runtimeHealth,
            capabilityStatus: capabilityProbe.discovered ? 'AVAILABLE' : 'CAPABILITIES_NOT_EXPOSED',
            capabilities: capabilityProbe.discovered ? capabilityProbe.capabilities : [],
            capabilityProbe: {
                probed: true,
                target: `${target.replace(/\/$/, '')}/capabilities`,
                httpStatus: capabilityProbe.httpStatus || 0,
                error: capabilityProbe.error || null
            },
            agentType: classification.agentType,
            evidence: classification.evidence,
            monitoring: context.monitoring,
            incident: context.incident,
            source: record.source || { database: 'nrkindex_trn', table: 'AGENT_MASTER_REGISTRY' }
        };

        await this._persistResult(result);
        return result;
    }
}

module.exports = {
    AgentMasterEvaluator,
    AGENT_TYPES,
    EVALUATIONS_COLLECTION
};
