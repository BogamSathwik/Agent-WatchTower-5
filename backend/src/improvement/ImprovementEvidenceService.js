/**
 * Phase 35 — Improvement Evidence Service
 * Collects evidence for an opportunity/scope from existing Watchtower
 * systems. Every item is classified and keeps its source reference.
 * Classes: OBSERVED / CONFIRMED / INFERRED / PREDICTED / SIMULATED /
 *          INSUFFICIENT_DATA. Inference is never promoted to confirmed fact.
 */

function isExternalAgent(agentId) {
    return !!agentId && /compa|repa/i.test(String(agentId));
}

class ImprovementEvidenceService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.evidenceService = options.evidenceService || null; // Phase 32 DecisionEvidenceService (reuse, no duplication)
        this.adaptiveService = options.adaptiveService || options.adaptiveResponseService || null;
        this.fleetService = options.fleetService || options.fleetIntelligenceService || null;
        this.earlyWarningService = options.earlyWarningService || options.earlyWarningCenterService || null;
        this.simulationService = options.simulationService || options.simulationIntelligenceService || null;
        this.knowledgeGraphService = options.knowledgeGraphService || options.agentKnowledgeGraphService || null;
    }

    _store() {
        return this.monitoringService ? this.monitoringService.store : null;
    }

    /**
     * Collect classified evidence for an agent scope (or fleet when null).
     */
    collectEvidence({ tenantId = 'default-tenant', agentId = null, range = '24h' } = {}) {
        const observed = [];
        const confirmed = [];
        const inferred = [];
        const predicted = [];
        const simulated = [];
        const gaps = [];

        // Base operational evidence (reuse Phase 32 collector where wired).
        if (this.evidenceService && typeof this.evidenceService.collectEvidence === 'function') {
            try {
                const base = this.evidenceService.collectEvidence({ tenantId, agentId, range });
                for (const e of base.observed || []) observed.push(this._tag(e, 'OBSERVED'));
                for (const e of base.trends || []) observed.push(this._tag(e, 'OBSERVED'));
                for (const e of base.inferred || []) inferred.push(this._tag(e, 'INFERRED'));
                for (const e of base.predicted || []) predicted.push(this._tag(e, 'PREDICTED'));
                for (const g of base.gaps || []) gaps.push({ kind: g.kind, classification: 'INSUFFICIENT_DATA', reason: g.reason || 'No record available.' });
            } catch (e) {
                gaps.push({ kind: 'BASE_EVIDENCE', classification: 'INSUFFICIENT_DATA', reason: `Base evidence unavailable: ${e.message}` });
            }
        }

        // Adaptive response learning + effectiveness (first-class evidence).
        if (this.adaptiveService) {
            try {
                const eff = typeof this.adaptiveService.getEffectiveness === 'function'
                    ? this.adaptiveService.getEffectiveness({ tenantId, agentId: agentId || null }) : null;
                const types = (eff && eff.byResponseType) || [];
                for (const t of types) {
                    if ((t.totalCount || 0) > 0) {
                        confirmed.push({
                            kind: 'RESPONSE_EFFECTIVENESS', classification: 'CONFIRMED', agentId: agentId || 'fleet',
                            summary: `Response '${t.responseType}': ${t.totalCount} recorded outcome(s) — ${t.verifiedRecoveredCount || 0} recovered, ${t.improvedCount || 0} improved, ${t.unchangedOrFailedCount || 0} unchanged/failed.`,
                            ref: { service: 'AdaptiveResponseService', method: 'getEffectiveness' }
                        });
                    }
                }
                const hist = typeof this.adaptiveService.getHistory === 'function'
                    ? this.adaptiveService.getHistory({ tenantId }) : { plans: [] };
                const scoped = agentId ? (hist.plans || []).filter(p => p.agentId === agentId) : (hist.plans || []);
                for (const p of scoped.slice(0, 5)) {
                    observed.push({
                        kind: 'ADAPTIVE_PLAN', classification: 'OBSERVED', agentId: p.agentId,
                        summary: `Adaptive plan ${p.adaptivePlanId}: approval ${p.approvalState}, execution ${p.executionState}, verification ${p.verificationState}.`,
                        ref: { service: 'AdaptiveResponseService', planId: p.adaptivePlanId }
                    });
                }
                if (agentId) {
                    const agentHist = typeof this.adaptiveService.getAgentResponseHistory === 'function'
                        ? this.adaptiveService.getAgentResponseHistory(agentId, { tenantId }) : { plans: [] };
                    for (const p of (agentHist.plans || []).slice(0, 3)) {
                        for (const l of (p.learning || []).slice(0, 2)) {
                            confirmed.push({
                                kind: 'RESPONSE_LEARNING', classification: 'CONFIRMED', agentId,
                                summary: l.statement || 'Recorded learning statement.',
                                ref: { service: 'AdaptiveResponseService', planId: p.adaptivePlanId }
                            });
                        }
                    }
                }
            } catch (e) { /* non-fatal */ }
        }

        // Fleet patterns (read-only, calculations untouched).
        if (this.fleetService && !agentId) {
            try {
                const problems = this.fleetService.getRecurringProblems({ tenantId }) || [];
                for (const p of problems.slice(0, 5)) {
                    confirmed.push({
                        kind: 'FLEET_RECURRING_PROBLEM', classification: 'CONFIRMED', agentId: 'fleet',
                        summary: (p.humanReadableDescription || p.problemType || p.type || 'Recurring problem') + ` (frequency ${p.frequency || 'unknown'}).`,
                        ref: { service: 'FleetIntelligenceService', problemId: p.problemId }
                    });
                }
            } catch (e) { /* non-fatal */ }
        }

        // Simulation outcomes as context (analytical, never facts).
        if (this.simulationService && agentId) {
            try {
                const sims = typeof this.simulationService.getAgentSimulations === 'function'
                    ? this.simulationService.getAgentSimulations(agentId, { tenantId }) : [];
                for (const s of (sims || []).slice(0, 3)) {
                    const states = ((s.outcomes || []).map(o => o.outcomeState).join(', ')) || 'not run';
                    simulated.push({
                        kind: 'SIMULATION_OUTCOME', classification: 'SIMULATED', agentId,
                        summary: `Simulation '${s.title || s.simulationType}': modeled outcome(s) ${states} (SIMULATED ONLY).`,
                        ref: { service: 'SimulationIntelligenceService', simulationId: s.simulationId }
                    });
                }
            } catch (e) { /* non-fatal */ }
        }

        // Knowledge context (recorded relations only).
        if (this.knowledgeGraphService && agentId) {
            try {
                const graph = typeof this.knowledgeGraphService.getGraph === 'function'
                    ? this.knowledgeGraphService.getGraph({ agentId }, tenantId) : null;
                const nodes = (graph && (graph.nodes || graph.entities || graph.items)) || [];
                if (Array.isArray(nodes) && nodes.length > 0) {
                    confirmed.push({
                        kind: 'KNOWLEDGE_CONTEXT', classification: 'CONFIRMED', agentId,
                        summary: `Knowledge graph holds ${nodes.length} recorded entit(ies) for scope (relations as stored).`,
                        ref: { service: 'AgentKnowledgeGraphService' }
                    });
                } else {
                    gaps.push({ kind: 'KNOWLEDGE_CONTEXT', classification: 'INSUFFICIENT_DATA', reason: 'No knowledge graph records for scope.' });
                }
            } catch (e) {
                gaps.push({ kind: 'KNOWLEDGE_CONTEXT', classification: 'INSUFFICIENT_DATA', reason: `Knowledge graph unavailable: ${e.message}` });
            }
        }

        const substantive = observed.length + confirmed.length + inferred.length;
        return {
            observed, confirmed, inferred, predicted, simulated, gaps,
            evidenceStrength: gaps.length === 0 ? 'STRONG' : (substantive >= 3 ? 'MODERATE' : (substantive > 0 ? 'WEAK' : 'NONE'))
        };
    }

    _tag(entry, classification) {
        return { kind: entry.kind, classification, agentId: entry.agentId, summary: entry.summary || entry.detail || '', ref: entry.ref || {} };
    }
}

module.exports = { ImprovementEvidenceService, isExternalAgent };
