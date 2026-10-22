/**
 * Phase 33 — Simulation Intelligence Service (master integration facade)
 * Integrates OperationalSimulationService with Decision Intelligence,
 * Early Warning Center, Fleet Intelligence, Response Center, Knowledge
 * Graph, dependencies, and incidents.
 * Flow: Decision → Simulation → Compare Possible Paths → Operator Choice
 * → Response Center → Verification → Learning. Simulation never executes.
 */

const { OperationalSimulationService } = require('./OperationalSimulationService');
const { DecisionEvidenceService } = require('../decision/DecisionEvidenceService');

class SimulationIntelligenceService {
    constructor(options = {}) {
        this.simulationService = options.simulationService || options.operationalSimulationService || new OperationalSimulationService(options);
        this.decisionService = options.decisionService || options.decisionIntelligenceService || null;
        this.earlyWarningService = options.earlyWarningService || options.earlyWarningCenterService || null;
        this.fleetIntelligenceService = options.fleetIntelligenceService || null;
        this.responseCenterService = options.responseCenterService || null;
        this.knowledgeGraphService = options.knowledgeGraphService || options.agentKnowledgeGraphService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
        this.monitoringService = options.monitoringService || null;
        this.auditService = options.auditService || options.auditLogService || null;
    }

    // ---- lifecycle passthrough ----
    getOverview(params) { return this.simulationService.getOverview(params); }
    createSimulation(params, opts) {
        const view = this.simulationService.createSimulation(params, opts);
        this._audit('SIMULATION_CREATED', params, view.simulation);
        return view;
    }
    runSimulation(id, params) { return this.simulationService.runSimulation(id, params); }
    getSimulation(id, params) { return this.simulationService.getSimulation(id, params); }
    getSimulations(params) { return this.simulationService.getSimulations(params); }
    getAgentSimulations(agentId, params) { return this.simulationService.getAgentSimulations(agentId, params); }
    getFleetSimulations(params) { return this.simulationService.getFleetSimulations(params); }
    compareSimulations(ids, params) { return this.simulationService.compareSimulations(ids, params); }
    getSimulationHistory(id, params) { return this.simulationService.getSimulationHistory(id, params); }

    /**
     * Create a simulation directly from a decision scenario, carrying
     * forward evidence, impact, options, risks, and assumptions by
     * reference (no duplication of the Decision engine).
     */
    createSimulationFromDecision(decisionScenarioId, { tenantId = 'default-tenant', simulationType = null, responseOptionType = null, contextNote = '' } = {}, opts = {}) {
        if (!this.decisionService) throw new Error('DecisionIntelligenceService not wired.');
        const found = this.decisionService.getScenario(decisionScenarioId, { tenantId });
        if (!found || found.status === 'NOT_FOUND') return { status: 'NOT_FOUND', decisionScenarioId, tenantId };
        const scenario = found.scenario;
        const inferredType = simulationType || this._decisionToSimulationType(scenario);
        const inferredOption = responseOptionType || this._defaultResponseOption(found);
        return this.createSimulation({
            simulationType: inferredType,
            agentId: scenario.agentId || null,
            tenantId,
            range: scenario.range || '24h',
            warningId: scenario.warningId || null,
            decisionScenarioId: scenario.scenarioId,
            responseOptionType: inferredType === 'RESPONSE_OPTION_PATH' ? inferredOption : null,
            title: `Simulation from decision scenario '${scenario.title}'`,
            contextNote: contextNote || `Carried forward: evidence (${(scenario.sourceEvidence.observed || []).length} observed), impact ${found.impact ? found.impact.impactScope : 'UNKNOWN'}, ${(found.options || []).length} decision option(s).`
        }, opts);
    }

    /**
     * Create a simulation directly from an early warning:
     * Warning → (Build Scenario → Decision) → Simulate.
     */
    createSimulationFromWarning(warningId, { tenantId = 'default-tenant', range = '24h', simulationType = null, contextNote = '' } = {}, opts = {}) {
        if (!this.earlyWarningService) throw new Error('EarlyWarningCenterService not wired.');
        const detail = this.earlyWarningService.getWarningById(warningId, { tenantId, range });
        if (!detail || detail.status === 'NOT_FOUND') return { status: 'NOT_FOUND', warningId, tenantId };
        const warning = detail.warning;
        return this.createSimulation({
            simulationType: simulationType || this._warningToSimulationType(warning),
            agentId: warning.agentId || null,
            tenantId,
            range,
            warningId: warning.warningId,
            title: `Simulation from ${warning.warningType} on ${warning.agentId}`,
            contextNote: contextNote || `Source warning severity ${warning.severity}, confidence ${warning.confidence}. Predictions stay forecasts, never facts.`
        }, opts);
    }

    /**
     * Knowledge context references for a simulation (recorded relations
     * only, confirmed/inferred as stored — never fabricated).
     */
    getKnowledgeContext(simulationId, { tenantId = 'default-tenant' } = {}) {
        const found = this.simulationService.getSimulation(simulationId, { tenantId });
        if (found.status === 'NOT_FOUND') return found;
        const agentId = found.simulation.agentId;
        if (!this.knowledgeGraphService || !agentId) {
            return { status: 'FOUND', simulationId, tenantId, context: { availability: 'INSUFFICIENT_DATA', reason: 'No agent scope or Knowledge Graph not wired.' } };
        }
        try {
            const graph = typeof this.knowledgeGraphService.getGraph === 'function'
                ? this.knowledgeGraphService.getGraph({ agentId }, tenantId)
                : null;
            const nodes = (graph && (graph.nodes || graph.entities || graph.items)) || [];
            return {
                status: 'FOUND', simulationId, tenantId,
                context: {
                    availability: Array.isArray(nodes) && nodes.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
                    entityKinds: ['Agent', 'Incident', 'Warning', 'Prediction', 'Dependency', 'Problem', 'Response', 'Recovery', 'HistoricalEvent'],
                    recordCount: Array.isArray(nodes) ? nodes.length : 0,
                    note: 'Relations preserved as recorded (confirmed vs inferred as stored). No relationships fabricated.'
                }
            };
        } catch (e) {
            return { status: 'FOUND', simulationId, tenantId, context: { availability: 'INSUFFICIENT_DATA', reason: e.message } };
        }
    }

    _decisionToSimulationType(decisionScenario) {
        const map = {
            AGENT_DEGRADATION_CONTINUES: 'CONTINUE_DEGRADATION',
            LATENCY_INCREASE_CONTINUES: 'CONTINUE_DEGRADATION',
            DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_FAILURE',
            RECURRING_FAILURES_RETURN: 'CONTINUE_DEGRADATION',
            INCIDENT_ESCALATION: 'WARNING_ESCALATION',
            SLOW_RECOVERY: 'RECOVERY_FAILURE',
            MULTI_AGENT_SPREAD: 'AGENT_UNAVAILABLE',
            WARNING_SEVERITY_INCREASE: 'WARNING_ESCALATION'
        };
        const t = decisionScenario ? decisionScenario.scenarioType : null;
        return map[t] || 'CONTINUE_CURRENT_STATE';
    }

    _defaultResponseOption(decisionView) {
        const opts = (decisionView && decisionView.options) || [];
        const prep = opts.find(o => o.optionType === 'PREPARE_RESPONSE' && o.executionSupport !== 'UNSUPPORTED');
        if (prep) return 'PREPARE_RESPONSE';
        const inv = opts.find(o => o.optionType === 'INVESTIGATE');
        return inv ? 'INVESTIGATE' : 'CONTINUE_OBSERVATION';
    }

    _warningToSimulationType(warning) {
        const map = {
            IMPENDING_OFFLINE_RISK: 'WARNING_ESCALATION',
            DEGRADATION_ESCALATION_RISK: 'CONTINUE_DEGRADATION',
            LATENCY_ESCALATION_RISK: 'CONTINUE_DEGRADATION',
            RECURRING_FAILURE_RESURGENCE: 'CONTINUE_DEGRADATION',
            DEPENDENCY_CASCADE_RISK: 'DEPENDENCY_FAILURE',
            ELEVATED_WATCH: 'CONTINUE_CURRENT_STATE'
        };
        return map[warning.warningType] || 'CONTINUE_CURRENT_STATE';
    }

    _audit(eventType, params, simulation) {
        try {
            if (this.auditService && typeof this.auditService.logEvent === 'function') {
                this.auditService.logEvent({
                    eventType,
                    action: 'create_simulation',
                    actor: 'operator',
                    tenantId: (params && params.tenantId) || (simulation && simulation.tenantId) || 'default-tenant',
                    resourceType: 'simulation',
                    resourceId: simulation ? simulation.simulationId : 'unknown',
                    outcome: 'SUCCESS',
                    severity: 'INFO',
                    correlationId: `sim_${Date.now()}`,
                    metadata: { simulationType: simulation ? simulation.simulationType : null, agentId: simulation ? simulation.agentId : null }
                });
            }
        } catch (e) { /* audit non-fatal */ }
    }
}

module.exports = { SimulationIntelligenceService };
