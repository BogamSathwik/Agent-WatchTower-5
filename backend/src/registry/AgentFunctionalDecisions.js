/**
 * Agent Functional Decisions — evidence-based KEEP / REVIEW / RETIRE
 * recommendations for AGENT_MASTER_REGISTRY records.
 *
 * HARD CONSTRAINTS:
 * - Recommendations ONLY, never actions. No deletion, no retirement writes,
 *   no master-table modifications of any kind.
 * - Insufficient evidence ==> REVIEW, never automatic retirement. A single
 *   failed test, an older date, no backend, WEB APP type, unexposed
 *   capabilities, unavailable execution, or a temporarily unreachable URL
 *   NEVER produce RETIRE on their own.
 * - RETIRE needs strong converging evidence: repeated failures AND a
 *   stronger functionally equivalent peer (or clear redundancy), spelled out
 *   with trial counts and peer IDs.
 * - KEEP needs adequacy + reliability + no clearly stronger equivalent,
 *   spelled out with observed numbers. Reachability alone is never enough.
 * - Every decision carries a human-readable reason citing actual evidence.
 * - Identity (masterId/userId/firmId) is preserved on every output.
 */

const { AgentFunctionalProfiler, RELATIONS } = require('./AgentFunctionalProfiler');
const { AgentFunctionalTester } = require('./AgentFunctionalTesting');

const DECISIONS = Object.freeze({
    KEEP: 'KEEP',
    REVIEW: 'REVIEW',
    RETIRE: 'RETIRE'
});

const CONFIDENCE = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });

function isOpenIncident(incident) {
    if (!incident) return false;
    const s = String(incident.status || incident.state || '').toUpperCase();
    return ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(s);
}

// Normalize reachability-trial evidence from stored trials, falling back to
// a single observation derived from a stored evaluation probe (explicitly
// labeled as a single observation, never as repeated evidence).
function reachabilityEvidence(trials, evaluation) {
    if (trials && Array.isArray(trials.reachabilityTrials) && trials.reachabilityTrials.length > 0) {
        const list = trials.reachabilityTrials;
        const failed = list.filter((t) => !t.successful).length;
        return {
            count: list.length,
            failed,
            allFailed: failed === list.length,
            allSuccessful: failed === 0,
            repeated: list.length >= 3,
            source: 'CONTROLLED_TRIALS'
        };
    }
    if (evaluation && evaluation.reachability) {
        const r = evaluation.reachability;
        return {
            count: 1,
            failed: r.reachable && (r.httpStatus >= 200 && r.httpStatus < 300) ? 0 : 1,
            allFailed: !(r.reachable && r.httpStatus >= 200 && r.httpStatus < 300),
            allSuccessful: Boolean(r.reachable && r.httpStatus >= 200 && r.httpStatus < 300),
            repeated: false,
            source: 'SINGLE_EVALUATION_PROBE'
        };
    }
    return { count: 0, failed: 0, allFailed: false, allSuccessful: false, repeated: false, source: 'NONE' };
}

function taskEvidence(trials) {
    if (trials && Array.isArray(trials.taskTrials) && trials.taskTrials.length > 0) {
        const list = trials.taskTrials;
        const successful = list.filter((t) => t.successful).length;
        return {
            count: list.length,
            successful,
            successRate: list.length > 0 ? Math.round((successful / list.length) * 1000) / 10 : 0,
            repeated: list.length >= 3
        };
    }
    return { count: 0, successful: 0, successRate: 0, repeated: false };
}

function peerIsStrongerEquivalent(peer, selfHealthy) {
    // A peer is "clearly stronger" only with hard observed advantages.
    const p = peer || {};
    if (p.taskSuccessRate !== null && p.taskSuccessRate !== undefined && p.taskTrials >= 3 && p.taskSuccessRate >= 80) return true;
    if (p.healthy && p.capsAvailable && !p.openIncident && !selfHealthy) return true;
    return false;
}

/**
 * Decide for one member. Input: { member, fingerprint, evaluation, trials,
 * monitoring, incident, peers[] } where peers = [{ member, relation, score }].
 * Returns { decision, confidence, reason, evidence[], codes[] }.
 */
function decideForMember(input) {
    const member = input.member || {};
    const evaluation = input.evaluation || null;
    const trials = input.trials || null;
    const peers = Array.isArray(input.peers) ? input.peers : [];
    const evidence = [];
    const codes = [];

    const masterId = member.masterId;
    const idLabel = `ID ${masterId} (USERID ${member.userId}, FIRMID ${member.firmId})`;

    // 1. Non-candidate rows are never decisioned beyond review.
    if (member.recordKind && member.recordKind !== 'CANDIDATE_AGENT') {
        return {
            decision: DECISIONS.REVIEW,
            confidence: CONFIDENCE.LOW,
            reason: `${idLabel} is a ${member.recordKind}, not a runnable agent candidate; no functional decision applies.`,
            evidence: [`record kind ${member.recordKind}`],
            codes: ['NON_CANDIDATE_RECORD']
        };
    }

    // 2. Testability gate.
    const testable = Boolean(member.testable !== undefined ? member.testable : (evaluation ? evaluation.externallyTestable : null));
    const testabilityReason = member.testabilityReason || (evaluation ? evaluation.testabilityReason : null) || 'NOT_EVALUATED';
    if (!evaluation) {
        return {
            decision: DECISIONS.REVIEW,
            confidence: CONFIDENCE.LOW,
            reason: `${idLabel} has not been evaluated yet; run a public-URL evaluation before any functional comparison.`,
            evidence: ['no stored evaluation'],
            codes: ['NOT_EVALUATED', 'FUNCTIONAL_TEST_NOT_POSSIBLE']
        };
    }
    if (!testable) {
        codes.push('FUNCTIONAL_TEST_NOT_POSSIBLE');
        return {
            decision: DECISIONS.REVIEW,
            confidence: CONFIDENCE.LOW,
            reason: `${idLabel} cannot be functionally tested (${testabilityReason}); the stored PUBLIC_URL was preserved verbatim and no substitute endpoint was invented.`,
            evidence: [`testability: ${testabilityReason}`, `record kind ${member.recordKind || 'unknown'}`],
            codes
        };
    }

    const reach = reachabilityEvidence(trials, evaluation);
    const task = taskEvidence(trials);
    const tracked = Boolean(member.monitoring && member.monitoring.tracked);
    const availability = (member.monitoring && member.monitoring.availabilityPercentage !== undefined)
        ? member.monitoring.availabilityPercentage
        : (member.availabilityPercentage !== undefined ? member.availabilityPercentage : null);
    const totalChecks = (member.monitoring && member.monitoring.totalChecksCount !== undefined)
        ? member.monitoring.totalChecksCount
        : (member.totalChecksCount !== undefined ? member.totalChecksCount : 0);
    const openIncident = isOpenIncident(member.incident);
    const healthy = String(member.health || '').toUpperCase() === 'HEALTHY';
    const execAssessment = (trials && trials.taskAssessment)
        ? trials.taskAssessment
        : AgentFunctionalTester.assessExecutability({ record: member, evaluation });

    evidence.push(`reachability observations: ${reach.count} (${reach.source})`);
    if (execAssessment && !execAssessment.executable) {
        evidence.push(`task interface: ${execAssessment.code}`);
        codes.push(execAssessment.code);
    }

    // Peer context: only same-group functionally-equivalent relations count.
    const equivPeers = peers.filter((p) => p && (p.relation === RELATIONS.FUNCTIONALLY_SIMILAR || p.relation === RELATIONS.POTENTIAL_DUPLICATE));
    const selfProfile = {
        healthy,
        capsAvailable: Boolean(member.capabilities && member.capabilities.length > 0),
        openIncident,
        taskSuccessRate: task.count >= 3 ? task.successRate : null,
        taskTrials: task.count
    };
    const strongerPeers = equivPeers.filter((p) => peerIsStrongerEquivalent({
        healthy: Boolean(p.healthy),
        capsAvailable: Boolean(p.capsAvailable),
        openIncident: Boolean(p.openIncident),
        taskSuccessRate: (p.taskTrials >= 3 ? p.taskSuccessRate : null),
        taskTrials: p.taskTrials || 0
    }, healthy));
    const duplicatePeers = peers.filter((p) => p && p.relation === RELATIONS.POTENTIAL_DUPLICATE);

    // 3. Task-execution evidence path.
    if (task.count >= 3) {
        if (task.successRate >= 80) {
            const inferiorTo = strongerPeers.filter((p) => (p.taskTrials >= 3 && (p.taskSuccessRate || 0) > task.successRate + 20));
            if (inferiorTo.length === 0) {
                return {
                    decision: DECISIONS.KEEP,
                    confidence: task.successRate >= 90 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
                    reason: `${idLabel} completed ${task.successful}/${task.count} controlled task trials (${task.successRate}% success) with consistent valid output and no clearly stronger equivalent in its functional group.`,
                    evidence: [...evidence, `task trials ${task.successful}/${task.count}`, `task success rate ${task.successRate}%`],
                    codes: [...codes, 'TASK_SUCCESS_OBSERVED']
                };
            }
            return {
                decision: DECISIONS.REVIEW,
                confidence: CONFIDENCE.MEDIUM,
                reason: `${idLabel} completed ${task.successful}/${task.count} task trials, but ID ${inferiorTo[0].masterId} shows stronger task evidence; human review should compare them before any decision.`,
                evidence: [...evidence, `stronger peer ID ${inferiorTo[0].masterId}`],
                codes: [...codes, 'STRONGER_ALTERNATIVE']
            };
        }
        if (task.successful === 0 && strongerPeers.length > 0) {
            return {
                decision: DECISIONS.RETIRE,
                confidence: CONFIDENCE.HIGH,
                reason: `${idLabel} failed all ${task.count} controlled task trials while functionally equivalent ID ${strongerPeers[0].masterId} demonstrates task success; redundant with a stronger equivalent and no unique capability observed.`,
                evidence: [...evidence, `task trials 0/${task.count}`, `stronger peer ID ${strongerPeers[0].masterId}`],
                codes: [...codes, 'REPEATED_TASK_FAILURE', 'STRONGER_EQUIVALENT']
            };
        }
    }

    // 4. Repeated reachability-failure path (never a single observation).
    const stableFailing = tracked && totalChecks >= 5 && availability !== null && availability < 20;
    if ((reach.count >= 3 && reach.allFailed) || stableFailing) {
        const trialNote = reach.count >= 3
            ? `${reach.count}/${reach.count} reachability trials failed`
            : `monitored availability ${availability}% over ${totalChecks} checks`;
        if (strongerPeers.length > 0 && strongerPeers.some((p) => p.healthy)) {
            const peer = strongerPeers.find((p) => p.healthy);
            return {
                decision: DECISIONS.RETIRE,
                confidence: CONFIDENCE.MEDIUM,
                reason: `${idLabel}: ${trialNote}, while functionally equivalent ID ${peer.masterId} is reachable and healthy; redundant with a stronger equivalent and no unique capability observed.`,
                evidence: [...evidence, trialNote, `stronger peer ID ${peer.masterId} (${peer.health || 'healthy'})`],
                codes: [...codes, 'REPEATED_FAILURE', 'STRONGER_EQUIVALENT']
            };
        }
        return {
            decision: DECISIONS.REVIEW,
            confidence: CONFIDENCE.LOW,
            reason: `${idLabel}: ${trialNote}, but no stronger functionally equivalent peer with sufficient evidence was found; repeated failure alone is not enough to retire without a replacement.`,
            evidence: [...evidence, trialNote],
            codes: [...codes, 'REPEATED_FAILURE', 'NO_STRONGER_EQUIVALENT']
        };
    }

    // 5. Stable-healthy path (KEEP needs sustained reliability, not one probe).
    const stableHealthy = Boolean(
        evaluation && evaluation.reachability && evaluation.reachability.reachable &&
        evaluation.runtimeHealth && evaluation.runtimeHealth.state === 'HEALTHY' &&
        tracked && totalChecks >= 10 && availability !== null && availability >= 95 && !openIncident
    );
    if (stableHealthy) {
        const clearlyInferior = duplicatePeers.some((p) => peerIsStrongerEquivalent({
            healthy: Boolean(p.healthy),
            capsAvailable: Boolean(p.capsAvailable),
            openIncident: Boolean(p.openIncident),
            taskSuccessRate: (p.taskTrials >= 3 ? p.taskSuccessRate : null),
            taskTrials: p.taskTrials || 0
        }, true));
        if (!clearlyInferior) {
            return {
                decision: DECISIONS.KEEP,
                confidence: CONFIDENCE.MEDIUM,
                reason: `${idLabel} is reachable and runtime-healthy with sustained monitored reliability (${availability}% availability over ${totalChecks} checks, no open incidents) and no clearly stronger equivalent in its functional group.`,
                evidence: [...evidence, `availability ${availability}% over ${totalChecks} checks`, 'no open incidents', 'no clearly stronger equivalent'],
                codes: [...codes, 'STABLE_HEALTHY_OBSERVED']
            };
        }
        return {
            decision: DECISIONS.REVIEW,
            confidence: CONFIDENCE.MEDIUM,
            reason: `${idLabel} is stable and healthy, but a near-identical peer shows stronger observed evidence; keep-vs-redundancy needs human review.`,
            evidence: [...evidence, 'possible stronger near-identical peer'],
            codes: [...codes, 'STRONGER_ALTERNATIVE']
        };
    }

    // 6. Default: REVIEW with the most specific honest reason available.
    if (reach.count === 1) {
        codes.push('SINGLE_OBSERVATION');
        return {
            decision: DECISIONS.REVIEW,
            confidence: CONFIDENCE.LOW,
            reason: `${idLabel} has only a single reachability observation (${reach.allSuccessful ? 'reachable' : 'unreachable'}); repeated trials are needed before any functional conclusion. A single test never retires a record.`,
            evidence: [...evidence, 'single observation only'],
            codes
        };
    }
    if (!execAssessment.executable) {
        return {
            decision: DECISIONS.REVIEW,
            confidence: CONFIDENCE.LOW,
            reason: `${idLabel} is publicly reachable but exposes no safe task execution interface (${execAssessment.code}), so functional superiority cannot be established; human review required.`,
            evidence: [...evidence, execAssessment.reason || execAssessment.code],
            codes
        };
    }
    if (openIncident) {
        return {
            decision: DECISIONS.REVIEW,
            confidence: CONFIDENCE.LOW,
            reason: `${idLabel} has an open incident${member.incident && member.incident.id ? ` (${member.incident.id})` : ''}; reliability is uncertain until it resolves.`,
            evidence: [...evidence, 'open incident present'],
            codes: [...codes, 'OPEN_INCIDENT']
        };
    }
    return {
        decision: DECISIONS.REVIEW,
        confidence: CONFIDENCE.LOW,
        reason: `${idLabel} has insufficient converging evidence for a KEEP or RETIRE recommendation; human review required.`,
        evidence: [...evidence, 'insufficient converging evidence'],
        codes: [...codes, 'INSUFFICIENT_EVIDENCE']
    };
}

module.exports = {
    AgentFunctionalDecider: { decideForMember },
    DECISIONS,
    CONFIDENCE
};
