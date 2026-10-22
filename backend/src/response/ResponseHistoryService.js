/**
 * Phase 29 — Response History Service
 * Maintains a human-readable chronological event history timeline for every response plan lifecycle.
 */

class ResponseHistoryService {
    constructor(options = {}) {
        this.historyStore = new Map();
    }

    /**
     * Appends an event to a response plan history timeline.
     */
    addStep(planId, step = {}) {
        if (!planId) return;
        if (!this.historyStore.has(planId)) {
            this.historyStore.set(planId, []);
        }

        const entry = {
            stepId: `step_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            timestamp: step.timestamp || new Date().toISOString(),
            actor: step.actor || step.operator || 'SYSTEM',
            action: step.action || 'RESPONSE_EVENT',
            status: step.status || 'INFO',
            summary: step.summary || step.description || 'Lifecycle event recorded.',
            evidence: step.evidence || null,
            sourceRecordId: step.sourceRecordId || null
        };

        this.historyStore.get(planId).push(entry);
        return entry;
    }

    /**
     * Gets full chronological history for a response plan.
     */
    getHistory(planId) {
        return this.historyStore.get(planId) || [];
    }
}

module.exports = { ResponseHistoryService };
