/**
 * Phase 35 — Improvement Opportunity Engine
 * Detects improvement opportunities ONLY from actual recorded evidence
 * across adaptive learning, fleet patterns, warnings, incidents, and
 * verification gaps. Deterministic IDs. Never manufactures opportunities;
 * returns an empty list (with INSUFFICIENT_DATA gaps) when evidence is thin.
 */

const OPPORTUNITY_TYPES = Object.freeze({
    RECURRING_FAILURE_PATTERN: 'RECURRING_FAILURE_PATTERN',
    REPEATED_RESPONSE_FAILURE: 'REPEATED_RESPONSE_FAILURE',
    RECOVERY_DURATION_PATTERN: 'RECOVERY_DURATION_PATTERN',
    DEPENDENCY_RELIABILITY_PATTERN: 'DEPENDENCY_RELIABILITY_PATTERN',
    REPEATED_WARNING_PATTERN: 'REPEATED_WARNING_PATTERN',
    VERIFICATION_GAP: 'VERIFICATION_GAP',
    OBSERVABILITY_GAP: 'OBSERVABILITY_GAP',
    UNSUPPORTED_CAPABILITY_GAP: 'UNSUPPORTED_CAPABILITY_GAP',
    RESPONSE_PROCESS_GAP: 'RESPONSE_PROCESS_GAP',
    POLICY_REVIEW_OPPORTUNITY: 'POLICY_REVIEW_OPPORTUNITY'
});

function sanitize(str) {
    return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

class ImprovementOpportunityEngine {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.adaptiveService = options.adaptiveService || options.adaptiveResponseService || null;
        this.fleetService = options.fleetService || options.fleetIntelligenceService || null;
        this.earlyWarningService = options.earlyWarningService || options.earlyWarningCenterService || null;
        this.riskEngine = options.riskEngine || options.predictiveRiskEngine || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
    }

    _store() {
        return this.monitoringService ? this.monitoringService.store : null;
    }

    /**
     * Detect opportunities for a tenant. Deterministic; read-only.
     * @returns {{ opportunities: Array, gaps: Array }}
     */
    detectOpportunities({ tenantId = 'default-tenant', range = '24h' } = {}) {
        const opportunities = [];
        const gaps = [];
        const push = (opp) => opportunities.push({
            opportunityId: `opp_${opp.type}_${sanitize(opp.agentId || 'fleet')}`,
            tenantId,
            detectedAt: new Date().toISOString(),
            status: 'OPEN',
            ...opp
        });

        // 1. Repeated response failures (adaptive effectiveness, counts >= 2).
        try {
            const patterns = this.adaptiveService && typeof this.adaptiveService.getOutcomePatterns === 'function'
                ? this.adaptiveService.getOutcomePatterns({ tenantId }) : null;
            for (const r of ((patterns && patterns.recurringUnsuccessfulResponses) || [])) {
                push({
                    type: OPPORTUNITY_TYPES.REPEATED_RESPONSE_FAILURE,
                    agentId: null,
                    title: `Response '${r.responseType}' repeatedly unsuccessful (${r.occurrences} recorded outcomes)`,
                    summary: `Recorded outcomes show '${r.responseType}' did not resolve the issue ${r.occurrences} times. Review whether the response path fits the problem type.`,
                    supportingEvidence: [`${r.occurrences} unsuccessful recorded outcomes for '${r.responseType}' (CONFIRMED adaptive records).`],
                    evidenceClassification: 'CONFIRMED',
                    affectedScopeHint: 'FLEET',
                    relatedAgents: [],
                    relatedResponses: [r.responseType]
                });
            }
        } catch (e) { /* non-fatal */ }

        // 2. Fleet recurring problems + hotspots.
        try {
            const problems = this.fleetService ? this.fleetService.getRecurringProblems({ tenantId }) || [] : [];
            for (const p of problems.slice(0, 10)) {
                const agents = p.affectedAgents || [];
                push({
                    type: OPPORTUNITY_TYPES.RECURRING_FAILURE_PATTERN,
                    agentId: agents.length === 1 ? agents[0] : null,
                    title: `Recurring pattern: ${(p.problemType || p.type || 'repeated failure')} (frequency ${p.frequency || 'unknown'})`,
                    summary: (p.humanReadableDescription || 'A failure pattern recurs across recorded history.') + ' Consider a review of monitoring, thresholds, or runbooks for the affected scope.',
                    supportingEvidence: [`Fleet recurring problem '${p.problemId || 'unknown'}' with frequency ${p.frequency || 'unknown'} (CONFIRMED).`],
                    evidenceClassification: 'CONFIRMED',
                    affectedScopeHint: agents.length > 1 ? 'MULTI_AGENT' : 'AGENT',
                    relatedAgents: agents.slice(0, 10),
                    relatedResponses: []
                });
            }
            if (this.fleetService) {
                const hotspots = this.fleetService.getOperationalHotspots({ tenantId }) || [];
                for (const h of hotspots.slice(0, 5)) {
                    const agents = h.affectedAgents || [];
                    push({
                        type: OPPORTUNITY_TYPES.DEPENDENCY_RELIABILITY_PATTERN,
                        agentId: agents.length === 1 ? agents[0] : null,
                        title: `Operational hotspot: ${h.affectedArea || 'scope under attention'}`,
                        summary: `${h.reason || 'Concentrated operational load observed.'} Review dependency declarations and capacity planning for the affected area.`,
                        supportingEvidence: [`Fleet hotspot '${h.affectedArea || 'unknown'}' (CONFIRMED aggregate).`],
                        evidenceClassification: 'CONFIRMED',
                        affectedScopeHint: agents.length > 1 ? 'MULTI_AGENT' : 'DEPENDENCY',
                        relatedAgents: agents.slice(0, 10),
                        relatedResponses: []
                    });
                }
            }
        } catch (e) { /* non-fatal */ }

        // 3. Repeated warnings per agent (early warnings >= 2 active).
        try {
            if (this.earlyWarningService) {
                const w = this.earlyWarningService.getWarnings({ tenantId, range });
                const byAgent = new Map();
                for (const x of (w.warnings || []).filter(x => x.status === 'ACTIVE')) {
                    if (!byAgent.has(x.agentId)) byAgent.set(x.agentId, []);
                    byAgent.get(x.agentId).push(x);
                }
                for (const [agentId, list] of byAgent.entries()) {
                    if (list.length >= 2) {
                        push({
                            type: OPPORTUNITY_TYPES.REPEATED_WARNING_PATTERN,
                            agentId,
                            title: `${list.length} active early warnings on '${agentId}'`,
                            summary: `Multiple converging warnings suggest a review of thresholds or monitoring coverage for '${agentId}'. Warnings are inferred, not facts.`,
                            supportingEvidence: list.slice(0, 4).map(x => `Warning ${x.warningType} (${x.severity}, INFERRED).`),
                            evidenceClassification: 'INFERRED',
                            affectedScopeHint: 'AGENT',
                            relatedAgents: [agentId],
                            relatedResponses: []
                        });
                    }
                }
            }
        } catch (e) { /* non-fatal */ }

        // 4. Store-driven gaps: unresolved incidents, unknown agents, verification gaps.
        try {
            const store = this._store();
            if (store) {
                const incidents = store.listIncidents(tenantId, null) || [];
                const open = incidents.filter(i => !/RESOLV|CLOSED/i.test(String(i.status || i.state || '')));
                const byAgent = new Map();
                for (const i of open) {
                    const a = i.agentId || 'unknown';
                    if (!byAgent.has(a)) byAgent.set(a, []);
                    byAgent.get(a).push(i);
                }
                for (const [agentId, list] of byAgent.entries()) {
                    if (list.length >= 2) {
                        push({
                            type: OPPORTUNITY_TYPES.RESPONSE_PROCESS_GAP,
                            agentId: agentId === 'unknown' ? null : agentId,
                            title: `${list.length} unresolved incidents${agentId === 'unknown' ? '' : ` on '${agentId}'`}`,
                            summary: 'Unresolved incidents accumulate; review incident workflow and approval responsiveness for the scope.',
                            supportingEvidence: list.slice(0, 4).map(i => `Incident ${i.id || i.incidentId || 'unknown'} (${i.severity || 'unknown severity'}, OBSERVED).`),
                            evidenceClassification: 'OBSERVED',
                            affectedScopeHint: agentId === 'unknown' ? 'FLEET' : 'AGENT',
                            relatedAgents: agentId === 'unknown' ? [] : [agentId],
                            relatedResponses: []
                        });
                    }
                }
                const statuses = store.listStatuses(tenantId) || [];
                for (const s of statuses) {
                    const state = s.currentState || s.status;
                    const checks = s.totalChecksCount || 0;
                    if ((state === 'UNKNOWN' && checks === 0) || (!s.lastCheckAt && checks === 0)) {
                        push({
                            type: OPPORTUNITY_TYPES.OBSERVABILITY_GAP,
                            agentId: s.agentId,
                            title: `No health probes recorded for '${s.agentId}'`,
                            summary: 'Monitoring has no probe history for this agent; review monitoring coverage or onboarding state.',
                            supportingEvidence: [`Store shows state UNKNOWN with 0 recorded checks (OBSERVED store read).`],
                            evidenceClassification: 'OBSERVED',
                            affectedScopeHint: 'AGENT',
                            relatedAgents: [s.agentId],
                            relatedResponses: []
                        });
                    }
                }
            }
        } catch (e) { /* non-fatal */ }

        // 5. Adaptive verification gaps + unsupported capability gaps.
        try {
            if (this.adaptiveService) {
                const hist = this.adaptiveService.getHistory({ tenantId });
                for (const p of (hist.plans || [])) {
                    if (['FAILED', 'UNCHANGED', 'DEGRADED'].includes(p.verificationState)) {
                        push({
                            type: OPPORTUNITY_TYPES.VERIFICATION_GAP,
                            agentId: p.agentId,
                            title: `Response on '${p.agentId}' did not verify (${p.verificationState})`,
                            summary: 'Verification could not confirm recovery; review the verification coverage or the suitability of the response path.',
                            supportingEvidence: [`Adaptive plan ${p.adaptivePlanId} verification state ${p.verificationState} (CONFIRMED record).`],
                            evidenceClassification: 'CONFIRMED',
                            affectedScopeHint: 'AGENT',
                            relatedAgents: [p.agentId],
                            relatedResponses: []
                        });
                    }
                    if (p.verificationState === 'UNSUPPORTED' || p.executionState === 'STOPPED_UNSUPPORTED') {
                        push({
                            type: OPPORTUNITY_TYPES.UNSUPPORTED_CAPABILITY_GAP,
                            agentId: p.agentId,
                            title: `Unsupported response scope on '${p.agentId}'`,
                            summary: 'Execution is unsupported here (e.g. external agent). A proposal may only cover observability or process gaps — never executable capabilities.',
                            supportingEvidence: [`Adaptive plan ${p.adaptivePlanId} stopped as UNSUPPORTED (CONFIRMED record).`],
                            evidenceClassification: 'CONFIRMED',
                            affectedScopeHint: 'AGENT',
                            relatedAgents: [p.agentId],
                            relatedResponses: []
                        });
                    }
                }
                // Recovery duration pattern from effectiveness durations.
                const eff = typeof this.adaptiveService.getEffectiveness === 'function'
                    ? this.adaptiveService.getEffectiveness({ tenantId }) : null;
                for (const t of ((eff && eff.byResponseType) || [])) {
                    if (t.totalCount >= 2 && (t.averageDurationSeconds == null || t.averageDurationSeconds > 300)) {
                        push({
                            type: OPPORTUNITY_TYPES.RECOVERY_DURATION_PATTERN,
                            agentId: null,
                            title: `Slow or unmeasured recovery windows for '${t.responseType}'`,
                            summary: `Response-to-verification windows for '${t.responseType}' average ${t.averageDurationSeconds == null ? 'unmeasured' : t.averageDurationSeconds + 's'} across ${t.totalCount} records. Review recovery runbooks or verification cadence.`,
                            supportingEvidence: [`${t.totalCount} effectiveness records for '${t.responseType}' (CONFIRMED counts).`],
                            evidenceClassification: 'CONFIRMED',
                            affectedScopeHint: 'FLEET',
                            relatedAgents: t.agents || [],
                            relatedResponses: [t.responseType]
                        });
                    }
                }
                // Policy review: repeated approval-required executions suggest workflow review.
                const plans = (hist.plans || []);
                if (plans.length >= 3) {
                    push({
                        type: OPPORTUNITY_TYPES.POLICY_REVIEW_OPPORTUNITY,
                        agentId: null,
                        title: `${plans.length} governed responses recorded — review approval workflow`,
                        summary: 'Enough governed history exists to review whether approval steps, evidence requirements, or runbooks need operator attention. Advisory review only.',
                        supportingEvidence: [`${plans.length} adaptive plans recorded in tenant history (CONFIRMED).`],
                        evidenceClassification: 'CONFIRMED',
                        affectedScopeHint: 'FLEET',
                        relatedAgents: [],
                        relatedResponses: []
                    });
                }
            }
        } catch (e) { /* non-fatal */ }

        if (opportunities.length === 0) {
            gaps.push({ kind: 'IMPROVEMENT_OPPORTUNITIES', classification: 'INSUFFICIENT_DATA', reason: 'No recorded evidence currently supports an improvement opportunity in this tenant.' });
        }

        return { opportunities, gaps };
    }
}

module.exports = { ImprovementOpportunityEngine, OPPORTUNITY_TYPES };
