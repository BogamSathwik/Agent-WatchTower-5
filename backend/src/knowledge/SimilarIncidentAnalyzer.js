/**
 * Similar Incident Analyzer
 * Compares active incidents against historical incident records using observable characteristics
 * (agent ID, trigger type, severity, affected agents, outcomes) without fabricating similarity.
 */

class SimilarIncidentAnalyzer {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
    }

    /**
     * Finds historical incidents similar to the specified target incident.
     */
    findSimilarIncidents(incidentId, tenantId = 'default-tenant', options = {}) {
        const tid = tenantId || 'default-tenant';

        if (!this.monitoringService || !this.monitoringService.store) {
            return {
                targetIncidentId: incidentId,
                tenantId: tid,
                hasHistoricalContext: false,
                message: 'INSUFFICIENT_DATA',
                similarIncidents: []
            };
        }

        const targetInc = this.monitoringService.store.getIncident(incidentId);
        if (!targetInc) {
            return {
                targetIncidentId: incidentId,
                tenantId: tid,
                hasHistoricalContext: false,
                message: `Target incident '${incidentId}' not found.`,
                similarIncidents: []
            };
        }

        const allIncidents = this.monitoringService.store.listIncidents(tid);
        const historical = allIncidents.filter(inc => inc.id !== incidentId);

        if (historical.length === 0) {
            return {
                targetIncidentId: incidentId,
                tenantId: tid,
                hasHistoricalContext: false,
                message: 'INSUFFICIENT_DATA',
                similarIncidents: []
            };
        }

        const matches = [];

        historical.forEach(inc => {
            let score = 0;
            const factors = [];

            if (inc.agentId === targetInc.agentId) {
                score += 0.35;
                factors.push('Identical primary agent ID');
            }

            if ((inc.type || inc.trigger) === (targetInc.type || targetInc.trigger)) {
                score += 0.25;
                factors.push(`Same incident trigger type '${inc.type || inc.trigger}'`);
            }

            if (inc.severity === targetInc.severity) {
                score += 0.15;
                factors.push(`Matching severity level '${inc.severity}'`);
            }

            const targetAffected = new Set(targetInc.affectedAgentIds || []);
            const currentAffected = inc.affectedAgentIds || [];
            const overlap = currentAffected.filter(id => targetAffected.has(id));
            if (overlap.length > 0) {
                score += 0.15;
                factors.push(`Overlapping affected agents: [${overlap.join(', ')}]`);
            }

            if (inc.status === targetInc.status || inc.state === targetInc.state) {
                score += 0.10;
                factors.push(`Matching status outcome '${inc.status || inc.state}'`);
            }

            score = Number(Math.min(1.0, score).toFixed(2));

            if (score >= 0.30) {
                matches.push({
                    incidentId: inc.id,
                    similarityScore: score,
                    similarityFactors: factors,
                    agentId: inc.agentId,
                    trigger: inc.type || inc.trigger,
                    severity: inc.severity,
                    status: inc.status || inc.state,
                    startedAt: inc.startedAt,
                    remediationUsed: inc.remediationId || 'STANDARD_RECOVERY'
                });
            }
        });

        matches.sort((a, b) => b.similarityScore - a.similarityScore);

        return {
            targetIncidentId: incidentId,
            tenantId: tid,
            hasHistoricalContext: matches.length > 0,
            count: matches.length,
            similarIncidents: matches,
            analyzedAt: new Date().toISOString()
        };
    }
}

module.exports = {
    SimilarIncidentAnalyzer
};
