/**
 * Quality Aggregator
 * Computes generic quality metrics, pass rates, durations, assertion failure counts, and trends across configurable time windows.
 * Purely generic - zero business domain logic.
 */

const TIME_WINDOWS = {
    '5m': 5 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
};

class QualityAggregator {
    constructor(qualityStore) {
        this.qualityStore = qualityStore;
    }

    /**
     * Compute quality metrics for a given system or globally across a time window.
     * @param {Object} options - { systemId, window: '24h' }
     * @returns {Object} Quality metrics summary
     */
    computeMetrics(options = {}) {
        const windowKey = options.window || '24h';
        const windowMs = TIME_WINDOWS[windowKey] || TIME_WINDOWS['24h'];
        const cutoffTime = new Date(Date.now() - windowMs);
        const systemId = options.systemId || null;

        // Fetch matching test results
        const rawResults = this.qualityStore.getTestResults({
            systemId,
            limit: 1000
        });

        // Filter by cutoff time
        const results = rawResults.filter(r => new Date(r.timestamp) >= cutoffTime);

        const totalTests = results.length;
        const passedTests = results.filter(r => r.status === 'PASS').length;
        const failedTests = results.filter(r => r.status === 'FAIL').length;
        const erroredTests = results.filter(r => r.status === 'ERROR').length;
        const skippedTests = results.filter(r => r.status === 'SKIPPED').length;

        const executed = totalTests - skippedTests;
        const passRate = executed > 0 ? Number(((passedTests / executed) * 100).toFixed(2)) : 0;
        const failureRate = executed > 0 ? Number(((failedTests / executed) * 100).toFixed(2)) : 0;
        const errorRate = totalTests > 0 ? Number(((erroredTests / totalTests) * 100).toFixed(2)) : 0;

        // Calculate average duration
        const totalDurationMs = results.reduce((acc, r) => acc + (Number(r.durationMs) || 0), 0);
        const averageDurationMs = totalTests > 0 ? Math.round(totalDurationMs / totalTests) : 0;

        // Slowest tests
        const slowestTests = [...results]
            .sort((a, b) => b.durationMs - a.durationMs)
            .slice(0, 5)
            .map(r => ({
                testId: r.testId,
                systemId: r.systemId,
                durationMs: r.durationMs,
                status: r.status,
                timestamp: r.timestamp
            }));

        // Assertion failure counts breakdown
        const assertionFailureCounts = {};
        results.forEach(r => {
            if (Array.isArray(r.assertions)) {
                r.assertions.forEach(a => {
                    if (a.status === 'FAIL') {
                        const key = `${a.type}:${a.path || 'unknown'}`;
                        assertionFailureCounts[key] = (assertionFailureCounts[key] || 0) + 1;
                    }
                });
            }
        });

        // Quality Trend (hourly or bucketed data points)
        const trend = this.generateTrend(results, windowMs);

        return {
            systemId,
            window: windowKey,
            totalTests,
            passedTests,
            failedTests,
            erroredTests,
            skippedTests,
            passRate,
            failureRate,
            errorRate,
            averageDurationMs,
            slowestTests,
            assertionFailureCounts,
            trend
        };
    }

    /**
     * Generate time-series trend data points.
     */
    generateTrend(results, windowMs) {
        const bucketCount = 10;
        const bucketSizeMs = windowMs / bucketCount;
        const now = Date.now();
        const buckets = [];

        for (let i = bucketCount - 1; i >= 0; i--) {
            const startTime = new Date(now - (i + 1) * bucketSizeMs);
            const endTime = new Date(now - i * bucketSizeMs);
            
            const bucketResults = results.filter(r => {
                const ts = new Date(r.timestamp).getTime();
                return ts >= startTime.getTime() && ts < endTime.getTime();
            });

            const total = bucketResults.length;
            const passed = bucketResults.filter(r => r.status === 'PASS').length;
            const executed = total - bucketResults.filter(r => r.status === 'SKIPPED').length;
            const passRate = executed > 0 ? Number(((passed / executed) * 100).toFixed(2)) : 100;

            buckets.push({
                timestamp: endTime.toISOString(),
                total,
                passed,
                failed: bucketResults.filter(r => r.status === 'FAIL').length,
                errors: bucketResults.filter(r => r.status === 'ERROR').length,
                passRate
            });
        }

        return buckets;
    }
}

module.exports = {
    QualityAggregator,
    TIME_WINDOWS
};
