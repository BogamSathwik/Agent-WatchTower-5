/**
 * Universal System Registry
 * In-memory repository for storing and managing registered systems.
 * Purely generic - works for any external system, agent, microservice, or web application.
 */

const { UniversalSystemContract } = require('../contract/UniversalSystemContract');
const { ContractValidator } = require('../contract/ContractValidator');
const { CapabilityRegistry } = require('./CapabilityRegistry');
const { SystemLifecycle, LIFECYCLE_STATES } = require('../lifecycle/SystemLifecycle');

class SystemRegistry {
    constructor(options = {}) {
        this.systems = new Map();
        this.capabilityRegistry = new CapabilityRegistry();
        // Optional application-state persistence (existing `agent_data` table
        // via PersistenceManager in mysql mode, memory/file otherwise).
        // Best-effort only: never throws, so registration works with or
        // without a persistence backend attached.
        this.persistenceManager = options.persistenceManager || options.persistence || null;
    }

    /**
     * Attach (or replace) the application-state persistence backend.
     */
    setPersistenceManager(persistenceManager) {
        this.persistenceManager = persistenceManager || null;
        return this;
    }

    _persistSystem(id) {
        if (!this.persistenceManager) return;
        try {
            const instance = this.systems.get(String(id).trim());
            if (!instance) return;
            const snapshot = typeof instance.toJSON === 'function' ? instance.toJSON() : { ...instance };
            const pm = this.persistenceManager;
            if (typeof pm.setSafe === 'function') {
                const r = pm.setSafe('systems', snapshot.id, snapshot);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            } else if (typeof pm.set === 'function') {
                const r = pm.set('systems', snapshot.id, snapshot);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            }
        } catch (_) { /* persistence is best-effort */ }
    }

    _removePersistedSystem(id) {
        if (!this.persistenceManager) return;
        try {
            const pm = this.persistenceManager;
            const key = String(id).trim();
            if (typeof pm.deleteSafe === 'function') {
                const r = pm.deleteSafe('systems', key);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            } else if (typeof pm.delete === 'function') {
                const r = pm.delete('systems', key);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            }
        } catch (_) { /* persistence is best-effort */ }
    }

    /**
     * Register a new system contract.
     * @param {Object} rawPayload 
     * @returns {Object} System object payload
     */
    registerSystem(rawPayload) {
        // Validate contract
        const validation = ContractValidator.validate(rawPayload, { isUpdate: false });
        if (!validation.valid) {
            const err = new Error('Contract validation failed');
            err.statusCode = 400;
            err.errors = validation.errors;
            throw err;
        }

        const id = rawPayload.id.trim();

        // Duplicate check
        if (this.systems.has(id)) {
            const err = new Error(`System with ID '${id}' is already registered`);
            err.statusCode = 409;
            err.errors = [{ field: 'id', code: 'DUPLICATE_REGISTRATION', message: `System '${id}' already exists` }];
            throw err;
        }

        // Normalize capabilities
        const normalizedCapabilities = this.capabilityRegistry.normalizeCapabilities(rawPayload.capabilities);

        // Instantiate contract
        const contract = new UniversalSystemContract({
            ...rawPayload,
            capabilities: normalizedCapabilities
        });

        this.systems.set(id, contract);
        const snapshot = contract.toJSON();
        this._persistSystem(id);
        return snapshot;
    }

    /**
     * Update an existing system.
     * @param {string} id 
     * @param {Object} updatePayload 
     * @returns {Object} Updated system object
     */
    updateSystem(id, updatePayload) {
        const system = this.getSystemInstance(id);

        const validation = ContractValidator.validate(updatePayload, { isUpdate: true });
        if (!validation.valid) {
            const err = new Error('Contract validation failed');
            err.statusCode = 400;
            err.errors = validation.errors;
            throw err;
        }

        if (updatePayload.name !== undefined) system.name = updatePayload.name.trim();
        if (updatePayload.version !== undefined) system.version = updatePayload.version.trim();
        if (updatePayload.contractVersion !== undefined) system.contractVersion = updatePayload.contractVersion.trim();
        if (updatePayload.description !== undefined) system.description = updatePayload.description.trim();
        if (updatePayload.category !== undefined) system.category = updatePayload.category.trim();

        if (updatePayload.capabilities !== undefined) {
            system.capabilities = this.capabilityRegistry.normalizeCapabilities(updatePayload.capabilities);
        }

        if (updatePayload.adapter !== undefined) {
            system.adapter = require('../adapter/AdapterMetadata').AdapterMetadata.normalize(updatePayload.adapter);
        }

        if (updatePayload.lifecycleState !== undefined) {
            if (!SystemLifecycle.canTransition(system.lifecycleState, updatePayload.lifecycleState)) {
                const err = new Error(`Invalid lifecycle transition from ${system.lifecycleState} to ${updatePayload.lifecycleState}`);
                err.statusCode = 400;
                err.errors = [{ field: 'lifecycleState', code: 'INVALID_TRANSITION', message: err.message }];
                throw err;
            }
            system.lifecycleState = updatePayload.lifecycleState;
        }

        if (updatePayload.metadata !== undefined) {
            system.metadata = { ...system.metadata, ...updatePayload.metadata };
        }

        if (updatePayload.baseUrl !== undefined || updatePayload.endpoint !== undefined) {
            const nb = (typeof updatePayload.baseUrl === 'string' && updatePayload.baseUrl.trim())
                ? updatePayload.baseUrl.trim()
                : ((typeof updatePayload.endpoint === 'string' && updatePayload.endpoint.trim()) ? updatePayload.endpoint.trim() : system.baseUrl);
            system.baseUrl = nb;
            system.endpoint = nb;
        }

        system.updatedAt = new Date().toISOString();
        this.systems.set(id, system);
        this._persistSystem(id);

        return system.toJSON();
    }

    /**
     * Remove a system registration (used by AgentRegistry.removeAgent).
     */
    unregisterSystem(id) {
        if (!id || typeof id !== 'string') return false;
        const removed = this.systems.delete(id.trim());
        if (removed) this._removePersistedSystem(id);
        return removed;
    }

    /**
     * Get system by ID instance (internal).
     */
    getSystemInstance(id) {
        if (!id || typeof id !== 'string') {
            const err = new Error('Invalid system ID provided');
            err.statusCode = 400;
            throw err;
        }
        const system = this.systems.get(id.trim());
        if (!system) {
            const err = new Error(`System with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'SYSTEM_NOT_FOUND';
            throw err;
        }
        return system;
    }

    /**
     * Get public JSON for a system by ID.
     */
    getSystem(id) {
        return this.getSystemInstance(id).toJSON();
    }

    /**
     * List all systems with optional filtering.
     */
    getAllSystems(filters = {}) {
        let list = Array.from(this.systems.values()).map(sys => sys.toJSON());

        if (filters.category) {
            const cat = filters.category.trim().toLowerCase();
            list = list.filter(sys => sys.category.toLowerCase() === cat);
        }

        if (filters.lifecycleState) {
            const state = filters.lifecycleState.trim().toUpperCase();
            list = list.filter(sys => sys.lifecycleState === state);
        }

        if (filters.capability) {
            const cap = filters.capability.trim().toLowerCase();
            list = list.filter(sys => this.capabilityRegistry.hasCapability(sys.capabilities, cap));
        }

        return list;
    }

    /**
     * Search systems by query string (matching id, name, description).
     */
    searchSystems(query = '') {
        if (!query || typeof query !== 'string') {
            return this.getAllSystems();
        }
        const q = query.trim().toLowerCase();
        return Array.from(this.systems.values())
            .filter(sys =>
                sys.id.toLowerCase().includes(q) ||
                sys.name.toLowerCase().includes(q) ||
                sys.description.toLowerCase().includes(q) ||
                sys.category.toLowerCase().includes(q)
            )
            .map(sys => sys.toJSON());
    }

    /**
     * Discover systems based on criteria (e.g. required capabilities, state).
     */
    discoverSystems(criteria = {}) {
        return this.getAllSystems(criteria);
    }

    /**
     * Activate a registered system.
     */
    activateSystem(id) {
        return this.updateSystem(id, { lifecycleState: LIFECYCLE_STATES.ACTIVE });
    }

    /**
     * Deactivate an active system.
     */
    deactivateSystem(id) {
        return this.updateSystem(id, { lifecycleState: LIFECYCLE_STATES.INACTIVE });
    }

    /**
     * Retire a system.
     */
    retireSystem(id) {
        return this.updateSystem(id, { lifecycleState: LIFECYCLE_STATES.RETIRED });
    }

    /**
     * Check if a system supports a specific capability.
     */
    hasCapability(id, capability) {
        const sys = this.getSystemInstance(id);
        return this.capabilityRegistry.hasCapability(sys.capabilities, capability);
    }

    /**
     * Get system capabilities.
     */
    getSystemCapabilities(id) {
        const sys = this.getSystemInstance(id);
        return {
            systemId: sys.id,
            capabilities: sys.capabilities
        };
    }

    /**
     * Get system metadata.
     */
    getSystemMetadata(id) {
        const sys = this.getSystemInstance(id);
        return {
            systemId: sys.id,
            adapter: sys.adapter,
            metadata: sys.metadata,
            healthConfigRef: sys.healthConfigRef,
            executionConfigRef: sys.executionConfigRef,
            telemetryConfigRef: sys.telemetryConfigRef
        };
    }

    /**
     * Clear all systems (useful for testing).
     */
    clear() {
        this.systems.clear();
    }
}

module.exports = {
    SystemRegistry
};
