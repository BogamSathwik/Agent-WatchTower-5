/**
 * Phase 35 — Improvement Outcome Tracker
 * Records observed outcomes AFTER an approved improvement is implemented
 * externally or through an existing supported system. Post-change evidence
 * is computed live from stores (incidents after implementation, current
 * warnings, response effectiveness since) — never asserted by the operator.
 * Outcomes: IMPROVED / NO_MEASURABLE_CHANGE / DEGRADED / PARTIALLY_IMPROVED /
 *           INSUFFICIENT_DATA / NOT_IMPLEMENTED. No improvement is claimed
 *           without post-change evidence.
 */

const IMPROVEMENT_OUTCOMES = Object.freeze({
    IMPROVED: 'IMPROVED',
    NO_MEASURABLE_CHANGE: 'NO_MEASURABLE_CHANGE',
    DEGRADED: 'DEGRADED',
    PARTIALLY_IMPROVED: 'PARTIALLY_IMPROVED',
    INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
    NOT_IMPLEMENTED: 'NOT_IMPLEMENTED'
});

class ImprovementOutcomeTracker {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.earlyWarningService = options.earlyWarningService || options.earlyWarningCenterService || null;
        this.adaptiveService = options.adaptiveService || options.adaptiveResponseService || null;
        this.governanceService = options.governanceService || null;
    }

    _store() {
        return this.monitoringService ? this.monitoringService.store : null;
    }

    /**
     * Record an outcome by observing post-change evidence.
     * Requires IMPLEMENTATION_TRACKING status and an implementation reference.
     */
    recordOutcome(proposal, { actor = 'operator', tenantId = null, note = '' } = {}) {
        const tid = tenantId || proposal.tenantId;
        if (proposal.status !== 'IMPLEMENTATION_TRACKING') {
            const err = new Error(`Outcome recording requires IMPLEMENTATION_TRACKING status (current: ${proposal.status}).`);
            err.statusCode = 409;
            throw err;
        }
        if (!proposal.implementationRef) {
            const err = new Error('An implementation reference is required before an outcome can be recorded (NOT_IMPLEMENTED otherwise).');
            err.statusCode = 409;
            throw err;
        }

        const baseline = this._baselineSnapshot(proposal);
        const postChange = this._postChangeSnapshot(proposal, tid);
        const outcome = this._compareSnapshots(baseline, postChange);

        proposal.outcome = {
            ...outcome,
            implementationRef: proposal.implementationRef,
            implementationNote: String(note || '').slice(0, 500),
            recordedBy: actor,
            recordedAt: new Date().toISOString()
        };
        proposal.implementationStatus = 'OBSERVED';
        proposal.updatedAt = new Date().toISOString();

        const entries = [];
        if (this.governanceService) {
            entries.push(this.governanceService.transition(proposal, 'OBSERVATION', { actor, reason: 'Post-change evidence observed.', tenantId: tid }));
            if (['IMPROVED', 'PARTIALLY_IMPROVED', 'NO_MEASURABLE_CHANGE', 'DEGRADED'].includes(outcome.outcomeState)) {
                entries.push(this.governanceService.transition(proposal, 'COMPLETED', { actor, reason: `Outcome observed: ${outcome.outcomeState}.`, tenantId: tid }));
            }
        }
        return { outcome: proposal.outcome, transitions: entries };
    }

    _baselineSnapshot(proposal) {
        const ev = proposal.evidence || {};
        const all = [].concat(ev.observed || [], ev.confirmed || [], ev.inferred || []);
        const incidentRefs = all.filter(e => e.kind === 'INCIDENT' || /incident/i.test(e.summary || '')).length;
        return {
            incidentRefs,
            evidenceStrength: ev.evidenceStrength || 'UNKNOWN',
            capturedAtProposal: proposal.createdAt
        };
    }

    _postChangeSnapshot(proposal, tenantId) {
        const agentId = proposal.agentId;
        const store = this._store();
        let incidentsAfter = null;
        let activeWarnings = null;
        if (store && typeof store.listIncidents === 'function') {
            try {
                const all = store.listIncidents(tenantId, agentId || null) || [];
                // Incidents recorded after implementation tracking began.
                const implStart = proposal.implementationStartedAt || proposal.updatedAt;
                incidentsAfter = all.filter(i => {
                    const ts = i.startedAt || i.detectedAt || i.createdAt;
                    if (!ts || !implStart) return false;
                    return new Date(ts) >= new Date(implStart);
                }).length;
            } catch (e) { incidentsAfter = null; }
        }
        if (this.earlyWarningService && agentId) {
            try {
                const w = this.earlyWarningService.getWarnings({ tenantId, agentId });
                activeWarnings = (w.warnings || []).filter(x => x.status === 'ACTIVE').length;
            } catch (e) { activeWarnings = null; }
        }
        let effectivenessSince = null;
        if (this.adaptiveService && typeof this.adaptiveService.getEffectiveness === 'function') {
            try {
                const eff = this.adaptiveService.getEffectiveness({ tenantId, agentId: agentId || null });
                effectivenessSince = eff ? eff.totalRecords : null;
            } catch (e) { effectivenessSince = null; }
        }
        return { incidentsAfter, activeWarnings, effectivenessSince, observedAt: new Date().toISOString() };
    }

    _compareSnapshots(baseline, postChange) {
        const before = baseline.incidentRefs;
        const after = postChange.incidentsAfter;
        const common = {
            baseline,
            postChange,
            evidenceQuality: after == null ? 'INSUFFICIENT_DATA' : 'OBSERVED',
            remainingUncertainty: 'Outcome reflects recorded post-change evidence only; external factors are not controlled for.'
        };
        if (after == null) {
            return { outcomeState: IMPROVEMENT_OUTCOMES.INSUFFICIENT_DATA, observedDifference: 'Post-change incident evidence unavailable; no outcome can be claimed.', ...common };
        }
        if (before === 0 && after === 0) {
            return { outcomeState: IMPROVEMENT_OUTCOMES.INSUFFICIENT_DATA, observedDifference: 'No incidents before or after; nothing measurable to compare.', ...common };
        }
        if (before > 0 && after === 0) {
            return { outcomeState: IMPROVEMENT_OUTCOMES.IMPROVED, observedDifference: `Incidents went from ${before} referenced before the change to 0 recorded after (observed).`, ...common };
        }
        if (after < before) {
            return { outcomeState: IMPROVEMENT_OUTCOMES.PARTIALLY_IMPROVED, observedDifference: `Incidents went from ${before} referenced before the change to ${after} recorded after (observed).`, ...common };
        }
        if (after === before) {
            return { outcomeState: IMPROVEMENT_OUTCOMES.NO_MEASURABLE_CHANGE, observedDifference: `Incident count unchanged at ${after} (observed).`, ...common };
        }
        return { outcomeState: IMPROVEMENT_OUTCOMES.DEGRADED, observedDifference: `Incidents went from ${before} referenced before the change to ${after} recorded after (observed).`, ...common };
    }
}

module.exports = { ImprovementOutcomeTracker, IMPROVEMENT_OUTCOMES };
