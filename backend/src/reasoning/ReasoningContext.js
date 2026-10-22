/**
 * ReasoningContext Model
 * Stores input evidence, agent observations, telemetry signals, and execution history for reasoning operations.
 */

class ReasoningContext {
    constructor(raw = {}) {
        this.contextId = raw.contextId || `ctx_reason_${Date.now()}`;
        this.agentId = raw.agentId || 'global';
        this.tenantId = raw.tenantId || 'global';
        this.correlationId = raw.correlationId || `corr_reason_${Date.now()}`;
        this.observations = Array.isArray(raw.observations) ? raw.observations : [];
        this.metrics = typeof raw.metrics === 'object' && raw.metrics !== null ? { ...raw.metrics } : {};
        this.healthState = raw.healthState || 'UNKNOWN';
        this.activeAlerts = Array.isArray(raw.activeAlerts) ? raw.activeAlerts : [];
        this.history = Array.isArray(raw.history) ? raw.history : [];
        this.timestamp = raw.timestamp || new Date().toISOString();
    }

    addObservation(obs) {
        this.observations.push({
            timestamp: new Date().toISOString(),
            content: typeof obs === 'string' ? obs : JSON.stringify(obs)
        });
    }

    toJSON() {
        return {
            contextId: this.contextId,
            agentId: this.agentId,
            tenantId: this.tenantId,
            correlationId: this.correlationId,
            observations: this.observations,
            metrics: this.metrics,
            healthState: this.healthState,
            activeAlerts: this.activeAlerts,
            history: this.history,
            timestamp: this.timestamp
        };
    }
}

module.exports = { ReasoningContext };
