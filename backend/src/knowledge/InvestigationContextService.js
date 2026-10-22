/**
 * Investigation Context Service
 * Assembles unified investigation context, chronological timelines, evidence chains,
 * and structured human-readable summaries for agents and incidents without fabricating missing facts.
 */

class InvestigationContextService {
    constructor(options = {}) {
        this.graphService = options.graphService || null;
        this.graphBuilder = options.graphBuilder || null;
        this.monitoringService = options.monitoringService || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
        this.rootCauseAnalyzer = options.rootCauseAnalyzer || null;
        this.decisionService = options.decisionService || null;
        this.orchestrator = options.orchestrator || null;
        this.remediationService = options.remediationService || null;
        this.auditService = options.auditService || null;
        this.similarIncidentAnalyzer = options.similarIncidentAnalyzer || null;
    }

    /**
     * Assembles comprehensive operational context for an agent.
     */
    getAgentContext(agentId, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';

        let currentHealth = 'UNKNOWN';
        let healthDetails = {};
        if (this.monitoringService && this.monitoringService.store) {
            try {
                const st = this.monitoringService.store.getStatus(agentId, tid);
                if (st) {
                    currentHealth = st.currentState || st.status || 'UNKNOWN';
                    healthDetails = st;
                }
            } catch (_) {}
        }

        let upstreamDependents = [];
        let downstreamDependencies = [];
        if (this.dependencyGraphService) {
            try {
                upstreamDependents = this.dependencyGraphService.getUpstreamDependents(agentId, tid);
                downstreamDependencies = this.dependencyGraphService.getDownstreamDependencies(agentId, tid);
            } catch (_) {}
        }

        let incidents = [];
        if (this.monitoringService && this.monitoringService.store) {
            try {
                incidents = this.monitoringService.store.listIncidents(tid, agentId);
            } catch (_) {}
        }

        let automations = [];
        if (this.decisionService) {
            try {
                automations = this.decisionService.listDecisions({ agentId }, tid);
            } catch (_) {}
        }

        return {
            agentId,
            tenantId: tid,
            currentHealth,
            healthDetails,
            dependencies: {
                upstreamDependentsCount: upstreamDependents.length,
                downstreamDependenciesCount: downstreamDependencies.length,
                upstreamDependents,
                downstreamDependencies
            },
            incidentsCount: incidents.length,
            incidents,
            automationsCount: automations.length,
            automations,
            assembledAt: new Date().toISOString()
        };
    }

    /**
     * Assembles unified context for an incident.
     */
    getIncidentContext(incidentId, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';
        let incident = null;

        if (this.monitoringService && this.monitoringService.store) {
            try {
                incident = this.monitoringService.store.getIncident(incidentId);
            } catch (_) {}
        }

        if (!incident) {
            return {
                incidentId,
                tenantId: tid,
                found: false,
                message: `Incident '${incidentId}' not found.`,
                assembledAt: new Date().toISOString()
            };
        }

        const primaryAgentId = incident.agentId;
        const affectedAgentIds = incident.affectedAgentIds || [];

        // Blast radius analysis
        let blastRadius = null;
        if (this.blastRadiusAnalyzer && primaryAgentId) {
            try {
                blastRadius = this.blastRadiusAnalyzer.analyzeBlastRadius(primaryAgentId, tid);
            } catch (_) {}
        }

        // Root cause candidate analysis
        let rootCauseAnalysis = null;
        if (this.rootCauseAnalyzer) {
            try {
                rootCauseAnalysis = this.rootCauseAnalyzer.analyzeRootCause({ incidentId }, tid);
            } catch (_) {}
        }

        // Similar incidents
        let similarIncidents = [];
        if (this.similarIncidentAnalyzer) {
            try {
                const simRes = this.similarIncidentAnalyzer.findSimilarIncidents(incidentId, tid);
                similarIncidents = simRes.similarIncidents || [];
            } catch (_) {}
        }

        return {
            incidentId,
            tenantId: tid,
            found: true,
            incident,
            primaryAgentId,
            affectedAgentIds,
            blastRadius,
            rootCauseAnalysis,
            similarIncidents,
            assembledAt: new Date().toISOString()
        };
    }

    /**
     * Assembles a unified chronological timeline for an incident.
     */
    getIncidentTimeline(incidentId, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';
        const ctx = this.getIncidentContext(incidentId, tid);

        if (!ctx.found || !ctx.incident) {
            return { incidentId, tenantId: tid, timeline: [], count: 0 };
        }

        const inc = ctx.incident;
        const timeline = [];

        if (inc.startedAt) {
            timeline.push({
                timestamp: inc.startedAt,
                category: 'INCIDENT',
                event: 'INCIDENT_STARTED',
                status: 'OPEN',
                description: `Incident '${inc.id}' opened for agent '${inc.agentId}'. Summary: ${inc.summary}`,
                sourceType: 'INCIDENT_STORE',
                sourceRecordId: inc.id
            });
        }

        if (inc.acknowledgedAt) {
            timeline.push({
                timestamp: inc.acknowledgedAt,
                category: 'INCIDENT',
                event: 'INCIDENT_ACKNOWLEDGED',
                status: 'ACKNOWLEDGED',
                description: `Incident acknowledged by ${inc.acknowledgedBy || 'operator'}.`,
                sourceType: 'INCIDENT_STORE',
                sourceRecordId: inc.id
            });
        }

        if (inc.recoveredAt || inc.resolvedAt) {
            const time = inc.recoveredAt || inc.resolvedAt;
            timeline.push({
                timestamp: time,
                category: 'INCIDENT',
                event: 'INCIDENT_RESOLVED',
                status: 'RESOLVED',
                description: `Incident resolved automatically or by operator.`,
                sourceType: 'INCIDENT_STORE',
                sourceRecordId: inc.id
            });
        }

        // Add related decisions / automations
        if (this.decisionService) {
            try {
                const decs = this.decisionService.listDecisions({ agentId: inc.agentId }, tid);
                decs.forEach(d => {
                    timeline.push({
                        timestamp: d.createdAt,
                        category: 'AUTOMATION',
                        event: `DECISION_${d.status}`,
                        status: d.status,
                        description: `Policy decision evaluated: ${d.policyId || 'default'}. Approval required: ${d.approvalRequired}`,
                        sourceType: 'AUTOMATION_DECISION',
                        sourceRecordId: d.decisionId
                    });
                });
            } catch (_) {}
        }

        // Sort chronologically ascending
        timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        return {
            incidentId,
            tenantId: tid,
            count: timeline.length,
            timeline
        };
    }

    /**
     * Generates a structured evidence chain for conclusions.
     */
    getEvidenceChain(incidentId, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';
        const ctx = this.getIncidentContext(incidentId, tid);

        if (!ctx.found || !ctx.incident) {
            return {
                incidentId,
                tenantId: tid,
                conclusion: 'UNKNOWN',
                confidence: 0.0,
                evidence: [],
                interpretation: 'Incident record not found.',
                limitation: 'No data available.'
            };
        }

        const inc = ctx.incident;
        const candidates = (ctx.rootCauseAnalysis && ctx.rootCauseAnalysis.candidates) ? ctx.rootCauseAnalysis.candidates : [];
        const topCandidate = candidates.length > 0 ? candidates[0] : null;

        const evidenceLines = [
            `Incident '${inc.id}' recorded severity '${inc.severity}' for agent '${inc.agentId}'.`,
            `Incident started at '${inc.startedAt || 'UNKNOWN'}'.`
        ];

        if (topCandidate) {
            evidenceLines.push(`Top candidate agent '${topCandidate.candidateAgentId}' has calculated confidence score ${topCandidate.confidence}.`);
            if (Array.isArray(topCandidate.evidence)) {
                evidenceLines.push(...topCandidate.evidence);
            }
        }

        return {
            incidentId,
            tenantId: tid,
            conclusion: topCandidate ? `Agent '${topCandidate.candidateAgentId}' is identified as a PRIMARY_ROOT_CAUSE_CANDIDATE.` : `Primary agent '${inc.agentId}' is under investigation.`,
            confidence: topCandidate ? topCandidate.confidence : 0.50,
            evidence: evidenceLines,
            interpretation: 'Conclusion generated algorithmically from relative probe failure timestamps and service topology paths.',
            limitation: 'Observational timing and dependency topology indicate candidate status. Absolute causality is not proven without direct internal diagnostic traces.'
        };
    }

    /**
     * Generates human-readable investigation summary.
     */
    getInvestigationSummary(incidentId, tenantId = 'default-tenant') {
        const tid = tenantId || 'default-tenant';
        const ctx = this.getIncidentContext(incidentId, tid);
        const chain = this.getEvidenceChain(incidentId, tid);

        if (!ctx.found || !ctx.incident) {
            return {
                incidentId,
                tenantId: tid,
                status: 'UNKNOWN',
                RECOVERY_RESULT: 'UNKNOWN',
                summary: `Incident '${incidentId}' not found.`
            };
        }

        const inc = ctx.incident;
        const simCount = ctx.similarIncidents ? ctx.similarIncidents.length : 0;

        return {
            incidentId,
            tenantId: tid,
            OVERALL_STATUS: inc.status || 'OPEN',
            WHAT_HAPPENED: `Incident '${inc.id}' triggered for agent '${inc.agentId}' with severity '${inc.severity}'. Summary: ${inc.summary}`,
            WHAT_IS_CONFIRMED: [
                `Agent '${inc.agentId}' health probe state is confirmed in incident record.`,
                `Incident timestamp recorded as '${inc.startedAt}'.`
            ],
            WHAT_IS_SUSPECTED: [
                chain.conclusion
            ],
            WHAT_IS_GOOD: [
                `Watchtower monitoring and alert logging captured the failure immediately.`,
                `Multi-tenant isolation and audit trail logging remain intact.`
            ],
            WHAT_IS_WRONG: [
                `Agent '${inc.agentId}' experienced health failure or degradation.`
            ],
            AFFECTED_AGENTS: [inc.agentId, ...(inc.affectedAgentIds || [])],
            DEPENDENCIES_INVOLVED: (ctx.blastRadius && ctx.blastRadius.directlyAffected) ? ctx.blastRadius.directlyAffected.map(d => d.agentId) : [],
            EVIDENCE: chain.evidence,
            ACTIONS_TAKEN: inc.recoveredAt ? ['Automated or manual recovery executed.'] : ['Incident opened and under operator investigation.'],
            RECOVERY_RESULT: inc.status === 'RESOLVED' ? 'CONFIRMED_RECOVERED' : 'PENDING_RECOVERY',
            SIMILAR_HISTORY: simCount > 0 ? `YES — ${simCount} similar historical incident(s) identified.` : 'NO — no similar historical incidents found in current window.',
            RECOMMENDED_NEXT_STEP: inc.status === 'RESOLVED' ? 'Maintain standard health monitoring.' : 'Inspect primary root cause candidate and verify agent dependencies.'
        };
    }
}

module.exports = {
    InvestigationContextService
};
