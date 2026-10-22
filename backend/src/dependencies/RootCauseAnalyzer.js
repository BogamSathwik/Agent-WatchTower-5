/**
 * Root Cause Analyzer
 * Analyzes multi-agent failures across overlapping time windows using failure timestamps
 * and dependency graph topology to identify ROOT_CAUSE_CANDIDATES with evidence and confidence scores.
 */

class RootCauseAnalyzer {
    constructor(options = {}) {
        this.graphService = options.graphService || null;
        this.monitoringService = options.monitoringService || null;
        this.telemetryService = options.telemetryService || null;
    }

    setGraphService(graphService) {
        this.graphService = graphService;
    }

    /**
     * Analyzes root cause candidates for a set of failing/degraded agents or an incident.
     */
    analyzeRootCause(input = {}, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';
        let agentIds = [];

        if (Array.isArray(input)) {
            agentIds = input;
        } else if (typeof input === 'object' && input !== null) {
            if (Array.isArray(input.agentIds)) {
                agentIds = input.agentIds;
            } else if (input.agentId) {
                agentIds = [input.agentId];
            } else if (input.incidentId && this.monitoringService && this.monitoringService.store) {
                try {
                    const inc = this.monitoringService.store.getIncident(input.incidentId);
                    if (inc) {
                        agentIds = [inc.agentId, ...(inc.affectedAgentIds || [])];
                    }
                } catch (_) {}
            }
        }

        const uniqueAgentIds = Array.from(new Set(agentIds.filter(Boolean)));

        if (uniqueAgentIds.length === 0) {
            return {
                candidates: [],
                tenantId: tid,
                message: 'No agent IDs provided for root cause candidate analysis.',
                analyzedAt: new Date().toISOString()
            };
        }

        // Collect timestamps and health details for each agent
        const agentTimestamps = [];
        uniqueAgentIds.forEach(id => {
            let lastChangeTime = null;
            let currentHealth = 'UNKNOWN';

            if (this.monitoringService && this.monitoringService.store) {
                try {
                    const st = this.monitoringService.store.getStatus(id, tid);
                    if (st) {
                        currentHealth = st.currentState || st.status || 'UNKNOWN';
                        lastChangeTime = st.updatedAt || st.lastChecked || st.timestamp || null;
                    }
                } catch (_) {}
            }

            agentTimestamps.push({
                agentId: id,
                health: currentHealth,
                timestamp: lastChangeTime ? new Date(lastChangeTime).getTime() : Date.now()
            });
        });

        // Sort by earliest timestamp
        agentTimestamps.sort((a, b) => a.timestamp - b.timestamp);

        const candidates = [];
        agentTimestamps.forEach((item, index) => {
            const id = item.agentId;
            let downstreamDependents = [];
            let upstreamDependencies = [];

            if (this.graphService) {
                downstreamDependents = this.graphService.getUpstreamDependents(id, tid);
                upstreamDependencies = this.graphService.getDownstreamDependencies(id, tid);
            }

            // Calculate confidence heuristic
            let confidence = 0.50;

            // Earliest timestamp boost
            if (index === 0) confidence += 0.25;

            // If other failing agents depend on this agent, boost confidence
            const affectedDependents = downstreamDependents.filter(d => uniqueAgentIds.includes(d.agentId));
            if (affectedDependents.length > 0) confidence += 0.15;

            // If this agent depends on another failing agent in the set, reduce confidence (likely an impact)
            const affectedProviders = upstreamDependencies.filter(p => uniqueAgentIds.includes(p.agentId));
            if (affectedProviders.length > 0) confidence -= 0.20;

            confidence = Math.min(0.95, Math.max(0.10, Number(confidence.toFixed(2))));

            const evidence = [
                `Agent '${id}' health state is '${item.health}'.`,
                `State recorded at timestamp '${new Date(item.timestamp).toISOString()}'.`
            ];

            if (index === 0) {
                evidence.push(`Agent '${id}' failed earliest among the analyzed set.`);
            }

            if (affectedDependents.length > 0) {
                evidence.push(`Agent '${id}' has ${affectedDependents.length} downstream dependent agent(s) also failing: [${affectedDependents.map(d => d.agentId).join(', ')}].`);
            }

            if (affectedProviders.length > 0) {
                evidence.push(`Agent '${id}' depends on another failing upstream agent: [${affectedProviders.map(p => p.agentId).join(', ')}].`);
            }

            const alternativeExplanations = [
                'Independent concurrent failure due to external infrastructure or network partition.',
                'Shared unmonitored downstream resource failure (e.g., database or cloud API outage).'
            ];

            candidates.push({
                candidateAgentId: id,
                confidence,
                role: index === 0 ? 'PRIMARY_ROOT_CAUSE_CANDIDATE' : 'SECONDARY_CANDIDATE',
                evidence,
                alternativeExplanations,
                topologicalRole: affectedProviders.length === 0 ? 'ROOT_PROVIDER' : 'INTERMEDIATE_DEPENDENT'
            });
        });

        // Sort candidates by confidence descending and set primary/secondary role
        candidates.sort((a, b) => b.confidence - a.confidence);
        candidates.forEach((cand, idx) => {
            cand.role = idx === 0 ? 'PRIMARY_ROOT_CAUSE_CANDIDATE' : 'SECONDARY_CANDIDATE';
        });

        return {
            tenantId: tid,
            analyzedAgents: uniqueAgentIds,
            candidates,
            disclaimer: 'Candidates are evaluated algorithmically based on relative failure timestamps and graph topology. Results are designated ROOT_CAUSE_CANDIDATE and do not assert absolute causality.',
            analyzedAt: new Date().toISOString()
        };
    }
}

module.exports = {
    RootCauseAnalyzer
};
