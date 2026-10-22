/**
 * Phase 24 — Operator Attention Service
 * Identifies agents and events that require human operator intervention.
 * Provides explicit, evidence-backed reasons rather than arbitrary scoring.
 */

class OperatorAttentionService {
    constructor(options = {}) {
        this.store = options.store || null;
        this.anomalyService = options.anomalyService || null;
        this.riskEngine = options.riskEngine || null;
        this.remediationService = options.remediationService || null;
        this.recurringProblemAnalyzer = options.recurringProblemAnalyzer || null;
    }

    /**
     * Get operator attention evaluation for all monitored agents in a tenant.
     * @param {string} tenantId 
     */
    getOperatorAttention(tenantId = 'default-tenant') {
        const attentionList = [];

        let statuses = [];
        if (this.store && typeof this.store.listStatuses === 'function') {
            try {
                statuses = this.store.listStatuses(tenantId);
            } catch (_) {}
        }

        for (const st of statuses) {
            const evaluation = this.evaluateAgentAttention(st.agentId, tenantId);
            if (evaluation.attentionRequired) {
                attentionList.push(evaluation);
            }
        }

        return {
            tenantId,
            totalAgentsEvaluated: statuses.length,
            agentsRequiringAttentionCount: attentionList.length,
            items: attentionList
        };
    }

    /**
     * Evaluate whether a specific agent requires operator attention and why.
     * @param {string} agentId 
     * @param {string} tenantId 
     */
    evaluateAgentAttention(agentId, tenantId = 'default-tenant') {
        const reasons = [];
        const recommendedActions = [];
        let urgency = 'LOW';

        // 1. Check current status & incidents
        let status = null;
        if (this.store && typeof this.store.getStatus === 'function') {
            try {
                status = this.store.getStatus(agentId, tenantId);
            } catch (_) {}
        }

        let incidents = [];
        if (this.store && typeof this.store.listIncidents === 'function') {
            try {
                incidents = this.store.listIncidents(tenantId, agentId);
            } catch (_) {}
        }

        const activeIncidents = incidents.filter(i => ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(i.status || i.state));
        const criticalIncidents = activeIncidents.filter(i => (i.severity || 'HIGH').toUpperCase() === 'CRITICAL');

        if (criticalIncidents.length > 0) {
            reasons.push(`${criticalIncidents.length} active CRITICAL incident(s) open.`);
            recommendedActions.push('Immediately investigate agent health endpoint and server environment.');
            urgency = 'CRITICAL';
        } else if (activeIncidents.length > 0) {
            reasons.push(`${activeIncidents.length} active incident(s) open.`);
            recommendedActions.push('Review open incident details and verify service connectivity.');
            if (urgency !== 'CRITICAL') urgency = 'HIGH';
        }

        if (status) {
            if (status.currentState === 'OFFLINE' || status.currentState === 'UNHEALTHY') {
                reasons.push(`Agent state is currently ${status.currentState}.`);
                recommendedActions.push('Check network connectivity and endpoint URL accessibility.');
                if (urgency !== 'CRITICAL') urgency = 'HIGH';
            } else if (status.currentState === 'DEGRADED') {
                reasons.push('Agent state is currently DEGRADED.');
                recommendedActions.push('Monitor response times and check for potential downstream dependencies.');
                if (urgency === 'LOW') urgency = 'MEDIUM';
            }

            if (status.consecutiveFailures >= 2) {
                reasons.push(`${status.consecutiveFailures} consecutive health check failures.`);
                if (urgency === 'LOW') urgency = 'MEDIUM';
            }

            if (status.availabilityPercentage < 95.0 && status.totalChecksCount > 5) {
                reasons.push(`Availability declining: currently ${status.availabilityPercentage}%.`);
                recommendedActions.push('Inspect recurring outage patterns and failure history.');
                if (urgency === 'LOW') urgency = 'MEDIUM';
            }
        }

        // 2. Predictive Risk Engine check
        if (this.riskEngine && typeof this.riskEngine.evaluateRisk === 'function') {
            try {
                const riskEval = this.riskEngine.evaluateRisk(agentId, tenantId);
                if (riskEval && (riskEval.riskLevel === 'HIGH' || riskEval.riskLevel === 'CRITICAL')) {
                    reasons.push(`High predictive risk detected: Level ${riskEval.riskLevel} (${riskEval.riskScore || 0}/100).`);
                    recommendedActions.push('Review predictive risk factors before an outage occurs.');
                    if (urgency !== 'CRITICAL' && riskEval.riskLevel === 'CRITICAL') urgency = 'CRITICAL';
                    else if (urgency === 'LOW') urgency = 'HIGH';
                }
            } catch (_) {}
        }

        // 3. Anomalies check
        if (this.anomalyService && typeof this.anomalyService.getAnomaliesForAgent === 'function') {
            try {
                const anomalies = this.anomalyService.getAnomaliesForAgent(agentId, tenantId);
                const activeAnomalies = anomalies.filter(a => a.status === 'ACTIVE' || !a.resolved);
                if (activeAnomalies.length > 0) {
                    reasons.push(`${activeAnomalies.length} active anomaly/anomalies detected.`);
                    recommendedActions.push('Inspect baseline anomaly details for abnormal metric spikes.');
                    if (urgency === 'LOW') urgency = 'MEDIUM';
                }
            } catch (_) {}
        }

        // 4. Remediation history check
        if (this.remediationService) {
            let remediations = [];
            if (typeof this.remediationService.getExecutionHistory === 'function') {
                try {
                    remediations = this.remediationService.getExecutionHistory({ systemId: agentId });
                } catch (_) {}
            } else if (this.remediationService.store && typeof this.remediationService.store.listExecutions === 'function') {
                try {
                    remediations = this.remediationService.store.listExecutions({ systemId: agentId });
                } catch (_) {}
            }

            const failedRems = remediations.filter(r => r.status === 'FAILED' || r.success === false);
            if (failedRems.length > 0) {
                reasons.push(`${failedRems.length} recent remediation attempt(s) failed.`);
                recommendedActions.push('Review the agent control interface and remediation logs because automated recovery is failing.');
                if (urgency !== 'CRITICAL') urgency = 'HIGH';
            } else if (remediations.length >= 3) {
                reasons.push(`Remediation executed ${remediations.length} times recently.`);
                recommendedActions.push('Investigate root cause of frequent self-healing triggers.');
                if (urgency === 'LOW') urgency = 'MEDIUM';
            }
        }

        // 5. Recurring problems check
        if (this.recurringProblemAnalyzer && typeof this.recurringProblemAnalyzer.analyzeAgentProblems === 'function') {
            try {
                const problems = this.recurringProblemAnalyzer.analyzeAgentProblems(agentId, tenantId);
                if (problems.length > 0) {
                    reasons.push(`${problems.length} recurring operational problem pattern(s) identified.`);
                    recommendedActions.push('Address recurring failure patterns in the agent service architecture.');
                    if (urgency === 'LOW') urgency = 'MEDIUM';
                }
            } catch (_) {}
        }

        const attentionRequired = reasons.length > 0;

        if (!attentionRequired) {
            reasons.push('Agent is operating within normal baseline parameters.');
            recommendedActions.push('Continue standard monitoring — no operator intervention required.');
        }

        return {
            agentId,
            tenantId,
            attentionRequired,
            urgency: attentionRequired ? urgency : 'NONE',
            reasons,
            recommendedActions: Array.from(new Set(recommendedActions))
        };
    }
}

module.exports = { OperatorAttentionService };
