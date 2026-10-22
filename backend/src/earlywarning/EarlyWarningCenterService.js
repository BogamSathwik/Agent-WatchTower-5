/**
 * Phase 31 — Early Warning Center Service (Master Orchestrator)
 * Unifies observed signals, trend analysis, inferred warnings, and explicit
 * predictions for Predictive Operations & Early Warning Center.
 *
 * Integrates (read-only, no duplication):
 *  monitoring store, baselines, anomalies, predictive risk, fleet intelligence,
 *  dependency graph / blast radius / root cause, response center readiness,
 *  knowledge investigation context.
 *
 * Truthfulness contract:
 *  - OBSERVED  = directly from stores (CONFIRMED)
 *  - TREND     = statistical baseline comparison (CONFIRMED computation)
 *  - INFERRED_WARNING = deterministic rule inference (INFERRED)
 *  - PREDICTION = explicit forecast with horizon + disclaimer (PREDICTION / INSUFFICIENT_DATA)
 */

const { WarningSignalAggregator } = require('./WarningSignalAggregator');
const { EarlyWarningInferenceEngine } = require('./EarlyWarningInferenceEngine');
const { ForecastHorizonService } = require('./ForecastHorizonService');

class EarlyWarningCenterService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.baselineEngine = options.baselineEngine || options.predictiveBaselineEngine || null;
        this.anomalyService = options.anomalyService || options.anomalyDetectionService || null;
        this.riskEngine = options.riskEngine || options.predictiveRiskEngine || null;
        this.fleetIntelligenceService = options.fleetIntelligenceService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
        this.rootCauseAnalyzer = options.rootCauseAnalyzer || null;
        this.responseCenterService = options.responseCenterService || null;
        this.investigationContextService = options.investigationContextService || null;
        this.similarIncidentAnalyzer = options.similarIncidentAnalyzer || null;
        this.auditService = options.auditService || options.auditLogService || null;
        this.persistence = options.persistenceManager || options.persistence || null;

        this.signalAggregator = options.signalAggregator || new WarningSignalAggregator({
            monitoringService: this.monitoringService,
            anomalyService: this.anomalyService,
            riskEngine: this.riskEngine,
            baselineEngine: this.baselineEngine,
            fleetIntelligenceService: this.fleetIntelligenceService,
            dependencyGraphService: this.dependencyGraphService,
            blastRadiusAnalyzer: this.blastRadiusAnalyzer
        });

        this.inferenceEngine = options.inferenceEngine || new EarlyWarningInferenceEngine({
            blastRadiusAnalyzer: this.blastRadiusAnalyzer,
            rootCauseAnalyzer: this.rootCauseAnalyzer,
            dependencyGraphService: this.dependencyGraphService
        });

        this.forecastService = options.forecastService || new ForecastHorizonService({
            baselineEngine: this.baselineEngine,
            monitoringService: this.monitoringService
        });

        // acknowledgement overlay: warningId -> { acknowledgedBy, note, acknowledgedAt, tenantId }
        this.acknowledgements = new Map();
    }

    _withAck(warnings) {
        return warnings.map(w => {
            const ack = this.acknowledgements.get(w.warningId);
            if (ack) return { ...w, status: 'ACKNOWLEDGED', acknowledgement: ack };
            return w;
        });
    }

    _computeWarnings({ tenantId, agentId = null, range = '24h' }) {
        const { observedSignals, trendSignals, coverage } = this.signalAggregator.collectSignals({ tenantId, agentId, range });
        let warnings = this.inferenceEngine.inferWarnings({ observedSignals, trendSignals, tenantId });
        if (agentId) warnings = warnings.filter(w => w.agentId === agentId);
        warnings = this._withAck(warnings);
        return { observedSignals, trendSignals, warnings, coverage };
    }

    getOverview({ tenantId = 'default-tenant', range = '24h' } = {}) {
        const { observedSignals, trendSignals, warnings, coverage } = this._computeWarnings({ tenantId, range });
        const { predictions, coverage: forecastCoverage } = this.forecastService.buildPredictions(warnings, { tenantId });

        const activeWarnings = warnings.filter(w => w.status === 'ACTIVE');
        const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
        for (const w of activeWarnings) {
            if (bySeverity[w.severity] !== undefined) bySeverity[w.severity] += 1;
        }

        let fleetRisk = null;
        try {
            fleetRisk = this.fleetIntelligenceService
                ? this.fleetIntelligenceService.getFleetRisks({ tenantId })
                : null;
        } catch (e) {
            fleetRisk = null;
        }

        return {
            tenantId,
            timestamp: new Date().toISOString(),
            monitoringStatus: coverage.status === 'INSUFFICIENT_DATA' ? 'WARMING_UP' : 'ACTIVE',
            dataClassificationLegend: {
                OBSERVED: 'Directly measured values from monitoring stores.',
                TREND: 'Statistical comparison against historical baselines.',
                INFERRED_WARNING: 'Deterministic rule inference from converging signals — plausible, not certain.',
                PREDICTION: 'Explicit forecast with horizon window and confidence — not a fact.'
            },
            scorecard: {
                observedSignalsCount: observedSignals.length,
                trendSignalsCount: trendSignals.length,
                activeWarningsCount: activeWarnings.length,
                acknowledgedWarningsCount: warnings.filter(w => w.status === 'ACKNOWLEDGED').length,
                forecastsIssued: forecastCoverage.forecastsIssued,
                forecastsWithheld: forecastCoverage.withheldForInsufficientData,
                bySeverity,
                coverageStatus: coverage.status,
                coverageReason: coverage.reason
            },
            topWarnings: activeWarnings.slice(0, 5),
            fleetRisk,
            predictions: predictions.slice(0, 5),
            evidenceSummary: {
                observedKinds: [...new Set(observedSignals.map(s => s.kind))],
                trendKinds: [...new Set(trendSignals.map(t => t.kind))],
                note: 'Warnings are inferred only when two or more independent signals converge. Single-signal deviations remain watch-level trends.'
            }
        };
    }

    getWarnings({ tenantId = 'default-tenant', severity = null, agentId = null, range = '24h', includeAcknowledged = true } = {}) {
        const { warnings, coverage } = this._computeWarnings({ tenantId, agentId, range });
        let list = warnings;
        if (severity) list = list.filter(w => w.severity === String(severity).toUpperCase());
        if (!includeAcknowledged) list = list.filter(w => w.status === 'ACTIVE');
        return {
            tenantId,
            timestamp: new Date().toISOString(),
            count: list.length,
            coverageStatus: coverage.status,
            warnings: list
        };
    }

    getWarningById(warningId, { tenantId = 'default-tenant', range = '24h' } = {}) {
        const { warnings } = this._computeWarnings({ tenantId, range });
        const found = warnings.find(w => w.warningId === warningId);
        if (!found) return { status: 'NOT_FOUND', warningId, tenantId };

        // Enrich with response + knowledge context (read-only references)
        let responseOptions = [];
        try {
            if (this.responseCenterService && typeof this.responseCenterService.generateResponseOptions === 'function') {
                responseOptions = this.responseCenterService.generateResponseOptions({ agentId: found.agentId, tenantId }) || [];
            }
        } catch (e) {
            responseOptions = [];
        }

        let similarIncidents = [];
        try {
            if (this.similarIncidentAnalyzer && typeof this.similarIncidentAnalyzer.findSimilarIncidents === 'function') {
                similarIncidents = this.similarIncidentAnalyzer.findSimilarIncidents(found.agentId, { tenantId }) || [];
            } else if (this.similarIncidentAnalyzer && typeof this.similarIncidentAnalyzer.analyzeSimilarIncidents === 'function') {
                similarIncidents = this.similarIncidentAnalyzer.analyzeSimilarIncidents(found.agentId, tenantId) || [];
            }
        } catch (e) {
            similarIncidents = [];
        }

        const { predictions } = this.forecastService.buildPredictions([found], { tenantId });

        return {
            status: 'FOUND',
            warning: found,
            prediction: predictions[0] || null,
            responseReadiness: {
                readiness: found.responseReadiness,
                reason: found.responseReadinessReason,
                availableResponseOptions: responseOptions.slice(0, 8).map(o => o.actionType || o.action || o.type).filter(Boolean)
            },
            relatedKnowledge: {
                similarIncidentsCount: Array.isArray(similarIncidents) ? similarIncidents.length : 0,
                similarIncidents: Array.isArray(similarIncidents) ? similarIncidents.slice(0, 5) : similarIncidents
            }
        };
    }

    getAgentEarlyWarning(agentId, { tenantId = 'default-tenant', range = '24h' } = {}) {
        const { observedSignals, trendSignals, warnings, coverage } = this._computeWarnings({ tenantId, agentId, range });
        const { predictions } = this.forecastService.buildPredictions(warnings, { tenantId });
        return {
            agentId,
            tenantId,
            timestamp: new Date().toISOString(),
            coverageStatus: coverage.status,
            coverageReason: coverage.reason,
            observedSignals: observedSignals.filter(s => s.agentId === agentId),
            trendSignals: trendSignals.filter(t => t.agentId === agentId),
            warnings,
            predictions
        };
    }

    getObservedTrends({ tenantId = 'default-tenant', range = '24h', agentId = null } = {}) {
        const { observedSignals, trendSignals, coverage } = this.signalAggregator.collectSignals({ tenantId, agentId, range });
        return {
            tenantId,
            timestamp: new Date().toISOString(),
            dataClassification: 'OBSERVED_AND_TREND_ONLY',
            note: 'No inferences or predictions in this view — observed measurements and baseline comparisons only.',
            coverageStatus: coverage.status,
            observedSignals,
            trendSignals
        };
    }

    getPredictions({ tenantId = 'default-tenant', agentId = null, range = '24h' } = {}) {
        const { warnings } = this._computeWarnings({ tenantId, agentId, range });
        const result = this.forecastService.buildPredictions(warnings, { tenantId });
        return {
            tenantId,
            timestamp: new Date().toISOString(),
            dataClassification: 'PREDICTION',
            disclaimer: 'Forecasts are statisticalли inferred from observed trends and may not materialize. Do not treat as facts.',
            ...result
        };
    }

    getReadiness({ tenantId = 'default-tenant', range = '24h' } = {}) {
        const { warnings } = this._computeWarnings({ tenantId, range });
        const agentIds = [...new Set(warnings.map(w => w.agentId))];
        // include all monitored agents even without warnings
        try {
            const store = this.monitoringService ? this.monitoringService.store : null;
            if (store && typeof store.listStatuses === 'function') {
                for (const s of store.listStatuses(tenantId)) {
                    if (s.agentId && !agentIds.includes(s.agentId)) agentIds.push(s.agentId);
                }
            }
        } catch (e) { /* ignore */ }

        return {
            tenantId,
            timestamp: new Date().toISOString(),
            readiness: agentIds.map(id => {
                const external = /compa|repa/i.test(id);
                return {
                    agentId: id,
                    readiness: external ? 'UNSUPPORTED' : 'SUPPORTED',
                    reason: external
                        ? 'External agent: monitoring only, no control interface.'
                        : 'Response Center inspection available; stateful actions require approval.',
                    activeWarnings: warnings.filter(w => w.agentId === id && w.status === 'ACTIVE').length
                };
            })
        };
    }

    acknowledgeWarning(warningId, { tenantId = 'default-tenant', acknowledgedBy = 'operator', note = '' } = {}) {
        const { warnings } = this._computeWarnings({ tenantId });
        const found = warnings.find(w => w.warningId === warningId);
        if (!found) return { status: 'NOT_FOUND', warningId, tenantId };
        const record = {
            acknowledgedBy,
            note: String(note || '').slice(0, 500),
            acknowledgedAt: new Date().toISOString(),
            tenantId
        };
        this.acknowledgements.set(warningId, record);
        try {
            if (this.auditService && typeof this.auditService.logEvent === 'function') {
                this.auditService.logEvent({
                    eventType: 'EARLY_WARNING_ACKNOWLEDGED',
                    action: 'acknowledge_warning',
                    actor: acknowledgedBy,
                    tenantId,
                    resourceType: 'early-warning',
                    resourceId: warningId,
                    outcome: 'SUCCESS',
                    severity: 'INFO',
                    correlationId: `ew_ack_${Date.now()}`,
                    metadata: { agentId: found.agentId, warningType: found.warningType }
                });
            }
        } catch (e) { /* audit non-fatal */ }
        return { status: 'ACKNOWLEDGED', warningId, tenantId, acknowledgement: record, warning: { ...found, status: 'ACKNOWLEDGED', acknowledgement: record } };
    }
}

module.exports = { EarlyWarningCenterService };
