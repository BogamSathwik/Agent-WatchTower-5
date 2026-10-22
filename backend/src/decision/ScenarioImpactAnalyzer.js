/**
 * Phase 32 — Scenario Impact Analyzer
 * Computes possible impact scope from recorded topology and history.
 * Impact classes: LOCAL / AGENT / DEPENDENCY / MULTI_AGENT / FLEET.
 * Never invents affected agents; only uses declared/discovered records.
 */

const IMPACT_SCOPES = Object.freeze({
    LOCAL: 'LOCAL',
    AGENT: 'AGENT',
    DEPENDENCY: 'DEPENDENCY',
    MULTI_AGENT: 'MULTI_AGENT',
    FLEET: 'FLEET',
    UNKNOWN: 'UNKNOWN'
});

class ScenarioImpactAnalyzer {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
        this.fleetIntelligenceService = options.fleetIntelligenceService || null;
    }

    analyzeImpact(scenario, { tenantId = 'default-tenant' } = {}) {
        const agentId = scenario ? scenario.agentId : null;
        const affectedAgents = new Set();
        if (agentId) affectedAgents.add(agentId);
        const dependencyEdges = [];
        let blastSummary = 'Blast-radius analysis not available for scope.';
        let blastCount = 0;

        // Declared dependency edges touching the agent
        if (this.dependencyGraphService && agentId) {
            try {
                const graph = typeof this.dependencyGraphService.getDependencyGraph === 'function'
                    ? this.dependencyGraphService.getDependencyGraph({}, tenantId)
                    : null;
                const edges = (graph && graph.edges) || [];
                for (const e of edges.slice(0, 50)) {
                    const from = e.from || e.source || e.sourceId;
                    const to = e.to || e.target || e.targetId || e.targetSystemId;
                    if (from === agentId || to === agentId) {
                        dependencyEdges.push({ from, to, relationship: e.relationship || e.type || 'DEPENDS_ON', classification: 'CONFIRMED' });
                        if (from && from !== agentId) affectedAgents.add(from);
                        if (to && to !== agentId) affectedAgents.add(to);
                    }
                }
            } catch (e) { /* non-fatal */ }
        }

        // Computed blast radius (INFERRED)
        if (this.blastRadiusAnalyzer && agentId) {
            try {
                const blast = typeof this.blastRadiusAnalyzer.analyzeBlastRadius === 'function'
                    ? this.blastRadiusAnalyzer.analyzeBlastRadius(agentId, tenantId)
                    : null;
                if (blast) {
                    const list = blast.affectedAgents || blast.impactedAgents || [];
                    if (Array.isArray(list)) {
                        for (const a of list.slice(0, 20)) affectedAgents.add(a);
                        blastCount = list.length;
                    }
                    blastSummary = `Computed blast radius lists ${blastCount} potentially affected agent(s) (INFERRED computation over CONFIRMED topology).`;
                }
            } catch (e) { /* non-fatal */ }
        }

        // Fleet-wide spread check: matching signals on other agents
        let fleetSpreadNote = 'No fleet-wide spread evaluated (single-agent scope or insufficient data).';
        if (!agentId && this.monitoringService) {
            try {
                const store = this.monitoringService.store;
                const statuses = store ? store.listStatuses(tenantId) : [];
                const degraded = statuses.filter(s => (s.currentState || s.status) === 'DEGRADED' || (s.consecutiveFailures || 0) >= 2);
                for (const s of degraded.slice(0, 20)) affectedAgents.add(s.agentId);
                fleetSpreadNote = `${degraded.length} agent(s) currently show degraded/failing signals (CONFIRMED snapshot).`;
            } catch (e) { /* non-fatal */ }
        }

        const count = affectedAgents.size;
        let impactScope = IMPACT_SCOPES.UNKNOWN;
        if (!agentId && count > 1) impactScope = IMPACT_SCOPES.FLEET;
        else if (count > 2) impactScope = IMPACT_SCOPES.MULTI_AGENT;
        else if (dependencyEdges.length > 0 && count > 1) impactScope = IMPACT_SCOPES.DEPENDENCY;
        else if (count === 1) impactScope = IMPACT_SCOPES.AGENT;
        else if (count === 0) impactScope = IMPACT_SCOPES.LOCAL;

        return {
            impactScope,
            affectedAgents: [...affectedAgents],
            affectedAgentsCount: count,
            dependencyEdges: dependencyEdges.slice(0, 20),
            blastRadius: { affectedCount: blastCount, summary: blastSummary, classification: 'INFERRED' },
            fleetSpreadNote,
            classificationNote: 'Affected list contains only recorded/decomputed agents. No invented business impact.'
        };
    }
}

module.exports = { ScenarioImpactAnalyzer, IMPACT_SCOPES };
