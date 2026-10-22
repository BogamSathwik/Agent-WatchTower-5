/**
 * ExternalAgentWorkflowFactory
 * Creates a domain-agnostic automated workflow definition for monitoring external agents.
 * Integrates with existing AgentWorkflow, WorkflowToOrchestrationAdapter, and OrchestrationEngine.
 */

const { AgentWorkflow } = require('./AgentWorkflow');
const { STEP_TYPES } = require('./WorkflowStep');

class ExternalAgentWorkflowFactory {
    static createExternalMonitoringWorkflow(agentId, agentName = '') {
        const id = `wf_ext_mon_${agentId}_${Date.now()}`;
        const name = `External Agent Automated Monitoring Flow: ${agentName || agentId}`;

        return new AgentWorkflow({
            id,
            name,
            description: `8-step automated observability workflow for external agent ${agentName || agentId}`,
            version: '1.0.0',
            agentId,
            steps: [
                {
                    id: 'step_connect',
                    name: 'Connectivity Check',
                    type: STEP_TYPES.HEALTH_CHECK,
                    target: agentId,
                    timeoutMs: 5000,
                    retryConfig: { maxRetries: 2 }
                },
                {
                    id: 'step_health',
                    name: 'Health Check',
                    type: STEP_TYPES.HEALTH_CHECK,
                    target: agentId,
                    dependsOn: ['step_connect']
                },
                {
                    id: 'step_capability',
                    name: 'Capability Discovery',
                    type: STEP_TYPES.CAPABILITY_DISCOVERY,
                    target: agentId,
                    dependsOn: ['step_health']
                },
                {
                    id: 'step_status',
                    name: 'Status Check',
                    type: STEP_TYPES.HEALTH_CHECK,
                    target: agentId,
                    dependsOn: ['step_capability']
                },
                {
                    id: 'step_exec_opt',
                    name: 'Optional Execution Test',
                    type: STEP_TYPES.AGENT_ACTION,
                    target: agentId,
                    continueOnFailure: true,
                    dependsOn: ['step_status']
                },
                {
                    id: 'step_validate',
                    name: 'Validate Result',
                    type: STEP_TYPES.VALIDATION,
                    target: agentId,
                    dependsOn: ['step_exec_opt']
                },
                {
                    id: 'step_reason',
                    name: 'Reasoning Analysis',
                    type: STEP_TYPES.REASONING,
                    target: agentId,
                    dependsOn: ['step_validate']
                },
                {
                    id: 'step_report',
                    name: 'Generate Human-readable Report',
                    type: STEP_TYPES.REPORT,
                    target: agentId,
                    dependsOn: ['step_reason']
                }
            ]
        });
    }
}

module.exports = { ExternalAgentWorkflowFactory };
