/**
 * Experience Aggregator
 * Computes factual metrics for explicit feedback, ratings, operational issues, resolution times, trends, and timelines.
 * Purely domain-agnostic - ZERO subjective inferences or AI sentiment guessing.
 */

const { RepeatedIssueDetector } = require('./RepeatedIssueDetector');

const TIME_WINDOWS = {
    '5m': 5 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
};

class ExperienceAggregator {
    constructor(experienceStore) {
        this.experienceStore = experienceStore;
    }

    /**
     * Compute factual client experience metrics for a system or globally.
     * @param {Object} options - { systemId, clientId, window: '24h' }
     * @returns {Object} Standardized factual experience metrics
     */
    computeMetrics(options = {}) {
        const windowKey = options.window || '24h';
        const windowMs = TIME_WINDOWS[windowKey] || TIME_WINDOWS['24h'];
        const cutoffTime = new Date(Date.now() - windowMs);
        const systemId = options.systemId || null;
        const clientId = options.clientId || null;

        // Fetch matching feedback
        const allFeedback = this.experienceStore.listFeedback({ systemId, clientId, limit: 10000 });
        const feedbackList = allFeedback.filter(f => new Date(f.timestamp) >= cutoffTime);

        // Fetch matching issues
        const allIssues = this.experienceStore.listIssues({ systemId, clientId, limit: 10000 });
        const issueList = allIssues.filter(i => new Date(i.reportedAt) >= cutoffTime || (i.resolvedAt && new Date(i.resolvedAt) >= cutoffTime));

        // 1. Ratings & Feedback Metrics
        const ratingEvents = feedbackList.filter(f => f.rating && f.rating.valid);
        const totalFeedback = feedbackList.length;
        const totalRatings = ratingEvents.length;

        let averageRating = null;
        let averageNormalizedScore = null;
        let minimumRating = null;
        let maximumRating = null;
        const ratingDistribution = {};

        if (totalRatings > 0) {
            const rawSum = ratingEvents.reduce((acc, f) => acc + f.rating.value, 0);
            const normSum = ratingEvents.reduce((acc, f) => acc + (f.rating.normalizedScore || 0), 0);
            
            averageRating = Number((rawSum / totalRatings).toFixed(2));
            averageNormalizedScore = Number((normSum / totalRatings).toFixed(2));

            const rawValues = ratingEvents.map(f => f.rating.value);
            minimumRating = Math.min(...rawValues);
            maximumRating = Math.max(...rawValues);

            ratingEvents.forEach(f => {
                const key = `${f.rating.value}/${f.rating.scaleMax}`;
                ratingDistribution[key] = (ratingDistribution[key] || 0) + 1;
            });
        }

        // 2. Issue Counts & Status Breakdown
        const totalIssues = issueList.length;
        const openIssues = issueList.filter(i => i.status === 'OPEN').length;
        const inProgressIssues = issueList.filter(i => i.status === 'IN_PROGRESS').length;
        const resolvedIssues = issueList.filter(i => i.status === 'RESOLVED').length;
        const closedIssues = issueList.filter(i => i.status === 'CLOSED').length;
        const reopenedIssues = issueList.filter(i => i.status === 'REOPENED').length;

        const criticalIssues = issueList.filter(i => i.severity === 'CRITICAL').length;
        const highIssues = issueList.filter(i => i.severity === 'HIGH').length;
        const mediumIssues = issueList.filter(i => i.severity === 'MEDIUM').length;
        const lowIssues = issueList.filter(i => i.severity === 'LOW').length;

        // 3. Resolution Time Metrics (strictly from resolved/closed issues with valid timeToResolutionMs)
        const resolvedWithTimes = allIssues.filter(i => (i.status === 'RESOLVED' || i.status === 'CLOSED') && typeof i.timeToResolutionMs === 'number');
        
        let averageTimeToResolutionMs = null;
        let medianTimeToResolutionMs = null;
        let minimumTimeToResolutionMs = null;
        let maximumTimeToResolutionMs = null;

        if (resolvedWithTimes.length > 0) {
            const times = resolvedWithTimes.map(i => i.timeToResolutionMs).sort((a, b) => a - b);
            const totalMs = times.reduce((acc, t) => acc + t, 0);
            
            averageTimeToResolutionMs = Math.round(totalMs / times.length);
            minimumTimeToResolutionMs = times[0];
            maximumTimeToResolutionMs = times[times.length - 1];

            const mid = Math.floor(times.length / 2);
            medianTimeToResolutionMs = times.length % 2 !== 0
                ? times[mid]
                : Math.round((times[mid - 1] + times[mid]) / 2);
        }

        // 4. Repeated Issue Groups
        const repeatedIssueGroups = RepeatedIssueDetector.detectRepeatedIssues(issueList);

        // 5. Trend Aggregation
        const trend = this.generateTrend(feedbackList, issueList, windowMs);

        return {
            systemId,
            clientId,
            window: windowKey,
            totalFeedback,
            totalRatings,
            averageRating,
            averageNormalizedScore,
            minimumRating,
            maximumRating,
            ratingDistribution,
            totalIssues,
            openIssues,
            inProgressIssues,
            resolvedIssues,
            closedIssues,
            reopenedIssues,
            criticalIssues,
            highIssues,
            mediumIssues,
            lowIssues,
            resolutionMetrics: {
                averageTimeToResolutionMs,
                medianTimeToResolutionMs,
                minimumTimeToResolutionMs,
                maximumTimeToResolutionMs,
                resolvedIssueCount: resolvedWithTimes.length
            },
            repeatedIssueGroups,
            trend
        };
    }

    /**
     * Generate chronological experience timeline events.
     */
    generateTimeline(options = {}) {
        const { systemId, clientId, limit = 50 } = options;
        const rawEvents = this.experienceStore.listEvents({ systemId, clientId, limit: Number(limit) || 50 });

        return rawEvents
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .map(e => typeof e.toJSON === 'function' ? e.toJSON() : e);
    }

    /**
     * Time-series trend buckets for feedback and issue volume.
     */
    generateTrend(feedbackList, issueList, windowMs) {
        const bucketCount = 10;
        const bucketSizeMs = windowMs / bucketCount;
        const now = Date.now() + 1000; // 1s buffer for current execution window
        const buckets = [];

        for (let i = bucketCount - 1; i >= 0; i--) {
            const startTime = new Date(now - (i + 1) * bucketSizeMs);
            const endTime = new Date(now - i * bucketSizeMs);

            const bucketFeedback = feedbackList.filter(f => {
                const ts = new Date(f.timestamp).getTime();
                return ts >= startTime.getTime() && ts <= endTime.getTime();
            });

            const bucketIssuesOpened = issueList.filter(i => {
                const ts = new Date(i.reportedAt).getTime();
                return ts >= startTime.getTime() && ts <= endTime.getTime();
            });

            const bucketIssuesResolved = issueList.filter(i => {
                if (!i.resolvedAt) return false;
                const ts = new Date(i.resolvedAt).getTime();
                return ts >= startTime.getTime() && ts <= endTime.getTime();
            });

            buckets.push({
                timestamp: endTime.toISOString(),
                feedbackCount: bucketFeedback.length,
                issuesOpened: bucketIssuesOpened.length,
                issuesResolved: bucketIssuesResolved.length
            });
        }

        return buckets;
    }
}

module.exports = {
    ExperienceAggregator,
    TIME_WINDOWS
};
