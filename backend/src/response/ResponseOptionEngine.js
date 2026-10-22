/**
 * Phase 29 — Response Option Engine
 * Identifies available operational response options based on target agent capabilities,
 * incident state, telemetry evidence, and supported platform remediation mechanisms.
 * Truthfully marks execution as UNSUPPORTED for external agents (Compa, Repa).
 */

class ResponseOptionEngine {
    constructor(options = {}) {
        this.remediationService = options.remediationService || null;
        this.workflowOrchestrator = options.workflowOrchestrator || null;
    }

    /**
     * Determines whether an agent is an external agent with unsupported execution capabilities (Compa / Repa).
     */
    isExecutionUnsupported(agentId = '', agentProfile = null) {
        if (!agentId) return false;
        const normalizedId = String(agentId).toLowerCase();
        
        if (normalizedId.includes('compa') || normalizedId.includes('repa')) {
            return true;
        }

        if (agentProfile && agentProfile.endpoints && agentProfile.endpoints.execution && agentProfile.endpoints.execution.enabled === false) {
            return true;
        }

        return false;
    }

    /**
     * Generates available response options for an agent and problem context.
     */
    generateOptions(context = {}) {
        const { agentId, incident, problemSummary, agentProfile, tenantId } = context;
        const unsupported = this.isExecutionUnsupported(agentId, agentProfile);

        const options = [];

        // 1. Informational & Diagnostic Actions (Always available and SAFE for all agents including Compa / Repa)
        options.push({
            optionId: `opt_inspect_health_${Date.now()}_1`,
            actionType: 'INSPECT_HEALTH',
            title: 'Inspect Health & Status Checks',
            description: 'Analyze real-time health checks, error rates, and availability state.',
            executionSupported: true,
            requiresApproval: false,
            riskLevel: 'NONE',
            actionPayload: { agentId, targetView: 'AGENT_360_HEALTH' }
        });

        options.push({
            optionId: `opt_inspect_timeline_${Date.now()}_2`,
            actionType: 'INSPECT_TIMELINE',
            title: 'Inspect Telemetry & Incident Timeline',
            description: 'Review chronological events, telemetry metrics, and alert triggers.',
            executionSupported: true,
            requiresApproval: false,
            riskLevel: 'NONE',
            actionPayload: { agentId, incidentId: incident?.incidentId, targetView: 'TIMELINE' }
        });

        options.push({
            optionId: `opt_inspect_deps_${Date.now()}_3`,
            actionType: 'INSPECT_DEPENDENCIES',
            title: 'Inspect Upstream & Downstream Topology',
            description: 'Analyze dependency impact, blast radius, and root-cause propagation.',
            executionSupported: true,
            requiresApproval: false,
            riskLevel: 'NONE',
            actionPayload: { agentId, targetView: 'DEPENDENCY_GRAPH' }
        });

        options.push({
            optionId: `opt_inspect_evidence_${Date.now()}_4`,
            actionType: 'INSPECT_EVIDENCE',
            title: 'Inspect Diagnostic Evidence Chain',
            description: 'Gather verified evidence chains and root-cause context.',
            executionSupported: true,
            requiresApproval: false,
            riskLevel: 'NONE',
            actionPayload: { agentId, incidentId: incident?.incidentId, targetView: 'EVIDENCE_CHAIN' }
        });

        // 2. Stateful & Remediation Actions
        if (unsupported) {
            options.push({
                optionId: `opt_unsupported_remediation_${Date.now()}_5`,
                actionType: 'EXECUTE_REMEDIATION',
                title: 'Automated Remediation / Agent Restart',
                description: 'Stateful execution and automated remediation are UNSUPPORTED for external agent Compa/Repa.',
                executionSupported: false,
                requiresApproval: true,
                riskLevel: 'UNSUPPORTED',
                unsupportedReason: 'External agent contract has execution endpoints disabled.',
                actionPayload: { agentId }
            });

            options.push({
                optionId: `opt_unsupported_workflow_${Date.now()}_6`,
                actionType: 'EXECUTE_WORKFLOW',
                title: 'Multi-Step Recovery Workflow',
                description: 'Workflow execution is UNSUPPORTED for external agent Compa/Repa.',
                executionSupported: false,
                requiresApproval: true,
                riskLevel: 'UNSUPPORTED',
                unsupportedReason: 'External agent contract does not support automated workflow execution.',
                actionPayload: { agentId }
            });
        } else {
            options.push({
                optionId: `opt_execute_remediation_${Date.now()}_5`,
                actionType: 'EXECUTE_REMEDIATION',
                title: 'Execute Automated Health Recovery',
                description: 'Run targeted agent health recovery script / restart protocol.',
                executionSupported: true,
                requiresApproval: true,
                riskLevel: 'MEDIUM',
                actionPayload: { agentId, actionName: 'RESTART_HEALTH_PROTOCOL' }
            });

            options.push({
                optionId: `opt_execute_workflow_${Date.now()}_6`,
                actionType: 'EXECUTE_WORKFLOW',
                title: 'Orchestrate Multi-Step Failover Workflow',
                description: 'Trigger policy-driven automated failover and dependency isolation workflow.',
                executionSupported: true,
                requiresApproval: true,
                riskLevel: 'HIGH',
                actionPayload: { agentId, workflowId: 'wf_failover_recovery' }
            });
        }

        // 3. Escalation & Operator Decisions
        options.push({
            optionId: `opt_escalate_operator_${Date.now()}_7`,
            actionType: 'ESCALATE_OPERATOR',
            title: 'Escalate to On-Call Operator',
            description: 'Mark problem as requiring manual operator intervention and oversight.',
            executionSupported: true,
            requiresApproval: false,
            riskLevel: 'LOW',
            actionPayload: { agentId, incidentId: incident?.incidentId }
        });

        options.push({
            optionId: `opt_wait_recovery_${Date.now()}_8`,
            actionType: 'WAIT_FOR_RECOVERY',
            title: 'Monitor & Wait for Natural Recovery',
            description: 'Keep under observation without active intervention for baseline stabilization.',
            executionSupported: true,
            requiresApproval: false,
            riskLevel: 'LOW',
            actionPayload: { agentId, observationWindowMs: 300000 }
        });

        return options;
    }
}

module.exports = { ResponseOptionEngine };
