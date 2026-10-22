/**
 * Operational Search Service
 * Deterministic, multi-entity operational search layer across agents, incidents, alerts,
 * anomalies, workflows, remediations, dependencies, and audit events.
 */

class OperationalSearchService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.dependencyService = options.dependencyService || null;
        this.decisionService = options.decisionService || null;
        this.auditService = options.auditService || null;
    }

    /**
     * Executes structured operational search across platform entities.
     */
    search(queryStr = '', filters = {}, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';
        const q = String(queryStr || '').toLowerCase().trim();

        const results = {
            agents: [],
            incidents: [],
            dependencies: [],
            automations: [],
            auditEvents: []
        };

        // 1. Search Agents & Incidents in MonitoringStore
        if (this.monitoringService && this.monitoringService.store) {
            try {
                const statuses = Array.from(this.monitoringService.store.statuses.values())
                    .filter(s => s.tenantId === tid);

                statuses.forEach(st => {
                    const matchQ = !q || st.agentId.toLowerCase().includes(q) || String(st.currentState).toLowerCase().includes(q);
                    const matchAgent = !filters.agentId || st.agentId === filters.agentId;
                    const matchStatus = !filters.status || st.currentState === filters.status;

                    if (matchQ && matchAgent && matchStatus) {
                        results.agents.push({
                            agentId: st.agentId,
                            currentState: st.currentState,
                            consecutiveFailures: st.consecutiveFailures,
                            lastChecked: st.lastChecked || st.updatedAt
                        });
                    }
                });

                const incidents = this.monitoringService.store.listIncidents(tid);
                incidents.forEach(inc => {
                    const matchQ = !q ||
                        inc.id.toLowerCase().includes(q) ||
                        inc.agentId.toLowerCase().includes(q) ||
                        String(inc.summary).toLowerCase().includes(q) ||
                        String(inc.status).toLowerCase().includes(q);

                    const matchAgent = !filters.agentId || inc.agentId === filters.agentId;
                    const matchStatus = !filters.status || inc.status === filters.status;
                    const matchSev = !filters.severity || inc.severity === filters.severity;

                    if (matchQ && matchAgent && matchStatus && matchSev) {
                        results.incidents.push({
                            incidentId: inc.id,
                            agentId: inc.agentId,
                            severity: inc.severity,
                            status: inc.status,
                            summary: inc.summary,
                            startedAt: inc.startedAt
                        });
                    }
                });
            } catch (_) {}
        }

        // 2. Search Dependencies
        if (this.dependencyService) {
            try {
                const deps = this.dependencyService.listDependencies({}, tid);
                deps.forEach(dep => {
                    const matchQ = !q ||
                        dep.sourceAgentId.toLowerCase().includes(q) ||
                        dep.targetAgentId.toLowerCase().includes(q) ||
                        dep.relationshipType.toLowerCase().includes(q);

                    const matchAgent = !filters.agentId || dep.sourceAgentId === filters.agentId || dep.targetAgentId === filters.agentId;

                    if (matchQ && matchAgent) {
                        results.dependencies.push({
                            dependencyId: dep.dependencyId,
                            sourceAgentId: dep.sourceAgentId,
                            targetAgentId: dep.targetAgentId,
                            relationshipType: dep.relationshipType,
                            criticality: dep.criticality
                        });
                    }
                });
            } catch (_) {}
        }

        // 3. Search Automations
        if (this.decisionService) {
            try {
                const decs = this.decisionService.listDecisions({}, tid);
                decs.forEach(dec => {
                    const matchQ = !q ||
                        dec.decisionId.toLowerCase().includes(q) ||
                        dec.agentId.toLowerCase().includes(q) ||
                        dec.status.toLowerCase().includes(q);

                    const matchAgent = !filters.agentId || dec.agentId === filters.agentId;

                    if (matchQ && matchAgent) {
                        results.automations.push({
                            decisionId: dec.decisionId,
                            agentId: dec.agentId,
                            status: dec.status,
                            approvalRequired: dec.approvalRequired,
                            createdAt: dec.createdAt
                        });
                    }
                });
            } catch (_) {}
        }

        const totalResults = results.agents.length +
                             results.incidents.length +
                             results.dependencies.length +
                             results.automations.length +
                             results.auditEvents.length;

        return {
            query: queryStr,
            tenantId: tid,
            totalResults,
            results
        };
    }
}

module.exports = {
    OperationalSearchService
};
