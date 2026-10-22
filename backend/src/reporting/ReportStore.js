/**
 * Universal Report Store
 * In-memory persistence manager for generated system reports and snapshot history.
 * Purely domain-agnostic.
 */

const SystemReport = require('./SystemReport');

class ReportStore {
    constructor() {
        this.reports = new Map(); // reportId -> SystemReport
        this.latestBySystem = new Map(); // systemId -> reportId
    }

    saveReport(report) {
        if (!(report instanceof SystemReport)) {
            report = new SystemReport(report);
        }
        this.reports.set(report.reportId, report);
        this.latestBySystem.set(report.systemId, report.reportId);
        return report;
    }

    getReport(reportId) {
        return this.reports.get(reportId) || null;
    }

    getLatestReport(systemId) {
        const reportId = this.latestBySystem.get(systemId);
        return reportId ? this.getReport(reportId) : null;
    }

    listReports(filters = {}) {
        let list = Array.from(this.reports.values());

        if (filters.systemId) {
            list = list.filter(r => r.systemId === filters.systemId);
        }
        if (filters.window) {
            list = list.filter(r => r.window === filters.window);
        }
        if (filters.overallStatus) {
            list = list.filter(r => r.overallStatus === filters.overallStatus);
        }

        return list.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
    }

    deleteReport(reportId) {
        const r = this.getReport(reportId);
        if (r) {
            this.reports.delete(reportId);
            if (this.latestBySystem.get(r.systemId) === reportId) {
                this.latestBySystem.delete(r.systemId);
            }
            return true;
        }
        return false;
    }

    clear() {
        this.reports.clear();
        this.latestBySystem.clear();
    }
}

module.exports = ReportStore;
