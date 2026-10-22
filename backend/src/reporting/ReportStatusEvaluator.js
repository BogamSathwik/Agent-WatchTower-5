/**
 * Universal Report Status Evaluator
 * Deterministically evaluates overall system operational status based on measurable metrics & threshold evidence.
 * Purely domain-agnostic.
 */

const SYSTEM_OPERATIONAL_STATUS = Object.freeze({
    HEALTHY: 'HEALTHY',
    ATTENTION_REQUIRED: 'ATTENTION_REQUIRED',
    DEGRADED: 'DEGRADED',
    CRITICAL: 'CRITICAL',
    UNKNOWN: 'UNKNOWN'
});

class ReportStatusEvaluator {
    
    /**
     * Evaluate overall system status from individual section data & metrics.
     * @param {Object} sections - { health, quality, usage, experience, intelligence, alerts }
     * @returns {Object} { status: string, reasons: Array<Object> }
     */
    static evaluateStatus(sections = {}) {
        const reasons = [];
        let isCritical = false;
        let isDegraded = false;
        let isAttention = false;

        const health = sections.health || {};
        const quality = sections.quality || {};
        const usage = sections.usage || {};
        const experience = sections.experience || {};
        const alerts = sections.alerts || {};

        // 1. Health Status Checks
        if (health.available) {
            const healthState = (health.healthStatus || health.status || '').toUpperCase();
            if (healthState === 'OFFLINE' || healthState === 'UNHEALTHY') {
                isCritical = true;
                reasons.push({
                    source: 'HEALTH',
                    metric: 'healthStatus',
                    value: healthState,
                    threshold: 'HEALTHY',
                    detail: `System health state is ${healthState}`
                });
            } else if (healthState === 'DEGRADED') {
                isDegraded = true;
                reasons.push({
                    source: 'HEALTH',
                    metric: 'healthStatus',
                    value: healthState,
                    threshold: 'HEALTHY',
                    detail: 'System health status is DEGRADED'
                });
            }

            const avail = Number(health.availability !== undefined ? health.availability : 100);
            if (avail < 90) {
                isCritical = true;
                reasons.push({
                    source: 'HEALTH',
                    metric: 'availability',
                    value: avail,
                    threshold: 90,
                    detail: `Availability (${avail}%) is below critical 90% threshold`
                });
            } else if (avail < 95) {
                isDegraded = true;
                reasons.push({
                    source: 'HEALTH',
                    metric: 'availability',
                    value: avail,
                    threshold: 95,
                    detail: `Availability (${avail}%) is below 95% threshold`
                });
            }
        }

        // 2. Quality Status Checks
        if (quality.available) {
            const passRate = Number(quality.passRate !== undefined ? quality.passRate : 100);
            if (passRate < 70) {
                isCritical = true;
                reasons.push({
                    source: 'QUALITY',
                    metric: 'passRate',
                    value: passRate,
                    threshold: 70,
                    detail: `Quality test pass rate (${passRate}%) is below 70% threshold`
                });
            } else if (passRate < 85) {
                isDegraded = true;
                reasons.push({
                    source: 'QUALITY',
                    metric: 'passRate',
                    value: passRate,
                    threshold: 85,
                    detail: `Quality test pass rate (${passRate}%) is below 85% threshold`
                });
            } else if (passRate < 95) {
                isAttention = true;
                reasons.push({
                    source: 'QUALITY',
                    metric: 'passRate',
                    value: passRate,
                    threshold: 95,
                    detail: `Quality test pass rate (${passRate}%) requires attention`
                });
            }
        }

        // 3. Alerts Status Checks
        if (alerts.available) {
            const activeCrit = Number(alerts.criticalAlertsCount || 0);
            const activeHigh = Number(alerts.highAlertsCount || 0);

            if (activeCrit > 0) {
                isCritical = true;
                reasons.push({
                    source: 'ALERTS',
                    metric: 'criticalAlertsCount',
                    value: activeCrit,
                    threshold: 0,
                    detail: `${activeCrit} active CRITICAL alert(s) detected`
                });
            }
            if (activeHigh > 0) {
                isDegraded = true;
                reasons.push({
                    source: 'ALERTS',
                    metric: 'highAlertsCount',
                    value: activeHigh,
                    threshold: 0,
                    detail: `${activeHigh} active HIGH alert(s) detected`
                });
            }
        }

        // 4. Experience Issues Checks
        if (experience.available) {
            const openCritIssues = Number(experience.criticalIssues || 0);
            if (openCritIssues > 0) {
                isAttention = true;
                reasons.push({
                    source: 'EXPERIENCE',
                    metric: 'criticalIssues',
                    value: openCritIssues,
                    threshold: 0,
                    detail: `${openCritIssues} open critical experience issue(s)`
                });
            }
        }

        // Determine Final Status
        let status = SYSTEM_OPERATIONAL_STATUS.HEALTHY;
        if (isCritical) {
            status = SYSTEM_OPERATIONAL_STATUS.CRITICAL;
        } else if (isDegraded) {
            status = SYSTEM_OPERATIONAL_STATUS.DEGRADED;
        } else if (isAttention) {
            status = SYSTEM_OPERATIONAL_STATUS.ATTENTION_REQUIRED;
        } else if (!health.available && !quality.available && !usage.available) {
            status = SYSTEM_OPERATIONAL_STATUS.UNKNOWN;
            reasons.push({
                source: 'SYSTEM',
                metric: 'dataAvailability',
                value: 'NO_DATA',
                detail: 'Insufficient telemetry signals available to determine status'
            });
        }

        return { status, reasons };
    }
}

module.exports = {
    ReportStatusEvaluator,
    SYSTEM_OPERATIONAL_STATUS
};
