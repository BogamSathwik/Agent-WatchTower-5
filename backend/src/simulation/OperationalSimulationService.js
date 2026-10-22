/**
 * Phase 33 — Operational Simulation Service (simulation lifecycle facade)
 * Main facade: getOverview / createSimulation / getSimulation /
 * getSimulations / getAgentSimulations / getFleetSimulations /
 * runSimulation / compareSimulations / getSimulationHistory.
 * Deterministic and evidence-based. No random outcomes. No probabilities.
 * Running a simulation computes branches — it never executes anything.
 */

const { SimulationScenarioBuilder } = require('./SimulationScenarioBuilder');
const { SimulationAssumptionService } = require('./SimulationAssumptionService');
const { SimulationImpactEngine } = require('./SimulationImpactEngine');
const { SimulationPathEngine } = require('./SimulationPathEngine');
const { SimulationOutcomeService } = require('./SimulationOutcomeService');
const { SimulationComparisonService } = require('./SimulationComparisonService');
const { SimulationHistoryService } = require('./SimulationHistoryService');
const { DecisionEvidenceService } = require('../decision/DecisionEvidenceService');

class OperationalSimulationService {
    constructor(options = {}) {
        this.evidenceService = options.evidenceService || new DecisionEvidenceService(options);
        this.builder = options.builder || new SimulationScenarioBuilder({ evidenceService: this.evidenceService });
        this.assumptionService = options.assumptionService || new SimulationAssumptionService(options);
        this.impactEngine = options.impactEngine || new SimulationImpactEngine(options);
        this.pathEngine = options.pathEngine || new SimulationPathEngine(options);
        this.outcomeService = options.outcomeService || new SimulationOutcomeService(options);
        this.comparisonService = options.comparisonService || new SimulationComparisonService(options);
        this.historyService = options.historyService || new SimulationHistoryService(options);
        this.monitoringService = options.monitoringService || null;
        this.responseCenterService = options.responseCenterService || null;
    }

    createSimulation(params, { operator = 'operator' } = {}) {
        const scenario = this.builder.buildSimulationScenario(params);
        const responseRef = this._responseRef(scenario, params.tenantId || 'default-tenant');
        const assumptions = this.assumptionService.buildAssumptions({
            simulationType: scenario.simulationType,
            agentId: scenario.agentId,
            evidence: scenario.sourceEvidence,
            responseRef
        });
        const impact = this.impactEngine.analyzeImpact(scenario, { tenantId: scenario.tenantId });

        const record = {
            simulationId: scenario.simulationId,
            tenantId: scenario.tenantId,
            agentId: scenario.agentId,
            simulationType: scenario.simulationType,
            whatIfQuestion: scenario.whatIfQuestion,
            title: scenario.title,
            scope: scenario.scope,
            status: scenario.status,
            hasRun: false,
            currentSituation: scenario.currentSituation,
            scenarioRefs: {
                warningId: scenario.warningId,
                decisionScenarioId: scenario.decisionScenarioId,
                incidentId: scenario.incidentId,
                dependencyTarget: scenario.dependencyTarget,
                responseOptionType: scenario.responseOptionType,
                range: scenario.range
            },
            sourceEvidence: scenario.sourceEvidence,
            assumptions,
            impact,
            responseRef,
            paths: [],
            outcomes: [],
            comparison: [],
            uncertainty: this._uncertaintySummary(scenario, assumptions),
            missingInformation: (scenario.sourceEvidence.gaps || []).map(g => g.kind),
            contextNote: scenario.contextNote,
            safetyNote: scenario.safetyNote,
            createdBy: operator,
            createdAt: scenario.createdAt,
            lastRunAt: null
        };
        this.historyService.saveSimulation(record);
        return this._view(record);
    }

    runSimulation(simulationId, { tenantId = 'default-tenant', operator = 'operator' } = {}) {
        const record = this.historyService.getSimulation(simulationId, tenantId);
        if (!record) return { status: 'NOT_FOUND', simulationId, tenantId };
        // Deterministic recompute from stored scenario state (planning only).
        const scenarioView = {
            simulationType: record.simulationType,
            agentId: record.agentId,
            currentSituation: record.currentSituation,
            sourceEvidence: record.sourceEvidence,
            status: record.status
        };
        const paths = this.pathEngine.buildPaths(
            { ...scenarioView, whatIfQuestion: record.whatIfQuestion, dependencyTarget: record.scenarioRefs.dependencyTarget, responseOptionType: record.scenarioRefs.responseOptionType },
            record.impact,
            record.assumptions,
            { tenantId }
        );
        const outcomes = this.outcomeService.buildOutcomes(
            { simulationType: record.simulationType, status: record.status, sourceEvidence: record.sourceEvidence },
            record.impact,
            record.assumptions,
            { tenantId }
        );
        const comparison = this.comparisonService.comparePaths(paths, outcomes, record.impact, record.assumptions);

        record.paths = paths;
        record.outcomes = outcomes;
        record.comparison = comparison;
        record.hasRun = true;
        record.lastRunAt = new Date().toISOString();
        record.uncertainty = this._uncertaintySummary({ sourceEvidence: record.sourceEvidence, status: record.status }, record.assumptions);
        this.historyService.updateSimulation(record);
        this.historyService.recordRun(simulationId, {
            runId: `run_${Date.now().toString(36)}`,
            simulationId,
            tenantId,
            operator,
            runAt: record.lastRunAt,
            pathIds: paths.map(p => p.pathId),
            outcomeStates: outcomes.map(o => o.outcomeState),
            classification: 'SIMULATED',
            note: 'Planning-only computation. No agent state modified; no remediation executed; no external commands sent.'
        });
        return this._view(record);
    }

    getSimulation(simulationId, { tenantId = 'default-tenant' } = {}) {
        const record = this.historyService.getSimulation(simulationId, tenantId);
        if (!record) return { status: 'NOT_FOUND', simulationId, tenantId };
        return { status: 'FOUND', ...this._view(record) };
    }

    getSimulations({ tenantId = 'default-tenant' } = {}) {
        return this.historyService.listSimulations(tenantId);
    }

    getAgentSimulations(agentId, { tenantId = 'default-tenant' } = {}) {
        return this.historyService.listSimulations(tenantId).filter(s => s.agentId === agentId);
    }

    getFleetSimulations({ tenantId = 'default-tenant' } = {}) {
        return this.historyService.listSimulations(tenantId).filter(s => !s.agentId);
    }

    compareSimulations(simulationIds, { tenantId = 'default-tenant' } = {}) {
        const found = [];
        const missing = [];
        for (const id of simulationIds || []) {
            const rec = this.historyService.getSimulation(id, tenantId);
            if (rec) found.push(rec);
            else missing.push(id);
        }
        // Factual side-by-side across simulations; no ranking, no scores.
        const rows = found.map(rec => ({
            simulationId: rec.simulationId,
            title: rec.title,
            simulationType: rec.simulationType,
            agentId: rec.agentId,
            status: rec.status,
            hasRun: rec.hasRun,
            sourceEvidenceCounts: {
                observed: (rec.sourceEvidence.observed || []).length,
                trends: (rec.sourceEvidence.trends || []).length,
                inferred: (rec.sourceEvidence.inferred || []).length,
                predicted: (rec.sourceEvidence.predicted || []).length,
                gaps: (rec.sourceEvidence.gaps || []).length
            },
            assumptionCount: (rec.assumptions || []).length,
            assumptionClasses: [...new Set((rec.assumptions || []).map(a => a.classification))],
            impactScope: rec.impact ? rec.impact.impactScope : 'UNKNOWN',
            affectedAgentsCount: rec.impact ? rec.impact.affectedAgentsCount : 0,
            outcomeStates: (rec.outcomes || []).map(o => o.outcomeState),
            uncertainty: rec.uncertainty,
            responseSupport: rec.responseRef ? rec.responseRef.executionSupport : 'UNKNOWN',
            reversibility: [...new Set((rec.paths || []).map(p => p.reversibility))],
            operatorInvolvement: [...new Set((rec.paths || []).map(p => p.operatorInvolvement))]
        }));
        return { status: 'COMPARED', tenantId, compared: rows, missingIds: missing };
    }

    getSimulationHistory(simulationId, { tenantId = 'default-tenant' } = {}) {
        const history = this.historyService.getHistory(simulationId, tenantId);
        if (!history) return { status: 'NOT_FOUND', simulationId, tenantId };
        return { status: 'FOUND', simulationId, tenantId, runs: history };
    }

    getOverview({ tenantId = 'default-tenant' } = {}) {
        const all = this.historyService.listSimulations(tenantId);
        const active = all.filter(s => s.status === 'READY');
        const insufficient = all.filter(s => s.status === 'INSUFFICIENT_DATA');
        const agents = new Set(all.map(s => s.agentId).filter(Boolean));
        const byType = {};
        for (const s of all) byType[s.simulationType] = (byType[s.simulationType] || 0) + 1;
        const highImpact = all.filter(s => s.impact && (s.impact.impactScope === 'MULTI_AGENT' || s.impact.impactScope === 'FLEET' || s.impact.impactScope === 'DEPENDENCY')).length;
        const recent = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
        return {
            tenantId,
            timestamp: new Date().toISOString(),
            scorecard: {
                activeSimulationsCount: active.length,
                agentsInvolvedCount: agents.size,
                affectedDependenciesCount: active.reduce((n, s) => n + ((s.impact && s.impact.dependencyEdges ? s.impact.dependencyEdges.length : 0)), 0),
                scenarioTypesCount: Object.keys(byType).length,
                insufficientDataCount: insufficient.length,
                recentSimulationsCount: recent.length,
                highImpactCount: highImpact
            },
            scenarioTypes: byType,
            recentSimulations: recent,
            note: 'Simulation overview is planning support. Running or comparing simulations executes nothing.'
        };
    }

    _responseRef(scenario, tenantId) {
        if (scenario.simulationType !== 'RESPONSE_OPTION_PATH') {
            return { relevance: 'NOT_APPLICABLE', executionSupport: 'NOT_APPLICABLE', note: 'Simulation branch does not model a response path.' };
        }
        if (!scenario.agentId || !this.responseCenterService) {
            return { relevance: 'INSUFFICIENT_DATA', executionSupport: 'UNKNOWN', note: 'No agent scope or Response Center not wired.' };
        }
        try {
            const opts = this.responseCenterService.generateResponseOptions({ agentId: scenario.agentId, tenantId }) || [];
            const match = opts.find(o => (o.actionType || o.action || o.type) === scenario.responseOptionType) || null;
            if (!match) {
                return { relevance: 'RECORDED', executionSupport: 'UNSUPPORTED', note: `Option '${scenario.responseOptionType}' not found among recorded Response Center options; path models inspection and escalation only.` };
            }
            return {
                relevance: 'RECORDED',
                optionType: scenario.responseOptionType,
                safetyState: match.safetyLevel || match.safety || match.safetyState || 'RECORDED',
                approvalRequirement: match.requiresApproval === false ? 'NONE' : (match.approvalRequirement || 'OPERATOR'),
                executionSupport: match.executionSupported === false ? 'UNSUPPORTED' : (match.executionSupport || 'CONDITIONAL'),
                historicalNote: 'Historical effectiveness, if recorded, is shown in the Response Center; simulation does not duplicate it.',
                note: 'SIMULATED ONLY — NO REAL ACTION EXECUTED.'
            };
        } catch (e) {
            return { relevance: 'INSUFFICIENT_DATA', executionSupport: 'UNKNOWN', note: `Response inspection failed: ${e.message}` };
        }
    }

    _uncertaintySummary(scenarioLike, assumptions) {
        const gaps = ((scenarioLike && scenarioLike.sourceEvidence && scenarioLike.sourceEvidence.gaps) || []).map(g => g.kind);
        if ((scenarioLike && scenarioLike.status) === 'INSUFFICIENT_DATA') {
            return 'High uncertainty: insufficient evidence to model branches. Continued monitoring is the only evidence-backed branch.';
        }
        const parts = [];
        parts.push(`Branches rest on ${(assumptions || []).length} explicit assumption(s).`);
        if (gaps.length > 0) parts.push(`Missing: ${gaps.slice(0, 4).join(', ')}.`);
        parts.push('Outcomes are possible branches that could change as new probes arrive.');
        return parts.join(' ');
    }

    _view(record) {
        return {
            simulation: {
                simulationId: record.simulationId,
                simulationType: record.simulationType,
                whatIfQuestion: record.whatIfQuestion,
                title: record.title,
                tenantId: record.tenantId,
                agentId: record.agentId,
                scope: record.scope,
                status: record.status,
                hasRun: record.hasRun,
                currentSituation: record.currentSituation,
                scenarioRefs: record.scenarioRefs,
                contextNote: record.contextNote,
                safetyNote: record.safetyNote,
                createdBy: record.createdBy,
                createdAt: record.createdAt,
                lastRunAt: record.lastRunAt
            },
            evidence: {
                observed: record.sourceEvidence.observed,
                trends: record.sourceEvidence.trends,
                inferred: record.sourceEvidence.inferred,
                predicted: record.sourceEvidence.predicted,
                gaps: record.sourceEvidence.gaps,
                evidenceStrength: record.sourceEvidence.evidenceStrength
            },
            assumptions: record.assumptions,
            impact: record.impact,
            responseRef: record.responseRef,
            paths: record.paths,
            outcomes: record.outcomes,
            comparison: record.comparison,
            uncertainty: record.uncertainty,
            missingInformation: record.missingInformation
        };
    }
}

module.exports = { OperationalSimulationService };
