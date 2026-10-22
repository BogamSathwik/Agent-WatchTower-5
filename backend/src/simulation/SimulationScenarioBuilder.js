/**
 * Phase 33 — Simulation Scenario Builder
 * Builds what-if scenarios ONLY from existing Watchtower information.
 * Creates a scenario only when sufficient evidence exists; otherwise
 * returns INSUFFICIENT_DATA. Every scenario retains source references.
 */

const SIMULATION_TYPES = Object.freeze({
    CONTINUE_CURRENT_STATE: 'CONTINUE_CURRENT_STATE',
    CONTINUE_DEGRADATION: 'CONTINUE_DEGRADATION',
    DEPENDENCY_FAILURE: 'DEPENDENCY_FAILURE',
    AGENT_UNAVAILABLE: 'AGENT_UNAVAILABLE',
    WARNING_ESCALATION: 'WARNING_ESCALATION',
    RESPONSE_OPTION_PATH: 'RESPONSE_OPTION_PATH',
    RECOVERY_SUCCESS: 'RECOVERY_SUCCESS',
    RECOVERY_FAILURE: 'RECOVERY_FAILURE'
});

function sanitize(str) {
    return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

const WHAT_IF_QUESTIONS = Object.freeze({
    CONTINUE_CURRENT_STATE: 'What if observation continues without intervention?',
    CONTINUE_DEGRADATION: 'What if degradation / latency continues increasing?',
    DEPENDENCY_FAILURE: 'What if this dependency remains offline?',
    AGENT_UNAVAILABLE: 'What if this agent becomes unavailable?',
    WARNING_ESCALATION: 'What if this warning escalates?',
    RESPONSE_OPTION_PATH: 'What if this existing response path is selected?',
    RECOVERY_SUCCESS: 'What if recovery succeeds?',
    RECOVERY_FAILURE: 'What if recovery fails?'
});

class SimulationScenarioBuilder {
    constructor(options = {}) {
        this.evidenceService = options.evidenceService || null;
    }

    _requireEvidence() {
        if (!this.evidenceService) throw new Error('DecisionEvidenceService not wired.');
    }

    /**
     * Build a what-if scenario deterministically from evidence.
     * Returns scenario with status READY or INSUFFICIENT_DATA.
     */
    buildSimulationScenario({ simulationType, agentId = null, tenantId = 'default-tenant', range = '24h', warningId = null, decisionScenarioId = null, incidentId = null, dependencyTarget = null, responseOptionType = null, title = null, contextNote = '' } = {}) {
        this._requireEvidence();
        if (!simulationType || !SIMULATION_TYPES[simulationType]) {
            throw new Error(`Unsupported simulationType '${simulationType}'. Supported: ${Object.keys(SIMULATION_TYPES).join(', ')}`);
        }
        if (simulationType === 'RESPONSE_OPTION_PATH' && !responseOptionType) {
            throw new Error(`simulationType RESPONSE_OPTION_PATH requires responseOptionType (an existing Response/Decision option type).`);
        }
        if ((simulationType === 'DEPENDENCY_FAILURE') && !dependencyTarget && !agentId) {
            throw new Error(`simulationType DEPENDENCY_FAILURE requires dependencyTarget or agentId scope.`);
        }

        const evidence = this.evidenceService.collectEvidence({ tenantId, agentId, range, warningId });
        const substantive = (evidence.observed || []).filter(o =>
            o.kind !== 'RESPONSE_OPTIONS' && o.kind !== 'KNOWLEDGE_CONTEXT'
        ).length + (evidence.trends || []).length + (evidence.inferred || []).length;

        const simulationId = `sim_${sanitize(agentId || 'fleet')}_${simulationType}_${Date.now().toString(36)}`;
        const status = substantive > 0 ? 'READY' : 'INSUFFICIENT_DATA';

        return {
            simulationId,
            simulationType,
            whatIfQuestion: WHAT_IF_QUESTIONS[simulationType],
            title: title || this._defaultTitle(simulationType, agentId, dependencyTarget, responseOptionType),
            tenantId,
            agentId: agentId || null,
            scope: agentId ? 'AGENT' : 'FLEET',
            warningId: warningId || null,
            decisionScenarioId: decisionScenarioId || null,
            incidentId: incidentId || null,
            dependencyTarget: dependencyTarget || null,
            responseOptionType: responseOptionType || null,
            range,
            status,
            currentSituation: this._describeCurrentSituation(simulationType, agentId, evidence, dependencyTarget, responseOptionType),
            sourceEvidence: {
                observed: evidence.observed,
                trends: evidence.trends,
                inferred: evidence.inferred,
                predicted: evidence.predicted,
                gaps: evidence.gaps,
                evidenceStrength: evidence.evidenceStrength
            },
            contextNote: String(contextNote || '').slice(0, 500),
            createdAt: new Date().toISOString(),
            safetyNote: 'SIMULATION ONLY — no agent state, configuration, or topology is modified; no remediation is executed; no external commands are sent.',
            dataClassificationNote: 'Current situation = OBSERVED/TREND summary. Simulated branches = SIMULATED possibilities, never facts.'
        };
    }

    _defaultTitle(type, agentId, dependencyTarget, responseOptionType) {
        const who = agentId || 'fleet';
        switch (type) {
            case 'CONTINUE_CURRENT_STATE': return `What if ${who} continues unchanged?`;
            case 'CONTINUE_DEGRADATION': return `What if degradation continues on ${who}?`;
            case 'DEPENDENCY_FAILURE': return `What if dependency '${dependencyTarget || who}' remains offline?`;
            case 'AGENT_UNAVAILABLE': return `What if agent ${who} becomes unavailable?`;
            case 'WARNING_ESCALATION': return `What if the warning on ${who} escalates?`;
            case 'RESPONSE_OPTION_PATH': return `What if response path '${responseOptionType}' is selected for ${who}?`;
            case 'RECOVERY_SUCCESS': return `What if recovery succeeds on ${who}?`;
            case 'RECOVERY_FAILURE': return `What if recovery fails on ${who}?`;
            default: return `What-if simulation for ${who}`;
        }
    }

    _describeCurrentSituation(type, agentId, evidence, dependencyTarget, responseOptionType) {
        const obs = evidence.observed.slice(0, 3).map(e => e.summary).join(' ');
        const base = obs || 'No confirmed observations recorded yet.';
        switch (type) {
            case 'DEPENDENCY_FAILURE':
                return `Conditional branch: dependency '${dependencyTarget || agentId || 'in scope'}' treated as unavailable. Grounding evidence: ${base}`;
            case 'RESPONSE_OPTION_PATH':
                return `Conditional branch: existing option '${responseOptionType}' modeled without execution. Grounding evidence: ${base}`;
            default:
                return `${base}`;
        }
    }
}

module.exports = { SimulationScenarioBuilder, SIMULATION_TYPES, WHAT_IF_QUESTIONS };
