/**
 * Universal Report Aggregator
 * Computes side-by-side multi-system comparisons and period-over-period delta change calculations.
 * Purely domain-agnostic.
 */

class ReportAggregator {

    /**
     * Compute multi-system comparison matrix side-by-side without subjective rankings or winner/loser bias.
     * @param {Array<SystemReport>} reports 
     * @returns {Object} { systems: Array<string>, metrics: Object }
     */
    static compareSystems(reports = []) {
        if (!Array.isArray(reports) || reports.length === 0) {
            return { systems: [], comparison: {} };
        }

        const systems = reports.map(r => ({ systemId: r.systemId, systemName: r.systemName, status: r.overallStatus }));
        const comparison = {};

        const TARGET_METRICS = [
            { source: 'health', metric: 'availability', label: 'Availability (%)' },
            { source: 'health', metric: 'responseTimeMs', label: 'Response Time (ms)' },
            { source: 'quality', metric: 'passRate', label: 'Quality Pass Rate (%)' },
            { source: 'usage', metric: 'totalEvents', label: 'Usage Events' },
            { source: 'experience', metric: 'openIssues', label: 'Open Experience Issues' },
            { source: 'alerts', metric: 'activeAlertsCount', label: 'Active Alerts' }
        ];

        for (const tm of TARGET_METRICS) {
            comparison[tm.metric] = {
                label: tm.label,
                values: {}
            };

            for (const report of reports) {
                const sec = report[tm.source];
                let val = 'NO_DATA';
                if (sec && sec.available && Array.isArray(sec.metrics)) {
                    const m = sec.metrics.find(item => item.name === tm.metric);
                    if (m && m.value !== null && m.value !== undefined) {
                        val = m.value;
                    }
                }
                comparison[tm.metric].values[report.systemId] = val;
            }
        }

        return { systems, comparison };
    }

    /**
     * Compare current period report against previous period report to calculate metric deltas.
     * @param {SystemReport} currentReport 
     * @param {SystemReport} previousReport 
     * @returns {Object} delta change object
     */
    static computePeriodChanges(currentReport, previousReport) {
        if (!currentReport) return { status: 'NO_DATA', reason: 'NO_CURRENT_REPORT' };
        if (!previousReport) return { status: 'NO_DATA', reason: 'NO_PREVIOUS_REPORT_FOR_COMPARISON' };

        const changes = {};
        const sources = ['health', 'quality', 'usage', 'experience', 'alerts'];

        for (const src of sources) {
            const currSec = currentReport[src];
            const prevSec = previousReport[src];

            if (currSec && currSec.available && prevSec && prevSec.available && Array.isArray(currSec.metrics)) {
                changes[src] = {};
                for (const currM of currSec.metrics) {
                    if (currM && typeof currM.value === 'number') {
                        const prevM = prevSec.metrics ? prevSec.metrics.find(m => m.name === currM.name) : null;
                        if (prevM && typeof prevM.value === 'number') {
                            const delta = Number((currM.value - prevM.value).toFixed(2));
                            const pctChange = prevM.value !== 0 ? Number(((delta / prevM.value) * 100).toFixed(2)) : 0;
                            changes[src][currM.name] = {
                                current: currM.value,
                                previous: prevM.value,
                                delta,
                                percentChange: pctChange,
                                status: delta > 0 ? 'INCREASED' : (delta < 0 ? 'DECREASED' : 'UNCHANGED')
                            };
                        } else {
                            changes[src][currM.name] = { status: 'NO_DATA', reason: 'PREVIOUS_METRIC_UNAVAILABLE' };
                        }
                    }
                }
            } else {
                changes[src] = { status: 'NO_DATA', reason: 'SECTION_DATA_UNAVAILABLE' };
            }
        }

        return {
            status: 'COMPARED',
            systemId: currentReport.systemId,
            currentWindow: currentReport.window,
            changes
        };
    }
}

module.exports = ReportAggregator;
