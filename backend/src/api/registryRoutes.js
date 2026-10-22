/**
 * Agent Master Registry REST API Router
 * Read-only access to the existing nrkindex_trn.AGENT_MASTER_REGISTRY table
 * plus onboarding of a master record into the existing Watchtower
 * registration + monitoring flow (PUBLIC_URL only, never FILENAME).
 * AgentGenPro backend compliant sub-router — explicit /api/... route paths.
 * Issues ZERO writes to AGENT_MASTER_REGISTRY (SELECT only, via the
 * existing read-only database access service).
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');
const { AgentMasterRegistrySource } = require('../registry/AgentMasterRegistrySource');
const { AgentFunctionalProfiler, RELATIONS } = require('../registry/AgentFunctionalProfiler');
const { AgentFunctionalTester } = require('../registry/AgentFunctionalTesting');
const { AgentFunctionalDecider } = require('../registry/AgentFunctionalDecisions');

router.use(requireAuth);

function getMasterSource(req) {
    const source = req.app.get('agentMasterRegistrySource');
    if (!source) {
        const err = new Error('Agent Master Registry source is not mounted on express application context');
        err.statusCode = 503;
        err.code = 'MASTER_REGISTRY_UNAVAILABLE';
        throw err;
    }
    return source;
}

function getEvaluator(req) {
    const evaluator = req.app.get('agentMasterEvaluator');
    if (!evaluator) {
        const err = new Error('Agent Master Evaluator is not mounted on express application context');
        err.statusCode = 503;
        err.code = 'MASTER_EVALUATOR_UNAVAILABLE';
        throw err;
    }
    return evaluator;
}

function toMasterError(err, fallbackCode) {
    const reason = (err && err.message) ? String(err.message) : 'Agent Master Registry request failed';
    const status = (err && err.statusCode) || 500;
    return { status, body: { success: false, error: { message: reason, code: (err && err.code) || fallbackCode } } };
}

function enrichWithMonitoring(record, req) {
    if (!record) return record;
    try {
        const monitoringService = req.app.get('agentMonitoringService');
        const agentId = `amr-${record.masterId}`;
        if (monitoringService && monitoringService.store && typeof monitoringService.store.getStatus === 'function') {
            const tenantId = req.headers['x-tenant-id'] || req.tenantId || 'default-tenant';
            const st = monitoringService.store.getStatus(agentId, tenantId);
            const tracked = Boolean(st && st.lastCheckAt);
            record.monitoring = {
                tracked,
                agentId,
                currentState: (st && st.currentState) || 'UNKNOWN',
                connectivity: (st && st.connectivity) || 'UNKNOWN',
                lastCheckAt: (st && st.lastCheckAt) || null
            };
        }
    } catch (_) {}
    return record;
}

// 1. GET /api/v1/registry/master — list evaluation records (filters + pagination)
router.get(['/api/v1/registry/master', '/api/registry/master'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const source = getMasterSource(req);
        const result = await source.listRecords({
            kind: req.query.kind,
            testable: req.query.testable,
            category: req.query.category,
            userId: req.query.userId,
            search: req.query.search,
            limit: req.query.limit,
            offset: req.query.offset
        });
        res.json({ success: true, ...result });
    } catch (err) {
        const mapped = toMasterError(err, 'MASTER_REGISTRY_LIST_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

// 2. GET /api/v1/registry/master/status — source availability (before :id route)
router.get(['/api/v1/registry/master/status', '/api/registry/master/status'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const source = getMasterSource(req);
        res.json({ success: true, data: await source.getStatus() });
    } catch (err) {
        const mapped = toMasterError(err, 'MASTER_REGISTRY_STATUS_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

// 3. GET /api/v1/registry/master/:id — single evaluation record (identity preserved)
router.get(['/api/v1/registry/master/:id', '/api/registry/master/:id'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const source = getMasterSource(req);
        const record = await source.getRecordById(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, error: { message: `Agent Master record '${req.params.id}' not found`, code: 'MASTER_RECORD_NOT_FOUND' } });
        }
        res.json({ success: true, data: enrichWithMonitoring(record, req) });
    } catch (err) {
        const mapped = toMasterError(err, 'MASTER_RECORD_FETCH_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

// 4. POST /api/v1/registry/master/:id/monitor — onboard one master record into
// the existing registration + monitoring flow. Test target is ALWAYS the
// record's exact PUBLIC_URL. Never writes to AGENT_MASTER_REGISTRY.
router.post(['/api/v1/registry/master/:id/monitor', '/api/registry/master/:id/monitor'], requireRole([ROLES.ADMIN]), async (req, res) => {
    try {
        const source = getMasterSource(req);
        const record = await source.getRecordById(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, error: { message: `Agent Master record '${req.params.id}' not found`, code: 'MASTER_RECORD_NOT_FOUND' } });
        }

        let contract;
        try {
            contract = AgentMasterRegistrySource.buildMonitorContract(record);
        } catch (contractErr) {
            return res.status(contractErr.statusCode || 422).json({
                success: false,
                error: { message: contractErr.message, code: contractErr.code || 'MASTER_RECORD_NOT_TESTABLE' },
                data: enrichWithMonitoring(record, req)
            });
        }

        const agentService = req.app.get('agentService');
        if (!agentService) {
            return res.status(503).json({ success: false, error: { message: 'AgentService is not mounted', code: 'AGENT_SERVICE_UNAVAILABLE' } });
        }
        const monitoringService = req.app.get('agentMonitoringService');
        if (!monitoringService) {
            return res.status(503).json({ success: false, error: { message: 'Monitoring service is not mounted', code: 'MONITORING_SERVICE_UNAVAILABLE' } });
        }

        const tenantId = req.headers['x-tenant-id'] || req.tenantId || 'default-tenant';
        let alreadyTracked = false;
        try {
            const existing = typeof agentService.getAgent === 'function' ? agentService.getAgent(contract.id) : null;
            if (existing) {
                alreadyTracked = true;
            } else {
                agentService.registerAgent(contract);
            }
        } catch (regErr) {
            const reason = (regErr && regErr.message) ? String(regErr.message) : 'Agent registration failed';
            if (reason.includes('already exists') || (regErr && regErr.statusCode === 409)) {
                alreadyTracked = true;
            } else {
                const status = (regErr && regErr.statusCode) || 400;
                return res.status(status).json({ success: false, error: { message: reason, code: (regErr && regErr.code) || 'MASTER_MONITOR_REGISTRATION_FAILED', errors: (regErr && regErr.errors) || [] } });
            }
        }

        try {
            const current = monitoringService.store.getStatus(contract.id, tenantId);
            if (!current || !current.monitoringEnabled) {
                await monitoringService.startMonitoring(contract.id, tenantId);
            }
        } catch (_) {}

        // One real on-demand probe through the canonical monitoring flow so
        // the response carries genuine state (never a fabricated default).
        let probe = null;
        try {
            probe = await monitoringService.checkAgent(contract.id, tenantId);
        } catch (probeErr) {
            probe = monitoringService.store.getStatus(contract.id, tenantId);
        }

        res.status(alreadyTracked ? 200 : 201).json({
            success: true,
            tracked: true,
            alreadyTracked,
            agentId: contract.id,
            master: {
                masterId: record.masterId,
                userId: record.userId,
                firmId: record.firmId,
                agentName: record.agentName,
                publicUrl: record.publicUrl
            },
            monitoring: probe ? {
                currentState: probe.currentState || 'UNKNOWN',
                connectivity: probe.connectivity || 'UNKNOWN',
                lastCheckAt: probe.lastCheckAt || null,
                latencyMs: (probe.latency && probe.latency.lastLatencyMs) || 0,
                lastError: probe.lastError || null
            } : null
        });
    } catch (err) {
        const mapped = toMasterError(err, 'MASTER_MONITOR_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});



// 5. POST /api/v1/registry/master/:id/evaluate — run a real public-URL
// evaluation of one master record (exact PUBLIC_URL only). The completed
// evaluation (including unreachable/UNKNOWN outcomes) is persisted through
// the existing Watchtower persistence architecture. AGENT_MASTER_REGISTRY
// is never written.
router.post(['/api/v1/registry/master/:id/evaluate', '/api/registry/master/:id/evaluate'], requireRole([ROLES.ADMIN]), async (req, res) => {
    try {
        const evaluator = getEvaluator(req);
        const result = await evaluator.evaluateMasterRecord(req.params.id);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        if (err && (err.code === 'MASTER_RECORD_NOT_FOUND' || err.code === 'MASTER_RECORD_NOT_TESTABLE' || err.code === 'MASTER_REGISTRY_UNAVAILABLE')) {
            const status = (err && err.statusCode) || 400;
            const body = { success: false, error: { message: err.message, code: err.code } };
            if (err.record) body.data = err.record;
            return res.status(status).json(body);
        }
        const mapped = toMasterError(err, 'MASTER_EVALUATION_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

// 6. GET /api/v1/registry/master/:id/evaluation — stored evaluation result
// (404 with EVALUATION_NOT_FOUND when the record was never evaluated).
router.get(['/api/v1/registry/master/:id/evaluation', '/api/registry/master/:id/evaluation'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const evaluator = getEvaluator(req);
        const stored = await evaluator.getStoredEvaluation(req.params.id);
        if (!stored) {
            return res.status(404).json({ success: false, error: { message: `No stored evaluation for Agent Master record '${req.params.id}'`, code: 'EVALUATION_NOT_FOUND' } });
        }
        res.json({ success: true, data: stored });
    } catch (err) {
        const mapped = toMasterError(err, 'MASTER_EVALUATION_FETCH_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

// 7. GET /api/v1/registry/evaluations/by-agent — badge data for fleet lists.
// Maps tracked agent IDs (amr-<masterId>) to their stored evaluation
// summary. Unknown agents map to null (never fabricated). Includes the
// single-record decision (no group-peer context) and trial summary.
router.get(['/api/v1/registry/evaluations/by-agent', '/api/registry/evaluations/by-agent'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const evaluator = getEvaluator(req);
        const raw = String(req.query.agentIds || '');
        const ids = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
        const trialsById = await loadTrialsMap(req);
        const data = {};
        for (const agentId of ids) {
            const match = /^amr-(\d+)$/.exec(agentId);
            if (!match) {
                data[agentId] = null;
                continue;
            }
            let stored = null;
            try {
                stored = await evaluator.getStoredEvaluation(match[1]);
            } catch (_) {
                stored = null;
            }
            if (!stored) {
                data[agentId] = null;
                continue;
            }
            const trials = trialsById[String(match[1])] || null;
            let decision = null;
            try {
                const source = getMasterSource(req);
                const record = await source.getRecordById(match[1]);
                if (record) {
                    const profiler = AgentFunctionalProfiler;
                    const decider = AgentFunctionalDecider;
                    decision = decider.decideForMember({
                        member: {
                            masterId: record.masterId, userId: record.userId, firmId: record.firmId,
                            agentName: record.agentName, filename: record.filename, category: record.category,
                            recordKind: record.recordKind,
                            testable: Boolean(stored.externallyTestable),
                            testabilityReason: stored.testabilityReason || null,
                            health: (stored.runtimeHealth && stored.runtimeHealth.state) || 'UNKNOWN',
                            capabilities: Array.isArray(stored.capabilities) ? stored.capabilities.map(String) : [],
                            monitoring: (stored.monitoring && stored.monitoring.tracked) ? stored.monitoring : null,
                            incident: stored.incident || null
                        },
                        fingerprint: profiler.fingerprintRecord(record, stored),
                        evaluation: stored,
                        trials,
                        peers: []
                    });
                }
            } catch (_) {}
            data[agentId] = {
                agentType: stored.agentType || 'UNKNOWN',
                evaluatedAt: stored.evaluatedAt || null,
                reachable: Boolean(stored.reachability && stored.reachability.reachable),
                runtimeHealth: (stored.runtimeHealth && stored.runtimeHealth.state) || 'UNKNOWN',
                evidenceCount: Array.isArray(stored.evidence) ? stored.evidence.length : 0,
                masterId: stored.masterId,
                userId: stored.userId,
                firmId: stored.firmId,
                decision,
                trialSummary: trials && trials.reachabilitySummary ? {
                    trials: trials.reachabilitySummary.trials,
                    successful: trials.reachabilitySummary.successful,
                    failed: trials.reachabilitySummary.failed,
                    successRate: trials.reachabilitySummary.successRate,
                    testedAt: trials.testedAt || null
                } : null
            };
        }
        res.json({ success: true, data });
    } catch (err) {
        const mapped = toMasterError(err, 'MASTER_EVALUATIONS_FETCH_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

// ---- Functional fingerprinting & comparison (Prompt 3) ----
// Read-only assembly over registry rows + stored evaluations + live
// monitoring snapshots. No probing, no writes, no decisions.

function getMonitoringStore(req) {
    try {
        const svc = req.app.get('agentMonitoringService');
        if (svc && svc.store) return svc.store;
    } catch (_) {}
    return null;
}

async function assembleFunctionalInputs(req) {
    const source = getMasterSource(req);
    const records = await source.listAllRecords();
    const evaluationsById = {};
    try {
        const pm = req.app.get('persistenceManager');
        if (pm && typeof pm.list === 'function') {
            const stored = await pm.list('master_evaluations');
            for (const ev of (Array.isArray(stored) ? stored : [])) {
                if (ev && ev.masterId !== null && ev.masterId !== undefined) {
                    evaluationsById[String(ev.masterId)] = ev;
                }
            }
        }
    } catch (_) {}
    const monitoringByAgent = {};
    try {
        const tenantId = req.headers['x-tenant-id'] || req.tenantId || 'default-tenant';
        const store = getMonitoringStore(req);
        if (store && typeof store.listStatuses === 'function') {
            for (const st of store.listStatuses(tenantId)) {
                if (st && st.agentId) monitoringByAgent[st.agentId] = st;
            }
        }
    } catch (_) {}
    return { records, evaluationsById, monitoringByAgent };
}

function enrichFunctionalMember(record, evaluationsById, monitoringByAgent, req) {
    const profiler = AgentFunctionalProfiler;
    const evaluation = evaluationsById[String(record.masterId)] || null;
    const fingerprint = profiler.fingerprintRecord(record, evaluation);
    const agentId = `amr-${record.masterId}`;
    const mon = monitoringByAgent[agentId] || null;
    let incident = null;
    try {
        const store = getMonitoringStore(req);
        if (store && mon && mon.activeIncidentId && typeof store.getIncident === 'function') {
            const inc = store.getIncident(mon.activeIncidentId);
            if (inc) incident = { id: inc.id, status: inc.status || inc.state || 'UNKNOWN', severity: inc.severity || 'UNKNOWN', summary: inc.summary || null, startedAt: inc.startedAt || null };
        }
    } catch (_) {}
    const capabilities = (evaluation && evaluation.capabilityStatus === 'AVAILABLE' && Array.isArray(evaluation.capabilities))
        ? evaluation.capabilities.map((c) => String((c && (c.id || c.name)) || c))
        : (mon && Array.isArray(mon.capabilities) && mon.capabilities.length > 0 ? mon.capabilities.map(String) : []);
    const testable = evaluation ? Boolean(evaluation.externallyTestable) : Boolean(record.externallyTestable);
    const testabilityReason = evaluation
        ? (evaluation.testabilityReason || null)
        : (record.testabilityReason || null);
    return {
        masterId: record.masterId,
        userId: record.userId,
        firmId: record.firmId,
        agentName: record.agentName,
        summary: (record.summary !== undefined ? record.summary : null),
        filename: record.filename,
        fileSizeKb: (record.fileSizeKb !== null && record.fileSizeKb !== undefined) ? Number(record.fileSizeKb) : null,
        category: record.category,
        publicUrl: record.publicUrl,
        recordKind: record.recordKind,
        testable,
        testabilityReason,
        agentType: (evaluation && evaluation.agentType) || 'NOT_EVALUATED',
        health: (mon && mon.currentState) || (evaluation && evaluation.runtimeHealth && evaluation.runtimeHealth.state) || 'UNKNOWN',
        latencyMs: (mon && mon.latency && mon.latency.lastLatencyMs !== undefined && mon.latency.lastLatencyMs !== null)
            ? mon.latency.lastLatencyMs
            : ((evaluation && evaluation.reachability) ? (evaluation.reachability.latencyMs || 0) : null),
        capabilities,
        capabilityStatus: (evaluation && evaluation.capabilityStatus) || (capabilities.length > 0 ? 'OBSERVED' : 'CAPABILITIES_NOT_EXPOSED'),
        hasBackend: record.hasBackend,
        isPublic: record.isPublic,
        verified: record.verified,
        evidenceStatus: evaluation ? 'EVALUATED' : 'NOT_EVALUATED',
        evaluatedAt: (evaluation && evaluation.evaluatedAt) || null,
        monitoring: mon ? {
            tracked: Boolean(mon.lastCheckAt),
            currentState: mon.currentState || 'UNKNOWN',
            connectivity: mon.connectivity || 'UNKNOWN',
            lastCheckAt: mon.lastCheckAt || null,
            availabilityPercentage: (mon.availabilityPercentage !== undefined && mon.availabilityPercentage !== null)
                ? mon.availabilityPercentage
                : null,
            totalChecksCount: mon.totalChecksCount || 0
        } : null,
        incident,
        fingerprint: {
            tokens: fingerprint.tokens,
            domains: fingerprint.domainDetail,
            category: fingerprint.category,
            capabilityIds: fingerprint.capabilityIds,
            contentTypeClass: fingerprint.contentTypeClass,
            evaluated: fingerprint.evaluated,
            reachable: fingerprint.reachable
        },
        functionalExecutionStatus: 'FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED'
    };
}

function rankObservedStrength(member) {
    const ev = member.evaluationPresent;
    return [
        ev ? 1 : 0,
        ev && member.reachable ? 1 : 0,
        ev && member.runtimeHealthy ? 1 : 0,
        ev && member.capsAvailable ? 1 : 0,
        member.hasOpenIncident ? 0 : 1,
        member.tracked ? 1 : 0
    ];
}

function compareRank(a, b) {
    const ra = rankObservedStrength(a);
    const rb = rankObservedStrength(b);
    for (let i = 0; i < ra.length; i += 1) {
        if (ra[i] !== rb[i]) return rb[i] - ra[i];
    }
    return (a.member.masterId || 0) - (b.member.masterId || 0);
}

// 8. GET /api/v1/registry/functional/groups — evidence-based functional groups
router.get(['/api/v1/registry/functional/groups', '/api/registry/functional/groups'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const { records, evaluationsById, monitoringByAgent } = await assembleFunctionalInputs(req);
        const profiler = AgentFunctionalProfiler;
        const fps = records.map((r) => profiler.fingerprintRecord(r, evaluationsById[String(r.masterId)] || null));
        const { groups, unclassified } = profiler.groupFingerprints(fps);
        const byId = new Map(records.map((r) => [r.masterId, r]));

        let minConfidence = null;
        if (req.query.minConfidence) {
            const v = String(req.query.minConfidence).toUpperCase();
            if (['HIGH', 'MEDIUM', 'LOW'].includes(v)) minConfidence = v;
        }
        const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const categoryFilter = req.query.category ? String(req.query.category).toLowerCase() : null;

        const outGroups = [];
        for (const g of groups) {
            if (minConfidence && (rank[g.confidence] || 0) < rank[minConfidence]) continue;
            const members = g.memberIds
                .map((id) => byId.get(id))
                .filter(Boolean)
                .map((rec) => enrichFunctionalMember(rec, evaluationsById, monitoringByAgent, req));
            if (categoryFilter && !members.some((m) => String(m.category || '').toLowerCase() === categoryFilter)) continue;
            outGroups.push({ ...g, members });
        }

        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            totalRecords: records.length,
            evaluatedCount: Object.keys(evaluationsById).length,
            groupCount: outGroups.length,
            groups: outGroups,
            unclassified,
            unclassifiedCount: unclassified.length,
            functionalExecutionStatus: 'FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED'
        });
    } catch (err) {
        const mapped = toMasterError(err, 'FUNCTIONAL_GROUPS_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

// 9. GET /api/v1/registry/functional/compare?ids=1,2,3 — pairwise comparison
// within a candidate set, plus observed-only best-candidate preparation.
// No KEEP/REVIEW/RETIRE decisions are made here.
router.get(['/api/v1/registry/functional/compare', '/api/registry/functional/compare'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const source = getMasterSource(req);
        const rawIds = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
        const ids = Array.from(new Set(rawIds.map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0)));
        if (ids.length < 2) {
            return res.status(400).json({ success: false, error: { message: 'Provide at least two master record IDs via ?ids=1,2,3', code: 'COMPARE_IDS_REQUIRED' } });
        }
        const { evaluationsById, monitoringByAgent } = await assembleFunctionalInputs(req);
        const profiler = AgentFunctionalProfiler;
        const members = [];
        for (const id of ids) {
            const record = await source.getRecordById(id);
            if (!record) {
                return res.status(404).json({ success: false, error: { message: `Agent Master record '${id}' not found`, code: 'MASTER_RECORD_NOT_FOUND' } });
            }
            members.push(enrichFunctionalMember(record, evaluationsById, monitoringByAgent, req));
        }
        const fps = members.map((m) => profiler.fingerprintRecord({
            masterId: m.masterId, userId: m.userId, firmId: m.firmId,
            agentName: m.agentName, filename: m.filename, category: m.category,
            hasBackend: m.hasBackend, fileSizeKb: m.fileSizeKb, recordKind: m.recordKind
        }, evaluationsById[String(m.masterId)] || null));

        const pairs = [];
        for (let i = 0; i < fps.length; i += 1) {
            for (let j = i + 1; j < fps.length; j += 1) {
                const cmp = profiler.comparePair(fps[i], fps[j]);
                pairs.push({
                    a: members[i].masterId,
                    b: members[j].masterId,
                    relation: cmp.relation,
                    score: cmp.score,
                    confidence: cmp.confidence,
                    reasons: cmp.reasons
                });
            }
        }

        const ranked = members.map((member) => {
            const ev = evaluationsById[String(member.masterId)] || null;
            return {
                member,
                evaluationPresent: Boolean(ev),
                reachable: Boolean(ev && ev.reachability && ev.reachability.reachable),
                runtimeHealthy: Boolean(ev && ev.runtimeHealth && ev.runtimeHealth.state === 'HEALTHY'),
                capsAvailable: Boolean(ev && ev.capabilityStatus === 'AVAILABLE'),
                hasOpenIncident: Boolean(member.incident && ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(String(member.incident.status || '').toUpperCase())),
                tracked: Boolean(member.monitoring && member.monitoring.tracked)
            };
        }).sort(compareRank);

        const insufficient = ranked.filter((r) => {
            const fp = fps[members.indexOf(r.member)];
            return !r.evaluationPresent && (!fp || (fp.domains.length === 0 && fp.tokens.length <= 1));
        }).map((r) => r.member.masterId);
        const needsTesting = ranked.filter((r) => !r.evaluationPresent && !insufficient.includes(r.member.masterId)).map((r) => r.member.masterId);

        // Per-member KEEP/REVIEW/RETIRE recommendations (recommendations only).
        const trialsById = await loadTrialsMap(req);
        const pairByKey = new Map();
        for (const p of pairs) {
            pairByKey.set(`${Math.min(p.a, p.b)}|${Math.max(p.a, p.b)}`, p);
        }
        const memberDecisions = {};
        for (const m of members) {
            const peerInfos = members
                .filter((o) => o.masterId !== m.masterId)
                .map((o) => {
                    const key = `${Math.min(m.masterId, o.masterId)}|${Math.max(m.masterId, o.masterId)}`;
                    const pr = pairByKey.get(key);
                    return {
                        masterId: o.masterId,
                        relation: pr ? pr.relation : 'UNRELATED',
                        score: pr ? pr.score : 0,
                        healthy: String(o.health || '').toUpperCase() === 'HEALTHY',
                        capsAvailable: Boolean(o.capabilities && o.capabilities.length > 0),
                        openIncident: Boolean(o.incident),
                        taskTrials: 0,
                        taskSuccessRate: null,
                        health: o.health || 'UNKNOWN'
                    };
                });
            // Enrich peer task evidence from stored trials where present.
            for (const peer of peerInfos) {
                const t = trialsById[String(peer.masterId)];
                if (t && Array.isArray(t.taskTrials) && t.taskTrials.length >= 3) {
                    const ok = t.taskTrials.filter((x) => x.successful).length;
                    peer.taskTrials = t.taskTrials.length;
                    peer.taskSuccessRate = Math.round((ok / t.taskTrials.length) * 1000) / 10;
                }
            }
            memberDecisions[m.masterId] = AgentFunctionalDecider.decideForMember({
                member: m,
                fingerprint: fps[members.indexOf(m)],
                evaluation: evaluationsById[String(m.masterId)] || null,
                trials: trialsById[String(m.masterId)] || null,
                peers: peerInfos
            });
        }

        res.json({
            success: true,
            members: members.map((m) => ({ ...m, decision: memberDecisions[m.masterId] || null })),
            pairs,
            bestCandidatePrep: {
                note: 'Strongest currently OBSERVED candidate only — not a quality verdict and not a KEEP/RETIRE decision.',
                strongest: ranked.length > 0 ? ranked[0].member.masterId : null,
                ranked: ranked.map((r) => r.member.masterId),
                weaker: ranked.slice(1).map((r) => r.member.masterId),
                needsFunctionalTesting: needsTesting,
                insufficientEvidence: insufficient
            },
            functionalExecutionStatus: 'FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED',
            executionDisclaimer: 'No controlled functional task execution has been performed yet; latency/reachability/capability counts are supporting signals only, not proof of better task performance.'
        });
    } catch (err) {
        const mapped = toMasterError(err, 'FUNCTIONAL_COMPARE_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

// 10. GET /api/v1/registry/master/:id/fingerprint — single functional fingerprint
router.get(['/api/v1/registry/master/:id/fingerprint', '/api/registry/master/:id/fingerprint'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const source = getMasterSource(req);
        const record = await source.getRecordById(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, error: { message: `Agent Master record '${req.params.id}' not found`, code: 'MASTER_RECORD_NOT_FOUND' } });
        }
        let storedEvaluation = null;
        try {
            const pm = req.app.get('persistenceManager');
            if (pm && typeof pm.get === 'function') {
                storedEvaluation = await pm.get('master_evaluations', String(record.masterId));
            }
        } catch (_) {}
        const fingerprint = AgentFunctionalProfiler.fingerprintRecord(record, storedEvaluation || null);
        res.json({ success: true, data: { ...fingerprint, storedEvaluationPresent: Boolean(storedEvaluation) } });
    } catch (err) {
        const mapped = toMasterError(err, 'FUNCTIONAL_FINGERPRINT_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

function getTester(req) {
    const tester = req.app.get('agentFunctionalTester');
    if (tester) return tester;
    // Fallback: construct from mounted source + persistence (same guarantees).
    const source = getMasterSource(req);
    let persistenceManager = null;
    try {
        persistenceManager = req.app.get('persistenceManager') || null;
    } catch (_) {}
    return new AgentFunctionalTester({ masterSource: source, persistenceManager });
}

async function loadTrialsMap(req) {
    const byId = {};
    try {
        const pm = req.app.get('persistenceManager');
        if (pm && typeof pm.list === 'function') {
            const stored = await pm.list('master_trials');
            for (const tr of (Array.isArray(stored) ? stored : [])) {
                if (tr && tr.masterId !== null && tr.masterId !== undefined) {
                    byId[String(tr.masterId)] = tr;
                }
            }
        }
    } catch (_) {}
    return byId;
}

// ---- Individual evidence assembly (fleet report + full-report endpoint) ----
// Pure assembly over already-available stores. No probing, no writes, no
// fabrication. Missing evidence is carried as null with explicit reasons.

function buildTrialEvidence(masterId, trialsById, evaluationsById) {
    const t = trialsById[String(masterId)] || null;
    const ev = evaluationsById[String(masterId)] || null;
    if (!t) {
        const single = (ev && ev.reachability) ? {
            trials: 1,
            successful: (ev.reachability.reachable && ev.reachability.httpStatus >= 200 && ev.reachability.httpStatus < 300) ? 1 : 0,
            failed: (ev.reachability.reachable && ev.reachability.httpStatus >= 200 && ev.reachability.httpStatus < 300) ? 0 : 1,
            source: 'SINGLE_EVALUATION_PROBE'
        } : null;
        return {
            tested: Boolean(single),
            reachabilityTrials: single ? single.trials : 0,
            reachabilitySuccessful: single ? single.successful : 0,
            reachabilityFailed: single ? single.failed : 0,
            reachabilitySource: single ? single.source : 'NONE',
            trialCount: 0,
            successfulTrials: 0,
            failedTrials: 0,
            averageLatencyMs: (ev && ev.reachability && ev.reachability.latencyMs) || null,
            consistency: single ? 'SINGLE_OBSERVATION' : 'NOT_TESTED',
            taskTrials: 0,
            taskSuccessful: 0,
            taskSuccessRate: null,
            taskAssessment: null,
            qualityEvidence: 'QUALITY_EVIDENCE_LIMITED',
            functionalExecutionStatus: 'FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED',
            testedAt: null
        };
    }
    const rs = (t.reachabilitySummary) || null;
    const taskTrials = Array.isArray(t.taskTrials) ? t.taskTrials : [];
    const taskOk = taskTrials.filter((x) => x && x.successful).length;
    return {
        tested: true,
        reachabilityTrials: rs ? rs.trials : (Array.isArray(t.reachabilityTrials) ? t.reachabilityTrials.length : 0),
        reachabilitySuccessful: rs ? rs.successful : 0,
        reachabilityFailed: rs ? rs.failed : 0,
        reachabilitySource: 'CONTROLLED_TRIALS',
        trialCount: Array.isArray(t.reachabilityTrials) ? t.reachabilityTrials.length : 0,
        successfulTrials: rs ? rs.successful : 0,
        failedTrials: rs ? rs.failed : 0,
        averageLatencyMs: rs ? rs.avgLatencyMs : null,
        consistency: t.consistency || null,
        taskTrials: taskTrials.length,
        taskSuccessful: taskOk,
        taskSuccessRate: taskTrials.length > 0 ? Math.round((taskOk / taskTrials.length) * 1000) / 10 : null,
        taskAssessment: t.taskAssessment || null,
        qualityEvidence: t.qualityEvidence || 'QUALITY_EVIDENCE_LIMITED',
        functionalExecutionStatus: t.functionalExecutionStatus || 'FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED',
        testedAt: t.testedAt || null
    };
}

function functionalResultFor(member, trialEvidence, evaluation) {
    if (!evaluation) return 'NOT_EVALUATED';
    if (trialEvidence && trialEvidence.tested && trialEvidence.taskTrials >= 3) {
        if (trialEvidence.taskSuccessRate >= 80) return `TASK_SUCCESS_${trialEvidence.taskSuccessful}/${trialEvidence.taskTrials}`;
        if (trialEvidence.taskSuccessful === 0) return `TASK_FAILURE_0/${trialEvidence.taskTrials}`;
        return `TASK_PARTIAL_${trialEvidence.taskSuccessful}/${trialEvidence.taskTrials}`;
    }
    if (trialEvidence && trialEvidence.tested && trialEvidence.reachabilityTrials > 0) {
        if (trialEvidence.reachabilityFailed === 0) return 'REACHABLE_NO_TASK_INTERFACE';
        if (trialEvidence.reachabilitySuccessful === 0) return 'UNREACHABLE_NO_TASK_INTERFACE';
        return 'PARTIALLY_REACHABLE_NO_TASK_INTERFACE';
    }
    if (evaluation && evaluation.reachability) {
        return evaluation.reachability.reachable ? 'REACHABLE_SINGLE_OBSERVATION' : 'UNREACHABLE_SINGLE_OBSERVATION';
    }
    return 'NOT_TESTED';
}

function nextActionFor(decision) {
    const d = decision && decision.decision ? String(decision.decision).toUpperCase() : 'REVIEW';
    if (d === 'KEEP') return 'No action required. Keep the record under routine monitoring.';
    if (d === 'RETIRE') return 'Confirm redundancy with the listed stronger equivalent, then follow the standard decommission process. Nothing is retired automatically.';
    return 'Review the record manually or provide a safe task interface so Watchtower can verify actual task execution.';
}

function buildPeerEntries(member, peerMembers, byFp, trialsById) {
    const profiler = AgentFunctionalProfiler;
    const selfFp = byFp.get(member.masterId);
    return peerMembers
        .filter((p) => p.masterId !== member.masterId)
        .map((p) => {
            let relation = 'UNRELATED';
            let score = 0;
            let reasons = [];
            try {
                const cmp = profiler.comparePair(selfFp, byFp.get(p.masterId));
                relation = cmp.relation;
                score = cmp.score;
                reasons = cmp.reasons || [];
            } catch (_) {}
            let taskTrials = 0;
            let taskSuccessRate = null;
            const t = trialsById[String(p.masterId)];
            if (t && Array.isArray(t.taskTrials) && t.taskTrials.length >= 3) {
                const ok = t.taskTrials.filter((x) => x && x.successful).length;
                taskTrials = t.taskTrials.length;
                taskSuccessRate = Math.round((ok / t.taskTrials.length) * 1000) / 10;
            }
            return {
                masterId: p.masterId,
                agentName: p.agentName || null,
                relation,
                score,
                reasons: reasons.slice(0, 4),
                healthy: String(p.health || '').toUpperCase() === 'HEALTHY',
                capsAvailable: Boolean(p.capabilities && p.capabilities.length > 0),
                openIncident: Boolean(p.incident),
                taskTrials,
                taskSuccessRate,
                health: p.health || 'UNKNOWN',
                decision: (p.decision && p.decision.decision) || null
            };
        });
}

function attachEvidenceFor(member, group, peerEntries, decided, evaluationsById, trialsById) {
    const evaluation = evaluationsById[String(member.masterId)] || null;
    const trialEvidence = buildTrialEvidence(member.masterId, trialsById, evaluationsById);
    const equivPeers = (peerEntries || []).filter((p) => p && (p.relation === 'FUNCTIONALLY_SIMILAR' || p.relation === 'POTENTIAL_DUPLICATE'));
    const stronger = equivPeers.filter((p) => {
        if (p.taskSuccessRate !== null && p.taskSuccessRate !== undefined && p.taskTrials >= 3 && p.taskSuccessRate >= 80) return true;
        const selfHealthy = String(member.health || '').toUpperCase() === 'HEALTHY';
        if (p.healthy && p.capsAvailable && !p.openIncident && !selfHealthy) return true;
        return false;
    });
    const strongerCandidate = stronger.length > 0 ? {
        masterId: stronger[0].masterId,
        agentName: stronger[0].agentName || null,
        health: stronger[0].health || 'UNKNOWN',
        taskTrials: stronger[0].taskTrials || 0,
        taskSuccessRate: stronger[0].taskSuccessRate,
        reason: `ID ${stronger[0].masterId} shares functional evidence (${stronger[0].relation}, score ${stronger[0].score}) and shows stronger observed signals.`
    } : null;
    return {
        ...member,
        decision: decided,
        trialSummary: {
            trials: trialEvidence.reachabilityTrials,
            successful: trialEvidence.reachabilitySuccessful,
            failed: trialEvidence.reachabilityFailed,
            successRate: trialEvidence.reachabilityTrials > 0
                ? Math.round((trialEvidence.reachabilitySuccessful / trialEvidence.reachabilityTrials) * 1000) / 10
                : 0,
            taskTrials: trialEvidence.taskTrials,
            taskSuccessful: trialEvidence.taskSuccessful,
            taskSuccessRate: trialEvidence.taskSuccessRate,
            averageLatencyMs: trialEvidence.averageLatencyMs,
            consistency: trialEvidence.consistency,
            testedAt: trialEvidence.testedAt,
            source: trialEvidence.reachabilitySource
        },
        functionalResult: functionalResultFor(member, trialEvidence, evaluation),
        peers: (peerEntries || []).map((p) => ({
            masterId: p.masterId,
            agentName: p.agentName || null,
            relation: p.relation,
            score: p.score,
            health: p.health || 'UNKNOWN',
            decision: p.decision || null
        })),
        strongerCandidate,
        group: group ? {
            groupId: group.groupId,
            label: group.label,
            confidence: group.confidence,
            evidence: (group.evidence || []).slice(0, 4)
        } : null,
        nextAction: nextActionFor(decided)
    };
}

// 11. POST /api/v1/registry/functional/test?ids=1,2 — controlled functional
// trials for specific records (sequential, bounded, ADMIN only). Trials probe
// the exact stored PUBLIC_URL; task trials run only with an observed safe
// interface (otherwise recorded as NOT_AVAILABLE, never fabricated).
router.post(['/api/v1/registry/functional/test', '/api/registry/functional/test'], requireRole([ROLES.ADMIN]), async (req, res) => {
    try {
        const source = getMasterSource(req);
        const rawIds = String((req.query.ids || '')).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
        const ids = Array.from(new Set(rawIds.map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0)));
        if (ids.length === 0) {
            return res.status(400).json({ success: false, error: { message: 'Provide master record IDs via ?ids=1,2 (max 10 per call)', code: 'TEST_IDS_REQUIRED' } });
        }
        let persistenceManager = null;
        try {
            persistenceManager = req.app.get('persistenceManager') || null;
        } catch (_) {}
        const trialCount = Math.min(Math.max(Number(req.query.trials) || 3, 1), 5);
        const tester = new AgentFunctionalTester({ masterSource: source, persistenceManager, trialCount });
        const results = [];
        for (const id of ids) {
            try {
                results.push({ masterId: id, ok: true, result: await tester.testMasterRecord(id) });
            } catch (err) {
                results.push({
                    masterId: id,
                    ok: false,
                    error: { message: (err && err.message) || 'Functional test failed', code: (err && err.code) || 'FUNCTIONAL_TEST_FAILED' }
                });
            }
        }
        res.json({ success: true, testedAt: new Date().toISOString(), results });
    } catch (err) {
        const mapped = toMasterError(err, 'FUNCTIONAL_TEST_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

// 12. GET /api/v1/registry/functional/report — fleet evaluation report:
// summary counts, per-group summaries with member decisions, and the full
// decision table. Decisions are recommendations only; nothing is
// deleted, retired, or modified.
router.get(['/api/v1/registry/functional/report', '/api/registry/functional/report'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const { records, evaluationsById, monitoringByAgent } = await assembleFunctionalInputs(req);
        const trialsById = await loadTrialsMap(req);
        const profiler = AgentFunctionalProfiler;
        const fps = records.map((r) => profiler.fingerprintRecord(r, evaluationsById[String(r.masterId)] || null));
        const { groups, unclassified } = profiler.groupFingerprints(fps);
        const byId = new Map(records.map((r) => [r.masterId, r]));
        const byFp = new Map(fps.map((f) => [f.masterId, f]));

        const decideWithPeers = (member, peerMembers) => {
            const peers = peerMembers
                .filter((p) => p.masterId !== member.masterId)
                .map((p) => {
                    const cmp = profiler.comparePair(
                        byFp.get(member.masterId),
                        byFp.get(p.masterId)
                    );
                    let taskTrials = 0;
                    let taskSuccessRate = null;
                    const pt = trialsById[String(p.masterId)];
                    if (pt && Array.isArray(pt.taskTrials) && pt.taskTrials.length >= 3) {
                        const ok = pt.taskTrials.filter((x) => x && x.successful).length;
                        taskTrials = pt.taskTrials.length;
                        taskSuccessRate = Math.round((ok / pt.taskTrials.length) * 1000) / 10;
                    }
                    return {
                        masterId: p.masterId,
                        relation: cmp.relation,
                        score: cmp.score,
                        healthy: String(p.health || '').toUpperCase() === 'HEALTHY',
                        capsAvailable: Boolean(p.capabilities && p.capabilities.length > 0),
                        openIncident: Boolean(p.incident),
                        taskTrials,
                        taskSuccessRate,
                        health: p.health || 'UNKNOWN'
                    };
                });
            return {
                decision: AgentFunctionalDecider.decideForMember({
                    member,
                    fingerprint: byFp.get(member.masterId),
                    evaluation: evaluationsById[String(member.masterId)] || null,
                    trials: trialsById[String(member.masterId)] || null,
                    peers
                }),
                peers
            };
        };

        const attachEvidence = (member, group, peerEntries, decided) => attachEvidenceFor(member, group, peerEntries, decided, evaluationsById, trialsById);

        const reportGroups = groups.map((g) => {
            const members = g.memberIds
                .map((id) => byId.get(id))
                .filter(Boolean)
                .map((rec) => enrichFunctionalMember(rec, evaluationsById, monitoringByAgent, req));
            const decidedPairs = members.map((m) => ({ member: m, ...decideWithPeers(m, members) }));
            const peerEntriesById = new Map();
            for (const dp of decidedPairs) {
                const entries = buildPeerEntries(dp.member, members.map((m) => {
                    const other = decidedPairs.find((x) => x.member.masterId === m.masterId);
                    return { ...m, decision: other ? other.decision : null };
                }), byFp, trialsById);
                peerEntriesById.set(dp.member.masterId, entries);
            }
            const withDecisions = decidedPairs.map((dp) => attachEvidence(
                dp.member,
                { groupId: g.groupId, label: g.label, confidence: g.confidence, evidence: g.evidence },
                peerEntriesById.get(dp.member.masterId) || [],
                dp.decision
            ));
            const keep = withDecisions.filter((m) => m.decision.decision === 'KEEP').length;
            const review = withDecisions.filter((m) => m.decision.decision === 'REVIEW').length;
            const retire = withDecisions.filter((m) => m.decision.decision === 'RETIRE').length;
            const tested = withDecisions.filter((m) => {
                const t = trialsById[String(m.masterId)];
                return Boolean(t && Array.isArray(t.reachabilityTrials) && t.reachabilityTrials.length > 0);
            }).length;
            return {
                groupId: g.groupId,
                label: g.label,
                confidence: g.confidence,
                averageScore: g.averageScore,
                evidence: g.evidence,
                memberCount: withDecisions.length,
                testedCount: tested,
                keepCount: keep,
                reviewCount: review,
                retireCount: retire,
                strongestEvidence: g.evidence.slice(0, 3),
                limitations: withDecisions.some((m) => m.evidenceStatus !== 'EVALUATED')
                    ? ['some members lack evaluation evidence; decisions for them are REVIEW by default']
                    : [],
                members: withDecisions
            };
        });

        const unclassifiedDecisions = unclassified.map((u) => {
            const rec = byId.get(u.masterId);
            if (!rec) {
                return { masterId: u.masterId, userId: u.userId, firmId: u.firmId, decision: { decision: 'REVIEW', confidence: 'LOW', reason: `ID ${u.masterId}: ${u.reason || 'unclassified'}`, evidence: [], codes: ['UNCLASSIFIED'] } };
            }
            const member = enrichFunctionalMember(rec, evaluationsById, monitoringByAgent, req);
            const decided = AgentFunctionalDecider.decideForMember({
                member,
                fingerprint: byFp.get(member.masterId),
                evaluation: evaluationsById[String(member.masterId)] || null,
                trials: trialsById[String(member.masterId)] || null,
                peers: []
            });
            return attachEvidence(member, null, [], decided);
        });

        const allDecided = [
            ...reportGroups.flatMap((g) => g.members),
            ...unclassifiedDecisions
        ];
        const count = (d) => allDecided.filter((m) => m.decision && m.decision.decision === d).length;
        const evaluatedRecords = records.filter((r) => evaluationsById[String(r.masterId)]);
        const typeCount = (t) => evaluatedRecords.filter((r) => {
            const ev = evaluationsById[String(r.masterId)];
            return ev && ev.agentType === t;
        }).length;
        const testedRecords = new Set([
            ...Object.keys(trialsById).map(Number),
            ...evaluatedRecords.map((r) => r.masterId)
        ]);
        const flatRecords = allDecided
            .slice()
            .sort((a, b) => (a.masterId || 0) - (b.masterId || 0));

        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            summary: {
                totalRecords: records.length,
                testableUrls: records.filter((r) => r.externallyTestable).length,
                nonTestableRecords: records.filter((r) => !r.externallyTestable).length,
                agentCount: typeCount('AGENT'),
                webAppCount: typeCount('WEB APP'),
                unknownCount: typeCount('UNKNOWN'),
                functionalGroups: reportGroups.length,
                evaluatedRecords: evaluatedRecords.length,
                trialRecords: Object.keys(trialsById).length,
                functionallyTestedRecords: testedRecords.size,
                keepCount: count('KEEP'),
                reviewCount: count('REVIEW'),
                retireCount: count('RETIRE')
            },
            records: flatRecords,
            groups: reportGroups.map((g) => ({
                groupId: g.groupId,
                label: g.label,
                confidence: g.confidence,
                memberCount: g.memberCount,
                testedCount: g.testedCount,
                keepCount: g.keepCount,
                reviewCount: g.reviewCount,
                retireCount: g.retireCount,
                strongestEvidence: g.strongestEvidence,
                limitations: g.limitations,
                members: g.members
            })),
            unclassified: unclassifiedDecisions,
            unclassifiedCount: unclassifiedDecisions.length,
            functionalExecutionStatus: 'FUNCTIONAL_EXECUTION_NOT_YET_EVALUATED',
            executionDisclaimer: 'Decisions are recommendations only. Nothing was deleted, retired, or modified. Task-execution evidence exists only where controlled trials actually ran.'
        });
    } catch (err) {
        const mapped = toMasterError(err, 'FUNCTIONAL_REPORT_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

// 13. GET /api/v1/registry/master/:id/full-report — ONE real record with
// all available evidence (identity, classification, evaluation, trials,
// monitoring, group, peers, decision, recommendation). Reuses the existing
// registry/evaluation/monitoring/decision stores. 404 when the primary ID
// does not exist. Read-only: no probing, no writes.
router.get(['/api/v1/registry/master/:id/full-report', '/api/registry/master/:id/full-report'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
    try {
        const source = getMasterSource(req);
        const record = await source.getRecordById(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, error: { message: `Agent Master record '${req.params.id}' not found`, code: 'MASTER_RECORD_NOT_FOUND' } });
        }
        const { records, evaluationsById, monitoringByAgent } = await assembleFunctionalInputs(req);
        const trialsById = await loadTrialsMap(req);
        const profiler = AgentFunctionalProfiler;
        const fps = records.map((r) => profiler.fingerprintRecord(r, evaluationsById[String(r.masterId)] || null));
        const { groups } = profiler.groupFingerprints(fps);
        const byId = new Map(records.map((r) => [r.masterId, r]));
        const byFp = new Map(fps.map((f) => [f.masterId, f]));

        const member = enrichFunctionalMember(record, evaluationsById, monitoringByAgent, req);
        const evaluation = evaluationsById[String(record.masterId)] || null;
        const trials = trialsById[String(record.masterId)] || null;

        const hostGroup = groups.find((g) => g.memberIds.includes(record.masterId)) || null;
        const groupMembers = hostGroup
            ? hostGroup.memberIds.map((id) => byId.get(id)).filter(Boolean)
                .map((rec) => enrichFunctionalMember(rec, evaluationsById, monitoringByAgent, req))
            : [];
        const decidedPeers = groupMembers.map((m) => {
            const d = AgentFunctionalDecider.decideForMember({
                member: m,
                fingerprint: byFp.get(m.masterId),
                evaluation: evaluationsById[String(m.masterId)] || null,
                trials: trialsById[String(m.masterId)] || null,
                peers: []
            });
            return { ...m, decision: d };
        });
        const peerEntries = buildPeerEntries(member, decidedPeers, byFp, trialsById);
        const equivPeers = peerEntries.filter((p) => p && (p.relation === 'FUNCTIONALLY_SIMILAR' || p.relation === 'POTENTIAL_DUPLICATE'));
        const decision = AgentFunctionalDecider.decideForMember({
            member,
            fingerprint: byFp.get(member.masterId),
            evaluation,
            trials,
            peers: peerEntries.map((p) => ({
                masterId: p.masterId,
                relation: p.relation,
                score: p.score,
                healthy: p.healthy,
                capsAvailable: p.capsAvailable,
                openIncident: p.openIncident,
                taskTrials: p.taskTrials,
                taskSuccessRate: p.taskSuccessRate,
                health: p.health
            }))
        });
        const full = attachEvidenceFor(
            member,
            hostGroup ? { groupId: hostGroup.groupId, label: hostGroup.label, confidence: hostGroup.confidence, evidence: hostGroup.evidence } : null,
            peerEntries,
            decision,
            evaluationsById,
            trialsById
        );
        const classificationEvidence = (evaluation && Array.isArray(evaluation.evidence) && evaluation.evidence.length > 0)
            ? evaluation.evidence
            : (record.kindEvidence || []);

        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            data: {
                ...full,
                classification: {
                    agentType: (evaluation && evaluation.agentType) || 'NOT_EVALUATED',
                    evidence: classificationEvidence,
                    why: (evaluation && evaluation.agentType && evaluation.agentType !== 'UNKNOWN')
                        ? `Classified as ${evaluation.agentType} from observed interface evidence at the stored PUBLIC_URL.`
                        : 'No agent execution interface was observed at the stored PUBLIC_URL, so the record is not classified as an AGENT from the available evidence.'
                },
                evaluation: evaluation ? {
                    evaluatedAt: evaluation.evaluatedAt || null,
                    agentType: evaluation.agentType || null,
                    reachability: evaluation.reachability || null,
                    runtimeHealth: evaluation.runtimeHealth || null,
                    capabilityStatus: evaluation.capabilityStatus || null,
                    capabilities: Array.isArray(evaluation.capabilities) ? evaluation.capabilities.slice(0, 20) : [],
                    evidence: Array.isArray(evaluation.evidence) ? evaluation.evidence.slice(0, 10) : []
                } : null,
                trials: trials ? {
                    testedAt: trials.testedAt || null,
                    reachabilityTrials: Array.isArray(trials.reachabilityTrials) ? trials.reachabilityTrials.slice(0, 5) : [],
                    reachabilitySummary: trials.reachabilitySummary || null,
                    consistency: trials.consistency || null,
                    taskAssessment: trials.taskAssessment || null,
                    taskTrials: Array.isArray(trials.taskTrials) ? trials.taskTrials.slice(0, 10) : [],
                    qualityEvidence: trials.qualityEvidence || 'QUALITY_EVIDENCE_LIMITED'
                } : null,
                similarAgents: equivPeers.map((p) => ({
                    masterId: p.masterId,
                    agentName: p.agentName,
                    relation: p.relation,
                    score: p.score,
                    reasons: (p.reasons || []).slice(0, 3),
                    health: p.health,
                    decision: p.decision
                })),
                similarReason: hostGroup
                    ? `Group '${hostGroup.label}' (${hostGroup.confidence} confidence): ${(hostGroup.evidence || []).slice(0, 2).join(' · ')}`
                    : 'No sufficiently supported functional peer group identified.'
            }
        });
    } catch (err) {
        const mapped = toMasterError(err, 'MASTER_FULL_REPORT_FAILED');
        res.status(mapped.status).json(mapped.body);
    }
});

module.exports = router;
