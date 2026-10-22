/**
 * Phase 32 — Decision Intelligence Service (master facade)
 * Integrates OperationalScenarioService with Early Warning, Fleet,
 * Response (inspect-only), Knowledge, dependencies, incidents, and risk.
 * No execution. Planning + decision support only.
 */

const { OperationalScenarioService } = require('./OperationalScenarioService');
const { DecisionEvidenceService } = require('./DecisionEvidenceService');

class DecisionIntelligenceService {
    constructor(options = {}) {
        this.scenarioService = options.scenarioService || options.operationalScenarioService || new OperationalScenarioService(options);
        this.evidenceService = options.evidenceService || this.scenarioService.evidenceService || new DecisionEvidenceService(options);
        this.monitoringService = options.monitoringService || null;
        this.earlyWarningService = options.earlyWarningService || options.earlyWarningCenterService || null;
        this.fleetIntelligenceService = options.fleetIntelligenceService || null;
        this.responseCenterService = options.responseCenterService || null;
        this.knowledgeGraphService = options.knowledgeGraphService || options.agentKnowledgeGraphService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
        this.auditService = options.auditService || options.auditLogService || null;
    }

    // ---- passthrough orchestration ----
    getScenarioOverview(params) { return this.scenarioService.getScenarioOverview(params); }
    listScenarios(params) { return this.scenarioService.listScenarios(params); }
    createScenario(params) {
        const enriched = this.scenarioService.createScenario(params);
        this._audit('DECISION_SCENARIO_CREATED', params, enriched.scenario);
        return enriched;
    }
    getScenario(id, params) { return this.scenarioService.getScenario(id, params); }
    getAgentScenario(agentId, params) { return this.scenarioService.getAgentScenario(agentId, params); }
    getFleetScenario(params) { return this.scenarioService.getFleetScenario(params); }
    getScenarioHistory(id, params) { return this.scenarioService.getScenarioHistory(id, params); }

    getScenarioOptions(scenarioId, { tenantId = 'default-tenant' } = {}) {
        const found = this.scenarioService.getScenario(scenarioId, { tenantId });
        if (found.status === 'NOT_FOUND') return found;
        return { status: 'FOUND', scenarioId, tenantId, options: found.options, comparison: found.comparison };
    }

    getScenarioEvidence(scenarioId, { tenantId = 'default-tenant' } = {}) {
        const found = this.scenarioService.getScenario(scenarioId, { tenantId });
        if (found.status === 'NOT_FOUND') return found;
        return { status: 'FOUND', scenarioId, tenantId, evidence: found.evidence };
    }

    getScenarioImpact(scenarioId, { tenantId = 'default-tenant' } = {}) {
        const found = this.scenarioService.getScenario(scenarioId, { tenantId });
        if (found.status === 'NOT_FOUND') return found;
        return { status: 'FOUND', scenarioId, tenantId, impact: found.impact };
    }

    getScenarioRisks(scenarioId, { tenantId = 'default-tenant' } = {}) {
        const found = this.scenarioService.getScenario(scenarioId, { tenantId });
        if (found.status === 'NOT_FOUND') return found;
        return { status: 'FOUND', scenarioId, tenantId, risks: found.risks };
    }

    /**
     * Build a scenario directly from an early warning:
     * Early Warning → scenario → impact → options → evidence → operator decision.
     * Nothing is executed.
     */
    createScenarioFromWarning(warningId, { tenantId = 'default-tenant', range = '24h', contextNote = '' } = {}) {
        if (!this.earlyWarningService) throw new Error('EarlyWarningCenterService not wired.');
        const detail = this.earlyWarningService.getWarningById(warningId, { tenantId, range });
        if (!detail || detail.status === 'NOT_FOUND') return { status: 'NOT_FOUND', warningId, tenantId };
        const warning = detail.warning;
        const scenarioType = this._warningToScenarioType(warning);
        return this.createScenario({
            scenarioType,
            agentId: warning.agentId,
            tenantId,
            range,
            warningId: warning.warningId,
            title: `Decision scenario from ${warning.warningType} on ${warning.agentId}`,
            contextNote: contextNote || `Source early warning severity ${warning.severity}, confidence ${warning.confidence}.`
        });
    }

    _warningToScenarioType(warning) {
        const map = {
            IMPENDING_OFFLINE_RISK: 'AGENT_DEGRADATION_CONTINUES',
            DEGRADATION_ESCALATION_RISK: 'AGENT_DEGRADATION_CONTINUES',
            LATENCY_ESCALATION_RISK: 'LATENCY_INCREASE_CONTINUES',
            RECURRING_FAILURE_RESURGENCE: 'RECURRING_FAILURES_RETURN',
            DEPENDENCY_CASCADE_RISK: 'DEPENDENCY_UNAVAILABLE',
            ELEVATED_WATCH: 'WARNING_SEVERITY_INCREASE'
        };
        return map[warning.warningType] || 'AGENT_DEGRADATION_CONTINUES';
    }

    /**
     * Inspect-only Response Center reference for a scenario (no duplication).
     */
    getResponseReference(scenarioId, { tenantId = 'default-tenant' } = {}) {
        const found = this.scenarioService.getScenario(scenarioId, { tenantId });
        if (found.status === 'NOT_FOUND') return found;
        const agentId = found.scenario.agentId;
        if (!agentId || !this.responseCenterService) {
            return { status: 'FOUND', scenarioId, tenantId, reference: { availability: 'INSUFFICIENT_DATA', reason: 'No agent scope or Response Center not wired.' } };
        }
        try {
            const opts = this.responseCenterService.generateResponseOptions({ agentId, tenantId }) || [];
            return {
                status: 'FOUND', scenarioId, tenantId,
                reference: {
                    availability: opts.length > 0 ? 'AVAILABLE_INSPECT_ONLY' : 'INSUFFICIENT_DATA',
                    optionsCount: opts.length,
                    options: opts.slice(0, 8),
                    note: 'Decision Intelligence inspects these options. Approval and execution remain exclusively in the Response Center.'
                }
            };
        } catch (e) {
            return { status: 'FOUND', scenarioId, tenantId, reference: { availability: 'INSUFFICIENT_DATA', reason: e.message } };
        }
    }

    _audit(eventType, params, scenario) {
        try {
            if (this.auditService && typeof this.auditService.logEvent === 'function') {
                this.auditService.logEvent({
                    eventType,
                    action: 'create_decision_scenario',
                    actor: 'operator',
                    tenantId: (params && params.tenantId) || (scenario && scenario.tenantId) || 'default-tenant',
                    resourceType: 'decision-scenario',
                    resourceId: scenario ? scenario.scenarioId : 'unknown',
                    outcome: 'SUCCESS',
                    severity: 'INFO',
                    correlationId: `dec_${Date.now()}`,
                    metadata: { scenarioType: scenario ? scenario.scenarioType : null, agentId: scenario ? scenario.agentId : null }
                });
            }
        } catch (e) { /* audit non-fatal */ }
    }
}

module.exports = { DecisionIntelligenceService };
