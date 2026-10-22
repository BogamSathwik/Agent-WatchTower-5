/**
 * Phase 17 — Agent Monitoring Store
 * Persistent storage for monitoring configs, metrics, timelines, and incident histories.
 */

const { MONITORING_STATES } = require('./AgentMonitoringStates');

class AgentMonitoringStore {
    constructor(persistenceManager = null) {
        this.persistence = persistenceManager;
        this.configs = new Map();
        this.statuses = new Map();
        this.timelines = new Map();
        this.incidents = new Map();
        this.checkHistories = new Map();
    }

    getDefaultConfig(agentId, tenantId = 'default-tenant') {
        return {
            agentId,
            tenantId,
            enabled: true,
            healthCheckEnabled: true,
            capabilityCheckEnabled: true,
            executionCheckEnabled: false,
            healthIntervalSeconds: 15,
            executionIntervalSeconds: 60,
            timeoutMs: 5000,
            slowThresholdMs: 1500,
            failureThreshold: 3,
            recoveryThreshold: 1,
            endpointOverride: null,
            updatedAt: new Date().toISOString()
        };
    }

    getConfig(agentId, tenantId = 'default-tenant') {
        const key = `${tenantId}:${agentId}`;
        if (!this.configs.has(key)) {
            const defaultConfig = this.getDefaultConfig(agentId, tenantId);
            this.configs.set(key, defaultConfig);
            return defaultConfig;
        }
        return { ...this.configs.get(key) };
    }

    _persist(collection, key, value) {
        if (!this.persistence) return;
        try {
            if (typeof this.persistence.setSafe === 'function') {
                this.persistence.setSafe(collection, key, value);
            } else if (typeof this.persistence.set === 'function') {
                const r = this.persistence.set(collection, key, value);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            } else if (typeof this.persistence.setItem === 'function') {
                this.persistence.setItem(`${collection}_${key}`, value);
            }
        } catch (_) {}
    }

    saveConfig(agentId, configData, tenantId = 'default-tenant') {
        const key = `${tenantId}:${agentId}`;
        const current = this.getConfig(agentId, tenantId);
        const updated = {
            ...current,
            ...configData,
            agentId,
            tenantId,
            updatedAt: new Date().toISOString()
        };
        this.configs.set(key, updated);
        this._persist('monitoring_configs', key, updated);
        return { ...updated };
    }

    getStatus(agentId, tenantId = 'default-tenant') {
        const key = `${tenantId}:${agentId}`;
        if (!this.statuses.has(key)) {
            const defaultStatus = {
                agentId,
                tenantId,
                monitoringEnabled: false,
                currentState: MONITORING_STATES.UNKNOWN,
                previousState: MONITORING_STATES.UNKNOWN,
                connectivity: 'UNKNOWN',
                lastCheckAt: null,
                nextCheckAt: null,
                lastSuccessfulCheckAt: null,
                lastFailureAt: null,
                consecutiveFailures: 0,
                consecutiveRecoveries: 0,
                totalChecksCount: 0,
                totalFailuresCount: 0,
                availabilityPercentage: 100,
                lastError: null,
                latency: {
                    lastLatencyMs: 0,
                    avgLatencyMs: 0,
                    minLatencyMs: 0,
                    maxLatencyMs: 0,
                    healthLatencyMs: 0,
                    capabilityLatencyMs: 0,
                    executionLatencyMs: 0
                },
                capabilities: [],
                capabilitySource: null,
                capabilityStatus: 'NOT_EXPOSED',
                capabilityLastProbedAt: null,
                lastExecutionResult: null,
                activeIncidentId: null,
                updatedAt: new Date().toISOString()
            };
            this.statuses.set(key, defaultStatus);
            return defaultStatus;
        }
        const st = { ...this.statuses.get(key) };
        const total = st.totalChecksCount || 0;
        const fails = st.totalFailuresCount || 0;
        st.availabilityPercentage = total > 0 ? Math.round(((total - fails) / total) * 1000) / 10 : 100;
        return st;
    }

    saveStatus(agentId, statusData, tenantId = 'default-tenant') {
        const key = `${tenantId}:${agentId}`;
        const current = this.getStatus(agentId, tenantId);
        const updated = {
            ...current,
            ...statusData,
            agentId,
            tenantId,
            updatedAt: new Date().toISOString()
        };
        const total = updated.totalChecksCount || 0;
        const fails = updated.totalFailuresCount || 0;
        updated.availabilityPercentage = total > 0 ? Math.round(((total - fails) / total) * 1000) / 10 : 100;
        this.statuses.set(key, updated);
        this._persist('monitoring_statuses', key, updated);
        return { ...updated };
    }

    addTimelineEntry(agentId, entry, tenantId = 'default-tenant') {
        const key = `${tenantId}:${agentId}`;
        if (!this.timelines.has(key)) {
            this.timelines.set(key, []);
        }
        const list = this.timelines.get(key);
        const record = {
            id: `timeline_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            agentId,
            tenantId,
            timestamp: new Date().toISOString(),
            ...entry
        };
        list.unshift(record);
        if (list.length > 200) {
            list.pop();
        }
        return record;
    }

    getTimeline(agentId, tenantId = 'default-tenant', limit = 50) {
        const key = `${tenantId}:${agentId}`;
        const list = this.timelines.get(key) || [];
        return list.slice(0, limit);
    }

    findActiveIncident(agentId, tenantId = 'default-tenant') {
        for (const inc of this.incidents.values()) {
            if (inc.agentId === agentId && inc.tenantId === tenantId && ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(inc.status || inc.state)) {
                return { ...inc };
            }
        }
        return null;
    }

    saveIncident(incidentData, tenantId = 'default-tenant') {
        const key = incidentData.id || `INC-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4)}`;
        const existing = this.incidents.get(key) || {};
        const tid = incidentData.tenantId || existing.tenantId || tenantId;
        const aid = incidentData.agentId || existing.agentId;

        const record = {
            id: key,
            tenantId: tid,
            agentId: aid,
            startedAt: incidentData.startedAt || existing.startedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            severity: incidentData.severity || existing.severity || 'HIGH',
            type: incidentData.type || incidentData.trigger || existing.type || 'AGENT_OFFLINE',
            status: incidentData.status || incidentData.state || existing.status || existing.state || 'OPEN',
            state: incidentData.state || incidentData.status || existing.state || existing.status || 'OPEN',
            trigger: incidentData.trigger || existing.trigger || 'AGENT_FAILURE',
            failureCount: incidentData.failureCount !== undefined ? incidentData.failureCount : (existing.failureCount || 1),
            summary: incidentData.summary || existing.summary || `${aid} health incident detected.`,
            evidence: Array.from(new Set([...(existing.evidence || []), ...(incidentData.evidence || (incidentData.lastError ? [incidentData.lastError] : []))])),
            affectedAgentIds: Array.from(new Set([...(existing.affectedAgentIds || []), ...(incidentData.affectedAgentIds || [])])),
            alertIds: Array.from(new Set([...(existing.alertIds || []), ...(incidentData.alertIds || (incidentData.alertId ? [incidentData.alertId] : []))])),
            correlationIds: Array.from(new Set([...(existing.correlationIds || []), ...(incidentData.correlationIds || (incidentData.correlationId ? [incidentData.correlationId] : []))])),
            acknowledgedAt: incidentData.acknowledgedAt || existing.acknowledgedAt || null,
            acknowledgedBy: incidentData.acknowledgedBy || existing.acknowledgedBy || null,
            recoveredAt: incidentData.recoveredAt || existing.recoveredAt || null,
            resolvedAt: incidentData.resolvedAt || existing.resolvedAt || null,
            resolvedBy: incidentData.resolvedBy || existing.resolvedBy || null,
            durationMs: incidentData.durationMs || existing.durationMs || ((incidentData.recoveredAt || incidentData.resolvedAt) ? (new Date(incidentData.recoveredAt || incidentData.resolvedAt).getTime() - new Date(existing.startedAt || incidentData.startedAt).getTime()) : 0),
            lastError: incidentData.lastError || existing.lastError || null
        };
        this.incidents.set(key, record);
        this._persist('incidents', key, record);
        return { ...record };
    }

    getIncident(incidentId) {
        return this.incidents.has(incidentId) ? { ...this.incidents.get(incidentId) } : null;
    }

    listIncidents(tenantId = 'default-tenant', agentId = null) {
        const results = [];
        for (const inc of this.incidents.values()) {
            if (inc.tenantId === tenantId) {
                if (!agentId || inc.agentId === agentId) {
                    results.push({ ...inc });
                }
            }
        }
        return results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    addCheckRecord(agentId, record, tenantId = 'default-tenant') {
        const key = `${tenantId}:${agentId}`;
        if (!this.checkHistories.has(key)) {
            this.checkHistories.set(key, []);
        }
        const history = this.checkHistories.get(key);
        const fullRecord = {
            id: record.id || `check_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            agentId,
            tenantId,
            timestamp: record.timestamp || new Date().toISOString(),
            healthState: record.healthState || record.status || 'UNKNOWN',
            responseTimeMs: record.durationMs !== undefined ? record.durationMs : (record.responseTimeMs || 0),
            httpStatus: record.healthStatusCode !== undefined ? record.healthStatusCode : (record.httpStatus || 0),
            success: record.success !== undefined ? record.success : (record.healthState === 'HEALTHY'),
            errorCategory: record.error || record.errorCategory || null,
            consecutiveFailures: record.consecutiveFailures || 0,
            consecutiveSuccesses: record.consecutiveSuccesses || 0,
            correlationId: record.correlationId || null
        };
        history.unshift(fullRecord);
        if (history.length > 5000) {
            history.pop();
        }
        this._persist('monitoring_histories', key, { key, history });
        return fullRecord;
    }

    getCheckHistory(agentId, tenantId = 'default-tenant', limit = 20) {
        const key = `${tenantId}:${agentId}`;
        const history = this.checkHistories.get(key) || [];
        return history.slice(0, limit);
    }

    listStatuses(tenantId = 'default-tenant') {
        const results = [];
        for (const [key, status] of this.statuses.entries()) {
            if (key.startsWith(`${tenantId}:`)) {
                results.push({ ...status });
            }
        }
        return results;
    }

    getAgentHistoryByRange(agentId, range = '24h', tenantId = 'default-tenant') {
        const allowedRanges = ['1h', '24h', '7d', '30d'];
        if (!allowedRanges.includes(range)) {
            const err = new Error(`Invalid range '${range}'. Allowed values: 1h, 24h, 7d, 30d`);
            err.statusCode = 400;
            throw err;
        }

        const msMap = {
            '1h': 3600000,
            '24h': 86400000,
            '7d': 604800000,
            '30d': 2592000000
        };

        const rangeMs = msMap[range];
        const cutoff = Date.now() - rangeMs;
        const key = `${tenantId}:${agentId}`;
        const history = this.checkHistories.get(key) || [];

        const filtered = history.filter(r => new Date(r.timestamp).getTime() >= cutoff);

        if (filtered.length === 0) {
            return {
                agentId,
                tenantId,
                timeRange: range,
                checkCount: 0,
                successfulChecks: 0,
                failedChecks: 0,
                availability: null,
                availabilityMessage: "No historical data available yet.",
                averageLatency: 0,
                minLatency: 0,
                maxLatency: 0,
                p95Latency: 0,
                downtimeDurationMs: 0,
                uptimeDurationMs: 0,
                incidentCount: 0,
                records: []
            };
        }

        const totalChecks = filtered.length;
        const successful = filtered.filter(r => r.success !== false && r.healthState === 'HEALTHY').length;
        const failed = totalChecks - successful;
        const availability = Math.round((successful / totalChecks) * 10000) / 100;

        const latencies = filtered.map(r => r.responseTimeMs || 0).sort((a, b) => a - b);
        const sumLatency = latencies.reduce((acc, v) => acc + v, 0);
        const averageLatency = Math.round(sumLatency / totalChecks);
        const minLatency = latencies[0] || 0;
        const maxLatency = latencies[latencies.length - 1] || 0;
        const p95Index = Math.floor(latencies.length * 0.95);
        const p95Latency = latencies[p95Index] || maxLatency;

        let downtimeDurationMs = 0;
        filtered.forEach(r => {
            if (r.success === false || r.healthState === 'OFFLINE' || r.healthState === 'UNHEALTHY') {
                downtimeDurationMs += (r.responseTimeMs || 5000);
            }
        });

        const incidentsInRange = this.listIncidents(tenantId, agentId).filter(inc => new Date(inc.startedAt).getTime() >= cutoff);

        return {
            agentId,
            tenantId,
            timeRange: range,
            checkCount: totalChecks,
            successfulChecks: successful,
            failedChecks: failed,
            availability,
            averageLatency,
            minLatency,
            maxLatency,
            p95Latency,
            downtimeDurationMs,
            uptimeDurationMs: Math.max(0, rangeMs - downtimeDurationMs),
            incidentCount: incidentsInRange.length,
            records: filtered
        };
    }

    getAgentPerformance(agentId, range = '24h', tenantId = 'default-tenant') {
        const hist = this.getAgentHistoryByRange(agentId, range, tenantId);
        const status = this.getStatus(agentId, tenantId);
        const currentLatency = status.latency ? (status.latency.lastLatencyMs || 0) : 0;
        const avgLatency = hist.averageLatency || 0;

        let latencyChangePercentage = 0;
        if (avgLatency > 0 && currentLatency > 0) {
            latencyChangePercentage = Math.round(((currentLatency - avgLatency) / avgLatency) * 100);
        }

        const degradationDetected = currentLatency > 0 && avgLatency > 0 && (currentLatency > avgLatency * 1.5 || currentLatency > 3000);

        return {
            agentId,
            tenantId,
            timeRange: range,
            currentLatency,
            averageLatency: avgLatency,
            minLatency: hist.minLatency,
            maxLatency: hist.maxLatency,
            p95Latency: hist.p95Latency,
            latencyChangePercentage,
            degradationDetected,
            samplesCount: hist.checkCount
        };
    }

    getGlobalHistoryOverview(tenantId = 'default-tenant') {
        const statuses = this.listStatuses(tenantId);
        const allIncidents = this.listIncidents(tenantId);
        const cutoff24h = Date.now() - 86400000;

        const openIncidents = allIncidents.filter(i => ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(i.status || i.state));
        const incidents24h = allIncidents.filter(i => new Date(i.startedAt).getTime() >= cutoff24h);

        let totalChecks = 0;
        let totalFailures = 0;
        let totalRecoveryMs = 0;
        let recoveredCount = 0;

        for (const inc of allIncidents) {
            if (inc.durationMs > 0) {
                totalRecoveryMs += inc.durationMs;
                recoveredCount++;
            }
        }

        for (const st of statuses) {
            totalChecks += (st.totalChecksCount || 0);
            totalFailures += (st.totalFailuresCount || 0);
        }

        const platformAvailability = totalChecks > 0 ? Math.round(((totalChecks - totalFailures) / totalChecks) * 10000) / 100 : 100;
        const avgRecoveryTimeMs = recoveredCount > 0 ? Math.round(totalRecoveryMs / recoveredCount) : 0;

        return {
            monitoredAgents: statuses.length,
            healthy: statuses.filter(s => s.currentState === 'HEALTHY').length,
            degraded: statuses.filter(s => s.currentState === 'DEGRADED' || s.currentState === 'RECOVERING').length,
            offline: statuses.filter(s => s.currentState === 'OFFLINE' || s.currentState === 'UNHEALTHY').length,
            unknown: statuses.filter(s => s.currentState === 'UNKNOWN').length,
            openIncidentsCount: openIncidents.length,
            incidents24hCount: incidents24h.length,
            avgRecoveryTimeMs,
            platformAvailability,
            totalHealthChecks: totalChecks,
            failedHealthChecks: totalFailures
        };
    }
}

module.exports = AgentMonitoringStore;
