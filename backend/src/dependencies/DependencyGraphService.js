/**
 * Dependency Graph Service
 * Builds in-memory directional dependency graphs, graph traversal, cycle detection,
 * depth calculation, topological recovery ordering, and topology visualization schemas.
 */

class DependencyGraphService {
    constructor(options = {}) {
        this.dependencyService = options.dependencyService || null;
        this.monitoringService = options.monitoringService || null;
        this.agentRegistry = options.agentRegistry || null;

        if (this.dependencyService && typeof this.dependencyService.setGraphService === 'function') {
            this.dependencyService.setGraphService(this);
        }
    }

    setDependencyService(dependencyService) {
        this.dependencyService = dependencyService;
        if (this.dependencyService && typeof this.dependencyService.setGraphService === 'function') {
            this.dependencyService.setGraphService(this);
        }
    }

    /**
     * Gets all active dependency edges for a tenant.
     */
    _getEdges(tenantId = 'default-tenant') {
        if (!this.dependencyService) return [];
        return this.dependencyService.listDependencies({ status: 'ACTIVE' }, tenantId);
    }

    /**
     * Returns direct upstream dependents (agents that depend directly on agentId).
     */
    getDirectUpstream(agentId, tenantId = 'default-tenant') {
        const edges = this._getEdges(tenantId);
        return edges.filter(e => e.targetAgentId === agentId).map(e => ({
            agentId: e.sourceAgentId,
            relationshipType: e.relationshipType,
            criticality: e.criticality,
            dependencyId: e.dependencyId
        }));
    }

    /**
     * Returns direct downstream dependencies (agents that agentId directly depends on).
     */
    getDirectDownstream(agentId, tenantId = 'default-tenant') {
        const edges = this._getEdges(tenantId);
        return edges.filter(e => e.sourceAgentId === agentId).map(e => ({
            agentId: e.targetAgentId,
            relationshipType: e.relationshipType,
            criticality: e.criticality,
            dependencyId: e.dependencyId
        }));
    }

    /**
     * Returns all upstream dependents (direct and indirect) that depend on target agentId.
     */
    getUpstreamDependents(agentId, tenantId = 'default-tenant') {
        const visited = new Set();
        const result = [];
        const queue = [{ id: agentId, depth: 0 }];

        while (queue.length > 0) {
            const { id, depth } = queue.shift();
            const directUpstream = this.getDirectUpstream(id, tenantId);

            for (const item of directUpstream) {
                if (!visited.has(item.agentId) && item.agentId !== agentId) {
                    visited.add(item.agentId);
                    result.push({
                        agentId: item.agentId,
                        depth: depth + 1,
                        directTarget: id,
                        relationshipType: item.relationshipType,
                        criticality: item.criticality
                    });
                    queue.push({ id: item.agentId, depth: depth + 1 });
                }
            }
        }

        return result;
    }

    /**
     * Returns all downstream dependencies (direct and indirect) that source agentId depends on.
     */
    getDownstreamDependencies(agentId, tenantId = 'default-tenant') {
        const visited = new Set();
        const result = [];
        const queue = [{ id: agentId, depth: 0 }];

        while (queue.length > 0) {
            const { id, depth } = queue.shift();
            const directDownstream = this.getDirectDownstream(id, tenantId);

            for (const item of directDownstream) {
                if (!visited.has(item.agentId) && item.agentId !== agentId) {
                    visited.add(item.agentId);
                    result.push({
                        agentId: item.agentId,
                        depth: depth + 1,
                        directSource: id,
                        relationshipType: item.relationshipType,
                        criticality: item.criticality
                    });
                    queue.push({ id: item.agentId, depth: depth + 1 });
                }
            }
        }

        return result;
    }

    /**
     * Calculates max dependency depth for an agent.
     */
    calculateDepth(agentId, tenantId = 'default-tenant') {
        const downstream = this.getDownstreamDependencies(agentId, tenantId);
        if (downstream.length === 0) return 0;
        return Math.max(...downstream.map(d => d.depth));
    }

    /**
     * Detects circular dependencies in the graph for a tenant.
     */
    detectCycle(tenantId = 'default-tenant') {
        const edges = this._getEdges(tenantId);
        return this._findCycleInEdges(edges);
    }

    /**
     * Helper to check if adding a prospective edge creates a cycle.
     */
    detectCycleWithCandidate(tenantId = 'default-tenant', candidateEdge) {
        const edges = [...this._getEdges(tenantId), candidateEdge];
        return this._findCycleInEdges(edges);
    }

    _findCycleInEdges(edges) {
        const adj = new Map();
        edges.forEach(e => {
            if (!adj.has(e.sourceAgentId)) adj.set(e.sourceAgentId, []);
            adj.get(e.sourceAgentId).push(e.targetAgentId);
        });

        const visited = new Map(); // 0 = unvisited, 1 = visiting, 2 = visited
        const path = [];
        let cyclePath = null;

        const dfs = (node) => {
            visited.set(node, 1);
            path.push(node);

            const neighbors = adj.get(node) || [];
            for (const neighbor of neighbors) {
                if (visited.get(neighbor) === 1) {
                    // Cycle detected!
                    const cycleStart = path.indexOf(neighbor);
                    cyclePath = [...path.slice(cycleStart), neighbor];
                    return true;
                }
                if (!visited.get(neighbor)) {
                    if (dfs(neighbor)) return true;
                }
            }

            path.pop();
            visited.set(node, 2);
            return false;
        };

        for (const node of adj.keys()) {
            if (!visited.get(node)) {
                if (dfs(node)) {
                    return { hasCycle: true, cyclePath };
                }
            }
        }

        return { hasCycle: false, cyclePath: [] };
    }

    /**
     * Computes optimal topological recovery ordering (root dependencies first, then dependents).
     */
    getRecoveryOrder(agentIds = [], tenantId = 'default-tenant') {
        if (!Array.isArray(agentIds) || agentIds.length === 0) return [];

        const uniqueAgents = Array.from(new Set(agentIds));
        const edges = this._getEdges(tenantId);

        // Build in-degree map relative to the candidate set
        const inDegree = new Map();
        const adj = new Map();

        uniqueAgents.forEach(id => {
            inDegree.set(id, 0);
            adj.set(id, []);
        });

        // Add edge if source -> target (source depends on target)
        // For recovery order, target (provider) must be recovered BEFORE source (dependent)
        edges.forEach(e => {
            if (uniqueAgents.includes(e.sourceAgentId) && uniqueAgents.includes(e.targetAgentId)) {
                // target -> source dependency direction for recovery
                adj.get(e.targetAgentId).push(e.sourceAgentId);
                inDegree.set(e.sourceAgentId, (inDegree.get(e.sourceAgentId) || 0) + 1);
            }
        });

        // Kahn's algorithm for topological sorting
        const queue = uniqueAgents.filter(id => inDegree.get(id) === 0);
        const order = [];

        while (queue.length > 0) {
            const curr = queue.shift();
            order.push(curr);

            const neighbors = adj.get(curr) || [];
            for (const neighbor of neighbors) {
                inDegree.set(neighbor, inDegree.get(neighbor) - 1);
                if (inDegree.get(neighbor) === 0) {
                    queue.push(neighbor);
                }
            }
        }

        // Add any remaining agents if cycles existed
        uniqueAgents.forEach(id => {
            if (!order.includes(id)) order.push(id);
        });

        return order;
    }

    /**
     * Renders full service topology graph.
     */
    getTopology(tenantId = 'default-tenant') {
        const edges = this._getEdges(tenantId);
        const nodeSet = new Set();

        edges.forEach(e => {
            nodeSet.add(e.sourceAgentId);
            nodeSet.add(e.targetAgentId);
        });

        const nodes = Array.from(nodeSet).map(agentId => {
            let health = 'UNKNOWN';
            let dependencyStatus = 'HEALTHY';

            if (this.monitoringService && this.monitoringService.store) {
                try {
                    const st = this.monitoringService.store.getStatus(agentId, tenantId);
                    if (st) health = st.currentState || st.status || 'UNKNOWN';
                } catch (_) {}
            }

            // Check if any downstream dependency is unhealthy
            const downstream = this.getDirectDownstream(agentId, tenantId);
            for (const dep of downstream) {
                let depHealth = 'UNKNOWN';
                if (this.monitoringService && this.monitoringService.store) {
                    try {
                        const dst = this.monitoringService.store.getStatus(dep.agentId, tenantId);
                        if (dst) depHealth = dst.currentState || dst.status || 'UNKNOWN';
                    } catch (_) {}
                }
                if (depHealth === 'OFFLINE' || depHealth === 'UNHEALTHY') {
                    dependencyStatus = dep.criticality === 'CRITICAL' ? 'BLOCKED' : 'DEPENDENCY_DEGRADED';
                    break;
                } else if (depHealth === 'DEGRADED') {
                    if (dependencyStatus !== 'BLOCKED') dependencyStatus = 'AT_RISK';
                }
            }

            return {
                agentId,
                health,
                dependencyStatus,
                upstreamCount: this.getDirectUpstream(agentId, tenantId).length,
                downstreamCount: downstream.length
            };
        });

        return {
            tenantId,
            nodes,
            edges: edges.map(e => ({
                dependencyId: e.dependencyId,
                sourceAgentId: e.sourceAgentId,
                targetAgentId: e.targetAgentId,
                relationshipType: e.relationshipType,
                criticality: e.criticality,
                origin: e.origin,
                confidence: e.confidence,
                status: e.status
            }))
        };
    }
}

module.exports = {
    DependencyGraphService
};
