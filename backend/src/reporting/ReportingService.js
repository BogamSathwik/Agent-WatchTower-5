/**
 * Universal Reporting Service
 * Orchestrates system report generation, period comparisons, side-by-side multi-system comparison, snapshot storage, and export downloads.
 * Purely domain-agnostic.
 */

const ReportStore = require('./ReportStore');
const ReportBuilder = require('./ReportBuilder');
const ReportAggregator = require('./ReportAggregator');

class ReportingService {
    constructor({
        reportStore = null,
        systemRegistry = null,
        healthEngine = null,
        qualityRunner = null,
        usageCollector = null,
        experienceStore = null,
        intelligenceService = null,
        alertingService = null
    } = {}) {
        this.store = reportStore || new ReportStore();
        this.systemRegistry = systemRegistry;
        this.builder = new ReportBuilder({
            systemRegistry,
            healthEngine,
            qualityRunner,
            usageCollector,
            experienceStore,
            intelligenceService,
            alertingService
        });
    }

    async generateReport(systemId, window = '24h') {
        const report = await this.builder.buildReport(systemId, window);
        this.store.saveReport(report);
        return report;
    }

    async getLatestReport(systemId, window = '24h') {
        let report = this.store.getLatestReport(systemId);
        if (!report || report.window !== window) {
            report = await this.generateReport(systemId, window);
        }
        return report;
    }

    listReports(filters = {}) {
        return this.store.listReports(filters);
    }

    async getReportSection(systemId, sectionName, window = '24h') {
        const report = await this.getLatestReport(systemId, window);
        const section = report[String(sectionName).toLowerCase()];
        if (!section) {
            return { available: false, reason: `SECTION_${sectionName.toUpperCase()}_NOT_FOUND` };
        }
        return section;
    }

    async compareSystems(systemIds = [], window = '24h') {
        if (!Array.isArray(systemIds) || systemIds.length === 0) {
            if (this.systemRegistry) {
                systemIds = this.systemRegistry.getAllSystems().map(s => s.id);
            }
        }

        const reports = [];
        for (const sysId of systemIds) {
            const r = await this.getLatestReport(sysId, window);
            if (r) reports.push(r);
        }

        return ReportAggregator.compareSystems(reports);
    }

    async getChanges(systemId, window = '24h') {
        const reports = this.store.listReports({ systemId, window });
        if (reports.length < 2) {
            return {
                status: 'NO_DATA',
                reason: 'INSUFFICIENT_HISTORICAL_SNAPSHOTS_FOR_PERIOD_COMPARISON',
                currentWindow: window
            };
        }
        const currentReport = reports[0];
        const previousReport = reports[1];
        return ReportAggregator.computePeriodChanges(currentReport, previousReport);
    }

    async exportReportJSON(systemId, window = '24h') {
        const report = await this.getLatestReport(systemId, window);
        const raw = report.toJSON ? report.toJSON() : report;

        // Credentials & secret sanitization
        const sanitizeObject = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(sanitizeObject);

            const safe = {};
            const FORBIDDEN_KEYS = ['password', 'token', 'secret', 'apikey', 'api_key', 'authorization', 'cookie', 'auth'];

            for (const [key, val] of Object.entries(obj)) {
                if (FORBIDDEN_KEYS.some(f => key.toLowerCase().includes(f))) {
                    safe[key] = '[REDACTED_CREDENTIAL]';
                } else if (typeof val === 'object' && val !== null) {
                    safe[key] = sanitizeObject(val);
                } else {
                    safe[key] = val;
                }
            }
            return safe;
        };

        return {
            exportVersion: '1.0.0',
            exportedAt: new Date().toISOString(),
            report: sanitizeObject(raw)
        };
    }

    getOverview() {
        const allReports = this.store.listReports();
        const systemsCount = this.systemRegistry ? this.systemRegistry.getAllSystems().length : 0;

        const healthyCount = allReports.filter(r => r.overallStatus === 'HEALTHY').length;
        const attentionCount = allReports.filter(r => r.overallStatus === 'ATTENTION_REQUIRED').length;
        const degradedCount = allReports.filter(r => r.overallStatus === 'DEGRADED').length;
        const criticalCount = allReports.filter(r => r.overallStatus === 'CRITICAL').length;
        const unknownCount = allReports.filter(r => r.overallStatus === 'UNKNOWN').length;

        return {
            registeredSystemsCount: systemsCount,
            totalReportsGenerated: allReports.length,
            healthySystemsCount: healthyCount,
            attentionRequiredSystemsCount: attentionCount,
            degradedSystemsCount: degradedCount,
            criticalSystemsCount: criticalCount,
            unknownSystemsCount: unknownCount
        };
    }
}

module.exports = ReportingService;
