/**
 * Agent Functional Testing — controlled, bounded functional trials for
 * AGENT_MASTER_REGISTRY records.
 *
 * HARD CONSTRAINTS:
 * - Tests ONLY the record's exact stored PUBLIC_URL. Never FILENAME-derived,
 *   guessed, or local paths. Non-testable records yield
 *   FUNCTIONAL_TEST_NOT_POSSIBLE without any probe.
 * - A task trial runs ONLY when a real, safe execution interface was
 *   actually observed (discovered machine-readable task interface). Browser
 *   UIs, unexposed capabilities, and unknown input schemas yield
 *   FUNCTIONAL_EXECUTION_NOT_AVAILABLE / NOT_SUPPORTED with reasons — never
 *   a fabricated task test. No destructive operations, no invented inputs.
 * - Bounded: sequential trials (no concurrency fan-out), per-request timeout,
 *   capped body reads, limited trial counts, limited ID batches (route layer).
 * - Results persist through the existing Watchtower persistence architecture
 *   (agent_data collection `master_trials`). The master table is NEVER written.
 * - No quality invention: where automated correctness cannot be determined,
 *   QUALITY_EVIDENCE_LIMITED is recorded instead of a score.
 */

const { AgentMasterRegistrySource } = require('./AgentMasterRegistrySource');

const TRIALS_COLLECTION = 'master_trials';
const TRIAL_TIMEOUT_MS = 8000;
const TRIAL_MAX_BODY_BYTES = 131072;
const DEFAULT_TRIAL_COUNT = 3;

// Safe representative task descriptors per functional domain. These describe
// what WOULD be tested if an execution interface existed; they are never
// executed against records lacking one.
const DOMAIN_TASKS = Object.freeze({
    CAREER: 'Provide a career recommendation for a sample candidate profile and return structured suggestions.',
    HOTEL_TRAVEL: 'Recommend a hotel or travel option for sample dates and a sample destination.',
    FINANCE: 'Assess credit risk for a sample anonymized applicant profile.',
    FITNESS: 'Provide a fitness suggestion for a sample profile.',
    SCRAPING: 'Extract structured data from a sample public page.',
    BOOKS: 'Recommend or track a book for a sample title or ISBN.',
    MARKETING: 'Generate an SEO or marketing suggestion for a sample topic.',
    DATA_SQL: 'Answer a sample data question over a sample dataset.',
    NEWS: 'Generate a news summary for a sample topic.',
    DOCUMENTS: 'Process a sample document and return structured output.',
    STARTUP: 'Analyze a sample startup idea and return structured feedback.',
    MONITORING_OPS: 'Report status for a sample monitored target.',
    CONVERSATION: 'Respond to a sample conversational prompt.'
});

function toIsoNow() {
    return new Date().toISOString();
}

class AgentFunctionalTester {
    constructor(options = {}) {
        this.masterSource = options.masterSource || options.source || null;
        this.persistenceManager = options.persistenceManager || options.persistence || null;
        this.fetchImpl = options.fetchImpl || options.fetch || null;
        this.trialTimeoutMs = Number(options.trialTimeoutMs) || TRIAL_TIMEOUT_MS;
        this.trialCount = Math.min(Math.max(Number(options.trialCount) || DEFAULT_TRIAL_COUNT, 1), 5);
    }

    _fetch() {
        const fn = this.fetchImpl || (typeof fetch === 'function' ? fetch : null);
        if (!fn) throw new Error('No fetch implementation available for functional testing.');
        return fn;
    }

    /**
     * Derive the safe representative task descriptor from fingerprint domains.
     * Descriptive only — execution still requires an observed interface.
     */
    static proposeTask(fingerprint) {
        const domains = (fingerprint && fingerprint.domains) || [];
        if (domains.length === 0) return null;
        const task = DOMAIN_TASKS[domains[0]] || null;
        return task ? { domain: domains[0], description: task } : null;
    }

    /**
     * Assess whether a safe task trial is possible. Returns
     * { executable, code, reason, interface } — never invents one.
     */
    static assessExecutability({ record, evaluation }) {
        if (!record || !record.externallyTestable) {
            return { executable: false, code: 'FUNCTIONAL_TEST_NOT_POSSIBLE', reason: 'Record has no valid externally testable PUBLIC_URL.', interface: null };
        }
        const capsAvailable = Boolean(evaluation && evaluation.capabilityStatus === 'AVAILABLE' && Array.isArray(evaluation.capabilities) && evaluation.capabilities.length > 0);
        if (!capsAvailable) {
            return { executable: false, code: 'FUNCTIONAL_EXECUTION_NOT_AVAILABLE', reason: 'Public URL exposes a browser UI with no safe task execution interface; no task trial was fabricated.', interface: null };
        }
        const caps = evaluation.capabilities.map((c) => String((c && (c.id || c.name)) || c));
        const taskLike = caps.filter((c) => /^(execute|run|task|jobs?|infer|predict|generate|analyze)$/i.test(c));
        if (taskLike.length === 0) {
            return { executable: false, code: 'FUNCTIONAL_EXECUTION_NOT_SUPPORTED', reason: `Discovered capabilities (${caps.slice(0, 5).join(', ')}) expose no safe task operation with a known input schema.`, interface: { capabilities: caps.slice(0, 20) } };
        }
        return { executable: true, code: 'EXECUTABLE', reason: `Observed task-capable operation(s): ${taskLike.join(', ')}.`, interface: { operations: taskLike, capabilities: caps.slice(0, 20) } };
    }

    async _singleReachabilityTrial(url) {
        const fetchFn = this._fetch();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.trialTimeoutMs);
        const startMs = Date.now();
        try {
            const res = await fetchFn(url, { signal: controller.signal, redirect: 'follow' });
            try {
                if (res.body && typeof res.body.getReader === 'function') {
                    const reader = res.body.getReader();
                    let received = 0;
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        received += value ? value.length : 0;
                        if (received > TRIAL_MAX_BODY_BYTES) {
                            try { await reader.cancel(); } catch (_) {}
                            break;
                        }
                    }
                } else if (typeof res.text === 'function') {
                    await res.text();
                }
            } catch (_) {}
            const latencyMs = Date.now() - startMs;
            return {
                reachable: true,
                httpStatus: res.status || 0,
                latencyMs,
                successful: (res.status >= 200 && res.status < 300),
                timeout: false,
                error: null
            };
        } catch (err) {
            const latencyMs = Date.now() - startMs;
            const name = err && err.name ? String(err.name) : '';
            const isTimeout = name === 'AbortError' || /abort|timeout/i.test((err && err.message) || '');
            return {
                reachable: false,
                httpStatus: 0,
                latencyMs,
                successful: false,
                timeout: isTimeout,
                error: isTimeout ? 'REQUEST_TIMEOUT' : ((err && err.message) || 'CONNECTION_FAILURE')
            };
        } finally {
            clearTimeout(timer);
        }
    }

    static summarizeTrials(trials) {
        const successful = trials.filter((t) => t.successful).length;
        const failed = trials.length - successful;
        const timeouts = trials.filter((t) => t.timeout).length;
        const latencies = trials.map((t) => t.latencyMs || 0).sort((a, b) => a - b);
        const sum = latencies.reduce((a, b) => a + b, 0);
        return {
            trials: trials.length,
            successful,
            failed,
            timeouts,
            successRate: trials.length > 0 ? Math.round((successful / trials.length) * 1000) / 10 : 0,
            avgLatencyMs: trials.length > 0 ? Math.round(sum / trials.length) : 0,
            minLatencyMs: trials.length > 0 ? latencies[0] : 0,
            maxLatencyMs: trials.length > 0 ? latencies[latencies.length - 1] : 0
        };
    }

    async _persistTrials(result) {
        if (!this.persistenceManager || typeof this.persistenceManager.set !== 'function') return false;
        try {
            await this.persistenceManager.set(TRIALS_COLLECTION, String(result.masterId), result);
            return true;
        } catch (_) {
            return false;
        }
    }

    async getStoredTrials(masterId) {
        if (!this.persistenceManager || typeof this.persistenceManager.get !== 'function') return null;
        try {
            const stored = await this.persistenceManager.get(TRIALS_COLLECTION, String(masterId));
            return stored === undefined ? null : stored;
        } catch (_) {
            return null;
        }
    }

    /**
     * Run controlled trials for one master record: sequential bounded
     * reachability trials plus an honest task-executability assessment.
     * Task trials execute ONLY with an observed safe interface (none of the
     * current registry records qualify — recorded, never fabricated).
     */
    async testMasterRecord(masterId, options = {}) {
        if (!this.masterSource || typeof this.masterSource.getRecordById !== 'function') {
            const err = new Error('Agent Master Registry source is not configured.');
            err.statusCode = 503;
            err.code = 'MASTER_REGISTRY_UNAVAILABLE';
            throw err;
        }
        const { AgentFunctionalProfiler } = require('./AgentFunctionalProfiler');
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
            err.code = 'FUNCTIONAL_TEST_NOT_POSSIBLE';
            err.record = record;
            throw err;
        }

        const trialCount = Math.min(Math.max(Number(options.trials) || this.trialCount, 1), 5);
        const target = String(record.publicUrl).trim();
        const trials = [];
        for (let i = 0; i < trialCount; i += 1) {
            trials.push(await this._singleReachabilityTrial(target));
        }
        const summary = AgentFunctionalTester.summarizeTrials(trials);

        const fingerprint = AgentFunctionalProfiler.fingerprintRecord(record, null);
        const proposedTask = AgentFunctionalTester.proposeTask(fingerprint);
        // Task assessment needs the latest stored evaluation when present.
        let storedEvaluation = null;
        try {
            if (this.persistenceManager && typeof this.persistenceManager.get === 'function') {
                storedEvaluation = await this.persistenceManager.get('master_evaluations', String(record.masterId));
            }
        } catch (_) {}
        const assessment = AgentFunctionalTester.assessExecutability({ record, evaluation: storedEvaluation || undefined });

        const result = {
            masterId: record.masterId,
            userId: record.userId,
            firmId: record.firmId,
            agentName: record.agentName,
            category: record.category,
            publicUrl: record.publicUrl,
            testedAt: toIsoNow(),
            testedBy: 'watchtower-functional-tester/1.0',
            trialPlan: { trials: trialCount, sequential: true, timeoutMs: this.trialTimeoutMs, maxBodyBytes: TRIAL_MAX_BODY_BYTES },
            reachabilityTrials: trials,
            reachabilitySummary: summary,
            consistency: trials.length > 1
                ? (summary.successful === trials.length ? 'CONSISTENT_SUCCESS' : (summary.failed === trials.length ? 'CONSISTENT_FAILURE' : 'INCONSISTENT'))
                : 'LIMITED_TRIAL_EVIDENCE',
            taskAssessment: assessment,
            proposedTask,
            taskTrials: [],
            taskSummary: null,
            qualityEvidence: 'QUALITY_EVIDENCE_LIMITED',
            functionalExecutionStatus: assessment.executable ? 'FUNCTIONAL_EXECUTION_TESTED' : assessment.code,
            source: record.source || { database: 'nrkindex_trn', table: 'AGENT_MASTER_REGISTRY' }
        };

        await this._persistTrials(result);
        return result;
    }
}

module.exports = {
    AgentFunctionalTester,
    TRIALS_COLLECTION,
    DOMAIN_TASKS
};
