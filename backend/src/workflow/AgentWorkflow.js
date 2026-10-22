/**
 * AgentWorkflow Model
 * Generic agent workflow definition layer extending universal Workflow model.
 * Purely domain-agnostic.
 */

const { Workflow } = require('./Workflow');

class AgentWorkflow extends Workflow {
    constructor(raw = {}) {
        super(raw);
    }
}

module.exports = { AgentWorkflow, Workflow };
