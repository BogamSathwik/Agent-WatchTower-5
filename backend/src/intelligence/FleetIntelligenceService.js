/**
 * Phase 30 — Fleet Intelligence Service
 * Master orchestration service for Agent Fleet Intelligence & Operational Learning.
 * Aggregates long-term operational performance, reliability analysis, recurring problems,
 * operational hotspots, dependency reliability, incident patterns, response effectiveness,
 * recovery duration analysis, trends, risks, and improvement suggestions across the platform.
 */

const { AgentReliabilityAnalyzer } = require('./AgentReliabilityAnalyzer');
const { RecurringProblemIntelligence } = require('./RecurringProblemIntelligence');
const { OperationalHotspotService } = require('./OperationalHotspotService');
const { IncidentPatternAnalyzer } = require('./IncidentPatternAnalyzer');
const { ResponseEffectivenessService } = require('./ResponseEffectivenessService');
const { RecoveryIntelligenceService } = require('./RecoveryIntelligenceService');
const { FleetTrendService } = require('./FleetTrendService');
const { FleetRiskContextService } = require('./FleetRiskContextService');
const { OperationalImprovementService } = require('./OperationalImprovementService');

class FleetIntelligenceService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.responseCenterService = options.responseCenterService || null;
        this.agentKnowledgeGraphService = options.agentKnowledgeGraphService || null;
        this.auditService = options.auditService || null;
        this.persistence = options.persistenceManager || options.persistence || null;

        // Sub-services
        this.reliabilityAnalyzer = options.reliabilityAnalyzer || new AgentReliabilityAnalyzer({
            monitoringService: this.monitoringService
        });

        this.recurringProblemIntelligence = options.recurringProblemIntelligence || new RecurringProblemIntelligence({
            monitoringService: this.monitoringService
        });

        this.hotspotService = options.hotspotService || new OperationalHotspotService({
            monitoringService: this.monitoringService,
            dependencyGraphService: this.dependencyGraphService,
            recurringProblemIntelligence: this.recurringProblemIntelligence
        });

        this.incidentPatternAnalyzer = options.incidentPatternAnalyzer || new IncidentPatternAnalyzer({
            monitoringService: this.monitoringService
        });

        this.responseEffectivenessService = options.responseEffectivenessService || new ResponseEffectivenessService({
            responseCenterService: this.responseCenterService
        });

        this.recoveryIntelligenceService = options.recoveryIntelligenceService || new RecoveryIntelligenceService({
            monitoringService: this.monitoringService,
            responseCenterService: this.responseCenterService
        });

        this.fleetTrendService = options.fleetTrendService || new FleetTrendService({
            monitoringService: this.monitoringService
        });

        this.fleetRiskContextService = options.fleetRiskContextService || new FleetRiskContextService({
            recurringProblemIntelligence: this.recurringProblemIntelligence,
            hotspotService: this.hotspotService
        });

        this.operationalImprovementService = options.operationalImprovementService || new OperationalImprovementService({
            recurringProblemIntelligence: this.recurringProblemIntelligence,
            hotspotService: this.hotspotService,
            responseEffectivenessService: this.responseEffectivenessService
        });
    }

    /**
     * Retrieves top-level fleet overview metrics and summary counts.
     */
    getFleetOverview({ tenantId = 'default-tenant' } = {}) {
        const reliability = this.reliabilityAnalyzer.analyzeFleet(tenantId);
        const recurringProblems = this.recurringProblemIntelligence.detectRecurringProblems(tenantId);
        const hotspots = this.hotspotService.getHotspots(tenantId);
        const dependencyReliability = this.getDependencyReliability({ tenantId });
        const incidentPatterns = this.incidentPatternAnalyzer.analyzePatterns(tenantId);
        const responseEffectiveness = this.responseEffectivenessService.getResponseEffectiveness(tenantId);
        const recoveryAnalysis = this.recoveryIntelligenceService.getRecoveryAnalysis(tenantId);
        const longTermTrends = this.fleetTrendService.getTrends('24h', tenantId);
        const risks = this.fleetRiskContextService.getFleetRisks(tenantId);
        const improvements = this.operationalImprovementService.getImprovements(tenantId);

        return {
            tenantId,
            timestamp: new Date().toISOString(),
            fleetSize: reliability.length,
            overallReliabilityStatus: risks.overallFleetRisk,
            scorecard: {
                totalMonitoredAgents: reliability.length,
                healthyAgentsCount: reliability.filter(r => r.status === 'HEALTHY').length,
                degradedAgentsCount: reliability.filter(r => r.status === 'DEGRADED').length,
                offlineAgentsCount: reliability.filter(r => r.status === 'OFFLINE').length,
                recurringProblemsCount: recurringProblems.length,
                operationalHotspotsCount: hotspots.length,
                improvementSuggestionsCount: improvements.length
            },
            agentReliability: reliability,
            recurringProblems,
            operationalHotspots: hotspots,
            dependencyReliability,
            incidentPatterns,
            responseEffectiveness,
            recoveryAnalysis,
            longTermTrends,
            fleetRisks: risks,
            operationalRecommendations: improvements,
            summaryHighlights: [
                `${reliability.length} total monitored agents evaluated.`,
                `${recurringProblems.length} recurring operational problem patterns identified.`,
                `${hotspots.length} active operational hotspots detected.`
            ]
        };
    }

    getAgentReliability({ agentId = null, tenantId = 'default-tenant' } = {}) {
        if (agentId) {
            return this.reliabilityAnalyzer.analyzeAgent(agentId, tenantId);
        }
        return this.reliabilityAnalyzer.analyzeFleet(tenantId);
    }

    getAgentPerformance({ agentId = null, tenantId = 'default-tenant' } = {}) {
        return this.getAgentReliability({ agentId, tenantId });
    }

    getRecurringProblems({ tenantId = 'default-tenant' } = {}) {
        return this.recurringProblemIntelligence.detectRecurringProblems(tenantId);
    }

    getOperationalHotspots({ tenantId = 'default-tenant' } = {}) {
        return this.hotspotService.getHotspots(tenantId);
    }

    getDependencyReliability({ tenantId = 'default-tenant' } = {}) {
        let topology = { nodes: [], edges: [] };
        if (this.dependencyGraphService && typeof this.dependencyGraphService.getDependencyGraph === 'function') {
            topology = this.dependencyGraphService.getDependencyGraph({}, tenantId);
        }

        return {
            tenantId,
            dependencyCount: topology.edges ? topology.edges.length : 0,
            impactedNodesCount: topology.nodes ? topology.nodes.filter(n => n.dependencyStatus !== 'HEALTHY').length : 0,
            nodes: topology.nodes || [],
            edges: topology.edges || [],
            evidenceTag: 'CONFIRMED'
        };
    }

    getIncidentPatterns({ tenantId = 'default-tenant' } = {}) {
        return this.incidentPatternAnalyzer.analyzePatterns(tenantId);
    }

    getResponseEffectiveness({ tenantId = 'default-tenant' } = {}) {
        const types = this.responseEffectivenessService.getResponseEffectiveness(tenantId);
        const totalUses = (types || []).reduce((sum, t) => sum + (t.usesCount || 0), 0);
        const totalSuccess = (types || []).reduce((sum, t) => sum + (t.successfulCount || 0), 0);
        const overallRate = totalUses > 0 ? totalSuccess / totalUses : 1.0;

        return {
            tenantId,
            totalHistoricalResponses: totalUses,
            overallVerificationSuccessRate: overallRate,
            responseTypes: types
        };
    }

    getRecoveryAnalysis({ tenantId = 'default-tenant' } = {}) {
        return this.recoveryIntelligenceService.getRecoveryAnalysis(tenantId);
    }

    getLongTermTrends({ period = '24h', tenantId = 'default-tenant' } = {}) {
        return this.fleetTrendService.getTrends(period, tenantId);
    }

    getFleetRisks({ tenantId = 'default-tenant' } = {}) {
        return this.fleetRiskContextService.getFleetRisks(tenantId);
    }

    getOperationalRecommendations({ tenantId = 'default-tenant' } = {}) {
        return this.operationalImprovementService.getImprovements(tenantId);
    }
}

module.exports = { FleetIntelligenceService };
