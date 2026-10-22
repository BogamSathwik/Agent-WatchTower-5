/**
 * Phase 31 — Forecast Horizon Service
 * Turns INFERRED warnings into explicit PREDICTION records with horizon
 * windows, confidence, expiry, and disclaimers. Predictions are clearly
 * labeled and never presented as observed facts. Returns INSUFFICIENT_DATA
 * when history cannot support a forecast.
 */

class ForecastHorizonService {
    constructor(options = {}) {
        this.baselineEngine = options.baselineEngine || options.predictiveBaselineEngine || null;
        this.monitoringService = options.monitoringService || null;
    }

    _historyDepth(agentId, tenantId) {
        const store = this.monitoringService ? this.monitoringService.store : null;
        if (!store || typeof store.getCheckHistory !== 'function') return 0;
        try {
            const hist = store.getCheckHistory(agentId, tenantId, 30);
            return Array.isArray(hist) ? hist.length : 0;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Build predictions from warnings.
     * @returns {{ predictions: Array, coverage: Object }}
     */
    buildPredictions(warnings = [], { tenantId = 'default-tenant' } = {}) {
        const predictions = [];

        for (const w of warnings) {
            // Active confirmed outages are not forecasts
            if (w.dataClassification === 'OBSERVED' && w.leadTimeEstimate === 'NOW') continue;

            const depth = this._historyDepth(w.agentId, tenantId);
            if (depth < 3) {
                predictions.push({
                    predictionId: `pred_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    agentId: w.agentId,
                    tenantId,
                    warningId: w.warningId,
                    warningType: w.warningType,
                    dataClassification: 'PREDICTION',
                    evidenceLevel: 'INSUFFICIENT_DATA',
                    status: 'INSUFFICIENT_DATA',
                    horizonWindow: w.horizonWindow || 'NEXT_24H',
                    predictedOutcome: 'Cannot forecast: fewer than 3 health probe records available.',
                    confidence: 0.5,
                    conditions: ['Collect additional monitoring history before forecasting.'],
                    validUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                    disclaimer: 'Prediction withheld to avoid unsupported claims. Observed data is shown instead.',
                    observedEvidence: w.observedEvidence || []
                });
                continue;
            }

            const horizonHours = w.horizonWindow === 'NEXT_1H_TO_24H' ? 24 : (w.horizonWindow === 'NEXT_24H_TO_7D' ? 168 : 24);
            predictions.push({
                predictionId: `pred_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                agentId: w.agentId,
                tenantId,
                warningId: w.warningId,
                warningType: w.warningType,
                dataClassification: 'PREDICTION',
                evidenceLevel: 'PREDICTION',
                status: 'FORECAST',
                horizonWindow: w.horizonWindow || 'NEXT_24H',
                predictedOutcome: this._outcomeText(w),
                confidence: w.confidence,
                conditions: [
                    `Forecast holds only if current signals persist over the ${w.horizonWindow || 'NEXT_24H'} window.`,
                    `Based on ${depth} recent probe records; confidence degrades if probe cadence changes.`,
                    'Recovery, remediation, or traffic change invalidates this forecast.'
                ],
                validUntil: new Date(Date.now() + horizonHours * 60 * 60 * 1000).toISOString(),
                disclaimer: 'Statistical forecast from observed trends — not a guarantee of failure. Treat as an early-warning watch condition.',
                observedEvidence: w.observedEvidence || [],
                inferredReasoning: w.inferredReasoning || ''
            });
        }

        return {
            predictions,
            coverage: {
                status: predictions.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
                forecastsIssued: predictions.filter(p => p.status === 'FORECAST').length,
                withheldForInsufficientData: predictions.filter(p => p.status === 'INSUFFICIENT_DATA').length
            }
        };
    }

    _outcomeText(w) {
        switch (w.warningType) {
            case 'IMPENDING_OFFLINE_RISK':
                return `${w.agentId} has an elevated likelihood of transitioning to OFFLINE within ${w.horizonWindow || 'NEXT_24H'} if consecutive failures continue.`;
            case 'DEGRADATION_ESCALATION_RISK':
                return `${w.agentId} degradation may persist or escalate within ${w.horizonWindow || 'NEXT_24H'} without operator review.`;
            case 'LATENCY_ESCALATION_RISK':
                return `${w.agentId} response latency is likely to remain elevated over ${w.horizonWindow || 'NEXT_24H_TO_7D'} unless load/downstream cause is addressed.`;
            case 'RECURRING_FAILURE_RESURGENCE':
                return `A previously seen failure pattern may recur on ${w.agentId} within ${w.horizonWindow || 'NEXT_24H'}.`;
            case 'DEPENDENCY_CASCADE_RISK':
                return `Dependents of ${w.agentId} face elevated disruption risk within ${w.horizonWindow || 'NEXT_24H'} while the source remains degraded.`;
            default:
                return `${w.agentId} remains on elevated watch over ${w.horizonWindow || 'NEXT_24H'}; no specific outage is forecast.`;
        }
    }
}

module.exports = { ForecastHorizonService };
