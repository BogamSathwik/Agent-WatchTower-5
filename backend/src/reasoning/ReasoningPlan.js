/**
 * ReasoningPlan Model
 * Ordered sequence of reasoning steps formulated during reasoning evaluation.
 */

const { ReasoningStep } = require('./ReasoningStep');

class ReasoningPlan {
    constructor(raw = {}) {
        this.planId = raw.planId || `rplan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.agentId = raw.agentId || 'global';
        this.goal = raw.goal || 'Evaluate agent operational health and propose safe action';
        const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
        this.steps = rawSteps.map(s => (s instanceof ReasoningStep ? s : new ReasoningStep(s)));
        this.createdAt = raw.createdAt || new Date().toISOString();
    }

    toJSON() {
        return {
            planId: this.planId,
            agentId: this.agentId,
            goal: this.goal,
            steps: this.steps.map(s => s.toJSON()),
            createdAt: this.createdAt
        };
    }
}

module.exports = { ReasoningPlan };
