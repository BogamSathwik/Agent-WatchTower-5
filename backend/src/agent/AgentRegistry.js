/**
 * Agent Registry
 * Central repository for registering, tracking, discovering, and managing external agents.
 * Interoperates with SystemRegistry to maintain full platform compatibility.
 */

const { UniversalAgentContract } = require('./UniversalAgentContract');
const { AgentContractValidator } = require('./AgentContractValidator');
const { AGENT_STATES } = require('./AgentStates');
const { UniversalSystemContract } = require('../contract/UniversalSystemContract');

class AgentRegistry {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.agents = new Map(); // id -> UniversalAgentContract
    }

    /**
     * Register a new agent via Universal Agent Contract.
     */
    registerAgent(rawContract) {
        const validation = AgentContractValidator.validate(rawContract);
        if (!validation.valid) {
            const err = new Error('Agent contract validation failed');
            err.statusCode = 400;
            err.code = 'CONTRACT_VALIDATION_FAILED';
            err.errors = validation.errors;
            throw err;
        }

        const contract = new UniversalAgentContract(rawContract);
        
        if (this.agents.has(contract.id)) {
            const err = new Error(`Agent with ID '${contract.id}' is already registered`);
            err.statusCode = 409;
            err.code = 'AGENT_ALREADY_EXISTS';
            throw err;
        }

        contract.lifecycleState = AGENT_STATES.REGISTERED;
        this.agents.set(contract.id, contract);

        // Sync with underlying SystemRegistry if available
        this._syncWithSystemRegistry(contract);

        return contract;
    }

    /**
     * Retrieve an agent by ID.
     */
    getAgent(id) {
        if (!id || typeof id !== 'string') return null;
        const normalizedId = id.trim();
        return this.agents.get(normalizedId) || null;
    }

    /**
     * List registered agents with optional filtering.
     */
    listAgents(filters = {}) {
        let list = Array.from(this.agents.values());

        if (filters.category) {
            const cat = String(filters.category).trim().toLowerCase();
            list = list.filter(a => a.category.toLowerCase() === cat);
        }

        if (filters.lifecycleState) {
            const state = String(filters.lifecycleState).trim();
            list = list.filter(a => a.lifecycleState === state);
        }

        if (filters.search) {
            const search = String(filters.search).trim().toLowerCase();
            list = list.filter(a => 
                a.id.toLowerCase().includes(search) || 
                a.name.toLowerCase().includes(search) ||
                a.description.toLowerCase().includes(search)
            );
        }

        return list;
    }

    /**
     * Update an agent contract.
     */
    updateAgent(id, updates = {}) {
        const agent = this.getAgent(id);
        if (!agent) {
            const err = new Error(`Agent with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'AGENT_NOT_FOUND';
            throw err;
        }

        const mergedRaw = {
            ...agent.toJSON(),
            ...updates,
            id: agent.id // ID cannot be changed
        };

        const validation = AgentContractValidator.validate(mergedRaw);
        if (!validation.valid) {
            const err = new Error('Updated agent contract validation failed');
            err.statusCode = 400;
            err.code = 'CONTRACT_VALIDATION_FAILED';
            err.errors = validation.errors;
            throw err;
        }

        const updatedContract = new UniversalAgentContract(mergedRaw);
        updatedContract.updatedAt = new Date().toISOString();

        this.agents.set(updatedContract.id, updatedContract);
        this._syncWithSystemRegistry(updatedContract);

        return updatedContract;
    }

    /**
     * Activate an agent.
     */
    activateAgent(id) {
        const agent = this.getAgent(id);
        if (!agent) {
            const err = new Error(`Agent with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'AGENT_NOT_FOUND';
            throw err;
        }

        agent.lifecycleState = AGENT_STATES.ACTIVE;
        agent.updatedAt = new Date().toISOString();
        this._syncWithSystemRegistry(agent);
        return agent;
    }

    /**
     * Deactivate an agent.
     */
    deactivateAgent(id) {
        const agent = this.getAgent(id);
        if (!agent) {
            const err = new Error(`Agent with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'AGENT_NOT_FOUND';
            throw err;
        }

        agent.lifecycleState = AGENT_STATES.DISABLED;
        agent.updatedAt = new Date().toISOString();
        this._syncWithSystemRegistry(agent);
        return agent;
    }

    /**
     * Retire/remove an agent.
     */
    retireAgent(id) {
        const agent = this.getAgent(id);
        if (!agent) {
            const err = new Error(`Agent with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'AGENT_NOT_FOUND';
            throw err;
        }

        agent.lifecycleState = AGENT_STATES.RETIRED;
        agent.updatedAt = new Date().toISOString();
        this._syncWithSystemRegistry(agent);
        return agent;
    }

    removeAgent(id) {
        const agent = this.getAgent(id);
        if (!agent) return false;
        this.agents.delete(agent.id);
        if (this.systemRegistry && typeof this.systemRegistry.unregisterSystem === 'function') {
            try { this.systemRegistry.unregisterSystem(agent.id); } catch (e) { /* ignore */ }
        }
        return true;
    }

    /**
     * Discover agent capabilities dynamically from contract or dynamic inspection.
     */
    discoverCapabilities(id) {
        const agent = this.getAgent(id);
        if (!agent) {
            const err = new Error(`Agent with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'AGENT_NOT_FOUND';
            throw err;
        }

        return {
            agentId: agent.id,
            agentName: agent.name,
            version: agent.version,
            capabilities: agent.capabilities.map(cap => cap.toJSON()),
            operations: agent.capabilities.flatMap(cap => cap.operations),
            interfaces: agent.interfaces
        };
    }

    /**
     * Refresh metadata for an agent.
     */
    refreshMetadata(id, newMetadata = {}) {
        const agent = this.getAgent(id);
        if (!agent) {
            const err = new Error(`Agent with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'AGENT_NOT_FOUND';
            throw err;
        }

        agent.metadata = {
            ...agent.metadata,
            ...newMetadata,
            lastRefreshedAt: new Date().toISOString()
        };
        agent.updatedAt = new Date().toISOString();
        this._syncWithSystemRegistry(agent);
        return agent;
    }

    /**
     * Resolve a requested capability or operation for an agent.
     */
    resolveCapability(id, capabilityOrOperationName) {
        const agent = this.getAgent(id);
        if (!agent) {
            return {
                supported: false,
                reason: 'AGENT_NOT_FOUND'
            };
        }

        if (!capabilityOrOperationName) {
            return {
                supported: true,
                capability: agent.capabilities[0] || null
            };
        }

        const search = String(capabilityOrOperationName).trim().toLowerCase();

        // Check matching capability ID
        let match = agent.capabilities.find(cap => cap.id.toLowerCase() === search || cap.name.toLowerCase() === search);
        
        // If not matched by ID, check matching operation name
        if (!match) {
            match = agent.capabilities.find(cap => cap.supportsOperation(search));
        }

        if (match) {
            return {
                supported: true,
                capability: match
            };
        }

        return {
            supported: false,
            reason: 'CAPABILITY_NOT_SUPPORTED',
            agentId: agent.id,
            requested: capabilityOrOperationName
        };
    }

    /**
     * Get agent status overview.
     */
    getAgentStatus(id) {
        const agent = this.getAgent(id);
        if (!agent) {
            const err = new Error(`Agent with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'AGENT_NOT_FOUND';
            throw err;
        }

        return {
            id: agent.id,
            name: agent.name,
            category: agent.category,
            version: agent.version,
            contractVersion: agent.contractVersion,
            lifecycleState: agent.lifecycleState,
            capabilitiesCount: agent.capabilities.length,
            endpoint: agent.runner.endpoint,
            updatedAt: agent.updatedAt
        };
    }

    /**
     * Internal helper to sync agent object with SystemRegistry.
     */
    _syncWithSystemRegistry(agentContract) {
        if (!this.systemRegistry) return;

        let sysState = 'REGISTERED';
        if (agentContract.lifecycleState === AGENT_STATES.ACTIVE) sysState = 'ACTIVE';
        else if (agentContract.lifecycleState === AGENT_STATES.DISABLED || agentContract.lifecycleState === AGENT_STATES.INVALID) sysState = 'INACTIVE';
        else if (agentContract.lifecycleState === AGENT_STATES.DEGRADED) sysState = 'DEGRADED';
        else if (agentContract.lifecycleState === AGENT_STATES.OFFLINE) sysState = 'OFFLINE';
        else if (agentContract.lifecycleState === AGENT_STATES.RETIRED) sysState = 'RETIRED';

        const systemContract = new UniversalSystemContract({
            id: agentContract.id,
            name: agentContract.name,
            version: agentContract.version,
            contractVersion: agentContract.contractVersion,
            description: agentContract.description,
            category: agentContract.category,
            capabilities: agentContract.capabilities.map(c => c.toJSON()),
            adapter: agentContract.runner.toAdapterMetadata(),
            lifecycleState: sysState,
            metadata: {
                ...agentContract.metadata,
                isAgent: true,
                agentState: agentContract.lifecycleState,
                provider: agentContract.provider,
                connection: agentContract.connection
            },
            createdAt: agentContract.createdAt,
            updatedAt: agentContract.updatedAt
        });

        let existing = null;
        try {
            existing = this.systemRegistry.getSystem(agentContract.id);
        } catch (e) {
            existing = null;
        }

        if (existing) {
            if (typeof this.systemRegistry.updateSystem === 'function') {
                try {
                    this.systemRegistry.updateSystem(agentContract.id, systemContract.toJSON());
                } catch (e) {
                    // If state transition is restricted in system registry, sync without changing state
                    const fallback = systemContract.toJSON();
                    delete fallback.lifecycleState;
                    this.systemRegistry.updateSystem(agentContract.id, fallback);
                }
            }
        } else {
            if (typeof this.systemRegistry.registerSystem === 'function') {
                this.systemRegistry.registerSystem(systemContract.toJSON());
            }
        }
    }
}

module.exports = {
    AgentRegistry
};
