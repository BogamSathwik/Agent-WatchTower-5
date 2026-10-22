/**
 * Quality Store
 * In-memory persistence store for test definitions, test suites, and historical quality test results.
 */

class QualityStore {
    constructor() {
        this.definitions = new Map(); // testId -> QualityTestDefinition
        this.suites = new Map();      // suiteId -> QualityTestSuite
        this.results = new Map();     // systemId -> Array<QualityTestResult>
        this.suiteResults = new Map(); // suiteId -> Array<SuiteResultSummary>
    }

    // --- TEST DEFINITIONS ---
    saveTestDefinition(def) {
        this.definitions.set(def.testId, def);
        return def;
    }

    getTestDefinition(testId) {
        if (!testId) return null;
        return this.definitions.get(String(testId).trim()) || null;
    }

    getTestDefinitions(filters = {}) {
        return this.listTestDefinitions(filters);
    }

    listTestDefinitions(filters = {}) {
        let list = Array.from(this.definitions.values());
        if (filters.systemId) {
            const sid = String(filters.systemId).trim();
            list = list.filter(d => d.systemId === sid);
        }
        if (filters.capability) {
            const cap = String(filters.capability).trim().toLowerCase();
            list = list.filter(d => (d.capability || d.operation).toLowerCase() === cap);
        }
        if (filters.enabled !== undefined && filters.enabled !== null && filters.enabled !== '') {
            const isEnabled = String(filters.enabled) === 'true';
            list = list.filter(d => d.enabled === isEnabled);
        }
        if (filters.tag) {
            const tag = String(filters.tag).trim().toLowerCase();
            list = list.filter(d => Array.isArray(d.tags) && d.tags.includes(tag));
        }
        return list;
    }

    updateTestDefinition(testId, updates = {}) {
        const existing = this.getTestDefinition(testId);
        if (!existing) return null;
        Object.assign(existing, updates, { updatedAt: new Date().toISOString() });
        this.definitions.set(existing.testId, existing);
        return existing;
    }

    deleteTestDefinition(testId) {
        if (!testId) return false;
        return this.definitions.delete(String(testId).trim());
    }

    // --- TEST SUITES ---
    saveTestSuite(suite) {
        this.suites.set(suite.suiteId, suite);
        return suite;
    }

    getTestSuite(suiteId) {
        if (!suiteId) return null;
        return this.suites.get(String(suiteId).trim()) || null;
    }

    getTestSuites(filters = {}) {
        return this.listTestSuites(filters);
    }

    listTestSuites(filters = {}) {
        let list = Array.from(this.suites.values());
        if (filters.systemId) {
            const sid = String(filters.systemId).trim();
            list = list.filter(s => s.systemId === sid || !s.systemId);
        }
        return list;
    }

    deleteTestSuite(suiteId) {
        if (!suiteId) return false;
        return this.suites.delete(String(suiteId).trim());
    }

    // --- TEST RESULTS ---
    saveTestResult(result) {
        const systemId = result.systemId;
        if (!this.results.has(systemId)) {
            this.results.set(systemId, []);
        }
        const history = this.results.get(systemId);
        history.push(result);

        if (history.length > 500) {
            history.shift();
        }

        return result;
    }

    saveSuiteResult(suiteSummary) {
        const suiteId = suiteSummary.suiteId || 'unknown-suite';
        if (!this.suiteResults.has(suiteId)) {
            this.suiteResults.set(suiteId, []);
        }
        const history = this.suiteResults.get(suiteId);
        history.push(suiteSummary);
        if (history.length > 100) {
            history.shift();
        }
        return suiteSummary;
    }

    getTestResults(filters = {}) {
        let allResults = [];
        if (filters.systemId) {
            allResults = Array.from(this.results.get(filters.systemId) || []);
        } else {
            for (const list of this.results.values()) {
                allResults.push(...list);
            }
        }

        if (filters.testId) {
            allResults = allResults.filter(r => r.testId === filters.testId);
        }

        if (filters.suiteId) {
            allResults = allResults.filter(r => r.suiteId === filters.suiteId);
        }

        if (filters.status) {
            const target = String(filters.status).toUpperCase();
            allResults = allResults.filter(r => r.status === target);
        }

        if (filters.startTime) {
            const startMs = new Date(filters.startTime).getTime();
            allResults = allResults.filter(r => new Date(r.timestamp).getTime() >= startMs);
        }

        if (filters.endTime) {
            const endMs = new Date(filters.endTime).getTime();
            allResults = allResults.filter(r => new Date(r.timestamp).getTime() <= endMs);
        }

        const limit = Number(filters.limit) || 100;
        return allResults.slice(-limit);
    }

    clear() {
        this.definitions.clear();
        this.suites.clear();
        this.results.clear();
        this.suiteResults.clear();
    }
}

module.exports = {
    QualityStore
};
