/**
 * Knowledge Graph Builder
 * Assembles entity nodes and relationship edges in AgentKnowledgeGraphService
 * from existing platform records without duplicating underlying data.
 */

class KnowledgeGraphBuilder {
    constructor(options = {}) {
        this.graphService = options.graphService || null;
        this.monitoringService = options.monitoringService || null;
        this.agentRegistry = options.agentRegistry || null;
        this.dependencyService = options.dependencyService || null;
        this.automationEngine = options.automationEngine || null;
        this.decisionService = options.decisionService || null;
        this.workflowService = options.workflowService || null;
        this.remediationService = options.remediationService || null;
        this.alertingService = options.alertingService || null;
        this.auditService = options.auditService || null;
    }

    /**
     * Builds and updates knowledge graph entities and edges from existing system records.
     */
    syncGraph(tenantId = 'default-tenant') {
        if (!this.graphService) return { success: false, reason: 'No graphService provided.' };

        const tid = tenantId || 'default-tenant';
        let syncedEntities = 0;
        let syncedRelationships = 0;

        // 1. Sync Agents & Health
        if (this.monitoringService && this.monitoringService.store) {
            try {
                const statuses = Array.from(this.monitoringService.store.statuses.values())
                    .filter(s => s.tenantId === tid);

                statuses.forEach(st => {
                    const agentId = st.agentId;
                    this.graphService.addEntity({
                        entityId: agentId,
                        entityType: 'AGENT',
                        tenantId: tid,
                        label: `Agent ${agentId}`,
                        source: 'AGENT_REGISTRY',
                        metadata: { healthState: st.currentState, consecutiveFailures: st.consecutiveFailures }
                    }, tid);
                    syncedEntities++;

                    // Add Health Check Entity
                    const checkId = `check_${agentId}_latest`;
                    this.graphService.addEntity({
                        entityId: checkId,
                        entityType: 'HEALTH_CHECK',
                        tenantId: tid,
                        label: `Health Check for ${agentId}`,
                        source: 'MONITORING_STORE',
                        metadata: { status: st.currentState, timestamp: st.updatedAt }
                    }, tid);
                    syncedEntities++;

                    this.graphService.addRelationship({
                        sourceEntityId: agentId,
                        targetEntityId: checkId,
                        relationshipType: 'AGENT_HAS_HEALTH_CHECK',
                        origin: 'OBSERVED',
                        confidence: 1.0,
                        evidence: `Latest health check status: ${st.currentState}`
                    }, tid);
                    syncedRelationships++;
                });

                // Sync Incidents
                const incidents = this.monitoringService.store.listIncidents(tid);
                incidents.forEach(inc => {
                    const incEntityId = inc.id;
                    this.graphService.addEntity({
                        entityId: incEntityId,
                        entityType: 'INCIDENT',
                        tenantId: tid,
                        label: `Incident ${incEntityId}`,
                        source: 'INCIDENT_STORE',
                        metadata: { severity: inc.severity, status: inc.status, summary: inc.summary }
                    }, tid);
                    syncedEntities++;

                    if (inc.agentId) {
                        this.graphService.addRelationship({
                            sourceEntityId: inc.agentId,
                            targetEntityId: incEntityId,
                            relationshipType: 'AGENT_HAS_INCIDENT',
                            origin: 'OBSERVED',
                            confidence: 1.0,
                            evidence: `Incident ${incEntityId} opened for primary agent ${inc.agentId}`
                        }, tid);
                        syncedRelationships++;
                    }

                    if (Array.isArray(inc.affectedAgentIds)) {
                        inc.affectedAgentIds.forEach(affId => {
                            this.graphService.addRelationship({
                                sourceEntityId: incEntityId,
                                targetEntityId: affId,
                                relationshipType: 'INCIDENT_INVOLVES_AGENT',
                                origin: 'DERIVED',
                                confidence: 0.90,
                                evidence: `Agent ${affId} identified as affected in incident ${incEntityId}`
                            }, tid);
                            syncedRelationships++;
                        });
                    }
                });
            } catch (_) {}
        }

        // 2. Sync Dependencies
        if (this.dependencyService) {
            try {
                const deps = this.dependencyService.listDependencies({}, tid);
                deps.forEach(dep => {
                    const depEntityId = dep.dependencyId;
                    this.graphService.addEntity({
                        entityId: depEntityId,
                        entityType: 'DEPENDENCY',
                        tenantId: tid,
                        label: `${dep.sourceAgentId} -> ${dep.targetAgentId}`,
                        source: 'DEPENDENCY_SERVICE',
                        metadata: { relationshipType: dep.relationshipType, criticality: dep.criticality, origin: dep.origin }
                    }, tid);
                    syncedEntities++;

                    this.graphService.addRelationship({
                        sourceEntityId: dep.sourceAgentId,
                        targetEntityId: dep.targetAgentId,
                        relationshipType: 'AGENT_DEPENDS_ON_AGENT',
                        origin: dep.origin || 'DECLARED',
                        confidence: dep.confidence || 1.0,
                        evidence: `Dependency '${dep.relationshipType}' with criticality '${dep.criticality}'`
                    }, tid);
                    syncedRelationships++;
                });
            } catch (_) {}
        }

        // 3. Sync Automation Decisions
        if (this.decisionService) {
            try {
                const decs = this.decisionService.listDecisions({}, tid);
                decs.forEach(dec => {
                    const decId = dec.decisionId;
                    this.graphService.addEntity({
                        entityId: decId,
                        entityType: 'AUTOMATION_DECISION',
                        tenantId: tid,
                        label: `Decision ${decId}`,
                        source: 'DECISION_SERVICE',
                        metadata: { status: dec.status, policyId: dec.policyId }
                    }, tid);
                    syncedEntities++;

                    if (dec.agentId) {
                        this.graphService.addRelationship({
                            sourceEntityId: dec.policyId || 'policy_default',
                            targetEntityId: decId,
                            relationshipType: 'POLICY_TRIGGERED_DECISION',
                            origin: 'OBSERVED',
                            confidence: 1.0,
                            evidence: `Decision generated for agent ${dec.agentId}`
                        }, tid);
                        syncedRelationships++;
                    }
                });
            } catch (_) {}
        }

        return {
            success: true,
            tenantId: tid,
            syncedEntities,
            syncedRelationships,
            syncedAt: new Date().toISOString()
        };
    }
}

module.exports = {
    KnowledgeGraphBuilder
};
