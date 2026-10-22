/**
 * AgentFrameworkValidator Utility
 * Validates agent framework definitions, capabilities, and tool registrations against the Universal Agent Contract.
 */

class AgentFrameworkValidator {
    static validateAgentDefinition(agentData = {}) {
        const errors = [];
        const warnings = [];

        if (!agentData.id && !agentData.agentId) {
            errors.push('Agent ID is required');
        }
        if (!agentData.name) {
            errors.push('Agent name is required');
        }
        if (!agentData.baseUrl && !agentData.endpoint) {
            warnings.push('Agent base URL/endpoint is missing; defaults to http://localhost:4001');
        }

        if (agentData.contractVersion && typeof agentData.contractVersion !== 'string') {
            errors.push('contractVersion must be a string');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
}

module.exports = { AgentFrameworkValidator };
