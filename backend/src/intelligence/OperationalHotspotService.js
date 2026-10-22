/**
 * Phase 30 — Operational Hotspot Service
 * Identifies areas of the platform receiving unusually high operational attention.
 * Deterministically explains WHY IT IS A HOTSPOT using empirical evidence.
 */

class OperationalHotspotService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.recurringProblemIntelligence = options.recurringProblemIntelligence || null;
    }

    getHotspots(tenantId = 'default-tenant') {
        const store = this.monitoringService ? this.monitoringService.store : null;
        const hotspots = [];

        if (!store) return hotspots;

        const incidents = store.incidents ? Array.from(store.incidents.values()).filter(i => i.tenantId === tenantId || !tenantId) : [];
        const statuses = store.statuses ? Array.from(store.statuses.values()).filter(s => s.tenantId === tenantId || !tenantId) : [];

        // 1. Identify agents with high incident frequency
        const incidentCounts = {};
        incidents.forEach(inc => {
            const aid = inc.agentId || 'UNKNOWN';
            incidentCounts[aid] = (incidentCounts[aid] || 0) + 1;
        });

        for (const [agentId, count] of Object.entries(incidentCounts)) {
            if (count >= 1) {
                hotspots.push({
                    hotspotId: `hs_incidents_${agentId}`,
                    affectedArea: `Agent: ${agentId}`,
                    reason: `Agent ${agentId} has accumulated ${count} operational incidents requiring attention.`,
                    evidence: [
                        `${count} incident records logged in monitoring store.`,
                        `Current agent status: ${store.getStatus ? (store.getStatus(agentId, tenantId)?.status || 'UNKNOWN') : 'UNKNOWN'}`
                    ],
                    relatedIncidents: incidents.filter(i => i.agentId === agentId).map(i => i.id || i.incidentId),
                    affectedAgents: [agentId],
                    affectedDependencies: [],
                    investigationShortcut: `/api/v1/knowledge/agents/${agentId}/context`
                });
            }
        }

        // 2. Identify degraded/offline agents
        statuses.forEach(st => {
            if ((st.status === 'DEGRADED' || st.status === 'OFFLINE') && !incidentCounts[st.agentId]) {
                hotspots.push({
                    hotspotId: `hs_status_${st.agentId}`,
                    affectedArea: `Agent: ${st.agentId}`,
                    reason: `Agent ${st.agentId} is in ${st.status} operational state.`,
                    evidence: [
                        `Consecutive failure checks: ${st.consecutiveFailures || 1}`,
                        `Availability: ${st.availabilityPercentage !== undefined ? st.availabilityPercentage + '%' : 'N/A'}`
                    ],
                    relatedIncidents: [],
                    affectedAgents: [st.agentId],
                    affectedDependencies: [],
                    investigationShortcut: `/api/v1/command-center/agents/${st.agentId}`
                });
            }
        });

        return hotspots;
    }
}

module.exports = { OperationalHotspotService };
