/**
 * Operator Attention Engine
 * Evaluates existing platform records (incidents, health, risks, anomalies, remediations,
 * automations, dependencies, availability) to generate prioritized attention items for operators.
 * 
 * Does NOT invent facts or make unsupported recommendations.
 */

class OperatorAttentionEngine {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService;
        this.agentRegistry = options.agentRegistry;
        this.riskEngine = options.riskEngine;
        this.anomalyService = options.anomalyService;
        this.remediationService = options.remediationService;
        this.automationDecisionService = options.decisionService;
        this.dependencyService = options.dependencyService;
        this.store = options.store || (this.monitoringService ? this.monitoringService.store : null);
    }

    _getAgents(tenantId) {
        if (this.store && this.store.statuses) {
            const list = Array.from(this.store.statuses.values())
                .filter(s => s.tenantId === tenantId || tenantId === 'all');
            if (list.length > 0) return list;
        }
        if (this.agentRegistry && typeof this.agentRegistry.getAllAgents === 'function') {
            return this.agentRegistry.getAllAgents(tenantId) || [];
        }
        return [];
    }

    /**
     * Evaluate system state and generate attention items
     * @param {Object} options
     * @returns {Array<Object>} List of attention items
     */
    evaluateAttentionItems(options = {}) {
        const tenantId = options.tenantId || 'default';
        const attentionItems = [];

        if (!this.store) {
            return attentionItems;
        }

        // 1. Critical and Active Incidents
        const activeIncidents = typeof this.store.getActiveIncidents === 'function'
            ? this.store.getActiveIncidents(tenantId)
            : (this.store.incidents ? Array.from(this.store.incidents.values()).filter(i => (i.tenantId === tenantId || tenantId === 'all') && i.status !== 'RESOLVED' && i.status !== 'RECOVERED') : []);

        for (const inc of activeIncidents) {
            const isCritical = inc.severity === 'CRITICAL' || inc.severity === 'HIGH';
            attentionItems.push({
                attentionId: `ATT-INC-${inc.incidentId || inc.id}`,
                type: isCritical ? 'CRITICAL_INCIDENT' : 'INVESTIGATION_REQUIRED',
                severity: inc.severity || 'HIGH',
                agentId: inc.agentId,
                incidentId: inc.incidentId || inc.id,
                title: `Active Incident: ${inc.title || inc.incidentId || inc.id}`,
                humanReadableSummary: `Incident on ${inc.agentId} (${inc.type || 'HEALTH_FAILURE'}) requires investigation and response.`,
                evidence: [
                    `Incident ID: ${inc.incidentId || inc.id}`,
                    `Trigger: ${inc.triggerType || inc.type || 'HEALTH_CHECK'}`,
                    `Current Status: ${inc.status}`
                ],
                sourceRecordIds: [inc.incidentId || inc.id],
                createdAt: inc.createdAt || new Date().toISOString(),
                updatedAt: inc.updatedAt || new Date().toISOString(),
                status: 'OPEN',
                recommendedOperatorAction: 'Inspect incident timeline, root cause candidates, and execute recovery workflow if needed.'
            });
        }

        // 2. Degraded and Offline Agents
        const agents = this._getAgents(tenantId);

        for (const agent of agents) {
            const agentId = agent.agentId || agent.id;
            const healthStatus = (agent.status || agent.healthStatus || agent.currentState || 'UNKNOWN').toUpperCase();

            if (healthStatus === 'OFFLINE') {
                attentionItems.push({
                    attentionId: `ATT-OFF-${agentId}`,
                    type: 'AGENT_OFFLINE',
                    severity: 'CRITICAL',
                    agentId,
                    incidentId: null,
                    title: `Agent Offline: ${agentId}`,
                    humanReadableSummary: `Agent ${agentId} is currently OFFLINE and failing health probes.`,
                    evidence: [
                        `Status: ${healthStatus}`,
                        `Last Checked: ${agent.lastChecked || 'N/A'}`
                    ],
                    sourceRecordIds: [agentId],
                    createdAt: agent.updatedAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    status: 'OPEN',
                    recommendedOperatorAction: 'Check agent endpoint connectivity, review recent alerts, and run health diagnostics.'
                });
            } else if (healthStatus === 'DEGRADED') {
                attentionItems.push({
                    attentionId: `ATT-DEG-${agentId}`,
                    type: 'AGENT_DEGRADED',
                    severity: 'MEDIUM',
                    agentId,
                    incidentId: null,
                    title: `Agent Degraded: ${agentId}`,
                    humanReadableSummary: `Agent ${agentId} is experiencing latency or error rate degradation.`,
                    evidence: [
                        `Status: ${healthStatus}`,
                        `Last Latency: ${agent.metrics?.latencyMs || agent.latencyMs || 'N/A'}ms`
                    ],
                    sourceRecordIds: [agentId],
                    createdAt: agent.updatedAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    status: 'OPEN',
                    recommendedOperatorAction: 'Review agent metrics, latency trends, and upstream/downstream dependency impact.'
                });
            }
        }

        // 3. High Risk Agents
        if (this.riskEngine && typeof this.riskEngine.getRiskScores === 'function') {
            const riskScores = this.riskEngine.getRiskScores(tenantId);
            for (const [agentId, risk] of Object.entries(riskScores)) {
                if (risk && (risk.level === 'HIGH' || risk.level === 'CRITICAL' || risk.score >= 0.7)) {
                    const existing = attentionItems.find(a => a.agentId === agentId && a.severity === 'CRITICAL');
                    if (!existing) {
                        attentionItems.push({
                            attentionId: `ATT-RISK-${agentId}`,
                            type: 'HIGH_RISK',
                            severity: 'HIGH',
                            agentId,
                            incidentId: null,
                            title: `High Risk Detected: ${agentId}`,
                            humanReadableSummary: `Predictive risk score for ${agentId} elevated to ${risk.level || 'HIGH'} (${(risk.score * 100).toFixed(0)}%).`,
                            evidence: risk.reasons || [`Risk score: ${risk.score}`],
                            sourceRecordIds: [agentId],
                            createdAt: risk.updatedAt || new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            status: 'OPEN',
                            recommendedOperatorAction: 'Analyze predictive baseline metrics and evaluate pre-emptive remediation.'
                        });
                    }
                }
            }
        }

        // 4. Pending Automation Approvals
        if (this.automationDecisionService && typeof this.automationDecisionService.getPendingDecisions === 'function') {
            const pendingDecisions = this.automationDecisionService.getPendingDecisions(tenantId);
            for (const dec of pendingDecisions) {
                attentionItems.push({
                    attentionId: `ATT-APPR-${dec.decisionId}`,
                    type: 'AUTOMATION_REQUIRES_APPROVAL',
                    severity: 'MEDIUM',
                    agentId: dec.agentId,
                    incidentId: dec.incidentId || null,
                    title: `Automation Approval Required: ${dec.action || dec.policyName || dec.decisionId}`,
                    humanReadableSummary: `Automation policy decision ${dec.decisionId} requires manual operator approval before execution.`,
                    evidence: [
                        `Policy: ${dec.policyId || dec.policyName}`,
                        `Target Agent: ${dec.agentId}`,
                        `Action: ${dec.action}`
                    ],
                    sourceRecordIds: [dec.decisionId],
                    createdAt: dec.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    status: 'PENDING',
                    recommendedOperatorAction: 'Approve or reject the pending automation policy action.'
                });
            }
        }

        // 5. Active and Failed Remediations
        if (this.store && this.store.remediations) {
            const remediations = Array.from(this.store.remediations.values()).filter(r => r.tenantId === tenantId || tenantId === 'all');
            for (const rem of remediations) {
                if (rem.status === 'FAILED') {
                    attentionItems.push({
                        attentionId: `ATT-REMFAIL-${rem.remediationId || rem.id}`,
                        type: 'FAILED_REMEDIATION',
                        severity: 'HIGH',
                        agentId: rem.agentId,
                        incidentId: rem.incidentId || null,
                        title: `Remediation Failed: ${rem.remediationId || rem.id}`,
                        humanReadableSummary: `Automated remediation action ${rem.action || rem.type} on ${rem.agentId} failed execution or verification.`,
                        evidence: [
                            `Action: ${rem.action || rem.type}`,
                            `Error: ${rem.error || rem.result?.error || 'Verification check failed'}`
                        ],
                        sourceRecordIds: [rem.remediationId || rem.id],
                        createdAt: rem.createdAt || new Date().toISOString(),
                        updatedAt: rem.updatedAt || new Date().toISOString(),
                        status: 'OPEN',
                        recommendedOperatorAction: 'Review remediation logs and execute manual recovery or failover procedure.'
                    });
                } else if (rem.status === 'IN_PROGRESS' || rem.status === 'EXECUTING') {
                    attentionItems.push({
                        attentionId: `ATT-REMACT-${rem.remediationId || rem.id}`,
                        type: 'ACTIVE_REMEDIATION',
                        severity: 'INFO',
                        agentId: rem.agentId,
                        incidentId: rem.incidentId || null,
                        title: `Active Remediation: ${rem.action || rem.type}`,
                        humanReadableSummary: `Remediation action is currently executing for ${rem.agentId}.`,
                        evidence: [
                            `Status: ${rem.status}`,
                            `Started: ${rem.createdAt}`
                        ],
                        sourceRecordIds: [rem.remediationId || rem.id],
                        createdAt: rem.createdAt || new Date().toISOString(),
                        updatedAt: rem.updatedAt || new Date().toISOString(),
                        status: 'IN_PROGRESS',
                        recommendedOperatorAction: 'Monitor execution progress and post-remediation health verification.'
                    });
                }
            }
        }

        // Sort by severity (CRITICAL > HIGH > MEDIUM > INFO) then timestamp
        const severityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, INFO: 1 };
        attentionItems.sort((a, b) => {
            const wDiff = (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
            if (wDiff !== 0) return wDiff;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        return attentionItems;
    }
}

module.exports = { OperatorAttentionEngine };
