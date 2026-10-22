/**
 * Phase 33 — Simulation Assumption Service
 * Every simulation explicitly exposes its assumptions. Assumptions are
 * classified and never silently promoted into facts.
 *
 * Classes: CONFIRMED / INFERRED / PREDICTED / ASSUMPTION / UNKNOWN
 */

const ASSUMPTION_CLASSES = Object.freeze({
    CONFIRMED: 'CONFIRMED',
    INFERRED: 'INFERRED',
    PREDICTED: 'PREDICTED',
    ASSUMPTION: 'ASSUMPTION',
    UNKNOWN: 'UNKNOWN'
});

function isExternalAgent(agentId) {
    return !!agentId && /compa|repa/i.test(String(agentId));
}

class SimulationAssumptionService {
    /**
     * Build the assumption set for a simulation type + scope.
     * @returns {Array} assumptions with classification + rationale
     */
    buildAssumptions({ simulationType, agentId = null, evidence = null, responseRef = null } = {}) {
        const list = [];
        const push = (statement, classification, rationale) => {
            list.push({ statement, classification, rationale });
        };

        // Baseline assumptions shared by all simulation types
        push(
            'Current recorded health snapshot is taken as the simulation starting point.',
            ASSUMPTION_CLASSES.ASSUMPTION,
            'Simulation explores consequences from the current state; the state itself may change at the next probe.'
        );
        push(
            'Declared dependency relationships used by the simulation remain valid for the simulated window.',
            ASSUMPTION_CLASSES.ASSUMPTION,
            'Topology is read from the existing dependency graph; undiscovered relationships are not modeled.'
        );

        const gaps = (evidence && evidence.gaps) || [];
        if (gaps.length > 0) {
            push(
                `Simulation proceeds with ${gaps.length} known evidence gap(s): ${gaps.slice(0, 3).map(g => g.kind).join(', ')}.`,
                ASSUMPTION_CLASSES.UNKNOWN,
                'Missing evidence is listed explicitly instead of being filled in.'
            );
        }

        const observedCount = (evidence && evidence.observed ? evidence.observed.length : 0);
        if (observedCount > 0) {
            push(
                `${observedCount} observed record(s) ground the simulation start state.`,
                ASSUMPTION_CLASSES.CONFIRMED,
                'Observed records are reused read-only from Watchtower stores.'
            );
        }

        const inferredCount = (evidence && evidence.inferred ? evidence.inferred.length : 0);
        if (inferredCount > 0) {
            push(
                `${inferredCount} inferred warning(s) are treated as plausible branches, not facts.`,
                ASSUMPTION_CLASSES.INFERRED,
                'Inferred warnings come from the Early Warning Center rule engine.'
            );
        }

        const predictedCount = (evidence && evidence.predicted ? evidence.predicted.length : 0);
        if (predictedCount > 0) {
            push(
                `${predictedCount} forecast(s) bound the simulated horizon; forecasts may not materialize.`,
                ASSUMPTION_CLASSES.PREDICTED,
                'Forecasts come from the Forecast Horizon Service with explicit horizons.'
            );
        }

        // Type-specific assumptions
        switch (simulationType) {
            case 'CONTINUE_CURRENT_STATE':
                push('No operator intervention and no environmental change occur during the simulated window.', ASSUMPTION_CLASSES.ASSUMPTION, 'Defines the continue-observation branch.');
                break;
            case 'CONTINUE_DEGRADATION':
            case 'WARNING_ESCALATION':
                push('The observed trend continues in the same direction for the simulated window.', ASSUMPTION_CLASSES.ASSUMPTION, 'Trend continuation is assumed, not measured; reversal remains possible.');
                break;
            case 'DEPENDENCY_FAILURE':
                push('The named dependency is treated as unavailable for the simulated window.', ASSUMPTION_CLASSES.ASSUMPTION, 'Unavailability is a conditional branch, not an observed fact.');
                break;
            case 'AGENT_UNAVAILABLE':
                push('The agent is treated as unreachable for the simulated window while dependents keep their current behavior.', ASSUMPTION_CLASSES.ASSUMPTION, 'Reachability change is simulated only; no probe or command is sent.');
                break;
            case 'RESPONSE_OPTION_PATH':
                push('The selected response option is modeled through checklists, approvals, and verification without executing anything.', ASSUMPTION_CLASSES.ASSUMPTION, 'Execution stays exclusively in the Response Center after explicit approval.');
                if (responseRef && responseRef.executionSupport === 'UNSUPPORTED') {
                    push('The referenced response capability is UNSUPPORTED for this scope; the path models inspection and escalation only.', ASSUMPTION_CLASSES.CONFIRMED, 'Support status is read from the existing Response Center inspection.');
                } else if (responseRef) {
                    push('The referenced response capability is recorded as available subject to existing approval workflow.', ASSUMPTION_CLASSES.CONFIRMED, 'Availability is read from the existing Response Center inspection.');
                }
                break;
            case 'RECOVERY_SUCCESS':
                push('Recovery completes within previously recorded durations; no new faults appear during the window.', ASSUMPTION_CLASSES.ASSUMPTION, 'Success is one modeled branch; failure is modeled separately.');
                break;
            case 'RECOVERY_FAILURE':
                push('Recovery does not complete within previously recorded durations.', ASSUMPTION_CLASSES.ASSUMPTION, 'Failure is one modeled branch; success is modeled separately.');
                break;
            default:
                break;
        }

        if (isExternalAgent(agentId)) {
            push(
                `External agent '${agentId}' execution capability is unsupported; simulation is inspect-only and sends no commands.`,
                ASSUMPTION_CLASSES.CONFIRMED,
                'External-agent profile behavior confirmed by existing Response Center inspection.'
            );
        }

        push(
            'Historical behavior is used as contextual evidence only, not as a guarantee of future behavior.',
            ASSUMPTION_CLASSES.ASSUMPTION,
            'Past incidents and recoveries inform plausibility; they do not determine the outcome.'
        );

        return list;
    }
}

module.exports = { SimulationAssumptionService, ASSUMPTION_CLASSES, isExternalAgent };
