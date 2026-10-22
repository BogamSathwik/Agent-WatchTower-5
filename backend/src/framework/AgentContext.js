/**
 * AgentContext Model
 * Holds operational state, configuration parameters, headers, and tenant scope for an agent instance.
 */

class AgentContext {
    constructor(raw = {}) {
        this.agentId = raw.agentId || 'unknown';
        this.tenantId = raw.tenantId || 'global';
        this.correlationId = raw.correlationId || `corr_${Date.now()}`;
        this.actor = raw.actor || 'system';
        this.role = raw.role || 'operator';
        this.environment = raw.environment || 'production';
        this.config = typeof raw.config === 'object' && raw.config !== null ? { ...raw.config } : {};
        this.metadata = typeof raw.metadata === 'object' && raw.metadata !== null ? { ...raw.metadata } : {};
        this.createdAt = raw.createdAt || new Date().toISOString();
    }

    toJSON() {
        return {
            agentId: this.agentId,
            tenantId: this.tenantId,
            correlationId: this.correlationId,
            actor: this.actor,
            role: this.role,
            environment: this.environment,
            config: this.config,
            metadata: this.metadata,
            createdAt: this.createdAt
        };
    }
}

module.exports = { AgentContext };
