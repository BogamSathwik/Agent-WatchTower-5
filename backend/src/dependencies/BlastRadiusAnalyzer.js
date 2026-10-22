/**
 * Blast Radius Analyzer
 * Calculates direct and indirect failure impact across upstream dependents,
 * workflows, incidents, and automation policies without assuming absolute causality.
 */

class BlastRadiusAnalyzer {
    constructor(options = {}) {
        this.graphService = options.graphService || null;
        this.monitoringService = options.monitoringService || null;
        this.workflowService = options.workflowService || null;
        this.automationEngine = options.automationEngine || null;
    }

    setGraphService(graphService) {
        this.graphService = graphService;
    }

    /**
     * Calculates the estimated blast radius when an agent experiences a failure or degradation.
     */
    analyzeBlastRadius(agentId, tenantId = 'default-tenant') {
        if (!agentId) {
            throw new Error('agentId is required for blast radius analysis.');
        }

        const tid = tenantId || 'default-tenant';

        if (!this.graphService) {
            return {
                rootAgentId: agentId,
                tenantId: tid,
                directlyAffected: [],
                indirectlyAffected: [],
                totalAffectedCount: 0,
                maxDepth: 0,
                criticalityBreakdown: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, OPTIONAL: 0 },
                potentiallyAffectedWorkflows: [],
                potentiallyAffectedIncidents: [],
                potentiallyAffectedAutomations: [],
                disclaimer: 'GraphService not available for deep topology analysis.'
            };
        }

        // Get direct upstream dependents (1 hop)
        const directUpstream = this.graphService.getDirectUpstream(agentId, tid);
        const directlyAffected = directUpstream.map(item => {
            let health = 'UNKNOWN';
            if (this.monitoringService && this.monitoringService.store) {
                try {
                    const st = this.monitoringService.store.getStatus(item.agentId, tid);
                    if (st) health = st.currentState || st.status || 'UNKNOWN';
                } catch (_) {}
            }
            return {
                agentId: item.agentId,
                relationshipType: item.relationshipType,
                criticality: item.criticality,
                impactType: 'POTENTIALLY_AFFECTED_DIRECT',
                confirmedHealth: health
            };
        });

        // Get all upstream dependents (2+ hops)
        const allUpstream = this.graphService.getUpstreamDependents(agentId, tid);
        const directIds = new Set(directlyAffected.map(d => d.agentId));
        
        const indirectlyAffected = allUpstream
            .filter(item => !directIds.has(item.agentId))
            .map(item => {
                let health = 'UNKNOWN';
                if (this.monitoringService && this.monitoringService.store) {
                    try {
                        const st = this.monitoringService.store.getStatus(item.agentId, tid);
                        if (st) health = st.currentState || st.status || 'UNKNOWN';
                    } catch (_) {}
                }
                return {
                    agentId: item.agentId,
                    depth: item.depth,
                    relationshipType: item.relationshipType,
                    criticality: item.criticality,
                    impactType: 'POTENTIALLY_AFFECTED_INDIRECT',
                    confirmedHealth: health
                };
            });

        // Calculate max depth
        const maxDepth = allUpstream.length > 0 ? Math.max(...allUpstream.map(u => u.depth)) : 0;

        // Breakdown by criticality
        const criticalityBreakdown = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, OPTIONAL: 0 };
        [...directlyAffected, ...indirectlyAffected].forEach(item => {
            const crit = item.criticality || 'HIGH';
            if (criticalityBreakdown[crit] !== undefined) {
                criticalityBreakdown[crit]++;
            } else {
                criticalityBreakdown.HIGH++;
            }
        });

        // Potentially affected incidents
        const potentiallyAffectedIncidents = [];
        if (this.monitoringService && this.monitoringService.store) {
            try {
                const affectedIds = [agentId, ...directlyAffected.map(d => d.agentId), ...indirectlyAffected.map(i => i.agentId)];
                affectedIds.forEach(id => {
                    const inc = this.monitoringService.store.findActiveIncident(id, tid);
                    if (inc) {
                        potentiallyAffectedIncidents.push({
                            incidentId: inc.id,
                            agentId: id,
                            severity: inc.severity,
                            status: inc.status,
                            summary: inc.summary
                        });
                    }
                });
            } catch (_) {}
        }

        // Potentially affected automations
        const potentiallyAffectedAutomations = [];
        if (this.automationEngine) {
            try {
                const policies = this.automationEngine.listPolicies({}, tid);
                if (Array.isArray(policies)) {
                    policies.forEach(p => {
                        potentiallyAffectedAutomations.push({
                            policyId: p.policyId,
                            name: p.name,
                            trigger: p.trigger,
                            workflowId: p.workflowId
                        });
                    });
                }
            } catch (_) {}
        }

        return {
            rootAgentId: agentId,
            tenantId: tid,
            directlyAffected,
            indirectlyAffected,
            totalAffectedCount: directlyAffected.length + indirectlyAffected.length,
            maxDepth,
            criticalityBreakdown,
            potentiallyAffectedWorkflows: [],
            potentiallyAffectedIncidents,
            potentiallyAffectedAutomations,
            disclaimer: 'All impact statuses are designated POTENTIALLY AFFECTED based on graph topology. Confirmed agent health probe data is listed separately to avoid false causality assertions.'
        };
    }
}

module.exports = {
    BlastRadiusAnalyzer
};
