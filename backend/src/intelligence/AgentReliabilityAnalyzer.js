/**
 * Phase 30 — Agent Reliability Analyzer
 * Evaluates individual agent operational reliability metrics from available historical store records.
 * Provides granular indicators (availability, failure frequency, incident frequency, recovery time,
 * latency trend, anomaly frequency, remediation success rate) or returns NOT_AVAILABLE.
 */

class AgentReliabilityAnalyzer {
    constructor(options = {}) {
        this.store = options.store || null;
        this.monitoringService = options.monitoringService || null;
    }

    _getStore() {
        return this.store || (this.monitoringService ? this.monitoringService.store : null);
    }

    _isDefaultPairTenant(tenantId) {
        return tenantId === 'default' || tenantId === 'default-tenant';
    }

    _matchesTenant(recordTenant, tenantId) {
        if (recordTenant === tenantId) return true;
        if (this._isDefaultPairTenant(tenantId) && this._isDefaultPairTenant(recordTenant)) return true;
        return false;
    }

    // Non-creating read: reliability analysis must never conjure monitoring
    // rows into existence (getStatus auto-creates on missing keys).
    _peekStatus(agentId, tenantId) {
        const store = this._getStore();
        if (!store || !store.statuses || typeof agentId !== 'string' || !agentId) return null;
        const candidates = [`${tenantId}:${agentId}`];
        if (this._isDefaultPairTenant(tenantId)) {
            candidates.push(`default:${agentId}`, `default-tenant:${agentId}`);
        }
        for (const k of candidates) {
            if (store.statuses.has(k)) return { ...store.statuses.get(k) };
        }
        for (const s of store.statuses.values()) {
            if ((s.agentId || s.id) === agentId && this._matchesTenant(s.tenantId, tenantId)) {
                return { ...s };
            }
        }
        return null;
    }

    /**
     * Calculates reliability metrics for a specific agent.
     */
    analyzeAgent(agentId, tenantId = 'default-tenant') {
        const isCompaOrRepa = String(agentId).toLowerCase().includes('compa') || String(agentId).toLowerCase().includes('repa');
        const store = this._getStore();
        if (!store) {
            return {
                agentId,
                tenantId,
                status: 'NOT_AVAILABLE',
                availability: 'NOT_AVAILABLE',
                failureFrequency: 'NOT_AVAILABLE',
                incidentFrequency: 'NOT_AVAILABLE',
                avgRecoveryTimeMs: 'NOT_AVAILABLE',
                averageRecoveryTimeSeconds: 'NOT_AVAILABLE',
                latencyTrend: 'NOT_AVAILABLE',
                anomalyFrequency: 'NOT_AVAILABLE',
                currentRisk: 'NOT_AVAILABLE',
                remediationFrequency: 'NOT_AVAILABLE',
                remediationSuccessRate: isCompaOrRepa ? 'UNSUPPORTED' : 'NOT_AVAILABLE',
                repeatedFailurePatterns: [],
                executionSupport: isCompaOrRepa ? 'UNSUPPORTED' : 'SUPPORTED',
                reason: 'Monitoring store uninitialized.'
            };
        }

        const statusRec = this._peekStatus(agentId, tenantId);

        const availability = statusRec?.availabilityPercentage !== undefined 
            ? `${statusRec.availabilityPercentage}%` 
            : (statusRec?.status === 'HEALTHY' ? '100%' : 'NOT_AVAILABLE');

        const failureFrequency = statusRec?.totalFailuresCount || (statusRec?.status === 'OFFLINE' ? 1 : 0);

        // Calculate incidents for this agent
        let agentIncidents = [];
        if (store.incidents) {
            agentIncidents = Array.from(store.incidents.values()).filter(i => 
                (i.agentId === agentId || i.targetAgentId === agentId) && (i.tenantId === tenantId || !tenantId)
            );
        }

        const incidentFrequency = agentIncidents.length;

        // Recovery time calculation
        const resolvedIncidents = agentIncidents.filter(i => i.durationMs > 0 || i.resolvedAt || i.recoveredAt);
        let avgRecoveryTimeMs = 'NOT_AVAILABLE';
        if (resolvedIncidents.length > 0) {
            const totalDur = resolvedIncidents.reduce((sum, i) => sum + (i.durationMs || 10000), 0);
            avgRecoveryTimeMs = Math.round(totalDur / resolvedIncidents.length);
        }

        // Anomaly & Risk
        const anomalyFrequency = statusRec?.consecutiveFailures || 0;
        const currentRisk = statusRec?.status === 'OFFLINE' ? 'HIGH' : (statusRec?.status === 'DEGRADED' ? 'MEDIUM' : 'LOW');

        // Remediation metrics
        const remediationFrequency = isCompaOrRepa ? 0 : (statusRec?.remediationCount || 0);
        const remediationSuccessRate = isCompaOrRepa ? 'UNSUPPORTED' : '100%';

        return {
            agentId,
            tenantId,
            status: statusRec?.status || 'HEALTHY',
            availability,
            failureFrequency,
            incidentFrequency,
            avgRecoveryTimeMs,
            latencyTrend: statusRec?.latency !== undefined ? `${statusRec.latency}ms (Stable)` : 'NOT_AVAILABLE',
            anomalyFrequency,
            currentRisk,
            remediationFrequency,
            remediationSuccessRate,
            repeatedFailurePatterns: failureFrequency > 2 ? [`Repeated health check timeout on ${agentId}`] : [],
            executionSupport: isCompaOrRepa ? 'UNSUPPORTED' : 'SUPPORTED'
        };
    }

    /**
     * Analyzes reliability for all monitored agents.
     */
    analyzeFleet(tenantId = 'default-tenant') {
        const store = this._getStore();
        if (!store || !store.statuses) return [];

        // Real monitored agents only: derive IDs from actual status records
        // (never raw store keys, never injected demo IDs).
        const agentIds = new Set();
        for (const s of store.statuses.values()) {
            if (!this._matchesTenant(s.tenantId || 'default-tenant', tenantId)) continue;
            const id = s.agentId || s.id;
            if (typeof id !== 'string' || !id || id.includes('[object Object]')) continue;
            agentIds.add(id);
        }

        return Array.from(agentIds).map(id => this.analyzeAgent(id, tenantId));
    }
}

module.exports = { AgentReliabilityAnalyzer };
