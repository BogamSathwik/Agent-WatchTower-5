/**
 * AgentCapabilityRegistry
 * Manages capability registration, discovery, mapping, and capability execution resolution across registered agents.
 */

class AgentCapabilityRegistry {
    constructor() {
        this.capabilities = new Map();
    }

    registerCapability(agentId, capability) {
        if (!agentId || !capability) return;
        const key = typeof capability === 'string' ? capability : (capability.name || capability.id);
        if (!key) return;

        if (!this.capabilities.has(key)) {
            this.capabilities.set(key, new Set());
        }
        this.capabilities.get(key).add(agentId);
    }

    registerAgentCapabilities(agentId, capArray = []) {
        if (!Array.isArray(capArray)) return;
        capArray.forEach(cap => this.registerCapability(agentId, cap));
    }

    findAgentsWithCapability(capabilityName) {
        if (!this.capabilities.has(capabilityName)) return [];
        return Array.from(this.capabilities.get(capabilityName));
    }

    listAllCapabilities() {
        const result = [];
        for (const [name, agents] of this.capabilities.entries()) {
            result.push({
                capability: name,
                agentCount: agents.size,
                agents: Array.from(agents)
            });
        }
        return result;
    }
}

module.exports = { AgentCapabilityRegistry };
