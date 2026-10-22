/**
 * Agent Knowledge Graph Service
 * Manages the unified operational knowledge graph, entity nodes, relationship edges,
 * relationship origins (OBSERVED, DECLARED, DERIVED, INFERRED), confidence levels,
 * multi-tenant isolation, and persistent graph metadata.
 */

const { defaultPersistenceManager } = require('../persistence/PersistenceManager');
const { auditLogService } = require('../audit/AuditLogService');

const ENTITY_TYPES = Object.freeze([
    'AGENT',
    'DEPENDENCY',
    'HEALTH_CHECK',
    'TELEMETRY_EVENT',
    'ANOMALY',
    'RISK',
    'ALERT',
    'INCIDENT',
    'WORKFLOW',
    'WORKFLOW_EXECUTION',
    'POLICY',
    'AUTOMATION_DECISION',
    'REMEDIATION',
    'REMEDIATION_EXECUTION',
    'AUDIT_EVENT',
    'REPORT'
]);

const RELATIONSHIP_TYPES = Object.freeze([
    'AGENT_DEPENDS_ON_AGENT',
    'AGENT_GENERATED_EVENT',
    'AGENT_HAS_HEALTH_CHECK',
    'AGENT_HAS_ANOMALY',
    'AGENT_HAS_RISK',
    'AGENT_HAS_INCIDENT',
    'INCIDENT_HAS_ALERT',
    'INCIDENT_HAS_ANOMALY',
    'INCIDENT_INVOLVES_AGENT',
    'INCIDENT_TRIGGERED_WORKFLOW',
    'WORKFLOW_EXECUTED_FOR_AGENT',
    'WORKFLOW_EXECUTED_REMEDIATION',
    'REMEDIATION_ATTEMPTED_ON_AGENT',
    'REMEDIATION_VERIFIED_BY_CHECK',
    'POLICY_TRIGGERED_DECISION',
    'DECISION_TRIGGERED_WORKFLOW',
    'EVENT_PRECEDED_EVENT',
    'EVENT_CORRELATED_WITH_EVENT'
]);

const ORIGINS = Object.freeze([
    'OBSERVED',
    'DECLARED',
    'DERIVED',
    'INFERRED'
]);

class AgentKnowledgeGraphService {
    constructor(options = {}) {
        this.persistenceManager = options.persistenceManager || defaultPersistenceManager;
        this.auditLogService = options.auditLogService || auditLogService;

        // Stores keyed by `${tenantId}:${entityId}` and `${tenantId}:${relationshipId}`
        this.entities = new Map();
        this.relationships = new Map();

        this.entitiesCollection = 'knowledge_entities';
        this.relationshipsCollection = 'knowledge_relationships';

        this._hydrateFromPersistence();
    }

    _hydrateFromPersistence() {
        try {
            if (this.persistenceManager && typeof this.persistenceManager.list === 'function') {
                Promise.resolve(this.persistenceManager.list(this.entitiesCollection))
                    .then(items => {
                        if (Array.isArray(items)) {
                            items.forEach(item => {
                                if (item && item.entityId && item.tenantId) {
                                    this.entities.set(`${item.tenantId}:${item.entityId}`, item);
                                }
                            });
                        }
                    })
                    .catch(() => {});

                Promise.resolve(this.persistenceManager.list(this.relationshipsCollection))
                    .then(items => {
                        if (Array.isArray(items)) {
                            items.forEach(item => {
                                if (item && item.relationshipId && item.tenantId) {
                                    this.relationships.set(`${item.tenantId}:${item.relationshipId}`, item);
                                }
                            });
                        }
                    })
                    .catch(() => {});
            }
        } catch (_) {}
    }

    _persistEntity(key, data) {
        try {
            if (this.persistenceManager && typeof this.persistenceManager.set === 'function') {
                this.persistenceManager.set(this.entitiesCollection, key, data).catch(() => {});
            }
        } catch (_) {}
    }

    _persistRelationship(key, data) {
        try {
            if (this.persistenceManager && typeof this.persistenceManager.set === 'function') {
                this.persistenceManager.set(this.relationshipsCollection, key, data).catch(() => {});
            }
        } catch (_) {}
    }

    /**
     * Upserts an entity node in the knowledge graph.
     */
    addEntity(payload, tenantId = 'default-tenant') {
        if (!payload || !payload.entityId || !payload.entityType) {
            throw new Error('entityId and entityType are required for graph entities.');
        }

        const tid = payload.tenantId || tenantId;
        const type = String(payload.entityType).toUpperCase();

        if (!ENTITY_TYPES.includes(type)) {
            throw new Error(`Invalid entityType '${type}'. Supported types: ${ENTITY_TYPES.join(', ')}.`);
        }

        const key = `${tid}:${payload.entityId}`;
        const existing = this.entities.get(key);

        const entityRecord = {
            entityId: payload.entityId,
            entityType: type,
            tenantId: tid,
            label: payload.label || payload.name || payload.entityId,
            source: payload.source || 'SYSTEM_RECORD',
            metadata: payload.metadata || {},
            createdAt: existing ? existing.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.entities.set(key, entityRecord);
        this._persistEntity(key, entityRecord);
        return entityRecord;
    }

    getEntity(entityId, tenantId = 'default-tenant') {
        const key = `${tenantId}:${entityId}`;
        return this.entities.get(key) || null;
    }

    listEntities(filters = {}, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';
        let list = Array.from(this.entities.values()).filter(e => e.tenantId === tid);

        if (filters.entityType) {
            list = list.filter(e => e.entityType === filters.entityType);
        }
        if (filters.source) {
            list = list.filter(e => e.source === filters.source);
        }

        return list;
    }

    /**
     * Upserts a relationship edge in the knowledge graph.
     */
    addRelationship(payload, tenantId = 'default-tenant') {
        if (!payload || !payload.sourceEntityId || !payload.targetEntityId || !payload.relationshipType) {
            throw new Error('sourceEntityId, targetEntityId, and relationshipType are required.');
        }

        const tid = payload.tenantId || tenantId;
        const type = String(payload.relationshipType).toUpperCase();
        const origin = String(payload.origin || 'OBSERVED').toUpperCase();
        const confidence = typeof payload.confidence === 'number' ? Math.min(1, Math.max(0, payload.confidence)) : 1.0;

        if (!RELATIONSHIP_TYPES.includes(type)) {
            throw new Error(`Invalid relationshipType '${type}'. Supported types: ${RELATIONSHIP_TYPES.join(', ')}.`);
        }

        if (!ORIGINS.includes(origin)) {
            throw new Error(`Invalid origin '${origin}'. Supported origins: ${ORIGINS.join(', ')}.`);
        }

        const relationshipId = payload.relationshipId || `rel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const key = `${tid}:${relationshipId}`;

        const relationshipRecord = {
            relationshipId,
            sourceEntityId: payload.sourceEntityId,
            targetEntityId: payload.targetEntityId,
            relationshipType: type,
            tenantId: tid,
            confidence,
            evidence: Array.isArray(payload.evidence) ? payload.evidence : (payload.evidence ? [payload.evidence] : []),
            origin,
            createdAt: new Date().toISOString()
        };

        this.relationships.set(key, relationshipRecord);
        this._persistRelationship(key, relationshipRecord);
        return relationshipRecord;
    }

    getRelationship(relationshipId, tenantId = 'default-tenant') {
        const key = `${tenantId}:${relationshipId}`;
        return this.relationships.get(key) || null;
    }

    listRelationships(filters = {}, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';
        let list = Array.from(this.relationships.values()).filter(r => r.tenantId === tid);

        if (filters.entityId) {
            list = list.filter(r => r.sourceEntityId === filters.entityId || r.targetEntityId === filters.entityId);
        }
        if (filters.sourceEntityId) {
            list = list.filter(r => r.sourceEntityId === filters.sourceEntityId);
        }
        if (filters.targetEntityId) {
            list = list.filter(r => r.targetEntityId === filters.targetEntityId);
        }
        if (filters.relationshipType) {
            list = list.filter(r => r.relationshipType === filters.relationshipType);
        }
        if (filters.origin) {
            list = list.filter(r => r.origin === filters.origin);
        }

        return list;
    }

    /**
     * Renders full knowledge graph structure for tenant.
     */
    getGraph(filters = {}, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';
        let nodes = this.listEntities(filters, tid);
        let edges = this.listRelationships(filters, tid);

        if (filters.entityId) {
            const targetId = filters.entityId;
            const connectedEdges = edges.filter(e => e.sourceEntityId === targetId || e.targetEntityId === targetId);
            const connectedEntityIds = new Set([targetId]);
            connectedEdges.forEach(e => {
                connectedEntityIds.add(e.sourceEntityId);
                connectedEntityIds.add(e.targetEntityId);
            });

            nodes = Array.from(this.entities.values()).filter(e => e.tenantId === tid && connectedEntityIds.has(e.entityId));
            edges = connectedEdges;
        }

        return {
            tenantId: tid,
            nodesCount: nodes.length,
            edgesCount: edges.length,
            nodes,
            edges
        };
    }
}

module.exports = {
    AgentKnowledgeGraphService,
    ENTITY_TYPES,
    RELATIONSHIP_TYPES,
    ORIGINS
};
