/**
 * Phase 32 — Scenario Builder
 * Builds structured decision scenarios ONLY from confirmed Watchtower data.
 * Never invents events. Every scenario cites its source evidence.
 */

const SCENARIO_TYPES = Object.freeze({
    AGENT_DEGRADATION_CONTINUES: 'AGENT_DEGRADATION_CONTINUES',
    LATENCY_INCREASE_CONTINUES: 'LATENCY_INCREASE_CONTINUES',
    DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
    RECURRING_FAILURES_RETURN: 'RECURRING_FAILURES_RETURN',
    INCIDENT_ESCALATION: 'INCIDENT_ESCALATION',
    SLOW_RECOVERY: 'SLOW_RECOVERY',
    MULTI_AGENT_SPREAD: 'MULTI_AGENT_SPREAD',
    WARNING_SEVERITY_INCREASE: 'WARNING_SEVERITY_INCREASE'
});

function sanitize(str) {
    return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

class ScenarioBuilder {
    constructor(options = {}) {
        this.evidenceService = options.evidenceService || null;
    }

    _requireEvidence() {
        if (!this.evidenceService) throw new Error('DecisionEvidenceService not wired.');
    }

    /**
     * Build a scenario context deterministically from evidence.
     * Returns scenario object with status READY or INSUFFICIENT_DATA.
     */
    buildScenario({ scenarioType, agentId = null, tenantId = 'default-tenant', range = '24h', warningId = null, title = null, contextNote = '' } = {}) {
        this._requireEvidence();
        if (!scenarioType || !SCENARIO_TYPES[scenarioType]) {
            throw new Error(`Unsupported scenarioType '${scenarioType}'. Supported: ${Object.keys(SCENARIO_TYPES).join(', ')}`);
        }
        const evidence = this.evidenceService.collectEvidence({ tenantId, agentId, range, warningId });
        // Readiness requires substantive operational evidence. Mere platform
        // capability references (response options, knowledge records) do not
        // make a scenario READY on their own.
        const substantive = (evidence.observed || []).filter(o =>
            o.kind !== 'RESPONSE_OPTIONS' && o.kind !== 'KNOWLEDGE_CONTEXT'
        ).length + (evidence.trends || []).length + (evidence.inferred || []).length;

        const scenarioId = `scn_${sanitize(agentId || 'fleet')}_${scenarioType}_${Date.now().toString(36)}`;
        const situation = this._describeSituation(scenarioType, agentId, evidence);
        const potentialOutcomes = this._describeOutcomes(scenarioType, agentId, evidence);

        const status = substantive > 0 ? 'READY' : 'INSUFFICIENT_DATA';
        return {
            scenarioId,
            scenarioType,
            title: title || this._defaultTitle(scenarioType, agentId),
            tenantId,
            agentId: agentId || null,
            scope: agentId ? 'AGENT' : 'FLEET',
            warningId: warningId || null,
            range,
            status,
            situation,
            potentialOutcomes,
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
            dataClassificationNote: 'Situation = OBSERVED/TREND summary. Outcomes = conditional possibilities if the situation continues, NOT predictions of fact.'
        };
    }

    _defaultTitle(type, agentId) {
        const who = agentId || 'fleet';
        const map = {
            AGENT_DEGRADATION_CONTINUES: `If degradation continues on ${who}`,
            LATENCY_INCREASE_CONTINUES: `If latency keeps increasing on ${who}`,
            DEPENDENCY_UNAVAILABLE: `If a dependency of ${who} becomes unavailable`,
            RECURRING_FAILURES_RETURN: `If recurring failures return on ${who}`,
            INCIDENT_ESCALATION: `If the active incident on ${who} escalates`,
            SLOW_RECOVERY: `If recovery takes longer than normal on ${who}`,
            MULTI_AGENT_SPREAD: `If the situation spreads to multiple agents`,
            WARNING_SEVERITY_INCREASE: `If the early warning for ${who} becomes more severe`
        };
        return map[type] || `Operational scenario for ${who}`;
    }

    _describeSituation(type, agentId, evidence) {
        const obs = evidence.observed.slice(0, 3).map(e => e.summary).join(' ');
        const tr = evidence.trends.slice(0, 2).map(e => e.summary).join(' ');
        const base = obs || 'No confirmed observations recorded yet.';
        const trendPart = tr ? ` Trend context: ${tr}` : '';
        const conditional = {
            AGENT_DEGRADATION_CONTINUES: `Current confirmed state may persist. ${base}${trendPart}`,
            LATENCY_INCREASE_CONTINUES: `Latency trend may continue along the observed baseline comparison. ${base}${trendPart}`,
            DEPENDENCY_UNAVAILABLE: `Declared dependency topology is evaluated as-is; unavailability is treated as a conditional branch, not an observed fact. ${base}${trendPart}`,
            RECURRING_FAILURES_RETURN: `A previously recorded fleet pattern could reappear under similar conditions. ${base}${trendPart}`,
            INCIDENT_ESCALATION: `An already recorded incident could broaden in scope. ${base}${trendPart}`,
            SLOW_RECOVERY: `Recovery could take longer than previously recorded durations. ${base}${trendPart}`,
            MULTI_AGENT_SPREAD: `Effects could extend beyond the current scope via declared dependencies. ${base}${trendPart}`,
            WARNING_SEVERITY_INCREASE: `An existing inferred warning could strengthen if further converging signals arrive. ${base}${trendPart}`
        };
        return conditional[type] || `${base}${trendPart}`;
    }

    _describeOutcomes(type, agentId, evidence) {
        const who = agentId || 'fleet scope';
        const generic = [
            `Situation stabilizes with continued observation (conditional, not guaranteed).`,
            `Situation persists at current level and requires operator investigation.`
        ];
        const specific = {
            AGENT_DEGRADATION_CONTINUES: [`Degraded state persists on ${who} and consumes operator attention.`, `Degraded state transitions to OFFLINE (possible, not certain).`],
            LATENCY_INCREASE_CONTINUES: [`Elevated latency persists and affects dependent calls.`, `Latency returns toward baseline without intervention (possible).`],
            DEPENDENCY_UNAVAILABLE: [`Dependent agents report errors referencing the unavailable dependency.`, `Traffic shifts or retries mask the dependency gap temporarily.`],
            RECURRING_FAILURES_RETURN: [`Failure signature matching fleet history reappears.`, `No recurrence within the evaluated window.`],
            INCIDENT_ESCALATION: [`Incident gains additional affected agents.`, `Incident remains contained to current scope.`],
            SLOW_RECOVERY: [`Recovery completes later than historical durations.`, `Recovery completes within historical durations.`],
            MULTI_AGENT_SPREAD: [`Additional agents show matching signals via shared dependencies.`, `Signals remain isolated to current scope.`],
            WARNING_SEVERITY_INCREASE: [`Warning severity steps up on new converging evidence.`, `Warning clears as signals return to baseline.`]
        };
        return [...(specific[type] || []), ...generic].map(text => ({
            outcome: text,
            classification: 'CONDITIONAL_POSSIBILITY',
            note: 'What could happen if the situation continues — not a forecast of what will happen.'
        }));
    }
}

module.exports = { ScenarioBuilder, SCENARIO_TYPES };
