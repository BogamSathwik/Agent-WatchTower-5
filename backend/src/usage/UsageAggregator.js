/**
 * Usage Aggregator
 * Computes generic usage analytics, recency, frequency, capability/operation usage breakdowns, and trend series.
 * Purely generic - zero business-domain logic.
 */

const TIME_WINDOWS = {
    '5m': 5 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
};

class UsageAggregator {
    constructor(usageStore) {
        this.usageStore = usageStore;
    }

    /**
     * Compute usage metrics for a system or globally.
     * @param {Object} options - { systemId, window: '24h', includeInternal: false }
     * @returns {Object} Standardized usage analytics overview
     */
    computeMetrics(options = {}) {
        const windowKey = options.window || '24h';
        const windowMs = TIME_WINDOWS[windowKey] || TIME_WINDOWS['24h'];
        const cutoffTime = new Date(Date.now() - windowMs);
        const systemId = options.systemId || null;

        // Fetch matching events
        const rawEvents = this.usageStore.listEvents({
            systemId,
            limit: 10000
        });

        // Window-filtered events
        const events = rawEvents.filter(e => new Date(e.timestamp) >= cutoffTime);

        const totalEvents = events.length;

        // Distinguish User/API Executions from Internal Monitoring
        const executionEvents = events.filter(e => e.category === 'EXECUTION' || e.source === 'api' || e.source === 'user');
        const internalCheckEvents = events.filter(e => e.category === 'HEALTH_CHECK' || e.category === 'QUALITY_TEST');

        const totalExecutions = executionEvents.length;
        const successfulExecutions = executionEvents.filter(e => e.status === 'SUCCESS').length;
        const failedExecutions = executionEvents.filter(e => e.status === 'FAILED').length;
        const errorExecutions = executionEvents.filter(e => e.status === 'ERROR').length;

        const successRate = totalExecutions > 0 ? Number(((successfulExecutions / totalExecutions) * 100).toFixed(2)) : 0;

        // Unique Capabilities & Operations (from execution events or all events if no executions)
        const targetEvents = executionEvents.length > 0 ? executionEvents : events;
        
        const capabilityCounts = {};
        const operationCounts = {};
        const categoryCounts = {};
        const sourceCounts = {};

        events.forEach(e => {
            if (e.capability) capabilityCounts[e.capability] = (capabilityCounts[e.capability] || 0) + 1;
            if (e.operation) operationCounts[e.operation] = (operationCounts[e.operation] || 0) + 1;
            if (e.category) categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
            if (e.source) sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1;
        });

        const uniqueCapabilities = Object.keys(capabilityCounts);
        const uniqueOperations = Object.keys(operationCounts);

        // Recency analytics across all historical events for the system
        const systemAllEvents = systemId
            ? rawEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            : this.usageStore.listEvents({ limit: 10000 }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const firstUsedAt = systemAllEvents.length > 0 ? systemAllEvents[0].timestamp : null;
        const lastUsedAt = systemAllEvents.length > 0 ? systemAllEvents[systemAllEvents.length - 1].timestamp : null;

        const nowMs = Date.now();
        const timeSinceLastUseMs = lastUsedAt ? Math.max(0, nowMs - new Date(lastUsedAt).getTime()) : null;
        const inactiveForDays = timeSinceLastUseMs !== null ? Number((timeSinceLastUseMs / (1000 * 60 * 60 * 24)).toFixed(2)) : null;

        // Active vs Inactive Days calculation
        const activeDatesSet = new Set(systemAllEvents.map(e => e.timestamp.substring(0, 10)));
        const activeDays = activeDatesSet.size;

        let totalDaysSpan = 0;
        if (firstUsedAt && lastUsedAt) {
            const spanMs = new Date(lastUsedAt).getTime() - new Date(firstUsedAt).getTime();
            totalDaysSpan = Math.max(1, Math.ceil(spanMs / (1000 * 60 * 60 * 24)));
        }
        const inactiveDays = Math.max(0, totalDaysSpan - activeDays);

        // Frequency calculations over the requested window
        const windowHours = windowMs / (1000 * 60 * 60);
        const windowDays = windowHours / 24;

        const executionsPerHour = Number((totalExecutions / windowHours).toFixed(2));
        const executionsPerDay = Number((totalExecutions / Math.max(1, windowDays)).toFixed(2));
        const executionsPerWeek = Number((executionsPerDay * 7).toFixed(2));

        // Trend aggregation
        const trend = this.generateTrend(events, windowMs);

        return {
            systemId,
            window: windowKey,
            totalEvents,
            totalExecutions,
            internalChecks: internalCheckEvents.length,
            successfulExecutions,
            failedExecutions,
            errorExecutions,
            successRate,
            firstUsedAt,
            lastUsedAt,
            timeSinceLastUseMs,
            inactiveForDays,
            activeDays,
            inactiveDays,
            frequency: {
                executionsPerHour,
                executionsPerDay,
                executionsPerWeek
            },
            uniqueCapabilitiesCount: uniqueCapabilities.length,
            capabilities: capabilityCounts,
            uniqueOperationsCount: uniqueOperations.length,
            operations: operationCounts,
            categories: categoryCounts,
            sources: sourceCounts,
            trend
        };
    }

    /**
     * Generate time-series trend buckets.
     */
    generateTrend(events, windowMs) {
        const bucketCount = 10;
        const bucketSizeMs = windowMs / bucketCount;
        const now = Date.now();
        const buckets = [];

        for (let i = bucketCount - 1; i >= 0; i--) {
            const startTime = new Date(now - (i + 1) * bucketSizeMs);
            const endTime = new Date(now - i * bucketSizeMs);

            const bucketEvents = events.filter(e => {
                const ts = new Date(e.timestamp).getTime();
                return ts >= startTime.getTime() && ts < endTime.getTime();
            });

            const total = bucketEvents.length;
            const executions = bucketEvents.filter(e => e.category === 'EXECUTION' || e.source === 'api').length;
            const successful = bucketEvents.filter(e => e.status === 'SUCCESS').length;

            buckets.push({
                timestamp: endTime.toISOString(),
                totalEvents: total,
                executions,
                successful
            });
        }

        return buckets;
    }
}

module.exports = {
    UsageAggregator,
    TIME_WINDOWS
};
