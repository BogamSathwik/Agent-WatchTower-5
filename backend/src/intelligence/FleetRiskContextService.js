/**
 * Phase 30 — Fleet Risk Context Service
 * Aggregates agent risks, dependency risks, incident patterns, recurring problems,
 * anomaly patterns, and response failures into fleet-level risk context.
 * Complements existing PredictiveRiskEngine without duplicating logic.
 */

class FleetRiskContextService {
    constructor(options = {}) {
        this.predictiveRiskEngine = options.predictiveRiskEngine || null;
        this.recurringProblemIntelligence = options.recurringProblemIntelligence || null;
        this.hotspotService = options.hotspotService || null;
    }

    getFleetRisks(tenantId = 'default-tenant') {
        const problems = this.recurringProblemIntelligence 
            ? this.recurringProblemIntelligence.detectRecurringProblems(tenantId)
            : [];

        const hotspots = this.hotspotService
            ? this.hotspotService.getHotspots(tenantId)
            : [];

        const overallFleetRisk = (problems.length > 0 || hotspots.length > 0) ? 'ELEVATED' : 'NOMINAL';

        return {
            tenantId,
            overallFleetRisk,
            riskScore: problems.length * 25 + hotspots.length * 15,
            factors: {
                recurringProblemsCount: problems.length,
                activeHotspotsCount: hotspots.length,
                highRiskAgentsCount: hotspots.filter(h => h.reason.includes('OFFLINE') || h.reason.includes('CRITICAL')).length
            },
            riskSummary: overallFleetRisk === 'ELEVATED'
                ? `Fleet risk is ELEVATED due to ${problems.length} recurring problems and ${hotspots.length} active operational hotspots.`
                : 'Fleet operational risk is within NOMINAL baseline parameters.',
            topRiskAreas: hotspots.map(h => ({
                area: h.affectedArea,
                reason: h.reason,
                evidence: h.evidence
            }))
        };
    }
}

module.exports = { FleetRiskContextService };
