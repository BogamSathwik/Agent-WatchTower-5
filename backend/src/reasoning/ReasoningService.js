/**
 * ReasoningService
 * Facade class exposing reasoning engine capabilities, analysis, planning, decisions, and traces.
 */

const { ReasoningEngine } = require('./ReasoningEngine');

class ReasoningService {
    constructor(options = {}) {
        this.engine = new ReasoningEngine(options);
    }

    async analyze(agentId, observationInput = {}, options = {}) {
        return this.engine.analyzeAndPlan(agentId, observationInput, options);
    }

    async plan(agentId, goal = 'Evaluate agent health', options = {}) {
        return this.engine.analyzeAndPlan(agentId, { observation: goal }, options);
    }

    async decide(agentId, options = {}) {
        return this.engine.analyzeAndPlan(agentId, options.observation || {}, options);
    }

    getTrace(traceId) {
        return this.engine.getTrace(traceId);
    }

    listTraces(filters = {}) {
        return this.engine.listTraces(filters);
    }

    getOverview() {
        const traces = this.engine.listTraces();
        return {
            totalTraces: traces.length,
            recentTraces: traces.slice(0, 10),
            engineStatus: 'OPERATIONAL'
        };
    }
}

module.exports = { ReasoningService };
