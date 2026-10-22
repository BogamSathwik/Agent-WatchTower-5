/**
 * WorkflowToOrchestrationAdapter
 * Compiles a high-level Agent Workflow into an OrchestrationPlan for execution
 * by the existing OrchestrationEngine without duplicating engine logic.
 */

const OrchestrationPlan = require('../orchestration/OrchestrationPlan');
const OrchestrationStep = require('../orchestration/OrchestrationStep');
const { EXECUTION_MODES, FAILURE_POLICIES, TARGET_MODES } = require('../orchestration/OrchestrationStates');

function mapStepTypeToOrchestration(type) {
    const t = String(type || 'HEALTH').toUpperCase();
    if (t === 'HEALTH_CHECK' || t === 'HEALTH' || t === 'CAPABILITY_DISCOVERY') return 'HEALTH';
    if (t === 'VALIDATION' || t === 'VERIFICATION' || t === 'QUALITY') return 'QUALITY';
    if (t === 'ALERT' || t === 'NOTIFICATION') return 'ALERT';
    if (t === 'REPORT') return 'REPORT';
    if (t === 'REASONING' || t === 'INTELLIGENCE') return 'INTELLIGENCE';
    if (t === 'USAGE') return 'USAGE';
    return 'HEALTH';
}

class WorkflowToOrchestrationAdapter {
    static compileWorkflowToPlan(workflow) {
        if (!workflow) throw new Error('Workflow is required for compilation');

        const planId = `plan_compiled_${workflow.id || Date.now()}`;
        const steps = (workflow.steps || []).map(step => {
            const stepId = step.id || `step_${Date.now()}`;
            const stepName = step.name || stepId;
            const stepType = mapStepTypeToOrchestration(step.type);
            const stepTarget = step.target || step.agentId || workflow.agentId || 'GLOBAL';
            const stepAction = step.action || step.operation || 'execute';

            const stepDeps = Array.isArray(step.dependsOn)
                ? step.dependsOn
                : (Array.isArray(step.dependencies) ? step.dependencies : []);

            return new OrchestrationStep({
                id: stepId,
                name: stepName,
                type: stepType,
                target: stepTarget,
                action: stepAction,
                parameters: {
                    ...(step.parameters || {}),
                    ...(step.inputSchema ? { inputSchema: step.inputSchema } : {}),
                    ...(step.verification ? { verification: step.verification } : {}),
                    ...(step.conditions ? { conditions: step.conditions } : {})
                },
                dependsOn: stepDeps,
                retryPolicy: step.retryPolicy || { maxAttempts: 1, backoffMs: 1000 },
                timeout: step.timeout || 30000,
                continueOnFailure: step.continueOnFailure ?? false
            });
        });

        const failurePolicy = workflow.failurePolicy
            ? String(workflow.failurePolicy).toUpperCase()
            : FAILURE_POLICIES.CONTINUE_AND_MARK_PARTIAL;

        return new OrchestrationPlan({
            id: planId,
            name: workflow.name || `Plan for ${workflow.id}`,
            description: workflow.description || '',
            enabled: workflow.enabled !== false,
            targets: workflow.agentId ? [workflow.agentId] : [],
            targetMode: workflow.agentId ? TARGET_MODES.SYSTEMS : TARGET_MODES.ALL_ACTIVE,
            steps,
            executionMode: EXECUTION_MODES.DEPENDENCY_AWARE,
            failurePolicy: Object.values(FAILURE_POLICIES).includes(failurePolicy) ? failurePolicy : FAILURE_POLICIES.CONTINUE_AND_MARK_PARTIAL,
            timeoutMs: (workflow.timeoutPolicy && workflow.timeoutPolicy.maxWorkflowTimeoutMs) || workflow.timeout || 300000,
            concurrencyLimit: 5,
            schedule: {
                enabled: Boolean(workflow.trigger && workflow.trigger.enabled && workflow.trigger.type === 'SCHEDULE'),
                intervalMs: workflow.trigger ? workflow.trigger.intervalMs : null,
                cron: workflow.trigger ? workflow.trigger.cron : null
            }
        });
    }
}

module.exports = WorkflowToOrchestrationAdapter;
