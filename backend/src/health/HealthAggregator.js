/**
 * Health Aggregator
 * Computes aggregated health metrics, availability percentages, latency percentiles,
 * and failure/recovery counts over configurable time windows.
 */

class HealthAggregator {
    /**
     * Convert time window string (e.g. '5m', '1h', '24h', '7d') to milliseconds.
     */
    static windowToMs(windowStr = '1h') {
        if (typeof windowStr === 'number') return windowStr;
        const str = String(windowStr).trim().toLowerCase();
        
        if (str.endsWith('m')) return (parseInt(str, 10) || 5) * 60 * 1000;
        if (str.endsWith('h')) return (parseInt(str, 10) || 1) * 3600 * 1000;
        if (str.endsWith('d')) return (parseInt(str, 10) || 1) * 86400 * 1000;

        return 3600 * 1000; // default 1 hour
    }

    /**
     * Compute percentile value from sorted numeric array.
     */
    static calculatePercentile(sortedArr, percentile) {
        if (!sortedArr || sortedArr.length === 0) return 0;
        const index = (percentile / 100) * (sortedArr.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        return Number((sortedArr[lower] + weight * (sortedArr[upper] - sortedArr[lower])).toFixed(2));
    }

    /**
     * Calculate health metrics for a system over a time window.
     * @param {Array<Object>} history - Array of HealthMeasurement JSON objects
     * @param {Object} options - { window: '1h'|'5m'|'24h'|'7d' }
     */
    static computeMetrics(history = [], options = {}) {
        const windowStr = options.window || '1h';
        const windowMs = this.windowToMs(windowStr);
        const cutoffMs = Date.now() - windowMs;

        const filtered = history.filter(m => new Date(m.timestamp).getTime() >= cutoffMs);
        const totalChecks = filtered.length;

        if (totalChecks === 0) {
            return {
                window: windowStr,
                totalChecks: 0,
                successfulChecks: 0,
                failedChecks: 0,
                availability: 100,
                successRate: 100,
                failureRate: 0,
                avgResponseTimeMs: 0,
                minResponseTimeMs: 0,
                maxResponseTimeMs: 0,
                p50ResponseTimeMs: 0,
                p90ResponseTimeMs: 0,
                p99ResponseTimeMs: 0,
                timeoutCount: 0,
                failureCount: 0,
                recoveryCount: 0
            };
        }

        let successfulChecks = 0;
        let failedChecks = 0;
        let timeoutCount = 0;
        let failureCount = 0;
        let recoveryCount = 0;

        const latencies = [];

        filtered.forEach((m, idx) => {
            if (m.success) {
                successfulChecks++;
            } else {
                failedChecks++;
                failureCount++;
            }

            if (m.errorCode === 'TIMEOUT' || m.reason === 'TIMEOUT') {
                timeoutCount++;
            }

            if (idx > 0 && !filtered[idx - 1].success && m.success) {
                recoveryCount++;
            }

            if (m.responseTimeMs !== undefined && m.responseTimeMs !== null) {
                latencies.push(Number(m.responseTimeMs));
            }
        });

        latencies.sort((a, b) => a - b);
        const latSum = latencies.reduce((acc, val) => acc + val, 0);

        const availability = Number(((successfulChecks / totalChecks) * 100).toFixed(2));
        const successRate = availability;
        const failureRate = Number((100 - availability).toFixed(2));

        const avgResponseTimeMs = latencies.length > 0 ? Number((latSum / latencies.length).toFixed(2)) : 0;
        const minResponseTimeMs = latencies.length > 0 ? latencies[0] : 0;
        const maxResponseTimeMs = latencies.length > 0 ? latencies[latencies.length - 1] : 0;

        return {
            window: windowStr,
            totalChecks,
            successfulChecks,
            failedChecks,
            availability,
            successRate,
            failureRate,
            avgResponseTimeMs,
            minResponseTimeMs,
            maxResponseTimeMs,
            p50ResponseTimeMs: this.calculatePercentile(latencies, 50),
            p90ResponseTimeMs: this.calculatePercentile(latencies, 90),
            p99ResponseTimeMs: this.calculatePercentile(latencies, 99),
            timeoutCount,
            failureCount,
            recoveryCount
        };
    }
}

module.exports = {
    HealthAggregator
};
