/**
 * Phase 34 — Response Effectiveness Tracker
 * Tracks historical response outcomes by response type, agent, problem and
 * incident type, dependency context, verification outcome, and recovery
 * state. Factual summaries only: counts, observed outcomes, durations from
 * actual timestamps, and evidence references. No arbitrary success scores.
 */

class ResponseEffectivenessTracker {
    constructor() {
        this.records = []; // { responseType, agentId, problemType, incidentType, dependencyScope, verificationState, recovered, durationSeconds, planId, tenantId, recordedAt }
    }

    trackRecord({ responseType, agentId, problemType = null, incidentType = null, dependencyScope = null, verificationState, durationSeconds = null, planId = null, tenantId = 'default-tenant' } = {}) {
        const rec = {
            responseType: responseType || 'UNKNOWN',
            agentId: agentId || null,
            problemType,
            incidentType,
            dependencyScope,
            verificationState: verificationState || 'INSUFFICIENT_DATA',
            recovered: verificationState === 'VERIFIED_RECOVERED',
            durationSeconds,
            planId,
            tenantId,
            recordedAt: new Date().toISOString()
        };
        this.records.push(rec);
        return rec;
    }

    /**
     * Factual historical summary grouped by response type (counts only).
     */
    getEffectiveness({ tenantId = 'default-tenant', responseType = null, agentId = null } = {}) {
        let list = this.records.filter(r => r.tenantId === tenantId || tenantId === 'all');
        if (responseType) list = list.filter(r => r.responseType === responseType);
        if (agentId) list = list.filter(r => r.agentId === agentId);

        const byType = {};
        for (const r of list) {
            if (!byType[r.responseType]) {
                byType[r.responseType] = {
                    responseType: r.responseType,
                    totalCount: 0,
                    verifiedRecoveredCount: 0,
                    improvedCount: 0,
                    unchangedOrFailedCount: 0,
                    unsupportedCount: 0,
                    insufficientDataCount: 0,
                    durationsSeconds: [],
                    agents: [],
                    planRefs: []
                };
            }
            const g = byType[r.responseType];
            g.totalCount += 1;
            if (r.verificationState === 'VERIFIED_RECOVERED') g.verifiedRecoveredCount += 1;
            else if (['VERIFIED_IMPROVED', 'PARTIALLY_IMPROVED'].includes(r.verificationState)) g.improvedCount += 1;
            else if (['UNCHANGED', 'FAILED', 'DEGRADED'].includes(r.verificationState)) g.unchangedOrFailedCount += 1;
            else if (r.verificationState === 'UNSUPPORTED') g.unsupportedCount += 1;
            else g.insufficientDataCount += 1;
            if (typeof r.durationSeconds === 'number') g.durationsSeconds.push(r.durationSeconds);
            if (r.agentId && !g.agents.includes(r.agentId)) g.agents.push(r.agentId);
            if (r.planId) g.planRefs.push(r.planId);
        }

        return {
            tenantId,
            totalRecords: list.length,
            byResponseType: Object.values(byType).map(g => ({
                ...g,
                observedRecoveryRate: null, // deliberately not computed as a score; counts above are the facts
                averageDurationSeconds: g.durationsSeconds.length > 0
                    ? Math.round((g.durationsSeconds.reduce((a, b) => a + b, 0) / g.durationsSeconds.length) * 10) / 10
                    : null,
                note: 'Counts and observed durations only; no success scores are assigned.'
            }))
        };
    }

    /**
     * Additive feed for Fleet Intelligence consumers: outcome patterns,
     * recurring unsuccessful responses, recovery durations, dependency scope.
     */
    getOutcomePatterns({ tenantId = 'default-tenant' } = {}) {
        const list = this.records.filter(r => r.tenantId === tenantId);
        const unsuccessful = list.filter(r => ['UNCHANGED', 'FAILED', 'DEGRADED'].includes(r.verificationState));
        const unsuccessfulByType = {};
        for (const r of unsuccessful) {
            unsuccessfulByType[r.responseType] = (unsuccessfulByType[r.responseType] || 0) + 1;
        }
        const recurringUnsuccessful = Object.entries(unsuccessfulByType)
            .filter(([, n]) => n >= 2)
            .map(([responseType, count]) => ({ responseType, occurrences: count, classification: 'OBSERVED' }));
        const durations = list.filter(r => typeof r.durationSeconds === 'number').map(r => r.durationSeconds);
        return {
            tenantId,
            totalOutcomes: list.length,
            recurringUnsuccessfulResponses: recurringUnsuccessful,
            recoveryDurationEvidence: {
                samples: durations.length,
                averageSeconds: durations.length > 0 ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null,
                classification: durations.length > 0 ? 'OBSERVED' : 'INSUFFICIENT_DATA'
            },
            affectedDependencyScopes: [...new Set(list.map(r => r.dependencyScope).filter(Boolean))],
            classification: 'OBSERVED'
        };
    }
}

module.exports = { ResponseEffectivenessTracker };
