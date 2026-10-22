/**
 * Phase 30 — Incident Pattern Analyzer
 * Analyzes historical incidents to group observable characteristics and recurring patterns.
 * Tags evidence assertions as CONFIRMED, INFERRED, or UNKNOWN.
 */

class IncidentPatternAnalyzer {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
    }

    /**
     * Analyzes incident patterns for a tenant.
     */
    analyzePatterns(tenantId = 'default-tenant') {
        const store = this.monitoringService ? this.monitoringService.store : null;
        if (!store || !store.incidents) return [];

        const incidents = Array.from(store.incidents.values()).filter(i => i.tenantId === tenantId || !tenantId);
        const patterns = [];

        // Group by incident type
        const typeMap = new Map();
        incidents.forEach(inc => {
            const type = inc.type || inc.trigger || 'HEALTH_DEGRADATION';
            if (!typeMap.has(type)) typeMap.set(type, []);
            typeMap.get(type).push(inc);
        });

        typeMap.forEach((incList, type) => {
            const agentIds = Array.from(new Set(incList.map(i => i.agentId).filter(Boolean)));
            const confirmCount = incList.length;

            patterns.push({
                patternId: `pat_${type.toLowerCase()}_${Date.now()}`,
                patternType: type,
                title: `Recurring ${type} Incidents`,
                occurrenceCount: confirmCount,
                affectedAgents: agentIds,
                sourceIncidentIds: incList.map(i => i.id || i.incidentId),
                evidenceTag: confirmCount > 1 ? 'CONFIRMED' : 'INFERRED',
                summary: `Observed ${confirmCount} incidents of type '${type}' affecting agents: ${agentIds.join(', ')}.`,
                evidence: incList.map(i => `${i.id || i.incidentId}: ${i.summary || i.title || type}`)
            });
        });

        return patterns;
    }
}

module.exports = { IncidentPatternAnalyzer };
