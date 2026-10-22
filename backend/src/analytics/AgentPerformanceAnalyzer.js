/**
 * Phase 24 — Agent Performance Analyzer
 * Calculates performance scorecards, measurable indicators, and trend analysis for individual agents.
 * Strictly relies on real monitoring, incident, anomaly, and remediation data.
 */

class AgentPerformanceAnalyzer {
    constructor(options = {}) {
        this.store = options.store || null;
        this.anomalyService = options.anomalyService || null;
        this.riskEngine = options.riskEngine || null;
        this.remediationService = options.remediationService || null;
    }

    /**
     * Analyze performance for a specific agent over a time range.
     * @param {string} agentId 
     * @param {string} range ('1h', '24h', '7d', '30d')
     * @param {string} tenantId 
     */
    analyzeAgent(agentId, range = '24h', tenantId = 'default-tenant') {
        if (!this.store) {
            return {
                agentId,
                tenantId,
                timeRange: range,
                status: 'INSUFFICIENT_DATA',
                message: 'Monitoring store not available.'
            };
        }

        const msMap = {
            '1h': 3600000,
            '24h': 86400000,
            '7d': 604800000,
            '30d': 2592000000
        };

        const rangeMs = msMap[range] || msMap['24h'];
        const cutoff = Date.now() - rangeMs;

        // Fetch historical check records
        let historyResult;
        try {
            historyResult = this.store.getAgentHistoryByRange(agentId, range, tenantId);
        } catch (_) {
            historyResult = { checkCount: 0, records: [] };
        }

        const records = (historyResult && historyResult.records) ? historyResult.records : [];
        const checkCount = records.length;

        // Fetch incidents
        let incidents = [];
        try {
            incidents = this.store.listIncidents(tenantId, agentId)
                .filter(inc => new Date(inc.startedAt || inc.updatedAt).getTime() >= cutoff);
        } catch (_) {}

        // Fetch anomalies
        let anomalies = [];
        if (this.anomalyService && typeof this.anomalyService.getAnomaliesForAgent === 'function') {
            try {
                anomalies = this.anomalyService.getAnomaliesForAgent(agentId, tenantId)
                    .filter(a => new Date(a.timestamp || a.detectedAt || Date.now()).getTime() >= cutoff);
            } catch (_) {}
        }

        // Fetch remediations
        let remediations = [];
        if (this.remediationService && typeof this.remediationService.getExecutionHistory === 'function') {
            try {
                remediations = this.remediationService.getExecutionHistory({ systemId: agentId })
                    .filter(r => new Date(r.timestamp || r.startedAt || Date.now()).getTime() >= cutoff);
            } catch (_) {}
        } else if (this.remediationService && this.remediationService.store && typeof this.remediationService.store.listExecutions === 'function') {
            try {
                remediations = this.remediationService.store.listExecutions({ systemId: agentId })
                    .filter(r => new Date(r.startedAt || r.timestamp || Date.now()).getTime() >= cutoff);
            } catch (_) {}
        }

        // If no monitoring checks recorded in range
        if (checkCount === 0) {
            const resolvedIncidents = incidents.filter(i => (i.recoveredAt || i.resolvedAt) || i.status === 'RESOLVED' || i.state === 'RESOLVED');
            let avgRecTime = 'INSUFFICIENT_DATA';
            if (resolvedIncidents.length > 0) {
                const totalRec = resolvedIncidents.reduce((acc, i) => {
                    let dur = i.durationMs;
                    if ((!dur || isNaN(dur)) && (i.recoveredAt || i.resolvedAt) && i.startedAt) {
                        dur = new Date(i.recoveredAt || i.resolvedAt).getTime() - new Date(i.startedAt).getTime();
                    }
                    return acc + (dur > 0 ? dur : 0);
                }, 0);
                if (totalRec > 0) {
                    avgRecTime = `${Math.round(Math.round(totalRec / resolvedIncidents.length) / 1000)}s`;
                }
            }

            return {
                agentId,
                tenantId,
                timeRange: range,
                availability: 'INSUFFICIENT_DATA',
                averageLatency: 'INSUFFICIENT_DATA',
                p95Latency: 'INSUFFICIENT_DATA',
                failureRate: 'INSUFFICIENT_DATA',
                checkCount: 0,
                successfulChecks: 0,
                failedChecks: 0,
                incidentCount: incidents.length,
                incidentFrequency: incidents.length > 0 ? `${(incidents.length / (rangeMs / 3600000)).toFixed(2)}/hr` : 'INSUFFICIENT_DATA',
                averageRecoveryTime: avgRecTime,
                anomalyCount: anomalies.length,
                remediationCount: remediations.length,
                remediationSuccessRate: 'INSUFFICIENT_DATA',
                recentPerformanceTrend: 'INSUFFICIENT_DATA',
                trendExplanation: 'Historical data is insufficient for a reliable performance conclusion.',
                status: 'INSUFFICIENT_DATA'
            };
        }

        const successfulChecks = records.filter(r => r.success !== false && r.healthState === 'HEALTHY').length;
        const failedChecks = checkCount - successfulChecks;
        const availabilityPercent = Math.round((successfulChecks / checkCount) * 10000) / 100;
        const failureRatePercent = Math.round((failedChecks / checkCount) * 10000) / 100;

        const latencies = records.map(r => r.responseTimeMs || 0).sort((a, b) => a - b);
        const sumLatency = latencies.reduce((acc, v) => acc + v, 0);
        const averageLatency = Math.round(sumLatency / checkCount);
        const p95Index = Math.floor(latencies.length * 0.95);
        const p95Latency = latencies[p95Index] !== undefined ? latencies[p95Index] : latencies[latencies.length - 1] || 0;

        // Recovery duration calculation
        const resolvedIncidents = incidents.filter(i => (i.recoveredAt || i.resolvedAt) || i.status === 'RESOLVED' || i.state === 'RESOLVED');
        let averageRecoveryTimeMs = 'INSUFFICIENT_DATA';
        if (resolvedIncidents.length > 0) {
            const totalRec = resolvedIncidents.reduce((acc, i) => {
                let dur = i.durationMs;
                if ((!dur || isNaN(dur)) && (i.recoveredAt || i.resolvedAt) && i.startedAt) {
                    dur = new Date(i.recoveredAt || i.resolvedAt).getTime() - new Date(i.startedAt).getTime();
                }
                return acc + (dur > 0 ? dur : 0);
            }, 0);
            if (totalRec > 0) {
                averageRecoveryTimeMs = Math.round(totalRec / resolvedIncidents.length);
            }
        }

        // Remediation success rate
        let remediationSuccessRate = 'INSUFFICIENT_DATA';
        if (remediations.length > 0) {
            const successfulRems = remediations.filter(r => r.status === 'SUCCESS' || r.status === 'COMPLETED' || r.success === true).length;
            remediationSuccessRate = `${Math.round((successfulRems / remediations.length) * 100)}%`;
        }

        // Trend calculation
        const trendResult = this.calculateTrend(records);

        return {
            agentId,
            tenantId,
            timeRange: range,
            availability: `${availabilityPercent}%`,
            availabilityNumber: availabilityPercent,
            averageLatency,
            p95Latency,
            failureRate: `${failureRatePercent}%`,
            failureRateNumber: failureRatePercent,
            checkCount,
            successfulChecks,
            failedChecks,
            incidentCount: incidents.length,
            incidentFrequency: incidents.length > 0 ? `${(incidents.length / (rangeMs / 3600000)).toFixed(2)}/hr` : '0/hr',
            averageRecoveryTime: averageRecoveryTimeMs !== 'INSUFFICIENT_DATA' ? `${Math.round(averageRecoveryTimeMs / 1000)}s` : 'INSUFFICIENT_DATA',
            averageRecoveryTimeMs,
            anomalyCount: anomalies.length,
            remediationCount: remediations.length,
            remediationSuccessRate,
            recentPerformanceTrend: trendResult.trend,
            trendExplanation: trendResult.explanation,
            status: 'COMPLETE'
        };
    }

    /**
     * Calculate performance trend from historical check records.
     * @param {Array} records 
     */
    calculateTrend(records = []) {
        if (!records || records.length < 4) {
            return {
                trend: 'INSUFFICIENT_DATA',
                explanation: 'Historical data is insufficient for a reliable trend calculation.'
            };
        }

        // Divide into older half and newer half
        // Records are sorted newest-first in AgentMonitoringStore
        const sortedOldToNew = [...records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const mid = Math.floor(sortedOldToNew.length / 2);
        const olderHalf = sortedOldToNew.slice(0, mid);
        const newerHalf = sortedOldToNew.slice(mid);

        const olderAvgLatency = Math.round(olderHalf.reduce((a, r) => a + (r.responseTimeMs || 0), 0) / olderHalf.length);
        const newerAvgLatency = Math.round(newerHalf.reduce((a, r) => a + (r.responseTimeMs || 0), 0) / newerHalf.length);

        const olderFailures = olderHalf.filter(r => r.success === false || r.healthState !== 'HEALTHY').length;
        const newerFailures = newerHalf.filter(r => r.success === false || r.healthState !== 'HEALTHY').length;

        const olderFailRate = olderHalf.length > 0 ? olderFailures / olderHalf.length : 0;
        const newerFailRate = newerHalf.length > 0 ? newerFailures / newerHalf.length : 0;

        if (newerAvgLatency > olderAvgLatency * 1.25 || (newerFailRate - olderFailRate) > 0.15) {
            return {
                trend: 'DEGRADED',
                explanation: `Average response time increased from ${olderAvgLatency} ms to ${newerAvgLatency} ms over the selected period.`
            };
        }

        if (newerAvgLatency < olderAvgLatency * 0.85 && newerFailRate <= olderFailRate) {
            return {
                trend: 'IMPROVING',
                explanation: `Average response time improved from ${olderAvgLatency} ms to ${newerAvgLatency} ms.`
            };
        }

        return {
            trend: 'STABLE',
            explanation: `Performance remains stable with average response time around ${newerAvgLatency} ms.`
        };
    }
}

module.exports = { AgentPerformanceAnalyzer };
