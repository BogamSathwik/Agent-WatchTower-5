/**
 * Phase 24 — Capacity Intelligence Service
 * Analyzes observable operational load without fabricating CPU, memory, or token metrics.
 * Strictly checks for real reported metrics or reports NOT_AVAILABLE.
 */

class CapacityIntelligenceService {
    constructor(options = {}) {
        this.store = options.store || null;
        this.systemRegistry = options.systemRegistry || null;
        this.telemetryService = options.telemetryService || null;
    }

    /**
     * Get capacity intelligence for a specific agent or system-wide.
     * @param {string|null} agentId 
     * @param {string} tenantId 
     */
    getCapacityIntelligence(agentId = null, tenantId = 'default-tenant') {
        if (!agentId) {
            return this.getPlatformCapacityOverview(tenantId);
        }

        // Check if system exists in registry or store
        let agentStatus = null;
        if (this.store && typeof this.store.getStatus === 'function') {
            try {
                agentStatus = this.store.getStatus(agentId, tenantId);
            } catch (_) {}
        }

        let agentHistory = null;
        if (this.store && typeof this.store.getAgentHistoryByRange === 'function') {
            try {
                agentHistory = this.store.getAgentHistoryByRange(agentId, '24h', tenantId);
            } catch (_) {}
        }

        const observableMetrics = {
            checkFrequencySeconds: (agentStatus && agentStatus.config) ? (agentStatus.config.healthIntervalSeconds || 15) : 15,
            totalChecks24h: agentHistory ? agentHistory.checkCount : 0,
            successfulChecks24h: agentHistory ? agentHistory.successfulChecks : 0,
            failedChecks24h: agentHistory ? agentHistory.failedChecks : 0,
            lastSampleLatencyMs: agentStatus && agentStatus.latency ? (agentStatus.latency.lastLatencyMs || 0) : 0,
            averageLatencyMs: agentHistory ? (agentHistory.averageLatency || 0) : 0
        };

        // Check if agent explicitly exposes infrastructure metrics in metadata or health state
        const metadata = (agentStatus && agentStatus.metadata) || {};
        const hasHardwareMetrics = Boolean(metadata.cpuUsage !== undefined || metadata.memoryUsage !== undefined);

        return {
            agentId,
            tenantId,
            capacityAvailable: hasHardwareMetrics,
            message: hasHardwareMetrics 
                ? "Agent provides custom capacity telemetry." 
                : "Capacity metrics are not available from this agent.",
            infrastructureMetrics: {
                cpuUsage: metadata.cpuUsage !== undefined ? `${metadata.cpuUsage}%` : 'NOT_AVAILABLE',
                memoryUsage: metadata.memoryUsage !== undefined ? `${metadata.memoryUsage}%` : 'NOT_AVAILABLE',
                tokenConsumption: metadata.tokenConsumption !== undefined ? metadata.tokenConsumption : 'NOT_AVAILABLE',
                requestThroughput: metadata.requestThroughput !== undefined ? metadata.requestThroughput : 'NOT_AVAILABLE',
                queueDepth: metadata.queueDepth !== undefined ? metadata.queueDepth : 'NOT_AVAILABLE'
            },
            observableLoad: observableMetrics,
            limitationsNote: "Agent Watchtower only reports capacity metrics when explicitly provided by the target agent contract."
        };
    }

    /**
     * Get platform-wide capacity overview based on actual observable load.
     * @param {string} tenantId 
     */
    getPlatformCapacityOverview(tenantId = 'default-tenant') {
        let statuses = [];
        if (this.store && typeof this.store.listStatuses === 'function') {
            try {
                statuses = this.store.listStatuses(tenantId);
            } catch (_) {}
        }

        let totalChecksCount = 0;
        statuses.forEach(s => {
            totalChecksCount += (s.totalChecksCount || 0);
        });

        return {
            tenantId,
            monitoredAgentsCount: statuses.length,
            totalObservedChecks: totalChecksCount,
            capacityAvailable: false,
            message: "Platform capacity is measured via observable monitoring load. Hardware telemetry is NOT_AVAILABLE for generic agents.",
            hardwareMetrics: {
                cpuUsage: 'NOT_AVAILABLE',
                memoryUsage: 'NOT_AVAILABLE',
                tokenUsage: 'NOT_AVAILABLE',
                throughput: 'NOT_AVAILABLE'
            }
        };
    }
}

module.exports = { CapacityIntelligenceService };
