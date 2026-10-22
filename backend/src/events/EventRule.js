/**
 * Phase 14 — Event Automation Rule Model
 * Configurable rule that matches events against conditions and triggers actions.
 */

const EventCondition = require('./EventCondition');

class EventRule {
    constructor(data = {}) {
        this.id = data.id || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        this.name = data.name || 'Unnamed Rule';
        this.description = data.description || '';
        this.enabled = data.enabled !== undefined ? Boolean(data.enabled) : true;
        this.sourceId = data.sourceId || '*'; // '*' for any source
        this.eventType = data.eventType || '*'; // '*' for any eventType
        this.conditions = Array.isArray(data.conditions)
            ? data.conditions.map(c => (c instanceof EventCondition ? c : new EventCondition(c)))
            : [];
        this.priority = Number(data.priority) || 10; // Higher = higher priority
        this.cooldownMs = Number(data.cooldownMs) || 5000;
        this.actions = Array.isArray(data.actions) ? data.actions : []; // [{ actionType, params, targetSystemId }]
        this.policyId = data.policyId || 'pol_default';
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
        this.matchCount = data.matchCount || 0;
        this.lastTriggeredAt = data.lastTriggeredAt || null;
    }

    matches(event) {
        if (!this.enabled) return false;
        if (!event || typeof event !== 'object') return false;

        // Source matching
        if (this.sourceId !== '*' && this.sourceId !== event.source) return false;

        // EventType matching
        if (this.eventType !== '*' && this.eventType !== event.eventType) return false;

        // Condition evaluation (all conditions must evaluate true)
        for (const cond of this.conditions) {
            if (!cond.evaluate(event)) {
                return false;
            }
        }

        return true;
    }

    recordMatch() {
        this.matchCount++;
        this.lastTriggeredAt = new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            enabled: this.enabled,
            sourceId: this.sourceId,
            eventType: this.eventType,
            conditions: this.conditions.map(c => c.toJSON()),
            priority: this.priority,
            cooldownMs: this.cooldownMs,
            actions: this.actions,
            policyId: this.policyId,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            matchCount: this.matchCount,
            lastTriggeredAt: this.lastTriggeredAt
        };
    }
}

module.exports = EventRule;
