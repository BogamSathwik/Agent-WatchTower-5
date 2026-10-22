/**
 * Phase 23 — Anomaly Detection Service
 * Deterministically identifies statistical anomalies and performance degradation.
 * Emits evidence-backed anomalies with clear severity levels (INFO, LOW, MEDIUM, HIGH, CRITICAL).
 */

const { PredictiveBaselineEngine } = require('./PredictiveBaselineEngine');

const ANOMALY_TYPES = Object.freeze({
    LATENCY_SPIKE: 'LATENCY_SPIKE',
    AVAILABILITY_DEGRADATION: 'AVAILABILITY_DEGRADATION',
    FAILURE_RATE_INCREASE: 'FAILURE_RATE_INCREASE',
    CONSECUTIVE_FAILURE_PATTERN: 'CONSECUTIVE_FAILURE_PATTERN',
    HEALTH_DEGRADATION: 'HEALTH_DEGRADATION',
    PERFORMANCE_TREND_DEGRADATION: 'PERFORMANCE_TREND_DEGRADATION'
});

const SEVERITY_LEVELS = Object.freeze({
    INFO: 'INFO',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
});

class AnomalyDetectionService {
    constructor(options = {}) {
        this.store = options.store || null;
        this.baselineEngine = options.baselineEngine || new PredictiveBaselineEngine({ store: this.store });
    }

    /**
     * Detect anomalies for an agent against its baseline.
     */
    detectAnomalies(agentId, options = {}) {
        const tenantId = options.tenantId || 'default-tenant';
        const range = options.range || '24h';
        const correlationId = options.correlationId || `corr_anom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        if (!this.store) {
            return [];
        }

        const baseline = this.baselineEngine.calculateBaseline(agentId, range, tenantId, this.store);
        if (!baseline || baseline.status === 'INSUFFICIENT_DATA') {
            return [];
        }

        const status = this.store.getStatus(agentId, tenantId);
        const history = this.store.getCheckHistory(agentId, tenantId, 20);
        const anomalies = [];

        const currentLatency = status.latency ? (status.latency.lastLatencyMs || 0) : 0;
        const avgLatency = baseline.averageResponseTimeMs || 0;
        const p95Latency = baseline.p95ResponseTimeMs || 0;

        // A. LATENCY_SPIKE
        if (currentLatency > 0 && avgLatency > 0) {
            const ratio = currentLatency / avgLatency;
            if (ratio >= 2.0 && currentLatency - avgLatency >= 100) {
                const devPct = Math.round((ratio - 1) * 100);
                const severity = ratio >= 4.0 || currentLatency > 5000 ? SEVERITY_LEVELS.HIGH : SEVERITY_LEVELS.MEDIUM;
                anomalies.push({
                    anomalyId: `anom_lat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    agentId,
                    tenantId,
                    type: ANOMALY_TYPES.LATENCY_SPIKE,
                    severity,
                    detectedAt: new Date().toISOString(),
                    confidence: Math.min(0.95, Math.round((ratio / 5) * 100) / 100 + 0.5),
                    baseline: { averageResponseTimeMs: avgLatency, p95ResponseTimeMs: p95Latency },
                    observedValue: `${currentLatency} ms`,
                    deviation: `+${devPct}% above baseline`,
                    evidence: [
                        `Current response latency (${currentLatency}ms) is ${devPct}% above historical average (${avgLatency}ms)`,
                        `p95 baseline latency: ${p95Latency}ms`
                    ],
                    humanReadableSummary: `Response latency spiked to ${currentLatency}ms (${devPct}% higher than historical average of ${avgLatency}ms).`,
                    correlationId
                });
            }
        }

        // B. AVAILABILITY_DEGRADATION
        const currentAvail = status.availabilityPercentage !== undefined ? status.availabilityPercentage : baseline.availability;
        if (baseline.availability > 0 && currentAvail < baseline.availability) {
            const drop = Math.round((baseline.availability - currentAvail) * 100) / 100;
            if (drop >= 2.0) {
                const severity = currentAvail < 90 ? SEVERITY_LEVELS.HIGH : SEVERITY_LEVELS.MEDIUM;
                anomalies.push({
                    anomalyId: `anom_avail_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    agentId,
                    tenantId,
                    type: ANOMALY_TYPES.AVAILABILITY_DEGRADATION,
                    severity,
                    detectedAt: new Date().toISOString(),
                    confidence: 0.90,
                    baseline: { availability: baseline.availability },
                    observedValue: `${currentAvail}%`,
                    deviation: `-${drop}% below baseline`,
                    evidence: [
                        `Recent availability (${currentAvail}%) dropped by ${drop}% below historical baseline (${baseline.availability}%)`,
                        `Total failed checks: ${status.totalFailuresCount || 0}`
                    ],
                    humanReadableSummary: `Availability dropped to ${currentAvail}% (a ${drop}% drop from baseline of ${baseline.availability}%).`,
                    correlationId
                });
            }
        }

        // C. FAILURE_RATE_INCREASE
        const recent10 = history.slice(0, 10);
        if (recent10.length >= 5) {
            const recentFails = recent10.filter(r => r.success === false || r.healthState === 'OFFLINE' || r.healthState === 'UNHEALTHY').length;
            const recentFailRate = Math.round((recentFails / recent10.length) * 100);
            if (recentFailRate > baseline.failureRate && recentFailRate >= 20) {
                const severity = recentFailRate >= 50 ? SEVERITY_LEVELS.CRITICAL : SEVERITY_LEVELS.HIGH;
                anomalies.push({
                    anomalyId: `anom_fail_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    agentId,
                    tenantId,
                    type: ANOMALY_TYPES.FAILURE_RATE_INCREASE,
                    severity,
                    detectedAt: new Date().toISOString(),
                    confidence: 0.88,
                    baseline: { failureRate: `${baseline.failureRate}%` },
                    observedValue: `${recentFailRate}%`,
                    deviation: `+${Math.round(recentFailRate - baseline.failureRate)}% increase`,
                    evidence: [
                        `Failure rate in last 10 checks is ${recentFailRate}% (historical baseline: ${baseline.failureRate}%)`,
                        `Failed probe count in sample: ${recentFails}/${recent10.length}`
                    ],
                    humanReadableSummary: `Failure rate increased to ${recentFailRate}% in recent probes compared to baseline failure rate of ${baseline.failureRate}%.`,
                    correlationId
                });
            }
        }

        // D. CONSECUTIVE_FAILURE_PATTERN
        const consecFails = status.consecutiveFailures || 0;
        if (consecFails >= 2) {
            const severity = consecFails >= 3 ? SEVERITY_LEVELS.CRITICAL : SEVERITY_LEVELS.HIGH;
            anomalies.push({
                anomalyId: `anom_consec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                agentId,
                tenantId,
                type: ANOMALY_TYPES.CONSECUTIVE_FAILURE_PATTERN,
                severity,
                detectedAt: new Date().toISOString(),
                confidence: 0.95,
                baseline: { maxConsecutiveFailuresPattern: baseline.maxConsecutiveFailuresPattern },
                observedValue: `${consecFails} consecutive failures`,
                deviation: `${consecFails} active failures`,
                evidence: [
                    `Agent experienced ${consecFails} consecutive failed health checks`,
                    `Last failure error: ${status.lastError || 'HTTP request failed or timed out'}`
                ],
                humanReadableSummary: `Consecutive health probe failures detected (${consecFails} in a row).`,
                correlationId
            });
        }

        // E. HEALTH_DEGRADATION
        if (status.currentState === 'DEGRADED' || (status.currentState === 'HEALTHY' && status.previousState === 'DEGRADED')) {
            const degradedProbes = history.slice(0, 10).filter(r => r.healthState === 'DEGRADED').length;
            if (degradedProbes >= 2) {
                anomalies.push({
                    anomalyId: `anom_hdeg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    agentId,
                    tenantId,
                    type: ANOMALY_TYPES.HEALTH_DEGRADATION,
                    severity: SEVERITY_LEVELS.MEDIUM,
                    detectedAt: new Date().toISOString(),
                    confidence: 0.85,
                    baseline: { degradedProbesBaseline: baseline.healthStateDistribution ? baseline.healthStateDistribution.DEGRADED || 0 : 0 },
                    observedValue: `${degradedProbes} degraded states in recent window`,
                    deviation: 'Repeated health state instability',
                    evidence: [
                        `Agent recorded ${degradedProbes} DEGRADED state observations in the last 10 health probes`,
                        `Current health state: ${status.currentState}`
                    ],
                    humanReadableSummary: `Repeated health state degradation observed (${degradedProbes} DEGRADED states in recent window).`,
                    correlationId
                });
            }
        }

        // F. PERFORMANCE_TREND_DEGRADATION
        if (baseline.responseTimeTrend === 'UPWARD_TREND' && baseline.trendChangePercent >= 25) {
            anomalies.push({
                anomalyId: `anom_trend_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                agentId,
                tenantId,
                type: ANOMALY_TYPES.PERFORMANCE_TREND_DEGRADATION,
                severity: SEVERITY_LEVELS.LOW,
                detectedAt: new Date().toISOString(),
                confidence: 0.80,
                baseline: { responseTimeTrend: 'STABLE', averageLatency: baseline.averageResponseTimeMs },
                observedValue: `+${baseline.trendChangePercent}% trend increase`,
                deviation: `Gradual response time increase over time`,
                evidence: [
                    `Response latency shows a sustained upward trend (+${baseline.trendChangePercent}% over historical average)`,
                    `Recent average latency: ${baseline.recentComparison ? baseline.recentComparison.recentAvgLatencyMs : 0}ms`
                ],
                humanReadableSummary: `Response latency is gradually increasing over time (+${baseline.trendChangePercent}% trend degradation).`,
                correlationId
            });
        }

        return anomalies;
    }
}

module.exports = {
    AnomalyDetectionService,
    ANOMALY_TYPES,
    SEVERITY_LEVELS
};
