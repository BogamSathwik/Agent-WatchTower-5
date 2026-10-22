/**
 * WorkflowTrigger Model
 * Defines automated or manual triggers for agent workflows.
 * Purely domain-agnostic.
 */

class WorkflowTrigger {
    constructor(raw = {}) {
        this.type = raw.type ? String(raw.type).toUpperCase() : 'MANUAL'; // MANUAL, EVENT, SCHEDULE, AGENT_STATE, REASONING
        this.eventType = raw.eventType ? String(raw.eventType) : null;
        this.systemId = raw.systemId ? String(raw.systemId) : null;
        this.agentId = raw.agentId ? String(raw.agentId) : null;
        this.cron = raw.cron ? String(raw.cron) : null;
        this.intervalMs = Number(raw.intervalMs) || null;
        this.enabled = Boolean(raw.enabled ?? true);
        this.metadata = typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
    }

    toJSON() {
        return {
            type: this.type,
            eventType: this.eventType,
            systemId: this.systemId,
            agentId: this.agentId,
            cron: this.cron,
            intervalMs: this.intervalMs,
            enabled: this.enabled,
            metadata: this.metadata
        };
    }
}

module.exports = { WorkflowTrigger };
