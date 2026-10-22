/**
 * OnboardingStore
 * In-memory persistence store for onboarding records, configurations, connection test logs, and audit trails.
 */

class OnboardingStore {
    constructor() {
        this.onboardings = new Map(); // systemId -> SystemOnboarding
        this.connectionTestHistory = new Map(); // systemId -> Array of test results
        this.auditLogs = [];
    }

    saveOnboarding(systemOnboarding) {
        if (!systemOnboarding || !systemOnboarding.id) {
            throw new Error('SystemOnboarding must have an id');
        }
        systemOnboarding.updatedAt = new Date().toISOString();
        this.onboardings.set(systemOnboarding.id, systemOnboarding);
        this.addAuditLog('SYSTEM', 'ONBOARDING_SAVED', 'SYSTEM', systemOnboarding.id, {
            status: systemOnboarding.status,
            name: systemOnboarding.name
        });
        return systemOnboarding;
    }

    getOnboarding(systemId) {
        if (!systemId) return null;
        return this.onboardings.get(String(systemId).trim()) || null;
    }

    listOnboardings(filterFn = null) {
        const list = Array.from(this.onboardings.values());
        return filterFn ? list.filter(filterFn) : list;
    }

    deleteOnboarding(systemId) {
        const sid = String(systemId).trim();
        const existed = this.onboardings.delete(sid);
        if (existed) {
            this.addAuditLog('SYSTEM', 'ONBOARDING_DELETED', 'SYSTEM', sid, {});
        }
        return existed;
    }

    saveConnectionTestResult(systemId, result) {
        const sid = String(systemId).trim();
        if (!this.connectionTestHistory.has(sid)) {
            this.connectionTestHistory.set(sid, []);
        }
        const history = this.connectionTestHistory.get(sid);
        history.push(result);
        if (history.length > 100) history.shift();

        const onboarding = this.getOnboarding(sid);
        if (onboarding) {
            onboarding.lastConnectionTest = result;
            this.saveOnboarding(onboarding);
        }
        return result;
    }

    getConnectionTestHistory(systemId) {
        return this.connectionTestHistory.get(String(systemId).trim()) || [];
    }

    addAuditLog(actor, action, resource, resourceId, metadata = {}) {
        const entry = {
            id: `audit_onb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            actor: actor || 'anonymous',
            action,
            resource,
            resourceId,
            timestamp: new Date().toISOString(),
            metadata: JSON.parse(JSON.stringify(metadata))
        };
        this.auditLogs.push(entry);
        if (this.auditLogs.length > 5000) this.auditLogs.shift();
        return entry;
    }

    getAuditLogs(limit = 100) {
        return this.auditLogs.slice(-limit);
    }

    clear() {
        this.onboardings.clear();
        this.connectionTestHistory.clear();
        this.auditLogs = [];
    }
}

module.exports = OnboardingStore;
