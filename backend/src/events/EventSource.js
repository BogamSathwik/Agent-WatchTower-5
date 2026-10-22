/**
 * Phase 14 — Event Source Registry Model
 * Manages generic event source metadata and dynamic registration.
 */

class EventSource {
    constructor(data = {}) {
        this.id = data.id || `src_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        this.name = data.name || 'Unnamed Source';
        this.type = data.type || 'SYSTEM';
        this.enabled = data.enabled !== undefined ? Boolean(data.enabled) : true;
        this.capabilities = Array.isArray(data.capabilities) ? data.capabilities : [];
        this.metadata = data.metadata || {};
        this.registeredAt = data.registeredAt || new Date().toISOString();
        this.lastEventAt = data.lastEventAt || null;
        this.eventCount = data.eventCount || 0;
    }

    recordEvent() {
        this.lastEventAt = new Date().toISOString();
        this.eventCount++;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            enabled: this.enabled,
            capabilities: this.capabilities,
            metadata: this.metadata,
            registeredAt: this.registeredAt,
            lastEventAt: this.lastEventAt,
            eventCount: this.eventCount
        };
    }
}

const DEFAULT_SOURCES = [
    { id: 'runtime', name: 'Universal Agent Runtime', type: 'RUNTIME', capabilities: ['RUNTIME_STATE_CHANGED', 'CAPABILITY_FAILURE'] },
    { id: 'health', name: 'Universal Health Engine', type: 'HEALTH', capabilities: ['HEALTH_CHANGED'] },
    { id: 'quality', name: 'Universal Quality Engine', type: 'QUALITY', capabilities: ['QUALITY_CHANGED'] },
    { id: 'usage', name: 'Universal Usage Analytics', type: 'USAGE', capabilities: ['USAGE_THRESHOLD'] },
    { id: 'intelligence', name: 'Universal Intelligence Engine', type: 'INTELLIGENCE', capabilities: ['ANOMALY_DETECTED'] },
    { id: 'alerting', name: 'Universal Alerting Service', type: 'ALERTING', capabilities: ['ALERT_CREATED'] },
    { id: 'remediation', name: 'Self-Healing Remediation Engine', type: 'REMEDIATION', capabilities: ['REMEDIATION_COMPLETED'] },
    { id: 'orchestration', name: 'Orchestration Engine', type: 'ORCHESTRATION', capabilities: ['ORCHESTRATION_TRIGGERED'] },
    { id: 'onboarding', name: 'Onboarding Engine', type: 'ONBOARDING', capabilities: ['SYSTEM_REGISTERED'] },
    { id: 'external', name: 'External Adapter / System', type: 'EXTERNAL', capabilities: ['CUSTOM'] }
];

module.exports = { EventSource, DEFAULT_SOURCES };
