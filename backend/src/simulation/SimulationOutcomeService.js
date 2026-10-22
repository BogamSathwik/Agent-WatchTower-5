/**
 * Phase 33 — Simulation Outcome Service
 * Produces structured possible outcomes in qualitative states only:
 * STABLE / DEGRADED / HIGH_RISK / INCIDENT_LIKELY / RECOVERY_POSSIBLE /
 * RECOVERY_UNCERTAIN / INSUFFICIENT_DATA.
 * Hedged wording only ("could lead to", "consistent with", ...).
 * Never claims an outcome will definitely happen.
 */

const OUTCOME_STATES = Object.freeze({
    STABLE: 'STABLE',
    DEGRADED: 'DEGRADED',
    HIGH_RISK: 'HIGH_RISK',
    INCIDENT_LIKELY: 'INCIDENT_LIKELY',
    RECOVERY_POSSIBLE: 'RECOVERY_POSSIBLE',
    RECOVERY_UNCERTAIN: 'RECOVERY_UNCERTAIN',
    INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

class SimulationOutcomeService {
    buildOutcomes(simulation, impact, assumptions, { tenantId = 'default-tenant' } = {}) {
        if (!simulation || simulation.status === 'INSUFFICIENT_DATA') {
            return [{
                outcomeState: OUTCOME_STATES.INSUFFICIENT_DATA,
                summary: 'Insufficient evidence to model outcomes; continued monitoring is the only evidence-backed branch.',
                operationalState: 'Unknown — evidence collection ongoing.',
                affectedScope: (impact && impact.impactScope) || 'UNKNOWN',
                dependencyConsequences: 'Unknown — no declared edges evaluated.',
                incidentImplications: 'No incident implications can be stated.',
                recoveryImplications: 'No recovery implications can be stated.',
                supportingEvidence: [],
                uncertainty: 'Outcome modeling requires at least one substantive observed, trend, or inferred record.',
                missingInformation: ((simulation && simulation.sourceEvidence && simulation.sourceEvidence.gaps) || []).map(g => g.kind),
                wording: 'insufficient evidence'
            }];
        }

        const type = simulation.simulationType;
        const scope = (impact && impact.impactScope) || 'UNKNOWN';
        const observedRefs = (simulation.sourceEvidence.observed || []).slice(0, 2).map(e => `${e.kind}: supported by recorded data.`);
        const trendRefs = (simulation.sourceEvidence.trends || []).slice(0, 2).map(e => `${e.kind}: supported by baseline comparison.`);
        const support = [...observedRefs, ...trendRefs];
        const missing = ((simulation.sourceEvidence && simulation.sourceEvidence.gaps) || []).map(g => g.kind);
        const assumptionCount = (assumptions || []).length;

        const base = {
            affectedScope: scope,
            supportingEvidence: support,
            uncertainty: `Outcomes are possible branches under ${assumptionCount} explicit assumption(s); they could change as new probes arrive.`,
            missingInformation: missing,
            wording: 'possible outcome'
        };

        switch (type) {
            case 'CONTINUE_CURRENT_STATE':
                return [{
                    ...base,
                    outcomeState: OUTCOME_STATES.STABLE,
                    summary: 'State could remain stable under continued observation, consistent with the current recorded snapshot.',
                    operationalState: 'Possible outcome: current state persists without new degradation.',
                    dependencyConsequences: 'No new dependency consequences expected on this branch.',
                    incidentImplications: 'No new incident implications beyond already recorded incidents.',
                    recoveryImplications: 'No recovery action modeled on this branch.'
                }];
            case 'CONTINUE_DEGRADATION':
                return [{
                    ...base,
                    outcomeState: OUTCOME_STATES.DEGRADED,
                    summary: 'Continued degradation could lead to persistent degraded state and growing operator attention demand.',
                    operationalState: 'Possible outcome: degraded state persists; transition to OFFLINE is possible but not certain.',
                    dependencyConsequences: scope === 'DEPENDENCY' || scope === 'MULTI_AGENT'
                        ? 'Declared dependents could observe errors on recorded edges.'
                        : 'No dependency consequences recorded for this scope.',
                    incidentImplications: 'Incident possibility rises while remaining a possibility, not a forecast incident.',
                    recoveryImplications: 'Recovery would require investigation followed by an approved response outside simulation.'
                }];
            case 'DEPENDENCY_FAILURE':
                return [{
                    ...base,
                    outcomeState: OUTCOME_STATES.HIGH_RISK,
                    summary: 'A sustained dependency outage could lead to error propagation along declared edges.',
                    operationalState: 'Possible outcome: dependents report errors referencing the unavailable dependency.',
                    dependencyConsequences: (impact && impact.propagationNote) || 'Propagation modeled over declared edges only.',
                    incidentImplications: 'Incident implications are possible for directly dependent scope; no incident is created by simulation.',
                    recoveryImplications: 'Recovery is possible once the dependency is restored through real operations (outside simulation).'
                }];
            case 'AGENT_UNAVAILABLE':
                return [{
                    ...base,
                    outcomeState: OUTCOME_STATES.HIGH_RISK,
                    summary: 'Agent unavailability could lead to errors in declared dependents, consistent with recorded topology.',
                    operationalState: 'Possible outcome: agent unreachable; dependents degrade.',
                    dependencyConsequences: (impact && impact.propagationNote) || 'Modeled over declared edges only.',
                    incidentImplications: 'An outage record would appear only at real future probes, never from simulation.',
                    recoveryImplications: 'Recovery is possible on restoration; duration is uncertain.'
                }];
            case 'WARNING_ESCALATION':
                return [{
                    ...base,
                    outcomeState: OUTCOME_STATES.HIGH_RISK,
                    summary: 'Warning escalation could lead to decision-required attention for the scope.',
                    operationalState: 'Possible outcome: severity steps up on new converging evidence.',
                    dependencyConsequences: 'No new dependency consequences unless dependents show new signals.',
                    incidentImplications: 'Escalation raises incident possibility; it does not confirm an incident.',
                    recoveryImplications: 'Early review keeps approved response preparation available outside simulation.'
                }];
            case 'RESPONSE_OPTION_PATH':
                return [{
                    ...base,
                    outcomeState: OUTCOME_STATES.RECOVERY_POSSIBLE,
                    summary: 'The modeled response path could lead to verification and recovery, supported by recorded response capabilities where available.',
                    operationalState: 'Possible outcome: planned path completes verification; continued degradation remains possible if verification fails.',
                    dependencyConsequences: 'Dependents could stabilize if the source recovers; otherwise scope is unchanged.',
                    incidentImplications: 'Recorded incidents could resolve on verified recovery; resolution happens only in real operations.',
                    recoveryImplications: 'Recovery is possible, not guaranteed; verification determines the branch outcome in real operations.'
                }];
            case 'RECOVERY_SUCCESS':
                return [{
                    ...base,
                    outcomeState: OUTCOME_STATES.RECOVERY_POSSIBLE,
                    summary: 'Recovery could complete within previously recorded durations.',
                    operationalState: 'Possible outcome: health signals return toward baseline at real future probes.',
                    dependencyConsequences: 'Dependents could stabilize following the source.',
                    incidentImplications: 'Recorded incidents could resolve following real verification.',
                    recoveryImplications: 'Recovery possible under the success-branch assumptions.'
                }];
            case 'RECOVERY_FAILURE':
                return [{
                    ...base,
                    outcomeState: OUTCOME_STATES.RECOVERY_UNCERTAIN,
                    summary: 'Recovery could remain incomplete, leaving the scope degraded and investigation ongoing.',
                    operationalState: 'Possible outcome: degraded state persists; further options remain in Decision Intelligence.',
                    dependencyConsequences: 'Dependents could continue observing errors.',
                    incidentImplications: 'Incident scope could broaden; broadening is possible, not confirmed.',
                    recoveryImplications: 'Recovery uncertain; alternative approved paths would be considered outside simulation.'
                }];
            default:
                return [{
                    ...base,
                    outcomeState: OUTCOME_STATES.INCIDENT_LIKELY,
                    summary: 'The situation could develop toward incident-level attention if signals converge further.',
                    operationalState: 'Possible outcome: elevated attention; specific trajectory uncertain.',
                    dependencyConsequences: 'Dependent impact possible where declared edges exist.',
                    incidentImplications: 'Incident likely is a qualitative watch state, never a confirmed future incident.',
                    recoveryImplications: 'Recovery implications uncertain on this branch.'
                }];
        }
    }
}

module.exports = { SimulationOutcomeService, OUTCOME_STATES };
