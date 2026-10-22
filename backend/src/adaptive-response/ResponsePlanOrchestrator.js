/**
 * Phase 34 — Response Plan Orchestrator
 * Creates structured response plans from existing Watchtower information
 * (incident, warning, decision scenario, simulation, recommendation,
 * dependency or fleet context). Backs each adaptive plan with a REAL
 * Response Center plan so approval/execution/verification reuse the
 * existing governed infrastructure. Never executes during plan creation.
 */

function sanitize(str) {
    return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

class ResponsePlanOrchestrator {
    constructor(options = {}) {
        this.responseCenterService = options.responseCenterService || null;
        this.evidenceService = options.evidenceService || null;
        this.decisionService = options.decisionService || options.decisionIntelligenceService || null;
        this.simulationService = options.simulationService || options.simulationIntelligenceService || null;
        this.monitoringService = options.monitoringService || null;
    }

    /**
     * Create an adaptive response plan (planning record only).
     */
    createAdaptivePlan({ agentId = null, incidentId = null, warningId = null, decisionScenarioId = null, simulationId = null, responseOptionType = null, tenantId = 'default-tenant', range = '24h', operator = 'operator', userRole = 'OPERATOR', contextNote = '' } = {}) {
        if (!agentId) throw new Error('agentId is required to create a response plan.');
        if (!this.responseCenterService) throw new Error('ResponseCenterService not wired.');

        // Source context (references only, no duplication of engines).
        const sourceContext = this._collectSourceContext({ agentId, incidentId, warningId, decisionScenarioId, simulationId, tenantId, range });

        // Evidence (reuse Phase 32 collector where wired).
        const evidence = this.evidenceService && typeof this.evidenceService.collectEvidence === 'function'
            ? this.evidenceService.collectEvidence({ tenantId, agentId, range, warningId })
            : { observed: [], trends: [], inferred: [], predicted: [], gaps: [{ kind: 'EVIDENCE', classification: 'INSUFFICIENT_DATA', reason: 'Evidence service not wired.' }], evidenceStrength: 'WEAK' };

        // Affected scope from decision/simulation impact where available.
        const affected = this._collectAffectedScope(sourceContext, agentId);

        // Select an existing response option (inspect-only read).
        const options = this.responseCenterService.generateResponseOptions({ agentId, incidentId, tenantId }) || [];
        const selected = (responseOptionType && options.find(o => (o.actionType || o.action || o.type) === responseOptionType))
            || options[0] || null;
        if (!selected) throw new Error(`No recorded Response Center options available for agent '${agentId}'.`);

        // Safety + approval requirements from the existing model.
        const safety = this.responseCenterService.evaluateResponseSafety({ action: selected, agentId, userRole, incident: null });
        const approvalRequirement = safety.requiresApproval === false ? 'NOT_REQUIRED'
            : (safety.safetyLevel === 'UNSUPPORTED' ? 'NOT_APPLICABLE_UNSUPPORTED' : 'OPERATOR_APPROVAL');

        // Backing Response Center plan (planning record; nothing executes here).
        const rcPlan = this.responseCenterService.createResponsePlan({
            agentId, incidentId, selectedAction: selected, operatorId: operator, userRole, tenantId
        });

        // Expected outcome: prefer simulation outcome, then decision outcomes, else plan default.
        const expectedOutcome = this._deriveExpectedOutcome(sourceContext, rcPlan, agentId);

        // Verification plan: what real verification will check.
        const verificationPlan = {
            method: 'Existing ResponseVerificationService.verifyResponse against live monitoring store.',
            checks: [
                `Health state of '${agentId}' at post-execution probes (CONFIRMED store reads).`,
                `Incident '${incidentId || rcPlan.incidentId || 'active'}' resolution state.`,
                'Rollback availability: ' + (safety.rollbackAvailable ? 'AVAILABLE via existing rollback workflow.' : 'not available for this action.')
            ],
            classification: 'PLAN'
        };

        const now = new Date().toISOString();
        return {
            adaptivePlanId: `adp_${sanitize(agentId)}_${Date.now().toString(36)}`,
            agentId,
            tenantId,
            responseCenterPlanId: rcPlan.planId || rcPlan.responseId,
            sourceContext,
            evidence: {
                observed: evidence.observed || [],
                trends: evidence.trends || [],
                inferred: evidence.inferred || [],
                predicted: evidence.predicted || [],
                gaps: evidence.gaps || [],
                evidenceStrength: evidence.evidenceStrength || 'UNKNOWN'
            },
            affectedAgents: affected.agents,
            affectedDependencies: affected.dependencies,
            selectedResponse: {
                optionType: selected.actionType || selected.action || selected.type,
                title: selected.title || selected.actionType,
                detail: selected
            },
            simulationRef: sourceContext.simulation ? {
                simulationId: sourceContext.simulation.simulationId,
                simulationType: sourceContext.simulation.simulationType,
                outcomeStates: (sourceContext.simulation.outcomes || []).map(o => o.outcomeState)
            } : null,
            safety: {
                safetyLevel: safety.safetyLevel,
                requiresApproval: safety.requiresApproval,
                reasons: safety.reasons || [],
                blastRadius: safety.blastRadius,
                rollbackAvailable: safety.rollbackAvailable,
                verificationAvailable: safety.verificationAvailable
            },
            approvalRequirement,
            approvalState: rcPlan.approvalState || 'PENDING',
            executionState: 'PLANNED',
            verificationState: 'PENDING',
            verificationPlan,
            rollbackInfo: safety.rollbackAvailable
                ? 'Rollback available via existing Response Center rollback workflow on verification failure.'
                : 'No rollback available for this action; failure escalates to the operator queue.',
            expectedOutcome,
            contextNote: String(contextNote || '').slice(0, 500),
            lifecycle: ['PLAN'],
            createdBy: operator,
            createdAt: now,
            updatedAt: now
        };
    }

    _collectSourceContext({ agentId, incidentId, warningId, decisionScenarioId, simulationId, tenantId, range }) {
        const ctx = { incidentId: incidentId || null, warning: null, decisionScenario: null, simulation: null };
        if (warningId && this.decisionService === null) { /* warnings resolved via evidence refs */ }
        if (decisionScenarioId && this.decisionService && typeof this.decisionService.getScenario === 'function') {
            try {
                const found = this.decisionService.getScenario(decisionScenarioId, { tenantId });
                if (found && found.status === 'FOUND') {
                    ctx.decisionScenario = {
                        scenarioId: found.scenario.scenarioId,
                        scenarioType: found.scenario.scenarioType,
                        title: found.scenario.title,
                        impactScope: found.impact ? found.impact.impactScope : 'UNKNOWN',
                        optionsCount: (found.options || []).length
                    };
                }
            } catch (e) { /* reference stays null */ }
        }
        if (simulationId && this.simulationService && typeof this.simulationService.getSimulation === 'function') {
            try {
                const found = this.simulationService.getSimulation(simulationId, { tenantId });
                if (found && found.status === 'FOUND') {
                    ctx.simulation = {
                        simulationId: found.simulation.simulationId,
                        simulationType: found.simulation.simulationType,
                        title: found.simulation.title,
                        outcomes: found.outcomes || [],
                        impactScope: found.impact ? found.impact.impactScope : 'UNKNOWN'
                    };
                }
            } catch (e) { /* reference stays null */ }
        }
        if (incidentId && this.monitoringService && this.monitoringService.store) {
            try {
                const inc = typeof this.monitoringService.store.getIncident === 'function'
                    ? this.monitoringService.store.getIncident(incidentId)
                    : (this.monitoringService.store.incidents ? this.monitoringService.store.incidents.get(incidentId) : null);
                if (inc) ctx.incident = { incidentId, severity: inc.severity || null, status: inc.status || inc.state || null };
            } catch (e) { /* reference stays null */ }
        }
        return ctx;
    }

    _collectAffectedScope(sourceContext, agentId) {
        const agents = new Set(agentId ? [agentId] : []);
        const dependencies = [];
        const scopes = [];
        if (sourceContext.decisionScenario) scopes.push(sourceContext.decisionScenario.impactScope);
        if (sourceContext.simulation) scopes.push(sourceContext.simulation.impactScope);
        return { agents: [...agents], dependencies, impactScopes: scopes };
    }

    _deriveExpectedOutcome(sourceContext, rcPlan, agentId) {
        if (sourceContext.simulation && (sourceContext.simulation.outcomes || []).length > 0) {
            const o = sourceContext.simulation.outcomes[0];
            return {
                source: 'SIMULATION',
                simulationId: sourceContext.simulation.simulationId,
                outcomeState: o.outcomeState,
                summary: o.summary,
                classification: 'PREDICTED',
                note: 'Expected outcome carried from simulation; actual outcome is established only by verification.'
            };
        }
        return {
            source: 'RESPONSE_PLAN_DEFAULT',
            outcomeState: 'RECOVERY_POSSIBLE',
            summary: rcPlan.expectedOutcome || `Restore ${agentId} health baseline to HEALTHY state.`,
            classification: 'PREDICTED',
            note: 'Default plan expectation; actual outcome is established only by verification.'
        };
    }
}

module.exports = { ResponsePlanOrchestrator };
