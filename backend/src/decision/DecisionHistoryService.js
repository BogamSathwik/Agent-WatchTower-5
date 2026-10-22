/**
 * Phase 32 — Decision History Service
 * Persists scenario creation + decision-analysis records via the existing
 * persistence abstraction (best-effort) with an in-memory primary store.
 * History is a timeline of operator analyses, never of executed actions
 * (execution remains in the Response Center).
 */

class DecisionHistoryService {
    constructor(options = {}) {
        this.persistence = options.persistenceManager || options.persistence || null;
        this.scenarios = new Map(); // scenarioId -> scenario
        this.events = new Map(); // scenarioId -> [events]
    }

    _persistBestEffort(collection, key, value) {
        try {
            if (this.persistence && typeof this.persistence.set === 'function') {
                const r = this.persistence.set(collection, key, value);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            }
        } catch (e) { /* persistence is best-effort */ }
    }

    saveScenario(scenario) {
        this.scenarios.set(scenario.scenarioId, scenario);
        this.appendEvent(scenario.scenarioId, {
            eventType: 'SCENARIO_CREATED',
            summary: `Scenario '${scenario.title}' created from ${scenario.sourceEvidence.observed.length} observed + ${scenario.sourceEvidence.trends.length} trend record(s).`,
            classification: scenario.status === 'READY' ? 'CONFIRMED' : 'INSUFFICIENT_DATA',
            actor: 'operator',
            tenantId: scenario.tenantId
        });
        this._persistBestEffort('decision_scenarios', `${scenario.tenantId}:${scenario.scenarioId}`, scenario);
        return scenario;
    }

    getScenario(scenarioId, tenantId = null) {
        const scn = this.scenarios.get(scenarioId);
        if (!scn) return null;
        if (tenantId && scn.tenantId !== tenantId) return null;
        return scn;
    }

    listScenarios(tenantId = null) {
        const all = [...this.scenarios.values()];
        return tenantId ? all.filter(s => s.tenantId === tenantId) : all;
    }

    appendEvent(scenarioId, { eventType, summary, classification = 'CONFIRMED', actor = 'operator', tenantId = 'default-tenant', metadata = {} } = {}) {
        const entry = {
            eventId: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            scenarioId,
            eventType, // SCENARIO_CREATED | EVIDENCE_REVIEWED | OPTIONS_GENERATED | OPERATOR_DECISION_RECORDED | SCENARIO_ACKNOWLEDGED
            summary: String(summary || '').slice(0, 600),
            classification, // CONFIRMED | INFERRED | PREDICTED | INSUFFICIENT_DATA
            actor,
            tenantId,
            metadata,
            recordedAt: new Date().toISOString()
        };
        if (!this.events.has(scenarioId)) this.events.set(scenarioId, []);
        this.events.get(scenarioId).push(entry);
        this._persistBestEffort('decision_history', `${tenantId}:${scenarioId}:${entry.eventId}`, entry);
        return entry;
    }

    getHistory(scenarioId, tenantId = null) {
        const scn = this.scenarios.get(scenarioId);
        if (!scn) return null;
        if (tenantId && scn.tenantId !== tenantId) return null;
        return [...(this.events.get(scenarioId) || [])];
    }
}

module.exports = { DecisionHistoryService };
