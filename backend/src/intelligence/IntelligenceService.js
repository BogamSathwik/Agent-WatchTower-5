/**
 * Universal Intelligence Service
 * High-level orchestrator for observation normalization, rule correlation, evidence generation, and system intelligence overviews.
 * Links Health, Quality, Usage, and Experience stores without violating domain independence.
 * Purely domain-agnostic.
 */

const { NormalizedObservation, OBSERVATION_SOURCES } = require('./NormalizedObservation');
const { TrendDetector, TREND_STATES } = require('./TrendDetector');
const { CorrelationEngine } = require('./CorrelationEngine');
const { InsightStore } = require('./InsightStore');
const { INSIGHT_STATUSES, INSIGHT_SEVERITY } = require('./Insight');

class IntelligenceService {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.healthStore = options.healthStore || null;
        this.qualityStore = options.qualityStore || null;
        this.usageStore = options.usageStore || null;
        this.experienceStore = options.experienceStore || null;

        this.insightStore = options.insightStore || new InsightStore({ systemRegistry: this.systemRegistry });
        this.correlationEngine = options.correlationEngine || new CorrelationEngine({ insightStore: this.insightStore });
    }

    /**
     * Normalize observations across all 4 monitoring dimensions for a system.
     */
    loadObservations(systemId, window = '24h') {
        const sid = String(systemId).trim();
        const observations = [];

        // 1. HEALTH OBSERVATIONS
        try {
            if (this.healthStore) {
                const history = this.healthStore.getHistory(sid, { limit: 50 });
                const latest = this.healthStore.getLatestMeasurement(sid);
                const state = this.healthStore.getSystemState(sid);

                if (history.length > 0 || state) {
                    const availabilities = history.filter(h => h.availabilityPercent !== undefined).map(h => h.availabilityPercent);
                    const trendInfo = TrendDetector.detectTrend(availabilities);

                    observations.push(new NormalizedObservation({
                        systemId: sid,
                        source: OBSERVATION_SOURCES.HEALTH,
                        metric: 'availability',
                        value: state && state.availabilityPercent !== undefined ? state.availabilityPercent : (availabilities.length > 0 ? availabilities[0] : 100),
                        unit: 'percent',
                        window,
                        available: true,
                        metadata: { trendState: trendInfo.state, changePercent: trendInfo.changePercent }
                    }));

                    observations.push(new NormalizedObservation({
                        systemId: sid,
                        source: OBSERVATION_SOURCES.HEALTH,
                        metric: 'status',
                        value: state ? state.status : 'HEALTHY',
                        unit: 'status',
                        window,
                        available: true
                    }));

                    if (latest && latest.latencyMs !== undefined) {
                        observations.push(new NormalizedObservation({
                            systemId: sid,
                            source: OBSERVATION_SOURCES.HEALTH,
                            metric: 'latency',
                            value: latest.latencyMs,
                            unit: 'ms',
                            window,
                            available: true
                        }));
                    }
                } else {
                    observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.HEALTH, 'availability', window));
                    observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.HEALTH, 'status', window));
                }
            } else {
                observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.HEALTH, 'availability', window));
            }
        } catch (error) {
            observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.HEALTH, 'availability', window, error.message));
        }

        // 2. QUALITY OBSERVATIONS
        try {
            if (this.qualityStore) {
                const results = this.qualityStore.getTestResults({ systemId: sid, limit: 50 });
                if (results.length > 0) {
                    const passed = results.filter(r => r.passed || r.status === 'PASSED').length;
                    const passRate = Number(((passed / results.length) * 100).toFixed(2));
                    const failRate = Number((100 - passRate).toFixed(2));

                    const passSeries = results.map(r => (r.passed || r.status === 'PASSED' ? 100 : 0));
                    const trendInfo = TrendDetector.detectTrend(passSeries);

                    observations.push(new NormalizedObservation({
                        systemId: sid,
                        source: OBSERVATION_SOURCES.QUALITY,
                        metric: 'passRate',
                        value: passRate,
                        unit: 'percent',
                        window,
                        available: true,
                        metadata: { trendState: trendInfo.state }
                    }));

                    observations.push(new NormalizedObservation({
                        systemId: sid,
                        source: OBSERVATION_SOURCES.QUALITY,
                        metric: 'failRate',
                        value: failRate,
                        unit: 'percent',
                        window,
                        available: true
                    }));
                } else {
                    observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.QUALITY, 'passRate', window));
                    observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.QUALITY, 'failRate', window));
                }
            } else {
                observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.QUALITY, 'passRate', window));
            }
        } catch (error) {
            observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.QUALITY, 'passRate', window, error.message));
        }

        // 3. USAGE OBSERVATIONS
        try {
            if (this.usageStore) {
                const events = this.usageStore.getEventsBySystem(sid, { limit: 200 });
                if (events.length > 0) {
                    const eventCount = events.length;

                    // Group by temporal buckets to calculate trend
                    const countsByHalf = [0, 0];
                    const midTime = events.length > 1 ? new Date(events[Math.floor(events.length / 2)].timestamp).getTime() : Date.now();
                    events.forEach(e => {
                        if (new Date(e.timestamp).getTime() <= midTime) {
                            countsByHalf[0]++;
                        } else {
                            countsByHalf[1]++;
                        }
                    });

                    const trendInfo = TrendDetector.detectTrend(countsByHalf);

                    observations.push(new NormalizedObservation({
                        systemId: sid,
                        source: OBSERVATION_SOURCES.USAGE,
                        metric: 'eventCount',
                        value: eventCount,
                        unit: 'count',
                        window,
                        available: true
                    }));

                    observations.push(new NormalizedObservation({
                        systemId: sid,
                        source: OBSERVATION_SOURCES.USAGE,
                        metric: 'activity',
                        value: trendInfo.state,
                        unit: 'trend',
                        window,
                        available: true,
                        metadata: {
                            trendState: trendInfo.state,
                            before: countsByHalf[0],
                            after: countsByHalf[1],
                            changePercent: trendInfo.changePercent
                        }
                    }));
                } else {
                    observations.push(new NormalizedObservation({
                        systemId: sid,
                        source: OBSERVATION_SOURCES.USAGE,
                        metric: 'eventCount',
                        value: 0,
                        unit: 'count',
                        window,
                        available: true
                    }));
                    observations.push(new NormalizedObservation({
                        systemId: sid,
                        source: OBSERVATION_SOURCES.USAGE,
                        metric: 'activity',
                        value: 'STABLE',
                        unit: 'trend',
                        window,
                        available: true,
                        metadata: { trendState: 'STABLE', changePercent: 0 }
                    }));
                }
            } else {
                observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.USAGE, 'eventCount', window));
            }
        } catch (error) {
            observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.USAGE, 'eventCount', window, error.message));
        }

        // 4. EXPERIENCE OBSERVATIONS
        try {
            if (this.experienceStore) {
                const feedbackList = this.experienceStore.getFeedbackBySystem(sid);
                const issues = this.experienceStore.getIssuesBySystem(sid);
                const openIssues = issues.filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS');

                const validRatings = feedbackList
                    .filter(f => f.rating && f.rating.valid)
                    .map(f => (f.rating.normalizedScore !== undefined ? f.rating.normalizedScore : f.rating.value));

                const avgRating = validRatings.length > 0
                    ? Number((validRatings.reduce((a, b) => a + b, 0) / validRatings.length).toFixed(2))
                    : null;

                observations.push(new NormalizedObservation({
                    systemId: sid,
                    source: OBSERVATION_SOURCES.EXPERIENCE,
                    metric: 'feedbackCount',
                    value: feedbackList.length,
                    unit: 'count',
                    window,
                    available: true
                }));

                observations.push(new NormalizedObservation({
                    systemId: sid,
                    source: OBSERVATION_SOURCES.EXPERIENCE,
                    metric: 'averageRating',
                    value: avgRating,
                    unit: 'score',
                    window,
                    available: avgRating !== null,
                    reason: avgRating === null ? 'NO_RATINGS' : null
                }));

                observations.push(new NormalizedObservation({
                    systemId: sid,
                    source: OBSERVATION_SOURCES.EXPERIENCE,
                    metric: 'openIssues',
                    value: openIssues.length,
                    unit: 'count',
                    window,
                    available: true
                }));
            } else {
                observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.EXPERIENCE, 'feedbackCount', window));
                observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.EXPERIENCE, 'openIssues', window));
            }
        } catch (error) {
            observations.push(NormalizedObservation.createMissing(sid, OBSERVATION_SOURCES.EXPERIENCE, 'feedbackCount', window, error.message));
        }

        return observations;
    }

    /**
     * Run correlation analysis for a system and return newly generated or updated insights.
     */
    analyzeSystem(systemId, window = '24h') {
        const sid = String(systemId).trim();
        const observations = this.loadObservations(sid, window);
        const rules = this.insightStore.listRules({ enabled: true });

        const insights = this.correlationEngine.evaluateRules(sid, observations, rules, { window });
        return {
            systemId: sid,
            window,
            analyzedAt: new Date().toISOString(),
            observationsCount: observations.length,
            insightsGenerated: insights.length,
            insights
        };
    }

    /**
     * Compute system intelligence overview.
     */
    getSystemOverview(systemId, window = '24h') {
        const sid = String(systemId).trim();
        const observations = this.loadObservations(sid, window);
        const insights = this.insightStore.listInsights({ systemId: sid, window });

        const dataAvailability = {
            health: observations.some(o => o.source === OBSERVATION_SOURCES.HEALTH && o.available),
            quality: observations.some(o => o.source === OBSERVATION_SOURCES.QUALITY && o.available),
            usage: observations.some(o => o.source === OBSERVATION_SOURCES.USAGE && o.available),
            experience: observations.some(o => o.source === OBSERVATION_SOURCES.EXPERIENCE && o.available)
        };

        const activeInsights = insights.filter(i => i.status === INSIGHT_STATUSES.NEW || i.status === INSIGHT_STATUSES.ACTIVE);

        const insightCounts = {
            info: activeInsights.filter(i => i.severity === INSIGHT_SEVERITY.INFO).length,
            low: activeInsights.filter(i => i.severity === INSIGHT_SEVERITY.LOW).length,
            medium: activeInsights.filter(i => i.severity === INSIGHT_SEVERITY.MEDIUM).length,
            high: activeInsights.filter(i => i.severity === INSIGHT_SEVERITY.HIGH).length,
            critical: activeInsights.filter(i => i.severity === INSIGHT_SEVERITY.CRITICAL).length
        };

        return {
            systemId: sid,
            window,
            dataAvailability,
            insightCounts,
            activeInsights: activeInsights.map(i => i.toJSON()),
            lastAnalyzedAt: new Date().toISOString()
        };
    }

    /**
     * Get mathematical trends for a system across dimensions.
     */
    getSystemTrends(systemId, window = '24h') {
        const sid = String(systemId).trim();
        const observations = this.loadObservations(sid, window);

        const trends = observations
            .filter(o => o.available && o.metadata && o.metadata.trendState)
            .map(o => ({
                source: o.source,
                metric: o.metric,
                trend: o.metadata.trendState,
                changePercent: o.metadata.changePercent !== undefined ? o.metadata.changePercent : 0,
                unit: o.unit
            }));

        return {
            systemId: sid,
            window,
            count: trends.length,
            trends
        };
    }
}

module.exports = {
    IntelligenceService
};
