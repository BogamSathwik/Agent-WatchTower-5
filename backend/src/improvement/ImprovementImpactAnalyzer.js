/**
 * Phase 35 — Improvement Impact Analyzer
 * Analyzes the possible operational scope of an improvement without
 * mutating topology or health state. Scopes: LOCAL / AGENT / DEPENDENCY /
 * MULTI_AGENT / FLEET. Includes reversibility, uncertainty, and
 * implementation dependencies as recorded facts.
 */

const IMPACT_SCOPES = Object.freeze({
    LOCAL: 'LOCAL',
    AGENT: 'AGENT',
    DEPENDENCY: 'DEPENDENCY',
    MULTI_AGENT: 'MULTI_AGENT',
    FLEET: 'FLEET',
    UNKNOWN: 'UNKNOWN'
});

class ImprovementImpactAnalyzer {
    constructor(options = {}) {
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
        this.monitoringService = options.monitoringService || null;
    }

    analyzeImpact({ opportunity = null, agentId = null, tenantId = 'default-tenant' } = {}) {
        const focal = (opportunity && opportunity.agentId) || agentId;
        const affectedAgents = new Set();
        if (focal) affectedAgents.add(focal);
        if (opportunity && Array.isArray(opportunity.relatedAgents)) {
            for (const a of opportunity.relatedAgents.slice(0, 20)) if (a) affectedAgents.add(a);
        }
        const dependencyEdges = [];
        let blastSummary = 'Blast-radius analysis not available for scope.';
        let blastCount = 0;

        if (this.dependencyGraphService && focal) {
            try {
                const graph = typeof this.dependencyGraphService.getDependencyGraph === 'function'
                    ? this.dependencyGraphService.getDependencyGraph({}, tenantId) : null;
                const edges = (graph && graph.edges) || [];
                for (const e of edges.slice(0, 50)) {
                    const from = e.from || e.source || e.sourceId;
                    const to = e.to || e.target || e.targetId || e.targetSystemId;
                    if (from === focal || to === focal) {
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
                    ? this.blastRadiusAnalyzer.analyzeBlastRadius(focal, tenantId) : null;
                if (blast) {
                    const list = blast.affectedAgents || blast.impactedAgents || [];
                    const others = Array.isArray(list) ? list.filter(a => a && a !== focal) : [];
                    for (const a of others.slice(0, 20)) affectedAgents.add(a);
                    blastCount = others.length;
                    blastSummary = `Computed blast radius lists ${blastCount} other potentially affected agent(s) (INFERRED computation over CONFIRMED topology).`;
                }
            } catch (e) { /* non-fatal */ }
        }

        const count = affectedAgents.size;
        let impactScope = IMPACT_SCOPES.UNKNOWN;
        if (!focal && count > 1) impactScope = IMPACT_SCOPES.FLEET;
        else if (count > 2) impactScope = IMPACT_SCOPES.MULTI_AGENT;
        else if (dependencyEdges.length > 0 && count > 1) impactScope = IMPACT_SCOPES.DEPENDENCY;
        else if (count === 1) impactScope = IMPACT_SCOPES.AGENT;
        else if (count === 0) impactScope = (opportunity && !opportunity.agentId) ? IMPACT_SCOPES.FLEET : IMPACT_SCOPES.LOCAL;

        const isProcessOnly = opportunity && /OBSERVABILITY_GAP|RESPONSE_PROCESS_GAP|POLICY_REVIEW_OPPORTUNITY|VERIFICATION_GAP/.test(opportunity.type || '');
        return {
            impactScope,
            affectedAgents: [...affectedAgents],
            affectedAgentsCount: count,
            dependencyEdges: dependencyEdges.slice(0, 20),
            blastRadius: { affectedCount: blastCount, summary: blastSummary, classification: 'INFERRED' },
            reversibility: isProcessOnly
                ? 'A review or documentation change is fully reversible; no production state is touched by the proposal itself.'
                : 'Reversibility depends on the externally implemented change; the proposal only describes it.',
            uncertainty: count === 0
                ? 'Scope is fleet-wide or not yet attributable; impact is described qualitatively.'
                : `Scope derived from ${count} recorded agent(s) and ${dependencyEdges.length} declared edge(s).`,
            implementationDependencies: dependencyEdges.length > 0
                ? ['Implementation should respect declared dependency edges; coordinate with owners of dependent scope.']
                : ['No declared implementation dependencies recorded for scope.'],
            classificationNote: 'Scope lists recorded/computed agents only. No topology or health mutated.'
        };
    }
}

module.exports = { ImprovementImpactAnalyzer, IMPACT_SCOPES };
