/**
 * Phase 33 — Simulation Impact Engine
 * Analyzes possible impact scope from recorded topology and history.
 * Read-only: never mutates dependency or health state.
 * Scopes: LOCAL / AGENT / DEPENDENCY / MULTI_AGENT / FLEET.
 */

const IMPACT_SCOPES = Object.freeze({
    LOCAL: 'LOCAL',
    AGENT: 'AGENT',
    DEPENDENCY: 'DEPENDENCY',
    MULTI_AGENT: 'MULTI_AGENT',
    FLEET: 'FLEET',
    UNKNOWN: 'UNKNOWN'
});

class SimulationImpactEngine {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
    }

    analyzeImpact(simulation, { tenantId = 'default-tenant' } = {}) {
        const agentId = simulation ? simulation.agentId : null;
        const dependencyTarget = simulation ? simulation.dependencyTarget : null;
        const focal = dependencyTarget || agentId;
        const affectedAgents = new Set();
        if (agentId) affectedAgents.add(agentId);
        const dependencyEdges = [];
        let blastSummary = 'Blast-radius analysis not available for scope.';
        let blastCount = 0;

        if (this.dependencyGraphService && focal) {
            try {
                const graph = typeof this.dependencyGraphService.getDependencyGraph === 'function'
                    ? this.dependencyGraphService.getDependencyGraph({}, tenantId)
                    : null;
                const edges = (graph && graph.edges) || [];
                for (const e of edges.slice(0, 50)) {
                    const from = e.from || e.source || e.sourceId;
                    const to = e.to || e.target || e.targetId || e.targetSystemId;
                    if (from === focal || to === focal || (agentId && (from === agentId || to === agentId))) {
                        dependencyEdges.push({ from, to, relationship: e.relationship || e.type || 'DEPENDS_ON', classification: 'CONFIRMED' });
                        if (from && from !== focal) affectedAgents.add(from);
                        if (to && to !== focal) affectedAgents.add(to);
                    }
                }
            } catch (e) { /* non-fatal */ }
        }

        if (this.blastRadiusAnalyzer && focal) {
            try {
                const blast = typeof this.blastRadiusAnalyzer.analyzeBlastRadius === 'function'
                    ? this.blastRadiusAnalyzer.analyzeBlastRadius(focal, tenantId)
                    : null;
                if (blast) {
                    const list = blast.affectedAgents || blast.impactedAgents || [];
                    const others = Array.isArray(list) ? list.filter(a => a && a !== focal) : [];
                    for (const a of others.slice(0, 20)) affectedAgents.add(a);
                    blastCount = others.length;
                    blastSummary = `Computed blast radius lists ${blastCount} other potentially affected agent(s) (INFERRED computation over CONFIRMED topology).`;
                }
            } catch (e) { /* non-fatal */ }
        }

        // Dependency-failure propagation: dependents of the failed target could
        // observe errors; this is modeled from declared edges only.
        let propagationNote = 'No propagation modeled (no dependency-failure branch or no declared edges).';
        if (simulation && simulation.simulationType === 'DEPENDENCY_FAILURE' && dependencyEdges.length > 0) {
            propagationNote = `If '${focal}' remains offline, ${dependencyEdges.length} declared edge(s) could carry errors to dependents (SIMULATED propagation over CONFIRMED edges).`;
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
            propagationNote,
            supportingEvidence: dependencyEdges.length > 0
                ? [`${dependencyEdges.length} declared edge(s) touch the simulated scope (CONFIRMED).`]
                : ['INSUFFICIENT_DATA: no declared edges touch the simulated scope.'],
            classificationNote: 'Affected list contains only recorded/computed agents. No invented impact.'
        };
    }
}

module.exports = { SimulationImpactEngine, IMPACT_SCOPES };
