/**
 * Centralized Audit Log Service
 * Tenant-aware, security-hardened audit log recorder supporting secret redaction,
 * correlation tracking, event search filtering, and configurable retention.
 */

const SENSITIVE_KEYS = ['secret', 'apiKey', 'password', 'token', 'authorization', 'privateKey'];

function redactAuditMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return {};
    const copy = JSON.parse(JSON.stringify(metadata));

    function clean(target) {
        if (!target || typeof target !== 'object') return;
        for (const key of Object.keys(target)) {
            if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
                target[key] = '[REDACTED]';
            } else if (typeof target[key] === 'object') {
                clean(target[key]);
            }
        }
    }
    clean(copy);
    return copy;
}

class AuditLogService {
    constructor(options = {}) {
        this.maxRecords = options.maxRecords || 5000;
        this.retentionDays = options.retentionDays || 30;
        this.events = [];
        this.securityEventsCount = 0;
    }

    logEvent(payload = {}) {
        const id = `aud_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const timestamp = payload.timestamp || new Date().toISOString();
        const eventType = payload.eventType || 'SYSTEM_ACTION';
        const action = payload.action || 'unknown_action';
        const actor = payload.actor || 'system';
        const role = payload.role || 'viewer';
        const tenantId = payload.tenantId || 'default-tenant';
        const resourceType = payload.resourceType || 'system';
        const resourceId = payload.resourceId || 'global';
        const outcome = payload.outcome || 'SUCCESS';
        const severity = payload.severity || 'INFO';
        const correlationId = payload.correlationId || `corr_${Date.now()}`;
        const metadata = redactAuditMetadata(payload.metadata || {});

        const eventRecord = {
            id,
            timestamp,
            eventType,
            action,
            actor,
            role,
            tenantId,
            resourceType,
            resourceId,
            outcome,
            severity,
            correlationId,
            metadata
        };

        if (outcome === 'DENIED' || severity === 'CRITICAL' || eventType.startsWith('SECURITY_') || eventType === 'AUTHORIZATION_DENIED') {
            this.securityEventsCount++;
        }

        this.events.unshift(eventRecord);

        if (this.events.length > this.maxRecords) {
            this.events.pop();
        }

        return eventRecord;
    }

    getEvent(id) {
        return this.events.find(e => e.id === id) || null;
    }

    listEvents(filters = {}) {
        let list = [...this.events];

        if (filters.tenantId) {
            list = list.filter(e => e.tenantId === filters.tenantId);
        }
        if (filters.eventType) {
            list = list.filter(e => e.eventType === filters.eventType);
        }
        if (filters.actor) {
            list = list.filter(e => e.actor.toLowerCase().includes(filters.actor.toLowerCase()));
        }
        if (filters.resourceType) {
            list = list.filter(e => e.resourceType === filters.resourceType);
        }
        if (filters.outcome) {
            list = list.filter(e => e.outcome === filters.outcome);
        }
        if (filters.severity) {
            list = list.filter(e => e.severity === filters.severity);
        }
        if (filters.dateFrom) {
            const fromTime = new Date(filters.dateFrom).getTime();
            list = list.filter(e => new Date(e.timestamp).getTime() >= fromTime);
        }
        if (filters.dateTo) {
            const toTime = new Date(filters.dateTo).getTime();
            list = list.filter(e => new Date(e.timestamp).getTime() <= toTime);
        }

        const limit = Number(filters.limit) || 100;
        return list.slice(0, limit);
    }

    getOverview(tenantId = null) {
        let records = this.events;
        if (tenantId) {
            records = records.filter(e => e.tenantId === tenantId);
        }

        const totalEvents = records.length;
        const securityEvents = records.filter(e => e.outcome === 'DENIED' || e.severity === 'CRITICAL' || e.eventType.startsWith('SECURITY_') || e.eventType === 'AUTHORIZATION_DENIED').length;
        const failedActions = records.filter(e => e.outcome === 'FAILED' || e.outcome === 'ERROR').length;
        const successActions = records.filter(e => e.outcome === 'SUCCESS').length;

        return {
            totalEvents,
            securityEvents,
            failedActions,
            successActions,
            maxRecords: this.maxRecords,
            retentionDays: this.retentionDays,
            timestamp: new Date().toISOString()
        };
    }

    getStats(tenantId = null) {
        return this.getOverview(tenantId);
    }

    exportEvents(filters = {}) {
        const list = this.listEvents({ ...filters, limit: 5000 });
        return {
            schemaVersion: '1.0.0',
            exportedAt: new Date().toISOString(),
            totalRecords: list.length,
            records: list
        };
    }
}

const auditLogService = new AuditLogService();

module.exports = {
    AuditLogService,
    auditLogService
};
