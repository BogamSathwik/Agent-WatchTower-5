/**
 * Phase 30 — Operational Improvement Service
 * Generates evidence-based operational improvement suggestions.
 * Strictly informational — does NOT automatically execute suggestions without operator consent.
 */

class OperationalImprovementService {
    constructor(options = {}) {
        this.recurringProblemIntelligence = options.recurringProblemIntelligence || null;
        this.hotspotService = options.hotspotService || null;
        this.responseEffectivenessService = options.responseEffectivenessService || null;
    }

    getImprovements(tenantId = 'default-tenant') {
        const improvements = [];

        const problems = this.recurringProblemIntelligence 
            ? this.recurringProblemIntelligence.detectRecurringProblems(tenantId)
            : [];

        const hotspots = this.hotspotService
            ? this.hotspotService.getHotspots(tenantId)
            : [];

        // 1. Suggestion for recurring problems
        problems.forEach(p => {
            improvements.push({
                improvementId: `imp_prob_${p.problemId}`,
                category: 'RECURRING_PROBLEM',
                title: `Investigate Repeated Degradation on ${p.affectedAgents.join(', ')}`,
                reason: `Agent has experienced ${p.frequency} recurring incident occurrences.`,
                affectedArea: p.affectedAgents.join(', '),
                evidence: p.evidence,
                sourceRecords: p.relatedIncidents,
                suggestedInvestigation: `Inspect timeline and evidence chain for agent ${p.affectedAgents[0]}.`
            });
        });

        // 2. Suggestion for hotspots
        hotspots.forEach(h => {
            if (!problems.some(p => p.affectedAgents.includes(h.affectedAgents[0]))) {
                improvements.push({
                    improvementId: `imp_hs_${h.hotspotId}`,
                    category: 'OPERATIONAL_HOTSPOT',
                    title: `Review Operational Hotspot: ${h.affectedArea}`,
                    reason: h.reason,
                    affectedArea: h.affectedArea,
                    evidence: h.evidence,
                    sourceRecords: h.relatedIncidents,
                    suggestedInvestigation: `Run diagnostic inspection on ${h.affectedArea}.`
                });
            }
        });

        if (improvements.length === 0) {
            improvements.push({
                improvementId: 'imp_baseline_nominal',
                category: 'HEALTH_OPTIMIZATION',
                title: 'Maintain Baseline Monitoring',
                reason: 'All monitored agents operating within normal baseline parameters.',
                affectedArea: 'Fleet-wide',
                evidence: ['Zero recurring degradation patterns detected.'],
                sourceRecords: [],
                suggestedInvestigation: 'Continue routine automated probe monitoring.'
            });
        }

        return improvements;
    }
}

module.exports = { OperationalImprovementService };
