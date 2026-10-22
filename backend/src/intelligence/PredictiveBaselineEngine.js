/**
 * Phase 23 — Predictive Baseline Engine
 * Calculates deterministic historical baselines from monitoring records.
 * Provides statistical latency, availability, failure rate, and trend comparisons.
 */

class PredictiveBaselineEngine {
    constructor(options = {}) {
        this.store = options.store || null;
    }

    /**
     * Compute baseline for a specific agent over a history range (1h, 24h, 7d, 30d).
     */
    calculateBaseline(agentId, range = '24h', tenantId = 'default-tenant', store = null) {
        const activeStore = store || this.store;
        if (!activeStore || typeof activeStore.getAgentHistoryByRange !== 'function') {
            return {
                agentId,
                tenantId,
                timeRange: range,
                status: 'INSUFFICIENT_DATA',
                message: 'No historical baseline available yet — monitoring store unavailable.',
                checkCount: 0
            };
        }

        const hist = activeStore.getAgentHistoryByRange(agentId, range, tenantId);

        if (!hist || hist.checkCount < 3 || !hist.records || hist.records.length < 3) {
            return {
                agentId,
                tenantId,
                timeRange: range,
                status: 'INSUFFICIENT_DATA',
                message: 'No historical baseline available yet — insufficient data.',
                checkCount: hist ? hist.checkCount : 0
            };
        }

        const records = hist.records;
        const total = hist.checkCount;
        const failed = hist.failedChecks || 0;
        const failureRate = Math.round((failed / total) * 10000) / 100;

        // Health state distribution
        const stateCounts = { HEALTHY: 0, DEGRADED: 0, OFFLINE: 0, UNHEALTHY: 0, UNKNOWN: 0 };
        records.forEach(r => {
            const st = r.healthState || 'UNKNOWN';
            stateCounts[st] = (stateCounts[st] || 0) + 1;
        });

        // Max consecutive failure pattern run
        let maxConsecutiveFailures = 0;
        let currentRun = 0;
        for (let i = records.length - 1; i >= 0; i--) {
            const r = records[i];
            if (r.success === false || r.healthState === 'OFFLINE' || r.healthState === 'UNHEALTHY') {
                currentRun++;
                if (currentRun > maxConsecutiveFailures) maxConsecutiveFailures = currentRun;
            } else {
                currentRun = 0;
            }
        }

        // Response time trend (comparing older half vs newer half)
        const sortedAsc = [...records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const midIndex = Math.floor(sortedAsc.length / 2);
        const olderHalf = sortedAsc.slice(0, midIndex);
        const newerHalf = sortedAsc.slice(midIndex);

        const olderAvg = olderHalf.length > 0 ? (olderHalf.reduce((acc, r) => acc + (r.responseTimeMs || 0), 0) / olderHalf.length) : hist.averageLatency;
        const newerAvg = newerHalf.length > 0 ? (newerHalf.reduce((acc, r) => acc + (r.responseTimeMs || 0), 0) / newerHalf.length) : hist.averageLatency;

        let responseTimeTrend = 'STABLE';
        let trendChangePercent = 0;
        if (olderAvg > 0) {
            trendChangePercent = Math.round(((newerAvg - olderAvg) / olderAvg) * 100);
            if (trendChangePercent >= 15) {
                responseTimeTrend = 'UPWARD_TREND'; // Latency degrading
            } else if (trendChangePercent <= -15) {
                responseTimeTrend = 'DOWNWARD_TREND'; // Latency improving
            }
        }

        // Recent (last 5 probes) vs Historical
        const recent5 = sortedAsc.slice(-5);
        const recentAvg = recent5.length > 0 ? Math.round(recent5.reduce((acc, r) => acc + (r.responseTimeMs || 0), 0) / recent5.length) : hist.averageLatency;
        const recentFailures = recent5.filter(r => r.success === false || r.healthState === 'OFFLINE' || r.healthState === 'UNHEALTHY').length;

        return {
            agentId,
            tenantId,
            timeRange: range,
            status: 'ESTABLISHED',
            establishedAt: new Date().toISOString(),
            checkCount: total,
            successfulChecks: hist.successfulChecks,
            failedChecks: failed,
            availability: hist.availability,
            failureRate,
            averageResponseTimeMs: hist.averageLatency,
            p95ResponseTimeMs: hist.p95Latency,
            minLatencyMs: hist.minLatency,
            maxLatencyMs: hist.maxLatency,
            maxConsecutiveFailuresPattern: maxConsecutiveFailures,
            responseTimeTrend,
            trendChangePercent,
            healthStateDistribution: stateCounts,
            recentComparison: {
                recentAvgLatencyMs: recentAvg,
                recentFailuresCount: recentFailures,
                latencyRatioVsBaseline: hist.averageLatency > 0 ? Math.round((recentAvg / hist.averageLatency) * 100) / 100 : 1.0
            }
        };
    }
}

module.exports = {
    PredictiveBaselineEngine
};
