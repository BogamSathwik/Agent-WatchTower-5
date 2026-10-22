/**
 * Phase 32 — Operational Scenario Service (scenario CRUD + overview orchestration)
 * Master for scenario lifecycle. Analysis (impact/options/evidence/risks) is
 * delegated to the focused services; this service composes them.
 */

const { ScenarioBuilder } = require('./ScenarioBuilder');
const { ScenarioImpactAnalyzer } = require('./ScenarioImpactAnalyzer');
const { DecisionOptionEngine } = require('./DecisionOptionEngine');
const { DecisionEvidenceService } = require('./DecisionEvidenceService');
const { DecisionRiskEvaluator } = require('./DecisionRiskEvaluator');
const { DecisionComparisonService } = require('./DecisionComparisonService');
const { DecisionHistoryService } = require('./DecisionHistoryService');

class OperationalScenarioService {
    constructor(options = {}) {
        this.evidenceService = options.evidenceService || new DecisionEvidenceService(options);
        this.builder = options.builder || new ScenarioBuilder({ evidenceService: this.evidenceService });
        this.impactAnalyzer = options.impactAnalyzer || new ScenarioImpactAnalyzer(options);
        this.optionEngine = options.optionEngine || new DecisionOptionEngine(options);
        this.riskEvaluator = options.riskEvaluator || new DecisionRiskEvaluator(options);
        this.comparisonService = options.comparisonService || new DecisionComparisonService(options);
        this.historyService = options.historyService || new DecisionHistoryService(options);
        this.monitoringService = options.monitoringService || null;
        this.earlyWarningService = options.earlyWarningService || options.earlyWarningCenterService || null;
        this.fleetIntelligenceService = options.fleetIntelligenceService || null;
    }

    createScenario(params) {
        const scenario = this.builder.buildScenario(params);
        this.historyService.saveScenario(scenario);
        const enriched = this._enrich(scenario, params);
        this.historyService.appendEvent(scenario.scenarioId, {
            eventType: 'OPTIONS_GENERATED',
            summary: `${enriched.options.length} operational option(s) generated (planning only, nothing executed).`,
            classification: 'INFERRED',
            tenantId: scenario.tenantId
        });
        return enriched;
    }

    getScenario(scenarioId, { tenantId = 'default-tenant' } = {}) {
        const scenario = this.historyService.getScenario(scenarioId, tenantId);
        if (!scenario) return { status: 'NOT_FOUND', scenarioId, tenantId };
        return { status: 'FOUND', ...this._enrich(scenario, { tenantId, range: scenario.range || '24h' }) };
    }

    listScenarios({ tenantId = 'default-tenant' } = {}) {
        return this.historyService.listScenarios(tenantId);
    }

    getScenarioOverview({ tenantId = 'default-tenant', range = '24h' } = {}) {
        const scenarios = this.listScenarios({ tenantId });
        const activeScenarios = scenarios.filter(s => s.status === 'READY');
        const insufficient = scenarios.filter(s => s.status === 'INSUFFICIENT_DATA');
        const affectedAgents = new Set(scenarios.map(s => s.agentId).filter(Boolean));

        // Emerging situations: active early warnings without a scenario yet
        let emerging = [];
        try {
            if (this.earlyWarningService && typeof this.earlyWarningService.getWarnings === 'function') {
                const w = this.earlyWarningService.getWarnings({ tenantId, range });
                const covered = new Set(scenarios.map(s => s.warningId).filter(Boolean));
                emerging = (w.warnings || []).filter(x => x.status === 'ACTIVE' && !covered.has(x.warningId)).slice(0, 5)
                    .map(x => ({ warningId: x.warningId, agentId: x.agentId, warningType: x.warningType, severity: x.severity }));
            }
        } catch (e) { emerging = []; }

        // Decision-required: READY scenarios with HIGH/CRITICAL-linked evidence
        const decisionRequired = activeScenarios.filter(s =>
            (s.sourceEvidence.inferred || []).some(i => /HIGH|CRITICAL|OFFLINE|DEGRADED/.test(JSON.stringify(i).toUpperCase()))
        ).length;

        let dependencyImpacts = 0;
        for (const s of activeScenarios.slice(0, 10)) {
            try {
                const impact = this.impactAnalyzer.analyzeImpact(s, { tenantId });
                dependencyImpacts += (impact.dependencyEdges || []).length;
            } catch (e) { /* non-fatal */ }
        }

        return {
            tenantId,
            timestamp: new Date().toISOString(),
            scorecard: {
                activeScenariosCount: activeScenarios.length,
                affectedAgentsCount: affectedAgents.size,
                dependencyImpactsCount: dependencyImpacts,
                emergingSituationsCount: emerging.length,
                insufficientDataCount: insufficient.length,
                decisionRequiredCount: decisionRequired
            },
            scenarios: scenarios.slice(0, 20),
            emergingSituations: emerging,
            note: 'Overview is planning support. No option is executed from this layer.'
        };
    }

    getAgentScenario(agentId, { tenantId = 'default-tenant', range = '24h' } = {}) {
        const existing = this.listScenarios({ tenantId }).filter(s => s.agentId === agentId);
        if (existing.length > 0) {
            const latest = existing[existing.length - 1];
            return this.getScenario(latest.scenarioId, { tenantId });
        }
        // Ad-hoc (not persisted) preview built from live evidence
        const draft = this.builder.buildScenario({
            scenarioType: 'AGENT_DEGRADATION_CONTINUES', agentId, tenantId, range,
            title: `Live decision preview for ${agentId}`
        });
        return { status: 'PREVIEW', preview: true, ...this._enrich(draft, { tenantId, range }) };
    }

    getFleetScenario({ tenantId = 'default-tenant', range = '24h' } = {}) {
        const existing = this.listScenarios({ tenantId }).filter(s => !s.agentId);
        if (existing.length > 0) {
            const latest = existing[existing.length - 1];
            return this.getScenario(latest.scenarioId, { tenantId });
        }
        const draft = this.builder.buildScenario({
            scenarioType: 'MULTI_AGENT_SPREAD', agentId: null, tenantId, range,
            title: 'Live fleet decision preview'
        });
        return { status: 'PREVIEW', preview: true, ...this._enrich(draft, { tenantId, range }) };
    }

    getScenarioHistory(scenarioId, { tenantId = 'default-tenant' } = {}) {
        const history = this.historyService.getHistory(scenarioId, tenantId);
        if (!history) return { status: 'NOT_FOUND', scenarioId, tenantId };
        return { status: 'FOUND', scenarioId, tenantId, events: history };
    }

    _enrich(scenario, { tenantId, range = '24h' } = {}) {
        const tid = tenantId || scenario.tenantId;
        const evidence = {
            observed: scenario.sourceEvidence.observed,
            trends: scenario.sourceEvidence.trends,
            inferred: scenario.sourceEvidence.inferred,
            predicted: scenario.sourceEvidence.predicted,
            gaps: scenario.sourceEvidence.gaps,
            evidenceStrength: scenario.sourceEvidence.evidenceStrength
        };
        const impact = this.impactAnalyzer.analyzeImpact(scenario, { tenantId: tid });
        const options = this.optionEngine.generateOptions(scenario, scenario.sourceEvidence, impact, { tenantId: tid });
        const risks = this.riskEvaluator.evaluateRisks(scenario, options, scenario.sourceEvidence, impact, { tenantId: tid, range });
        const comparison = this.comparisonService.compareOptions(options, risks, impact);
        return { scenario, evidence, impact, options, risks, comparison };
    }
}

module.exports = { OperationalScenarioService };
