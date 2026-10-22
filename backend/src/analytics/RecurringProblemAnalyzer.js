/**
 * Phase 24 — Recurring Problem Analyzer
 * Detects recurring operational patterns (repeated latency, offline, failed remediation, recurring anomalies).
 * Generates structured problem reports with human-readable evidence.
 */

class RecurringProblemAnalyzer {
    constructor(options = {}) {
        this.store = options.store || null;
        this.anomalyService = options.anomalyService || null;
        this.remediationService = options.remediationService || null;
    }

    /**
     * Analyze recurring problems for a tenant (or specific agent).
     * @param {string} tenantId 
     * @param {string|null} targetAgentId 
     */
    analyzeRecurringProblems(tenantId = 'default-tenant', targetAgentId = null) {
        const recurringProblems = [];

        // Determine list of agents to inspect
        let agentIds = [];
        if (targetAgentId) {
            agentIds = [targetAgentId];
        } else if (this.store && typeof this.store.listStatuses === 'function') {
            try {
                const statuses = this.store.listStatuses(tenantId);
                agentIds = statuses.map(s => s.agentId);
            } catch (_) {}
        }

        for (const agentId of agentIds) {
            const problems = this.analyzeAgentProblems(agentId, tenantId);
            recurringProblems.push(...problems);
        }

        return recurringProblems;
    }

    /**
     * Analyze recurring problems for a specific agent.
     * @param {string} agentId 
     * @param {string} tenantId 
     */
    analyzeAgentProblems(agentId, tenantId = 'default-tenant') {
        const problems = [];
        if (!this.store) return problems;

        // Fetch history
        let historyResult;
        try {
            historyResult = this.store.getAgentHistoryByRange(agentId, '7d', tenantId);
        } catch (_) {
            historyResult = { records: [] };
        }
        const records = (historyResult && historyResult.records) ? historyResult.records : [];

        // Fetch incidents
        let incidents = [];
        try {
            incidents = this.store.listIncidents(tenantId, agentId);
        } catch (_) {}

        // Fetch anomalies
        let anomalies = [];
        if (this.anomalyService && typeof this.anomalyService.getAnomaliesForAgent === 'function') {
            try {
                anomalies = this.anomalyService.getAnomaliesForAgent(agentId, tenantId);
            } catch (_) {}
        }

        // Fetch remediations
        let remediations = [];
        if (this.remediationService && typeof this.remediationService.getExecutionHistory === 'function') {
            try {
                remediations = this.remediationService.getExecutionHistory({ systemId: agentId });
            } catch (_) {}
        } else if (this.remediationService && this.remediationService.store && typeof this.remediationService.store.listExecutions === 'function') {
            try {
                remediations = this.remediationService.store.listExecutions({ systemId: agentId });
            } catch (_) {}
        }

        // 1. Repeated Latency Degradation
        const slowChecks = records.filter(r => (r.responseTimeMs || 0) > 1500);
        const latencyAnomalies = anomalies.filter(a => a.type === 'LATENCY_SPIKE' || a.anomalyType === 'LATENCY_SPIKE');
        if (slowChecks.length >= 2 || latencyAnomalies.length >= 2) {
            const relatedIncidents = incidents.filter(i => i.type === 'LATENCY_DEGRADATION' || i.trigger === 'SLOW_RESPONSE').map(i => i.id);
            const relatedAnomalyIds = latencyAnomalies.map(a => a.anomalyId || a.id).filter(Boolean);
            const timestamps = [...slowChecks.map(c => c.timestamp), ...latencyAnomalies.map(a => a.timestamp)].filter(Boolean).sort();
            
            problems.push({
                problemId: `RP_LATENCY_${agentId}_${Date.now()}`,
                agentId,
                tenantId,
                problemType: 'REPEATED_LATENCY_DEGRADATION',
                occurrences: Math.max(slowChecks.length, latencyAnomalies.length),
                firstDetectedAt: timestamps[0] || new Date().toISOString(),
                lastDetectedAt: timestamps[timestamps.length - 1] || new Date().toISOString(),
                relatedIncidentIds: Array.from(new Set(relatedIncidents)),
                relatedAnomalyIds: Array.from(new Set(relatedAnomalyIds)),
                relatedRemediationIds: [],
                evidence: [
                    `${slowChecks.length} checks exceeded 1500 ms latency threshold.`,
                    `${latencyAnomalies.length} latency anomalies detected.`
                ],
                humanReadableSummary: `Latency degradation has occurred repeatedly (${Math.max(slowChecks.length, latencyAnomalies.length)} times) during the selected period.`
            });
        }

        // 2. Repeated Offline Incidents / Availability Degradation
        const offlineIncidents = incidents.filter(i => i.type === 'AGENT_OFFLINE' || i.type === 'HEALTH_FAILURE' || i.state === 'OPEN' || i.status === 'OPEN');
        const offlineChecks = records.filter(r => r.healthState === 'OFFLINE' || r.success === false);
        if (offlineIncidents.length >= 2 || offlineChecks.length >= 3) {
            const relatedIncidentIds = offlineIncidents.map(i => i.id);
            const timestamps = offlineIncidents.map(i => i.startedAt).filter(Boolean).sort();

            problems.push({
                problemId: `RP_OFFLINE_${agentId}_${Date.now()}`,
                agentId,
                tenantId,
                problemType: 'REPEATED_OFFLINE_INCIDENTS',
                occurrences: Math.max(offlineIncidents.length, offlineChecks.length),
                firstDetectedAt: timestamps[0] || new Date().toISOString(),
                lastDetectedAt: timestamps[timestamps.length - 1] || new Date().toISOString(),
                relatedIncidentIds: Array.from(new Set(relatedIncidentIds)),
                relatedAnomalyIds: [],
                relatedRemediationIds: [],
                evidence: [
                    `${offlineIncidents.length} offline/health incidents recorded.`,
                    `${offlineChecks.length} failed health check samples.`
                ],
                humanReadableSummary: `Availability degradation has occurred repeatedly (${offlineIncidents.length} incidents recorded).`
            });
        }

        // 3. Repeated Remediation Executions
        if (remediations.length >= 2) {
            const failedRems = remediations.filter(r => r.status === 'FAILED' || r.success === false);
            const relatedRemIds = remediations.map(r => r.executionId || r.id).filter(Boolean);
            const timestamps = remediations.map(r => r.timestamp || r.startedAt).filter(Boolean).sort();

            const problemType = failedRems.length > 0 ? 'REPEATED_REMEDIATION_FAILURE' : 'REPEATED_REMEDIATION';
            problems.push({
                problemId: `RP_REMEDIATION_${agentId}_${Date.now()}`,
                agentId,
                tenantId,
                problemType,
                occurrences: remediations.length,
                firstDetectedAt: timestamps[0] || new Date().toISOString(),
                lastDetectedAt: timestamps[timestamps.length - 1] || new Date().toISOString(),
                relatedIncidentIds: [],
                relatedAnomalyIds: [],
                relatedRemediationIds: Array.from(new Set(relatedRemIds)),
                evidence: [
                    `${remediations.length} remediation attempts executed for ${agentId}.`,
                    `${failedRems.length} remediation attempts failed.`
                ],
                humanReadableSummary: failedRems.length > 0
                    ? `Remediation has been triggered repeatedly and experienced ${failedRems.length} failures.`
                    : `Remediation has been triggered ${remediations.length} times in recent activity.`
            });
        }

        return problems;
    }
}

module.exports = { RecurringProblemAnalyzer };
