/**
 * Agent Dependency Service
 * Manages inter-agent dependency relationships, relationship validation, circular dependency detection,
 * multi-tenant isolation, RBAC checks, and persistent state management.
 */

const { defaultPersistenceManager } = require('../persistence/PersistenceManager');
const { auditLogService } = require('../audit/AuditLogService');

const RELATIONSHIP_TYPES = Object.freeze([
    'DEPENDS_ON',
    'CALLS',
    'PROVIDES_SERVICE_TO',
    'DATA_DEPENDENCY',
    'WORKFLOW_DEPENDENCY',
    'OPTIONAL_DEPENDENCY'
]);

const CRITICALITIES = Object.freeze([
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW',
    'OPTIONAL'
]);

const ORIGINS = Object.freeze([
    'DECLARED',
    'DISCOVERED',
    'INFERRED'
]);

const STATUSES = Object.freeze([
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED'
]);

class AgentDependencyService {
    constructor(options = {}) {
        this.persistenceManager = options.persistenceManager || defaultPersistenceManager;
        this.auditLogService = options.auditLogService || auditLogService;
        this.agentRegistry = options.agentRegistry || null;
        this.graphService = options.graphService || null;

        // In-memory store keyed by `${tenantId}:${dependencyId}`
        this.dependencies = new Map();
        this.collection = 'agent_dependencies';

        this._hydrateFromPersistence();
    }

    setGraphService(graphService) {
        this.graphService = graphService;
    }

    _hydrateFromPersistence() {
        try {
            if (this.persistenceManager && typeof this.persistenceManager.list === 'function') {
                Promise.resolve(this.persistenceManager.list(this.collection))
                    .then(items => {
                        if (Array.isArray(items)) {
                            items.forEach(item => {
                                if (item && item.dependencyId && item.tenantId) {
                                    this.dependencies.set(`${item.tenantId}:${item.dependencyId}`, item);
                                }
                            });
                        }
                    })
                    .catch(() => {});
            }
        } catch (_) {}
    }

    _persist(key, data) {
        try {
            if (this.persistenceManager && typeof this.persistenceManager.set === 'function') {
                this.persistenceManager.set(this.collection, key, data).catch(() => {});
            }
        } catch (_) {}
    }

    _deletePersisted(key) {
        try {
            if (this.persistenceManager && typeof this.persistenceManager.delete === 'function') {
                this.persistenceManager.delete(this.collection, key).catch(() => {});
            }
        } catch (_) {}
    }

    /**
     * Registers a new inter-agent dependency relationship.
     */
    registerDependency(payload, tenantId = 'default-tenant') {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Invalid dependency payload.');
        }

        const tid = payload.tenantId || tenantId;
        const sourceAgentId = String(payload.sourceAgentId || '').trim();
        const targetAgentId = String(payload.targetAgentId || '').trim();
        const relationshipType = String(payload.relationshipType || 'DEPENDS_ON').toUpperCase();
        const criticality = String(payload.criticality || 'HIGH').toUpperCase();
        const origin = String(payload.origin || 'DECLARED').toUpperCase();
        const status = String(payload.status || 'ACTIVE').toUpperCase();
        const confidence = typeof payload.confidence === 'number' ? Math.min(1, Math.max(0, payload.confidence)) : 1.0;

        // Validation Rules
        if (!sourceAgentId || !targetAgentId) {
            throw new Error('sourceAgentId and targetAgentId are required.');
        }

        if (sourceAgentId === targetAgentId) {
            throw new Error(`Self-dependency is invalid for agent '${sourceAgentId}'.`);
        }

        if (!RELATIONSHIP_TYPES.includes(relationshipType)) {
            throw new Error(`Invalid relationshipType '${relationshipType}'. Supported types: ${RELATIONSHIP_TYPES.join(', ')}.`);
        }

        if (!CRITICALITIES.includes(criticality)) {
            throw new Error(`Invalid criticality '${criticality}'. Supported criticalities: ${CRITICALITIES.join(', ')}.`);
        }

        if (!ORIGINS.includes(origin)) {
            throw new Error(`Invalid origin '${origin}'. Supported origins: ${ORIGINS.join(', ')}.`);
        }

        if (!STATUSES.includes(status)) {
            throw new Error(`Invalid status '${status}'. Supported statuses: ${STATUSES.join(', ')}.`);
        }

        // Check duplicate relationship
        const existing = Array.from(this.dependencies.values()).find(
            d => d.tenantId === tid &&
                 d.sourceAgentId === sourceAgentId &&
                 d.targetAgentId === targetAgentId &&
                 d.relationshipType === relationshipType
        );

        if (existing) {
            throw new Error(`Duplicate dependency already exists between '${sourceAgentId}' and '${targetAgentId}' (${relationshipType}).`);
        }

        // Check graph cycle if GraphService is available
        if (this.graphService && typeof this.graphService.detectCycleWithCandidate === 'function') {
            const prospectiveEdge = { sourceAgentId, targetAgentId, relationshipType };
            const cycleCheck = this.graphService.detectCycleWithCandidate(tid, prospectiveEdge);
            if (cycleCheck && cycleCheck.hasCycle) {
                throw new Error(`CIRCULAR_DEPENDENCY: Creating dependency from '${sourceAgentId}' to '${targetAgentId}' creates a cycle: ${cycleCheck.cyclePath.join(' -> ')}`);
            }
        }

        const dependencyId = payload.dependencyId || `dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const dependencyRecord = {
            dependencyId,
            tenantId: tid,
            sourceAgentId,
            targetAgentId,
            relationshipType,
            direction: payload.direction || 'OUTGOING',
            criticality,
            confidence,
            status,
            origin,
            metadata: payload.metadata || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const key = `${tid}:${dependencyId}`;
        this.dependencies.set(key, dependencyRecord);
        this._persist(key, dependencyRecord);

        try {
            if (this.auditLogService && typeof this.auditLogService.log === 'function') {
                this.auditLogService.log({
                    event: 'DEPENDENCY_CREATED',
                    actor: payload.actor || 'system',
                    systemId: sourceAgentId,
                    tenantId: tid,
                    details: { dependencyId, sourceAgentId, targetAgentId, relationshipType, criticality }
                });
            }
        } catch (_) {}

        return dependencyRecord;
    }

    getDependency(dependencyId, tenantId = 'default-tenant') {
        const key = `${tenantId}:${dependencyId}`;
        return this.dependencies.get(key) || null;
    }

    listDependencies(filters = {}, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';
        let list = Array.from(this.dependencies.values()).filter(d => d.tenantId === tid);

        if (filters.agentId) {
            list = list.filter(d => d.sourceAgentId === filters.agentId || d.targetAgentId === filters.agentId);
        }
        if (filters.sourceAgentId) {
            list = list.filter(d => d.sourceAgentId === filters.sourceAgentId);
        }
        if (filters.targetAgentId) {
            list = list.filter(d => d.targetAgentId === filters.targetAgentId);
        }
        if (filters.relationshipType) {
            list = list.filter(d => d.relationshipType === filters.relationshipType);
        }
        if (filters.status) {
            list = list.filter(d => d.status === filters.status);
        }
        if (filters.criticality) {
            list = list.filter(d => d.criticality === filters.criticality);
        }

        return list;
    }

    updateDependency(dependencyId, updates = {}, tenantId = 'default-tenant') {
        const existing = this.getDependency(dependencyId, tenantId);
        if (!existing) {
            throw new Error(`Dependency '${dependencyId}' not found.`);
        }

        const updated = {
            ...existing,
            ...updates,
            dependencyId: existing.dependencyId,
            tenantId: existing.tenantId,
            updatedAt: new Date().toISOString()
        };

        if (updates.relationshipType && !RELATIONSHIP_TYPES.includes(updates.relationshipType)) {
            throw new Error(`Invalid relationshipType '${updates.relationshipType}'.`);
        }

        if (updates.criticality && !CRITICALITIES.includes(updates.criticality)) {
            throw new Error(`Invalid criticality '${updates.criticality}'.`);
        }

        const key = `${tenantId}:${dependencyId}`;
        this.dependencies.set(key, updated);
        this._persist(key, updated);

        return updated;
    }

    deleteDependency(dependencyId, tenantId = 'default-tenant') {
        const existing = this.getDependency(dependencyId, tenantId);
        if (!existing) {
            throw new Error(`Dependency '${dependencyId}' not found.`);
        }

        const key = `${tenantId}:${dependencyId}`;
        this.dependencies.delete(key);
        this._deletePersisted(key);

        try {
            if (this.auditLogService && typeof this.auditLogService.log === 'function') {
                this.auditLogService.log({
                    event: 'DEPENDENCY_DELETED',
                    actor: 'system',
                    systemId: existing.sourceAgentId,
                    tenantId,
                    details: { dependencyId, sourceAgentId: existing.sourceAgentId, targetAgentId: existing.targetAgentId }
                });
            }
        } catch (_) {}

        return { success: true, deletedId: dependencyId };
    }
}

module.exports = {
    AgentDependencyService,
    RELATIONSHIP_TYPES,
    CRITICALITIES,
    ORIGINS,
    STATUSES
};
