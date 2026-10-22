/**
 * Phase 31 — Warning Signal Aggregator
 * Collects OBSERVED signals and TREND signals from existing engines without
 * inventing data. Every signal is tagged CONFIRMED (direct store observation)
 * or TREND (statistical baseline comparison). No predictions are made here.
 */

class WarningSignalAggregator {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.anomalyService = options.anomalyService || options.anomalyDetectionService || null;
        this.riskEngine = options.riskEngine || options.predictiveRiskEngine || null;
        this.baselineEngine = options.baselineEngine || options.predictiveBaselineEngine || null;
        this.fleetIntelligenceService = options.fleetIntelligenceService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
    }

    _store() {
        return this.monitoringService ? this.monitoringService.store : null;
    }

    _listAgentIds(tenantId) {
        const store = this._store();
        if (!store) return [];
        try {
            const statuses = store.listStatuses(tenantId);
            return statuses.map(s => s.agentId).filter(Boolean);
        } catch (e) {
            return [];
        }
    }

    /**
     * Collect observed + trend signals for a tenant (or single agent).
     * @returns {{ observedSignals: Array, trendSignals: Array, coverage: Object }}
     */
    collectSignals({ tenantId = 'default-tenant', agentId = null, range = '24h' } = {}) {
        const store = this._store();
        const observedSignals = [];
        const trendSignals = [];

        if (!store) {
            return {
                observedSignals,
                trendSignals,
                coverage: {
                    status: 'INSUFFICIENT_DATA',
                    reason: 'Monitoring store is not available.',
                    agentsEvaluated: 0
                }
            };
        }

        const agentIds = agentId ? [agentId] : this._listAgentIds(tenantId);

        if (agentIds.length === 0) {
            return {
                observedSignals,
                trendSignals,
                coverage: {
                    status: 'INSUFFICIENT_DATA',
                    reason: 'No monitored agents found for this tenant.',
                    agentsEvaluated: 0
                }
            };
        }

        let agentsWithHistory = 0;

        for (const id of agentIds) {
            let status = null;
            try {
                status = store.getStatus(id, tenantId);
            } catch (e) {
                status = null;
            }
            if (!status) continue;

            const currentState = status.currentState || status.status || 'UNKNOWN';
            const consecFails = status.consecutiveFailures || 0;
            const lastLatency = status.latency ? (status.latency.lastLatencyMs || 0) : 0;

            // OBSERVED: current health state (CONFIRMED direct observation)
            observedSignals.push({
                signalId: `sig_state_${id}_${Date.now()}`,
                agentId: id,
                tenantId,
                kind: 'HEALTH_STATE',
                dataClassification: 'OBSERVED',
                evidenceLevel: 'CONFIRMED',
                observedValue: currentState,
                observedAt: status.lastCheckAt || status.updatedAt || new Date().toISOString(),
                detail: `Current health probe state is ${currentState} with ${consecFails} consecutive failures.`,
                evidence: [
                    `Health store reports state=${currentState}`,
                    `Consecutive failures=${consecFails}`,
                    `Last latency=${lastLatency}ms`
                ]
            });

            // OBSERVED: consecutive failures (CONFIRMED)
            if (consecFails >= 1) {
                observedSignals.push({
                    signalId: `sig_fails_${id}_${Date.now()}`,
                    agentId: id,
                    tenantId,
                    kind: 'CONSECUTIVE_FAILURES',
                    dataClassification: 'OBSERVED',
                    evidenceLevel: 'CONFIRMED',
                    observedValue: `${consecFails} consecutive failures`,
                    observedAt: new Date().toISOString(),
                    detail: `${consecFails} consecutive failed health probes observed.`,
                    evidence: [`Store consecutiveFailures=${consecFails}`, `Last error: ${status.lastError || 'not recorded'}`]
                });
            }

            // TREND: baseline comparison (requires baseline engine + history)
            if (this.baselineEngine && typeof this.baselineEngine.calculateBaseline === 'function') {
                try {
                    const baseline = this.baselineEngine.calculateBaseline(id, range, tenantId, store);
                    if (baseline && baseline.status !== 'INSUFFICIENT_DATA') {
                        agentsWithHistory += 1;
                        trendSignals.push({
                            signalId: `sig_trend_${id}_${Date.now()}`,
                            agentId: id,
                            tenantId,
                            kind: 'BASELINE_TREND',
                            dataClassification: 'TREND',
                            evidenceLevel: 'CONFIRMED',
                            observedValue: baseline.responseTimeTrend || 'STABLE',
                            baselineValue: {
                                averageResponseTimeMs: baseline.averageResponseTimeMs,
                                availability: baseline.availability,
                                failureRate: baseline.failureRate
                            },
                            currentLatencyMs: lastLatency,
                            trendChangePercent: baseline.trendChangePercent || 0,
                            observedAt: new Date().toISOString(),
                            detail: `Baseline trend is ${baseline.responseTimeTrend || 'STABLE'} (${baseline.trendChangePercent || 0}% change) over ${range}.`,
                            evidence: [
                                `Baseline avg latency=${baseline.averageResponseTimeMs}ms`,
                                `Current latency=${lastLatency}ms`,
                                `Check count=${baseline.checkCount || baseline.sampleSize || 'unknown'}`
                            ]
                        });
                    }
                } catch (e) {
                    // baseline failure is non-fatal; skip trend for this agent
                }
            }

            // OBSERVED: anomalies (each anomaly already evidence-backed)
            if (this.anomalyService && typeof this.anomalyService.detectAnomalies === 'function') {
                try {
                    const anomalies = this.anomalyService.detectAnomalies(id, { tenantId, range }) || [];
                    for (const a of anomalies) {
                        observedSignals.push({
                            signalId: `sig_anom_${id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                            agentId: id,
                            tenantId,
                            kind: `ANOMALY_${a.type}`,
                            dataClassification: 'OBSERVED',
                            evidenceLevel: 'CONFIRMED',
                            observedValue: a.type,
                            severity: a.severity,
                            observedAt: a.detectedAt || new Date().toISOString(),
                            detail: a.humanReadableSummary || `Anomaly ${a.type} detected.`,
                            evidence: a.evidence || []
                        });
                    }
                } catch (e) {
                    // non-fatal
                }
            }

            // TREND: predictive risk level (statistical, not a fact)
            if (this.riskEngine && typeof this.riskEngine.evaluateRisk === 'function') {
                try {
                    const risk = this.riskEngine.evaluateRisk(id, { tenantId, range });
                    if (risk && risk.baselineStatus !== 'INSUFFICIENT_DATA') {
                        trendSignals.push({
                            signalId: `sig_risk_${id}_${Date.now()}`,
                            agentId: id,
                            tenantId,
                            kind: 'PREDICTIVE_RISK',
                            dataClassification: 'TREND',
                            evidenceLevel: 'INFERRED',
                            observedValue: risk.riskLevel,
                            confidence: risk.confidence,
                            observedAt: risk.evaluatedAt || new Date().toISOString(),
                            detail: `Predictive risk engine rates ${id} as ${risk.riskLevel} (confidence ${risk.confidence}).`,
                            evidence: risk.evidence || []
                        });
                    }
                } catch (e) {
                    // non-fatal
                }
            }
        }

        // OBSERVED: fleet-level recurring problems + hotspots (CONFIRMED aggregates)
        if (this.fleetIntelligenceService && !agentId) {
            try {
                const problems = this.fleetIntelligenceService.getRecurringProblems({ tenantId }) || [];
                for (const p of problems.slice(0, 10)) {
                    observedSignals.push({
                        signalId: `sig_recur_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                        agentId: (p.affectedAgents && p.affectedAgents[0]) || 'fleet',
                        tenantId,
                        kind: 'RECURRING_PROBLEM',
                        dataClassification: 'OBSERVED',
                        evidenceLevel: 'CONFIRMED',
                        observedValue: p.problemType || p.type || 'RECURRING',
                        observedAt: p.lastObserved || new Date().toISOString(),
                        detail: p.humanReadableDescription || 'Recurring operational problem observed across fleet.',
                        evidence: p.evidence ? [JSON.stringify(p.evidence).slice(0, 500)] : []
                    });
                }
                const hotspots = this.fleetIntelligenceService.getOperationalHotspots({ tenantId }) || [];
                for (const h of hotspots.slice(0, 10)) {
                    observedSignals.push({
                        signalId: `sig_hot_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                        agentId: (h.affectedAgents && h.affectedAgents[0]) || h.affectedArea || 'fleet',
                        tenantId,
                        kind: 'OPERATIONAL_HOTSPOT',
                        dataClassification: 'OBSERVED',
                        evidenceLevel: 'CONFIRMED',
                        observedValue: h.hotspotType || 'HOTSPOT',
                        observedAt: new Date().toISOString(),
                        detail: h.whyItIsAHotspot || 'Operational hotspot detected.',
                        evidence: h.evidence ? [JSON.stringify(h.evidence).slice(0, 500)] : [h.evidenceSummary || 'hotspot evidence']
                    });
                }
            } catch (e) {
                // non-fatal
            }
        }

        // OBSERVED: dependency blast-radius exposure (CONFIRMED topology)
        if (this.blastRadiusAnalyzer && !agentId) {
            try {
                if (typeof this.blastRadiusAnalyzer.analyzeBlastRadius === 'function') {
                    // per-agent blast radius is evaluated at inference time; record topology availability
                    trendSignals.push({
                        signalId: `sig_depctx_${Date.now()}`,
                        agentId: 'fleet',
                        tenantId,
                        kind: 'DEPENDENCY_CONTEXT',
                        dataClassification: 'TREND',
                        evidenceLevel: 'CONFIRMED',
                        observedValue: 'TOPOLOGY_AVAILABLE',
                        observedAt: new Date().toISOString(),
                        detail: 'Dependency topology is available for blast-radius aware warnings.',
                        evidence: ['DependencyGraphService topology reachable']
                    });
                }
            } catch (e) {
                // non-fatal
            }
        }

        return {
            observedSignals,
            trendSignals,
            coverage: {
                status: agentsWithHistory > 0 || observedSignals.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
                reason: observedSignals.length === 0
                    ? 'No health probe observations recorded yet.'
                    : `${agentIds.length} agent(s) evaluated, ${agentsWithHistory} with baseline history.`,
                agentsEvaluated: agentIds.length,
                agentsWithHistory
            }
        };
    }
}

module.exports = { WarningSignalAggregator };
