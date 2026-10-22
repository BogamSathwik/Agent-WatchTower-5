/**
 * WorkflowStep Model
 * Represents a discrete, domain-agnostic step in an automated workflow.
 */

const STEP_TYPES = Object.freeze({
    HEALTH_CHECK: 'HEALTH_CHECK',
    CAPABILITY_DISCOVERY: 'CAPABILITY_DISCOVERY',
    AGENT_EXECUTION: 'AGENT_EXECUTION',
    VALIDATION: 'VALIDATION',
    REASONING: 'REASONING',
    TOOL_CALL: 'TOOL_CALL',
    MCP_TOOL_CALL: 'MCP_TOOL_CALL',
    CONDITION: 'CONDITION',
    TRANSFORM: 'TRANSFORM',
    ALERT: 'ALERT',
    REPORT: 'REPORT',
    WAIT: 'WAIT',
    CUSTOM_CAPABILITY: 'CUSTOM_CAPABILITY',
    AGENT_ACTION: 'AGENT_ACTION',
    SYSTEM_ACTION: 'SYSTEM_ACTION',
    DELAY: 'DELAY',
    APPROVAL: 'APPROVAL',
    VERIFICATION: 'VERIFICATION',
    REMEDIATION: 'REMEDIATION',
    NOTIFICATION: 'NOTIFICATION'
});

class WorkflowStep {
    constructor(raw = {}) {
        this.id = raw.id ? String(raw.id).trim() : `step_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        this.name = raw.name ? String(raw.name).trim() : this.id;
        this.type = raw.type && (Object.values(STEP_TYPES).includes(raw.type) || Object.keys(STEP_TYPES).includes(raw.type))
            ? String(raw.type).toUpperCase()
            : STEP_TYPES.SYSTEM_ACTION;
        this.target = raw.target ? String(raw.target).trim() : (raw.agentId ? String(raw.agentId).trim() : '');
        this.agentId = raw.agentId ? String(raw.agentId).trim() : (raw.target || '');
        this.action = raw.action ? String(raw.action).trim() : (raw.operation || 'execute');
        this.parameters = typeof raw.parameters === 'object' && raw.parameters !== null ? raw.parameters : {};
        this.inputSchema = typeof raw.inputSchema === 'object' && raw.inputSchema !== null ? raw.inputSchema : {};
        this.outputMapping = typeof raw.outputMapping === 'object' && raw.outputMapping !== null ? raw.outputMapping : {};
        this.dependsOn = Array.isArray(raw.dependsOn) ? raw.dependsOn : (Array.isArray(raw.dependencies) ? raw.dependencies : []);

        // Branching conditions
        this.conditions = typeof raw.conditions === 'object' && raw.conditions !== null ? raw.conditions : null;

        // Step-level retry policy
        const retry = typeof raw.retryPolicy === 'object' && raw.retryPolicy !== null ? raw.retryPolicy : {};
        this.retryPolicy = {
            maxAttempts: Math.max(1, Math.min(Number(retry.maxAttempts) || 1, 10)),
            backoffMs: Math.max(0, Number(retry.backoffMs) || 500),
            backoffMultiplier: Math.max(1, Number(retry.backoffMultiplier) || 2),
            maxBackoffMs: Math.max(1000, Number(retry.maxBackoffMs) || 30000)
        };

        this.timeout = Math.max(1, Number(raw.timeout || raw.timeoutMs) || 30000);
        this.continueOnFailure = Boolean(raw.continueOnFailure ?? false);

        // Post-step verification
        this.verification = typeof raw.verification === 'object' && raw.verification !== null ? raw.verification : null;

        this.metadata = typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            target: this.target,
            agentId: this.agentId,
            action: this.action,
            parameters: this.parameters,
            inputSchema: this.inputSchema,
            outputMapping: this.outputMapping,
            dependsOn: this.dependsOn,
            conditions: this.conditions,
            retryPolicy: this.retryPolicy,
            timeout: this.timeout,
            continueOnFailure: this.continueOnFailure,
            verification: this.verification,
            metadata: this.metadata
        };
    }
}

module.exports = {
    WorkflowStep,
    STEP_TYPES
};
