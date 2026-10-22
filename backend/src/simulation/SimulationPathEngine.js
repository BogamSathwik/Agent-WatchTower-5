/**
 * Phase 33 — Simulation Path Engine
 * Builds possible operational step sequences from the current state.
 * Every step is classified OBSERVED / ASSUMED / SIMULATED.
 * The terminal step of any path involving a real-world action is always
 * marked SIMULATED_ONLY — the simulation never executes it.
 */

const STEP_CLASSES = Object.freeze({
    OBSERVED: 'OBSERVED',
    ASSUMED: 'ASSUMED',
    SIMULATED: 'SIMULATED',
    SIMULATED_ONLY: 'SIMULATED_ONLY'
});

class SimulationPathEngine {
    constructor(options = {}) {
        this.responseCenterService = options.responseCenterService || null;
    }

    /**
     * Build one deterministic path per simulation (plus an observation
     * baseline path for comparison). No randomness.
     */
    buildPaths(simulation, impact, assumptions, { tenantId = 'default-tenant' } = {}) {
        const paths = [this._observationBaselinePath(simulation, impact)];
        paths.push(this._branchPath(simulation, impact, assumptions, tenantId));
        return paths;
    }

    _observationBaselinePath(simulation, impact) {
        return {
            pathId: 'PATH_OBSERVE',
            pathName: 'Continue Observation',
            description: 'What could happen if observation continues without intervention.',
            reversibility: 'FULLY_REVERSIBLE',
            operatorInvolvement: 'NONE_REQUIRED',
            steps: [
                { order: 1, title: 'Current recorded state', classification: STEP_CLASSES.OBSERVED, detail: (simulation && simulation.currentSituation) || 'Recorded state.' },
                { order: 2, title: 'Warning and trend signals persist or clear at the next probe cycle', classification: STEP_CLASSES.ASSUMED, detail: 'Either persistence or return to baseline is possible; the branch does not assume which.' },
                { order: 3, title: `Scope remains ${(impact && impact.impactScope) || 'UNKNOWN'} unless new signals arrive`, classification: STEP_CLASSES.SIMULATED, detail: 'Simulated steady-state branch for comparison.' }
            ]
        };
    }

    _branchPath(simulation, impact, assumptions, tenantId) {
        const type = simulation ? simulation.simulationType : 'CONTINUE_CURRENT_STATE';
        const agentId = simulation ? simulation.agentId : null;
        const steps = [
            { order: 1, title: 'Current recorded state', classification: STEP_CLASSES.OBSERVED, detail: (simulation && simulation.currentSituation) || 'Recorded state.' }
        ];

        switch (type) {
            case 'CONTINUE_DEGRADATION':
                steps.push(
                    { order: 2, title: 'Degradation signals continue along the observed trend', classification: STEP_CLASSES.ASSUMED, detail: 'Trend continuation is assumed for the simulated window.' },
                    { order: 3, title: 'Risk level rises and operator attention demand grows', classification: STEP_CLASSES.SIMULATED, detail: 'Consistent with converging failure signals; not guaranteed.' },
                    { order: 4, title: `Impact stays within ${(impact && impact.impactScope) || 'UNKNOWN'} scope unless dependents show new signals`, classification: STEP_CLASSES.SIMULATED, detail: (impact && impact.propagationNote) || '' }
                );
                break;
            case 'DEPENDENCY_FAILURE':
                steps.push(
                    { order: 2, title: `Dependency '${(simulation && simulation.dependencyTarget) || agentId || 'in scope'}' remains unavailable`, classification: STEP_CLASSES.ASSUMED, detail: 'Conditional branch; unavailability is not an observed fact.' },
                    { order: 3, title: 'Dependent agents could observe errors on declared edges', classification: STEP_CLASSES.SIMULATED, detail: (impact && impact.propagationNote) || '' },
                    { order: 4, title: 'Incident possibility rises for directly dependent scope', classification: STEP_CLASSES.SIMULATED, detail: 'Possible outcome, not a forecast of an incident.' }
                );
                break;
            case 'AGENT_UNAVAILABLE':
                steps.push(
                    { order: 2, title: `Agent '${agentId || 'in scope'}' treated as unreachable`, classification: STEP_CLASSES.ASSUMED, detail: 'Simulated only; no probe or command is altered.' },
                    { order: 3, title: 'Dependents could observe errors referencing the agent', classification: STEP_CLASSES.SIMULATED, detail: (impact && impact.propagationNote) || '' },
                    { order: 4, title: 'Monitoring records the outage only at real future probes (outside simulation)', classification: STEP_CLASSES.SIMULATED, detail: 'Simulation does not create telemetry or incidents.' }
                );
                break;
            case 'WARNING_ESCALATION':
                steps.push(
                    { order: 2, title: 'Further converging signals arrive and warning severity steps up', classification: STEP_CLASSES.ASSUMED, detail: 'Escalation is conditional on new evidence.' },
                    { order: 3, title: 'Decision-required attention grows for the scope', classification: STEP_CLASSES.SIMULATED, detail: 'Consistent with Early Warning inference rules.' },
                    { order: 4, title: 'Operator review determines whether a response plan is prepared', classification: STEP_CLASSES.SIMULATED_ONLY, detail: 'SIMULATED ONLY — preparation and approval happen in Decision/Response Centers, never here.' }
                );
                break;
            case 'RESPONSE_OPTION_PATH': {
                const ref = this._inspectResponseOption(agentId, tenantId, simulation);
                steps.push(
                    { order: 2, title: `Existing option '${(simulation && simulation.responseOptionType) || 'unknown'}' selected for modeling`, classification: STEP_CLASSES.ASSUMED, detail: 'Selection is simulated; nothing is approved or queued.' },
                    { order: 3, title: `Option review: safety '${ref.safetyState}', approval '${ref.approvalRequirement}', support '${ref.executionSupport}'`, classification: STEP_CLASSES.SIMULATED, detail: ref.note },
                    { order: 4, title: 'Response executes through the existing Response Center, then verification, then recovery or continued degradation', classification: STEP_CLASSES.SIMULATED_ONLY, detail: 'SIMULATED ONLY — NO REAL ACTION EXECUTED. Actual execution remains exclusively in the Response Center after explicit approval.' }
                );
                break;
            }
            case 'RECOVERY_SUCCESS':
                steps.push(
                    { order: 2, title: 'Recovery completes within previously recorded durations', classification: STEP_CLASSES.ASSUMED, detail: 'Success branch; failure is modeled as a separate simulation.' },
                    { order: 3, title: 'Health signals return toward baseline at real future probes', classification: STEP_CLASSES.SIMULATED, detail: 'Possible outcome supported by historical recovery records where available.' }
                );
                break;
            case 'RECOVERY_FAILURE':
                steps.push(
                    { order: 2, title: 'Recovery does not complete within previously recorded durations', classification: STEP_CLASSES.ASSUMED, detail: 'Failure branch; success is modeled as a separate simulation.' },
                    { order: 3, title: 'Degradation persists and investigation continues', classification: STEP_CLASSES.SIMULATED, detail: 'Possible outcome; further options remain in Decision Intelligence.' }
                );
                break;
            default: // CONTINUE_CURRENT_STATE and fallback
                steps.push(
                    { order: 2, title: 'State persists without intervention for the simulated window', classification: STEP_CLASSES.ASSUMED, detail: 'Steady-state assumption for comparison.' },
                    { order: 3, title: 'Evidence improves as further probes accumulate', classification: STEP_CLASSES.SIMULATED, detail: 'Continued monitoring is the only action modeled.' }
                );
                break;
        }

        return {
            pathId: 'PATH_BRANCH',
            pathName: this._branchName(type, simulation),
            description: (simulation && simulation.whatIfQuestion) || 'Simulated branch.',
            reversibility: type === 'RESPONSE_OPTION_PATH' ? 'REQUIRES_VERIFICATION' : 'FULLY_REVERSIBLE',
            operatorInvolvement: type === 'RESPONSE_OPTION_PATH' ? 'APPROVAL_REQUIRED' : 'REVIEW_ONLY',
            steps
        };
    }

    _branchName(type, simulation) {
        const map = {
            CONTINUE_CURRENT_STATE: 'Steady State',
            CONTINUE_DEGRADATION: 'Degradation Continues',
            DEPENDENCY_FAILURE: 'Dependency Failure Propagation',
            AGENT_UNAVAILABLE: 'Agent Unavailability',
            WARNING_ESCALATION: 'Warning Escalation',
            RESPONSE_OPTION_PATH: `Response Path: ${(simulation && simulation.responseOptionType) || 'option'}`,
            RECOVERY_SUCCESS: 'Recovery Succeeds',
            RECOVERY_FAILURE: 'Recovery Fails'
        };
        return map[type] || 'Simulated Branch';
    }

    _inspectResponseOption(agentId, tenantId, simulation) {
        const fallback = {
            safetyState: 'UNKNOWN', approvalRequirement: 'OPERATOR', executionSupport: 'UNKNOWN',
            note: 'Response Center inspection unavailable; path assumes standard approval workflow.'
        };
        if (!agentId || !this.responseCenterService) return fallback;
        try {
            const opts = typeof this.responseCenterService.generateResponseOptions === 'function'
                ? this.responseCenterService.generateResponseOptions({ agentId, tenantId }) || []
                : [];
            const wanted = simulation && simulation.responseOptionType;
            const match = opts.find(o => (o.actionType || o.action || o.type) === wanted) || opts[0];
            if (!match) {
                return { safetyState: 'NO_OPTION_RECORDED', approvalRequirement: 'OPERATOR', executionSupport: 'UNSUPPORTED', note: 'No matching Response Center option recorded; path models inspection and escalation only.' };
            }
            return {
                safetyState: match.safetyLevel || match.safety || match.safetyState || 'RECORDED',
                approvalRequirement: match.requiresApproval === false ? 'NONE' : (match.approvalRequirement || 'OPERATOR'),
                executionSupport: match.executionSupported === false ? 'UNSUPPORTED' : (match.executionSupport || 'CONDITIONAL'),
                note: `Modeled option '${match.actionType || match.action || match.type}'. SIMULATED ONLY — NO REAL ACTION EXECUTED.`
            };
        } catch (e) {
            return { ...fallback, note: `Response inspection failed: ${e.message}` };
        }
    }
}

module.exports = { SimulationPathEngine, STEP_CLASSES };
