/**
 * Phase 32 — Decision Evidence Service
 * Gathers read-only evidence for scenarios/options from existing Watchtower
 * systems. Never fabricates telemetry, relationships, or capabilities.
 * Every bucket is classified: CONFIRMED / INFERRED / PREDICTED / INSUFFICIENT_DATA.
 */

function isExternalAgent(agentId) {
    return !!agentId && /compa|repa/i.test(String(agentId));
}

class DecisionEvidenceService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.earlyWarningService = options.earlyWarningService || options.earlyWarningCenterService || null;
        this.fleetIntelligenceService = options.fleetIntelligenceService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
        this.responseCenterService = options.responseCenterService || null;
        this.knowledgeGraphService = options.knowledgeGraphService || options.agentKnowledgeGraphService || null;
        this.similarIncidentAnalyzer = options.similarIncidentAnalyzer || null;
        this.riskEngine = options.riskEngine || options.predictiveRiskEngine || null;
        this.anomalyService = options.anomalyService || options.anomalyDetectionService || null;
    }

    _store() {
        return this.monitoringService ? this.monitoringService.store : null;
    }

    /**
     * Collect classified evidence for an agent (or fleet when agentId is null).
     */
    collectEvidence({ tenantId = 'default-tenant', agentId = null, range = '24h', warningId = null } = {}) {
        const observed = [];
        const trends = [];
        const inferred = [];
        const predicted = [];
        const gaps = [];

        const store = this._store();

        // OBSERVED: health status + incidents (CONFIRMED)
        if (store) {
            try {
                if (agentId) {
                    const status = store.getStatus(agentId, tenantId);
                    const hasRealProbes = status && (status.lastCheckAt || (status.totalChecksCount || 0) > 0);
                    const isUnknownDefault = status && ((status.currentState || status.status) === 'UNKNOWN') && !hasRealProbes;
                    if (status && !isUnknownDefault) {
                        observed.push({
                            kind: 'HEALTH_STATUS', classification: 'CONFIRMED', agentId,
                            summary: `Health state ${status.currentState || status.status || 'UNKNOWN'} with ${status.consecutiveFailures || 0} consecutive failures.`,
                            ref: { store: 'AgentMonitoringStore', method: 'getStatus' }
                        });
                    } else {
                        gaps.push({ kind: 'HEALTH_STATUS', classification: 'INSUFFICIENT_DATA', reason: `No health probes recorded for '${agentId}' (state UNKNOWN, monitoring not yet active).` });
                    }
                    const incidents = store.listIncidents(tenantId, agentId) || [];
                    for (const inc of incidents.slice(0, 5)) {
                        observed.push({
                            kind: 'INCIDENT', classification: 'CONFIRMED', agentId,
                            summary: `Incident ${inc.id || inc.incidentId || 'unknown'} (${inc.severity || 'unknown severity'}): ${inc.title || inc.trigger || inc.type || 'recorded incident'}.`,
                            ref: { store: 'AgentMonitoringStore', method: 'listIncidents', incidentId: inc.id || inc.incidentId }
                        });
                    }
                    const history = typeof store.getCheckHistory === 'function' ? store.getCheckHistory(agentId, tenantId, 5) : [];
                    if (!history || history.length === 0) {
                        gaps.push({ kind: 'PROBE_HISTORY', classification: 'INSUFFICIENT_DATA', reason: `Fewer than 3 probe records for '${agentId}'.` });
                    }
                } else {
                    const statuses = store.listStatuses(tenantId) || [];
                    observed.push({
                        kind: 'FLEET_HEALTH_SNAPSHOT', classification: 'CONFIRMED', agentId: 'fleet',
                        summary: `${statuses.length} monitored agent(s) in tenant snapshot.`,
                        ref: { store: 'AgentMonitoringStore', method: 'listStatuses' }
                    });
                    if (statuses.length === 0) gaps.push({ kind: 'FLEET_HEALTH_SNAPSHOT', classification: 'INSUFFICIENT_DATA', reason: 'No monitored agents in tenant.' });
                }
            } catch (e) {
                gaps.push({ kind: 'MONITORING_STORE', classification: 'INSUFFICIENT_DATA', reason: `Monitoring store unavailable: ${e.message}` });
            }
        } else {
            gaps.push({ kind: 'MONITORING_STORE', classification: 'INSUFFICIENT_DATA', reason: 'Monitoring service not wired.' });
        }

        // TREND + INFERRED + PREDICTED: early warnings (reuse, do not recompute)
        if (this.earlyWarningService) {
            try {
                const ew = agentId
                    ? this.earlyWarningService.getAgentEarlyWarning(agentId, { tenantId, range })
                    : this.earlyWarningService.getOverview({ tenantId, range });
                // An UNKNOWN default store entry (no real probes) must not count
                // as substantive signal coverage for a single-agent scope.
                let agentHasProbes = true;
                if (agentId && store) {
                    try {
                        const st = store.getStatus(agentId, tenantId);
                        agentHasProbes = !!(st && (st.lastCheckAt || (st.totalChecksCount || 0) > 0));
                    } catch (e) { agentHasProbes = false; }
                }
                const sigCount = agentHasProbes ? (agentId
                    ? ((ew.observedSignals || []).length + (ew.trendSignals || []).length)
                    : ((ew.scorecard ? ew.scorecard.observedSignalsCount : 0) + (ew.scorecard ? ew.scorecard.trendSignalsCount : 0))) : 0;
                if (!agentHasProbes && agentId) {
                    gaps.push({ kind: 'EARLY_WARNING_SIGNALS', classification: 'INSUFFICIENT_DATA', reason: `No probe-backed early-warning signals for '${agentId}'.` });
                } else {
                    trends.push({
                        kind: 'EARLY_WARNING_SIGNALS', classification: sigCount > 0 ? 'CONFIRMED' : 'INSUFFICIENT_DATA', agentId: agentId || 'fleet',
                        summary: sigCount > 0 ? `${sigCount} early-warning signal(s) aggregated for scope.` : 'No early-warning signals aggregated.',
                        ref: { service: 'EarlyWarningCenterService' }
                    });
                }
                const warnings = agentId ? (ew.warnings || []) : (ew.topWarnings || []);
                const target = warningId ? warnings.filter(w => w.warningId === warningId) : warnings;
                for (const w of target.slice(0, 5)) {
                    inferred.push({
                        kind: 'EARLY_WARNING', classification: w.evidenceLevel === 'CONFIRMED' ? 'CONFIRMED' : 'INFERRED', agentId: w.agentId,
                        summary: `${w.warningType} (${w.severity}, confidence ${w.confidence}): ${w.title || ''}`,
                        ref: { service: 'EarlyWarningCenterService', warningId: w.warningId }
                    });
                }
                const preds = agentId ? (ew.predictions || []) : (ew.predictions || []);
                for (const p of preds.slice(0, 3)) {
                    if (p.status === 'FORECAST') {
                        predicted.push({
                            kind: 'FORECAST', classification: 'PREDICTED', agentId: p.agentId,
                            summary: `${p.predictedOutcome || ''} [horizon ${p.horizonWindow}]`,
                            ref: { service: 'ForecastHorizonService', predictionId: p.predictionId }
                        });
                    } else {
                        gaps.push({ kind: 'FORECAST', classification: 'INSUFFICIENT_DATA', reason: p.predictedOutcome || 'Forecast withheld for insufficient history.' });
                    }
                }
            } catch (e) {
                gaps.push({ kind: 'EARLY_WARNING', classification: 'INSUFFICIENT_DATA', reason: `Early Warning Center unavailable: ${e.message}` });
            }
        }

        // OBSERVED: fleet recurring problems / hotspots (CONFIRMED aggregates)
        if (this.fleetIntelligenceService && !agentId) {
            try {
                const problems = this.fleetIntelligenceService.getRecurringProblems({ tenantId }) || [];
                for (const p of problems.slice(0, 3)) {
                    observed.push({
                        kind: 'RECURRING_PROBLEM', classification: 'CONFIRMED', agentId: 'fleet',
                        summary: (p.humanReadableDescription || p.problemType || p.type || 'Recurring problem') + '',
                        ref: { service: 'FleetIntelligenceService', method: 'getRecurringProblems' }
                    });
                }
            } catch (e) { /* non-fatal */ }
        }

        // OBSERVED: dependency topology (only declared/discovered, never invented)
        if (this.dependencyGraphService) {
            try {
                const graph = typeof this.dependencyGraphService.getDependencyGraph === 'function'
                    ? this.dependencyGraphService.getDependencyGraph({}, tenantId)
                    : null;
                if (graph && (graph.nodes || graph.edges)) {
                    observed.push({
                        kind: 'DEPENDENCY_TOPOLOGY', classification: 'CONFIRMED', agentId: agentId || 'fleet',
                        summary: `Declared topology: ${(graph.nodes || []).length} node(s), ${(graph.edges || []).length} edge(s).`,
                        ref: { service: 'DependencyGraphService' }
                    });
                } else {
                    gaps.push({ kind: 'DEPENDENCY_TOPOLOGY', classification: 'INSUFFICIENT_DATA', reason: 'No declared dependency topology for scope.' });
                }
            } catch (e) {
                gaps.push({ kind: 'DEPENDENCY_TOPOLOGY', classification: 'INSUFFICIENT_DATA', reason: `Dependency graph unavailable: ${e.message}` });
            }
        }

        // INFERRED: blast radius (computed, labeled inferred)
        if (this.blastRadiusAnalyzer && agentId) {
            try {
                const blast = typeof this.blastRadiusAnalyzer.analyzeBlastRadius === 'function'
                    ? this.blastRadiusAnalyzer.analyzeBlastRadius(agentId, tenantId)
                    : null;
                if (blast) {
                    const list = blast.affectedAgents || blast.impactedAgents || [];
                    const others = Array.isArray(list) ? list.filter(a => a && a !== agentId) : [];
                    if (others.length > 0) {
                        inferred.push({
                            kind: 'BLAST_RADIUS', classification: 'INFERRED', agentId,
                            summary: `Computed blast radius touches ${others.length} other agent(s): ${others.slice(0, 5).join(', ')}.`,
                            ref: { service: 'BlastRadiusAnalyzer' }
                        });
                    }
                    // An empty blast radius is absence of evidence, not evidence:
                    // record nothing so INSUFFICIENT_DATA stays honest.
                }
            } catch (e) { /* non-fatal */ }
        }

        // OBSERVED: response history / safety (inspect-only reference)
        if (this.responseCenterService && agentId) {
            try {
                const opts = typeof this.responseCenterService.generateResponseOptions === 'function'
                    ? this.responseCenterService.generateResponseOptions({ agentId, tenantId }) || []
                    : [];
                if (opts.length > 0) {
                    observed.push({
                        kind: 'RESPONSE_OPTIONS', classification: 'CONFIRMED', agentId,
                        summary: `${opts.length} existing Response Center option(s) available for inspection.`,
                        ref: { service: 'IntelligentResponseCenterService', method: 'generateResponseOptions' }
                    });
                } else {
                    gaps.push({ kind: 'RESPONSE_OPTIONS', classification: 'INSUFFICIENT_DATA', reason: 'No Response Center options generated for agent.' });
                }
            } catch (e) { /* non-fatal */ }
        }

        // CONFIRMED vs INFERRED knowledge graph context (never fabricated)
        if (this.knowledgeGraphService) {
            try {
                const graph = typeof this.knowledgeGraphService.getGraph === 'function'
                    ? this.knowledgeGraphService.getGraph(agentId ? { agentId } : {}, tenantId)
                    : null;
                const nodes = (graph && (graph.nodes || graph.entities || graph.items)) || [];
                if (Array.isArray(nodes) && nodes.length > 0) {
                    observed.push({
                        kind: 'KNOWLEDGE_CONTEXT', classification: 'CONFIRMED', agentId: agentId || 'fleet',
                        summary: `Knowledge graph holds ${nodes.length} recorded entit(ies) for scope. Relationships preserved as recorded (confirmed vs inferred as stored).`,
                        ref: { service: 'AgentKnowledgeGraphService' }
                    });
                } else {
                    gaps.push({ kind: 'KNOWLEDGE_CONTEXT', classification: 'INSUFFICIENT_DATA', reason: 'No knowledge graph records for scope.' });
                }
            } catch (e) {
                gaps.push({ kind: 'KNOWLEDGE_CONTEXT', classification: 'INSUFFICIENT_DATA', reason: `Knowledge graph unavailable: ${e.message}` });
            }
        }

        if (this.similarIncidentAnalyzer && agentId) {
            try {
                const incidents = store ? store.listIncidents(tenantId, agentId) : [];
                if (incidents && incidents.length > 0) {
                    const firstId = incidents[0].id || incidents[0].incidentId;
                    const similar = this.similarIncidentAnalyzer.findSimilarIncidents(firstId, tenantId, {}) || [];
                    const list = Array.isArray(similar) ? similar : [];
                    if (list.length > 0) {
                        inferred.push({
                            kind: 'SIMILAR_INCIDENTS', classification: 'INFERRED', agentId,
                            summary: `${list.length} historically similar incident(s) matched by recorded attributes.`,
                            ref: { service: 'SimilarIncidentAnalyzer' }
                        });
                    } else {
                        gaps.push({ kind: 'SIMILAR_INCIDENTS', classification: 'INSUFFICIENT_DATA', reason: 'No historically similar incidents matched.' });
                    }
                }
            } catch (e) { /* non-fatal */ }
        }

        const strength = gaps.length === 0 ? 'STRONG' : (observed.length + trends.length >= 3 ? 'MODERATE' : 'WEAK');

        return { observed, trends, inferred, predicted, gaps, evidenceStrength: strength };
    }
}

module.exports = { DecisionEvidenceService, isExternalAgent };
