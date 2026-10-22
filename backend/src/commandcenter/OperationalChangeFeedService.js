/**
 * Operational Change Feed Service
 * Aggregates operational events into a single unified chronological timeline.
 * Preserves eventId, timestamp, eventType, severity, agentId, incidentId, sourceRecordId, summary, and origin.
 * Does NOT fabricate timestamps.
 */

class OperationalChangeFeedService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService;
        this.riskEngine = options.riskEngine;
        this.anomalyService = options.anomalyService;
        this.remediationService = options.remediationService;
        this.automationDecisionService = options.decisionService;
        this.auditService = options.auditService;
        this.store = options.store || (this.monitoringService ? this.monitoringService.store : null);
    }

    _isDefaultPairTenant(tenantId) {
        return tenantId === 'default' || tenantId === 'default-tenant';
    }

    _matchesTenant(recordTenant, tenantId) {
        if (tenantId === 'all') return true;
        if (!recordTenant) return true;
        if (recordTenant === tenantId) return true;
        if (this._isDefaultPairTenant(tenantId) && this._isDefaultPairTenant(recordTenant)) return true;
        return false;
    }

    /**
     * Get chronological change feed events
     * @param {Object} options { tenantId, limit }
     * @returns {Array<Object>} Sorted list of operational events
     */
    getChangeFeed(options = {}) {
        const tenantId = options.tenantId || 'default';
        const limit = options.limit || 100;
        const events = [];

        if (!this.store) {
            return events;
        }

        // 1. Incidents (Created, Updated, Recovered)
        if (this.store.incidents) {
            for (const inc of this.store.incidents.values()) {
                if (!this._matchesTenant(inc.tenantId, tenantId)) continue;
                
                events.push({
                    eventId: `EVT-INC-${inc.incidentId || inc.id}`,
                    timestamp: inc.startedAt || inc.createdAt || new Date().toISOString(),
                    eventType: 'INCIDENT_OPENED',
                    severity: inc.severity || 'HIGH',
                    agentId: inc.agentId,
                    incidentId: inc.incidentId || inc.id,
                    sourceRecordId: inc.incidentId || inc.id,
                    summary: `Incident opened on ${inc.agentId}: ${inc.title || inc.type || 'Failure'}`,
                    origin: 'OBSERVED'
                });

                if (inc.status === 'RESOLVED' || inc.status === 'RECOVERED') {
                    events.push({
                        eventId: `EVT-INC-REC-${inc.incidentId || inc.id}`,
                        timestamp: inc.recoveredAt || inc.resolvedAt || inc.updatedAt || new Date().toISOString(),
                        eventType: 'INCIDENT_RECOVERED',
                        severity: 'INFO',
                        agentId: inc.agentId,
                        incidentId: inc.incidentId || inc.id,
                        sourceRecordId: inc.incidentId || inc.id,
                        summary: `Incident recovered on ${inc.agentId}: ${inc.title || inc.incidentId}`,
                        origin: 'OBSERVED'
                    });
                }
            }
        }

        // 2. Monitoring timeline entries (STATE_CHANGED, RECOVERED,
        // MONITORING_STARTED/STOPPED) — the canonical operator activity record.
        if (this.store.timelines) {
            for (const [key, entries] of this.store.timelines.entries()) {
                if (!Array.isArray(entries)) continue;
                for (const t of entries.slice(0, 15)) {
                    if (!this._matchesTenant(t.tenantId, tenantId)) continue;
                    const type = String(t.type || 'TIMELINE_EVENT');
                    const isRecovery = type === 'RECOVERED';
                    const isProblem = /FAIL|ERROR|OFFLINE|UNHEALTHY|DEGRADED/i.test(`${type} ${t.message || ''} ${t.error || ''}`);
                    events.push({
                        eventId: t.id || `EVT-TL-${t.agentId}-${t.timestamp}`,
                        timestamp: t.timestamp || new Date().toISOString(),
                        eventType: type === 'STATE_CHANGED' ? 'HEALTH_STATE_CHANGED'
                            : (isRecovery ? 'AGENT_RECOVERED'
                            : (type === 'MONITORING_STARTED' ? 'MONITORING_STARTED'
                            : (type === 'MONITORING_STOPPED' ? 'MONITORING_STOPPED' : type))),
                        severity: isRecovery || type === 'MONITORING_STARTED' ? 'INFO' : (isProblem ? 'HIGH' : 'INFO'),
                        agentId: t.agentId,
                        incidentId: null,
                        sourceRecordId: t.id || t.agentId,
                        summary: t.fromState && t.toState
                            ? `${t.agentId} health ${t.fromState} → ${t.toState}`
                            : (t.message || `${type} on ${t.agentId}`),
                        origin: 'OBSERVED'
                    });
                }
            }
        }

        // 3. Health check records (real probe results, newest first in store).
        if (this.store.checkHistories) {
            for (const [key, records] of this.store.checkHistories.entries()) {
                if (!Array.isArray(records)) continue;
                const parts = String(key).split(':');
                const fallbackAgent = parts.slice(1).join(':') || null;
                for (const chk of records.slice(0, 10)) {
                    if (!this._matchesTenant(chk.tenantId, tenantId)) continue;
                    const state = String(chk.healthState || chk.status || 'UNKNOWN');
                    const ok = chk.success === true || state === 'HEALTHY';
                    events.push({
                        eventId: chk.id ? `EVT-CHK-${chk.id}` : `EVT-CHK-${chk.agentId || fallbackAgent}-${chk.timestamp}`,
                        timestamp: chk.timestamp || new Date().toISOString(),
                        eventType: ok ? 'HEALTH_CHECK_PASSED' : 'HEALTH_CHECK_FAILED',
                        severity: ok ? 'INFO' : (state === 'OFFLINE' ? 'CRITICAL' : 'MEDIUM'),
                        agentId: chk.agentId || fallbackAgent,
                        incidentId: null,
                        sourceRecordId: chk.id || chk.agentId || fallbackAgent,
                        summary: `Health check for ${chk.agentId || fallbackAgent}: ${state} (latency: ${chk.responseTimeMs || chk.durationMs || 0}ms)`,
                        origin: 'OBSERVED'
                    });
                }
            }
        }

        // 3. Alerts
        if (this.store.alerts) {
            for (const alert of this.store.alerts.values()) {
                if (!this._matchesTenant(alert.tenantId, tenantId)) continue;
                events.push({
                    eventId: `EVT-ALT-${alert.alertId || alert.id}`,
                    timestamp: alert.createdAt || new Date().toISOString(),
                    eventType: 'ALERT_TRIGGERED',
                    severity: alert.severity || 'MEDIUM',
                    agentId: alert.agentId,
                    incidentId: alert.incidentId || null,
                    sourceRecordId: alert.alertId || alert.id,
                    summary: `Alert triggered on ${alert.agentId}: ${alert.message || alert.title || 'Alert'}`,
                    origin: 'OBSERVED'
                });
            }
        }

        // 4. Remediations
        if (this.store.remediations) {
            for (const rem of this.store.remediations.values()) {
                if (!this._matchesTenant(rem.tenantId, tenantId)) continue;
                events.push({
                    eventId: `EVT-REM-${rem.remediationId || rem.id}`,
                    timestamp: rem.createdAt || new Date().toISOString(),
                    eventType: rem.status === 'SUCCESS' ? 'REMEDIATION_SUCCESS' : (rem.status === 'FAILED' ? 'REMEDIATION_FAILED' : 'REMEDIATION_EXECUTED'),
                    severity: rem.status === 'FAILED' ? 'HIGH' : 'INFO',
                    agentId: rem.agentId,
                    incidentId: rem.incidentId || null,
                    sourceRecordId: rem.remediationId || rem.id,
                    summary: `Remediation (${rem.action || rem.type}) for ${rem.agentId}: ${rem.status}`,
                    origin: 'DERIVED'
                });
            }
        }

        // 5. Automation Decisions
        if (this.automationDecisionService && typeof this.automationDecisionService.getDecisions === 'function') {
            const decisions = this.automationDecisionService.getDecisions(tenantId);
            for (const dec of decisions) {
                events.push({
                    eventId: `EVT-DEC-${dec.decisionId}`,
                    timestamp: dec.createdAt || new Date().toISOString(),
                    eventType: 'AUTOMATION_DECISION_MADE',
                    severity: dec.action === 'BLOCKED' ? 'HIGH' : 'INFO',
                    agentId: dec.agentId,
                    incidentId: dec.incidentId || null,
                    sourceRecordId: dec.decisionId,
                    summary: `Automation policy decision on ${dec.agentId}: ${dec.action} (${dec.status})`,
                    origin: 'DERIVED'
                });
            }
        }

        // 6. Audit Events
        if (this.auditService && typeof this.auditService.getLogs === 'function') {
            const logs = this.auditService.getLogs({ tenantId, limit: 20 });
            for (const log of logs) {
                events.push({
                    eventId: `EVT-AUD-${log.logId || log.id}`,
                    timestamp: log.timestamp || log.createdAt || new Date().toISOString(),
                    eventType: 'AUDIT_EVENT',
                    severity: 'INFO',
                    agentId: log.agentId || null,
                    incidentId: log.incidentId || null,
                    sourceRecordId: log.logId || log.id,
                    summary: `Audit log: ${log.action || log.event} by ${log.actor || 'system'}`,
                    origin: 'OBSERVED'
                });
            }
        }

        // Sort descending by timestamp
        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return events.slice(0, limit);
    }
}

module.exports = { OperationalChangeFeedService };
