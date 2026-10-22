/**
 * Phase 24 — Operational Analytics Service
 * Master operational analytics engine aggregating monitoring, performance, reliability, capacity,
 * recurring problem, operator attention, and snapshot historical intelligence.
 */

const { AgentPerformanceAnalyzer } = require('./AgentPerformanceAnalyzer');
const { CapacityIntelligenceService } = require('./CapacityIntelligenceService');
const { RecurringProblemAnalyzer } = require('./RecurringProblemAnalyzer');
const { OperatorAttentionService } = require('./OperatorAttentionService');

class OperationalAnalyticsService {
    constructor(options = {}) {
        this.store = options.store || null;
        this.systemRegistry = options.systemRegistry || null;
        this.anomalyService = options.anomalyService || null;
        this.riskEngine = options.riskEngine || null;
        this.remediationService = options.remediationService || null;
        this.telemetryService = options.telemetryService || null;
        this.persistenceManager = options.persistenceManager || null;

        this.performanceAnalyzer = new AgentPerformanceAnalyzer({
            store: this.store,
            anomalyService: this.anomalyService,
            riskEngine: this.riskEngine,
            remediationService: this.remediationService
        });

        this.capacityService = new CapacityIntelligenceService({
            store: this.store,
            systemRegistry: this.systemRegistry,
            telemetryService: this.telemetryService
        });

        this.recurringAnalyzer = new RecurringProblemAnalyzer({
            store: this.store,
            anomalyService: this.anomalyService,
            remediationService: this.remediationService
        });

        this.operatorAttentionService = new OperatorAttentionService({
            store: this.store,
            anomalyService: this.anomalyService,
            riskEngine: this.riskEngine,
            remediationService: this.remediationService,
            recurringProblemAnalyzer: this.recurringAnalyzer
        });

        this.snapshots = new Map();
    }

    /**
     * Platform-wide Operational Overview across range (1h, 24h, 7d, 30d).
     */
    getPlatformOverview(range = '24h', tenantId = 'default-tenant') {
        const allowedRanges = ['1h', '24h', '7d', '30d'];
        if (!allowedRanges.includes(range)) {
            const err = new Error(`Invalid time range '${range}'. Allowed values: 1h, 24h, 7d, 30d`);
            err.statusCode = 400;
            throw err;
        }

        const msMap = {
            '1h': 3600000,
            '24h': 86400000,
            '7d': 604800000,
            '30d': 2592000000
        };
        const rangeMs = msMap[range];
        const cutoff = Date.now() - rangeMs;

        let statuses = [];
        if (this.store && typeof this.store.listStatuses === 'function') {
            try {
                statuses = this.store.listStatuses(tenantId);
            } catch (_) {}
        }

        let allIncidents = [];
        if (this.store && typeof this.store.listIncidents === 'function') {
            try {
                allIncidents = this.store.listIncidents(tenantId);
            } catch (_) {}
        }

        const incidentsInRange = allIncidents.filter(i => new Date(i.startedAt || i.updatedAt).getTime() >= cutoff);
        const activeIncidents = allIncidents.filter(i => ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(i.status || i.state));
        const recoveredIncidents = incidentsInRange.filter(i => i.status === 'RESOLVED' || i.state === 'RESOLVED' || i.recoveredAt || i.resolvedAt);

        // Aggregate checks across all agents for range
        let totalChecks = 0;
        let successfulChecks = 0;
        let failedChecks = 0;
        const allLatencies = [];

        statuses.forEach(st => {
            let hist;
            try {
                hist = this.store.getAgentHistoryByRange(st.agentId, range, tenantId);
            } catch (_) {
                hist = { checkCount: 0, successfulChecks: 0, failedChecks: 0, records: [] };
            }
            if (hist && hist.checkCount > 0) {
                totalChecks += hist.checkCount;
                successfulChecks += hist.successfulChecks;
                failedChecks += hist.failedChecks;
                (hist.records || []).forEach(r => {
                    if (r.responseTimeMs !== undefined) allLatencies.push(r.responseTimeMs);
                });
            }
        });

        // Anomalies
        let totalAnomalies = 0;
        let activeAnomalies = 0;
        if (this.anomalyService && typeof this.anomalyService.getAnomaliesForTenant === 'function') {
            try {
                const anomalies = this.anomalyService.getAnomaliesForTenant(tenantId);
                totalAnomalies = anomalies.filter(a => new Date(a.timestamp || a.detectedAt || Date.now()).getTime() >= cutoff).length;
                activeAnomalies = anomalies.filter(a => a.status === 'ACTIVE' || !a.resolved).length;
            } catch (_) {}
        }

        // Remediations
        let totalRemediations = 0;
        let successfulRemediations = 0;
        let failedRemediations = 0;
        if (this.remediationService) {
            let rems = [];
            if (typeof this.remediationService.getExecutionHistory === 'function') {
                try { rems = this.remediationService.getExecutionHistory(); } catch (_) {}
            } else if (this.remediationService.store && typeof this.remediationService.store.listExecutions === 'function') {
                try { rems = this.remediationService.store.listExecutions(); } catch (_) {}
            }
            const remsInRange = rems.filter(r => new Date(r.timestamp || r.startedAt || Date.now()).getTime() >= cutoff);
            totalRemediations = remsInRange.length;
            successfulRemediations = remsInRange.filter(r => r.status === 'SUCCESS' || r.status === 'COMPLETED' || r.success === true).length;
            failedRemediations = totalRemediations - successfulRemediations;
        }

        // High Risk Agents
        let highRiskAgentsCount = 0;
        if (this.riskEngine && typeof this.riskEngine.evaluateRisk === 'function') {
            statuses.forEach(st => {
                try {
                    const r = this.riskEngine.evaluateRisk(st.agentId, tenantId);
                    if (r && (r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL')) highRiskAgentsCount++;
                } catch (_) {}
            });
        }

        // Latency math
        allLatencies.sort((a, b) => a - b);
        let averageResponseTime = 'INSUFFICIENT_DATA';
        let p95ResponseTime = 'INSUFFICIENT_DATA';
        if (allLatencies.length > 0) {
            const sum = allLatencies.reduce((a, b) => a + b, 0);
            averageResponseTime = Math.round(sum / allLatencies.length);
            const p95Idx = Math.floor(allLatencies.length * 0.95);
            p95ResponseTime = allLatencies[p95Idx] !== undefined ? allLatencies[p95Idx] : allLatencies[allLatencies.length - 1];
        }

        const availability = totalChecks > 0 ? `${(Math.round((successfulChecks / totalChecks) * 10000) / 100)}%` : 'INSUFFICIENT_DATA';
        const failureRate = totalChecks > 0 ? `${(Math.round((failedChecks / totalChecks) * 10000) / 100)}%` : 'INSUFFICIENT_DATA';

        // Recovery duration
        let recoveryDuration = 'INSUFFICIENT_DATA';
        const resolvedWithDuration = recoveredIncidents.filter(i => i.durationMs > 0);
        if (resolvedWithDuration.length > 0) {
            const avgMs = Math.round(resolvedWithDuration.reduce((a, i) => a + i.durationMs, 0) / resolvedWithDuration.length);
            recoveryDuration = `${Math.round(avgMs / 1000)}s`;
        }

        return {
            tenantId,
            timeRange: range,
            monitoredAgents: statuses.length,
            healthyAgents: statuses.filter(s => s.currentState === 'HEALTHY').length,
            degradedAgents: statuses.filter(s => s.currentState === 'DEGRADED' || s.currentState === 'RECOVERING').length,
            offlineAgents: statuses.filter(s => s.currentState === 'OFFLINE' || s.currentState === 'UNHEALTHY').length,
            totalMonitoringChecks: totalChecks,
            successfulChecks,
            failedChecks,
            totalIncidents: incidentsInRange.length,
            activeIncidents: activeIncidents.length,
            recoveredIncidents: recoveredIncidents.length,
            totalAnomalies,
            activeAnomalies,
            totalRemediationExecutions: totalRemediations,
            successfulRemediations,
            failedRemediations,
            averageResponseTime,
            p95ResponseTime,
            availability,
            failureRate,
            recoveryDuration,
            highRiskAgentsCount,
            status: totalChecks > 0 ? 'COMPLETE' : 'INSUFFICIENT_DATA'
        };
    }

    getAgentPerformance(agentId, range = '24h', tenantId = 'default-tenant') {
        return this.performanceAnalyzer.analyzeAgent(agentId, range, tenantId);
    }

    getAgentTrends(agentId, range = '7d', tenantId = 'default-tenant') {
        const perf = this.getAgentPerformance(agentId, range, tenantId);
        return {
            agentId,
            tenantId,
            timeRange: range,
            latencyTrend: perf.recentPerformanceTrend,
            availabilityTrend: perf.availability !== 'INSUFFICIENT_DATA' ? perf.recentPerformanceTrend : 'INSUFFICIENT_DATA',
            failureRateTrend: perf.failureRate !== 'INSUFFICIENT_DATA' ? perf.recentPerformanceTrend : 'INSUFFICIENT_DATA',
            recoveryTimeTrend: perf.averageRecoveryTime !== 'INSUFFICIENT_DATA' ? 'STABLE' : 'INSUFFICIENT_DATA',
            overallTrend: perf.recentPerformanceTrend,
            explanation: perf.trendExplanation
        };
    }

    getAgentReliability(agentId, range = '30d', tenantId = 'default-tenant') {
        const perf = this.getAgentPerformance(agentId, range, tenantId);
        const recurring = this.recurringAnalyzer.analyzeAgentProblems(agentId, tenantId);

        return {
            agentId,
            tenantId,
            timeRange: range,
            availability: perf.availability,
            incidentCount: perf.incidentCount,
            incidentFrequency: perf.incidentFrequency,
            meanTimeToRecovery: perf.averageRecoveryTime,
            averageRecoveryDuration: perf.averageRecoveryTime,
            failureFrequency: perf.failureRate,
            recoverySuccessRate: perf.remediationSuccessRate,
            recurringIncidentPatterns: recurring
        };
    }

    getCapacityIntelligence(agentId = null, tenantId = 'default-tenant') {
        return this.capacityService.getCapacityIntelligence(agentId, tenantId);
    }

    getActivityAnalysis(range = '24h', tenantId = 'default-tenant') {
        const msMap = { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
        const rangeMs = msMap[range] || msMap['24h'];
        const cutoff = Date.now() - rangeMs;

        let statuses = [];
        if (this.store && typeof this.store.listStatuses === 'function') {
            try { statuses = this.store.listStatuses(tenantId); } catch (_) {}
        }

        const hourlyMap = {};
        for (let i = 0; i < 24; i++) {
            const hStr = `${String(i).padStart(2, '0')}:00`;
            hourlyMap[hStr] = 0;
        }

        let totalRecords = 0;
        statuses.forEach(st => {
            let hist;
            try { hist = this.store.getAgentHistoryByRange(st.agentId, range, tenantId); } catch (_) {}
            const records = (hist && hist.records) ? hist.records : [];
            records.forEach(r => {
                if (new Date(r.timestamp).getTime() >= cutoff) {
                    totalRecords++;
                    const hour = new Date(r.timestamp).getHours();
                    const hStr = `${String(hour).padStart(2, '0')}:00`;
                    hourlyMap[hStr] = (hourlyMap[hStr] || 0) + 1;
                }
            });
        });

        if (totalRecords === 0) {
            return {
                tenantId,
                timeRange: range,
                totalActivitySamples: 0,
                hourlyDistribution: Object.keys(hourlyMap).map(h => ({ hour: h, count: 0 })),
                recentActivityTrend: "Insufficient activity data for period analysis.",
                status: 'INSUFFICIENT_DATA'
            };
        }

        // Find busiest peak hour
        let peakHour = '00:00';
        let maxCount = -1;
        Object.entries(hourlyMap).forEach(([h, count]) => {
            if (count > maxCount) {
                maxCount = count;
                peakHour = h;
            }
        });

        const nextHour = `${String((parseInt(peakHour.split(':')[0], 10) + 2) % 24).padStart(2, '0')}:00`;
        const trendSummary = maxCount > 0
            ? `Most recorded activity occurred between ${peakHour} and ${nextHour}.`
            : "Activity is distributed evenly across monitoring intervals.";

        return {
            tenantId,
            timeRange: range,
            totalActivitySamples: totalRecords,
            hourlyDistribution: Object.entries(hourlyMap).map(([hour, count]) => ({ hour, count })),
            recentActivityTrend: trendSummary,
            status: 'COMPLETE'
        };
    }

    getRecurringProblems(tenantId = 'default-tenant', agentId = null) {
        return this.recurringAnalyzer.analyzeRecurringProblems(tenantId, agentId);
    }

    getOperatorAttention(tenantId = 'default-tenant') {
        return this.operatorAttentionService.getOperatorAttention(tenantId);
    }

    generateRecommendations(agentId = null, range = '24h', tenantId = 'default-tenant') {
        const recommendations = [];

        if (agentId) {
            const perf = this.getAgentPerformance(agentId, range, tenantId);
            const attention = this.operatorAttentionService.evaluateAgentAttention(agentId, tenantId);

            if (perf.status === 'INSUFFICIENT_DATA') {
                recommendations.push("Historical data is insufficient for a reliable performance conclusion.");
            } else {
                if (perf.recentPerformanceTrend === 'STABLE') {
                    recommendations.push(`Continue monitoring — latency is stable around ${perf.averageLatency} ms.`);
                } else if (perf.recentPerformanceTrend === 'DEGRADED') {
                    recommendations.push(`Investigate recurring latency degradation. Average latency is ${perf.averageLatency} ms (P95: ${perf.p95Latency} ms).`);
                }

                if (perf.remediationSuccessRate !== 'INSUFFICIENT_DATA' && parseInt(perf.remediationSuccessRate, 10) < 50) {
                    recommendations.push("Review the agent's control interface because remediation is repeatedly failing.");
                }
            }

            if (attention.attentionRequired) {
                attention.recommendedActions.forEach(act => recommendations.push(act));
            }
        } else {
            const overview = this.getPlatformOverview(range, tenantId);
            if (overview.status === 'INSUFFICIENT_DATA') {
                recommendations.push("Historical data is insufficient for a reliable platform performance conclusion.");
            } else {
                if (overview.degradedAgents > 0 || overview.offlineAgents > 0) {
                    recommendations.push(`Address ${overview.degradedAgents + overview.offlineAgents} agent(s) experiencing health issues.`);
                }
                if (overview.highRiskAgentsCount > 0) {
                    recommendations.push(`Perform proactive maintenance on ${overview.highRiskAgentsCount} high-risk agent(s).`);
                }
                if (overview.failedRemediations > 0) {
                    recommendations.push(`Audit ${overview.failedRemediations} failed self-healing executions.`);
                }
                if (recommendations.length === 0) {
                    recommendations.push("Platform operating smoothly — all monitored agents meet baseline health targets.");
                }
            }
        }

        return Array.from(new Set(recommendations));
    }

    compareAgents(agentIds = [], range = '24h', tenantId = 'default-tenant') {
        if (!Array.isArray(agentIds) || agentIds.length === 0) {
            const err = new Error("Parameter 'agents' (comma-separated list of agent IDs) is required for comparison.");
            err.statusCode = 400;
            throw err;
        }

        const comparison = agentIds.map(id => {
            const perf = this.getAgentPerformance(id, range, tenantId);
            return {
                agentId: id,
                availability: perf.availability,
                latency: perf.averageLatency,
                p95: perf.p95Latency,
                failureRate: perf.failureRate,
                incidentCount: perf.incidentCount,
                recoveryDuration: perf.averageRecoveryTime,
                anomalyCount: perf.anomalyCount,
                remediationCount: perf.remediationCount,
                trend: perf.recentPerformanceTrend,
                status: perf.status
            };
        });

        return {
            tenantId,
            timeRange: range,
            agentCount: comparison.length,
            agents: comparison,
            disclaimer: "Operational comparison tool — metrics are presented objectively without ranking or declaring winners."
        };
    }

    createHistoricalSnapshot(tenantId = 'default-tenant') {
        const overview = this.getPlatformOverview('24h', tenantId);
        const snapshot = {
            snapshotId: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            timestamp: new Date().toISOString(),
            tenantId,
            monitoredAgents: overview.monitoredAgents,
            availability: overview.availability,
            averageResponseTime: overview.averageResponseTime,
            p95ResponseTime: overview.p95ResponseTime,
            totalIncidents: overview.totalIncidents,
            activeIncidents: overview.activeIncidents,
            totalAnomalies: overview.totalAnomalies,
            totalRemediations: overview.totalRemediationExecutions,
            highRiskAgentsCount: overview.highRiskAgentsCount
        };

        const key = `${tenantId}:${snapshot.snapshotId}`;
        this.snapshots.set(key, snapshot);

        if (this.persistenceManager) {
            try {
                if (typeof this.persistenceManager.setSafe === 'function') {
                    this.persistenceManager.setSafe('analytics_snapshots', key, snapshot);
                } else if (typeof this.persistenceManager.set === 'function') {
                    const r = this.persistenceManager.set('analytics_snapshots', key, snapshot);
                    if (r && typeof r.catch === 'function') r.catch(() => {});
                } else if (typeof this.persistenceManager.setItem === 'function') {
                    this.persistenceManager.setItem(`analytics_snapshots_${key}`, snapshot);
                }
            } catch (_) {}
        }

        return snapshot;
    }

    listHistoricalSnapshots(tenantId = 'default-tenant') {
        const results = [];
        for (const [key, snap] of this.snapshots.entries()) {
            if (key.startsWith(`${tenantId}:`)) {
                results.push({ ...snap });
            }
        }
        return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
}

module.exports = OperationalAnalyticsService;
