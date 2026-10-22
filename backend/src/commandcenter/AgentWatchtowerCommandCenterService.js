/**
 * Agent Watchtower Command Center Service
 * Orchestrates existing platform services (Monitoring, Health, Intelligence, Analytics, Automations,
 * Dependencies, Knowledge Graph, Investigation Context, Search) into a unified operational Command Center.
 * 
 * References source-of-truth records without duplication.
 */

const { OperatorAttentionEngine } = require('./OperatorAttentionEngine');
const { CommandCenterScorecardService } = require('./CommandCenterScorecardService');
const { OperationalChangeFeedService } = require('./OperationalChangeFeedService');
const { OperationalNarrativeService } = require('./OperationalNarrativeService');

class AgentWatchtowerCommandCenterService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService;
        this.agentRegistry = options.agentRegistry || options.systemRegistry;
        this.agentService = options.agentService;
        this.telemetryIngestionService = options.telemetryIngestionService || null;
        this.alertingService = options.alertingService || null;
        this.knowledgeGraphService = options.knowledgeGraphService || options.agentKnowledgeGraphService;
        this.knowledgeGraphBuilder = options.knowledgeGraphBuilder;
        this.investigationContextService = options.investigationContextService;
        this.similarIncidentAnalyzer = options.similarIncidentAnalyzer;
        this.operationalSearchService = options.operationalSearchService;
        this.dependencyGraphService = options.dependencyGraphService;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer;
        this.rootCauseAnalyzer = options.rootCauseAnalyzer;
        this.baselineEngine = options.baselineEngine || options.predictiveBaselineEngine;
        this.anomalyService = options.anomalyService || options.anomalyDetectionService;
        this.riskEngine = options.riskEngine || options.predictiveRiskEngine;
        this.remediationService = options.remediationService;
        this.operationalAnalyticsService = options.operationalAnalyticsService;
        this.automationPolicyEngine = options.automationPolicyEngine;
        this.automationDecisionService = options.automationDecisionService;
        this.intelligentWorkflowOrchestrator = options.intelligentWorkflowOrchestrator;
        this.auditService = options.auditService || options.auditLogService;

        this.store = options.store || (this.monitoringService ? this.monitoringService.store : null);

        // Sub-engines
        this.attentionEngine = options.attentionEngine || new OperatorAttentionEngine({
            monitoringService: this.monitoringService,
            agentRegistry: this.agentRegistry,
            riskEngine: this.riskEngine,
            anomalyService: this.anomalyService,
            remediationService: this.remediationService,
            decisionService: this.automationDecisionService,
            dependencyService: options.agentDependencyService,
            store: this.store
        });

        this.scorecardService = options.scorecardService || new CommandCenterScorecardService({
            monitoringService: this.monitoringService,
            agentRegistry: this.agentRegistry,
            riskEngine: this.riskEngine,
            anomalyService: this.anomalyService,
            remediationService: this.remediationService,
            decisionService: this.automationDecisionService,
            dependencyService: options.agentDependencyService,
            store: this.store
        });

        this.changeFeedService = options.changeFeedService || new OperationalChangeFeedService({
            monitoringService: this.monitoringService,
            riskEngine: this.riskEngine,
            anomalyService: this.anomalyService,
            remediationService: this.remediationService,
            decisionService: this.automationDecisionService,
            auditService: this.auditService,
            store: this.store
        });

        this.narrativeService = options.narrativeService || new OperationalNarrativeService({
            monitoringService: this.monitoringService,
            agentRegistry: this.agentRegistry,
            riskEngine: this.riskEngine,
            anomalyService: this.anomalyService,
            remediationService: this.remediationService,
            dependencyService: options.agentDependencyService,
            store: this.store
        });
    }

    _resolveTenantCandidates(tenantId) {
        // Tenant-tolerant only for the legacy default/default-tenant pair.
        // Arbitrary tenants (tenant-1, tenant-A, ...) stay strictly isolated.
        const t = tenantId || 'default-tenant';
        if (t === 'default' || t === 'default-tenant') {
            return [t, t === 'default' ? 'default-tenant' : 'default'];
        }
        return [t];
    }

    _isDefaultPairTenant(tenantId) {
        return tenantId === 'default' || tenantId === 'default-tenant';
    }

    _matchesTenant(recordTenant, tenantId) {
        if (tenantId === 'all') return true;
        if (recordTenant === tenantId) return true;
        if (this._isDefaultPairTenant(tenantId) && this._isDefaultPairTenant(recordTenant)) return true;
        return false;
    }

    _isMonitoredRecord(s) {
        const id = s.agentId || s.id;
        return typeof id === 'string' && id.length > 0 && !id.includes('[object Object]');
    }

    _getAgents(tenantId) {
        // Tenant-tolerant for the legacy default/default-tenant pair only
        // (browser sends no tenant header; monitoring writes default-tenant,
        // command-center reads default). Arbitrary tenants stay isolated.
        if (this.store && this.store.statuses) {
            const list = Array.from(this.store.statuses.values())
                .filter(s => this._isMonitoredRecord(s) && this._matchesTenant(s.tenantId, tenantId));
            if (list.length > 0) return list;
        }
        if (this.agentRegistry && typeof this.agentRegistry.getAllAgents === 'function') {
            return this.agentRegistry.getAllAgents(tenantId) || [];
        }
        return [];
    }

    _findMonitoredRecord(agentId, tenantId) {
        if (!this.store) return null;
        const candidates = this._resolveTenantCandidates(tenantId);
        for (const t of candidates) {
            try {
                const key = `${t}:${agentId}`;
                if (this.store.statuses && this.store.statuses.has(key)) {
                    return { ...(this.store.statuses.get(key)), _resolvedTenant: t };
                }
            } catch (_) {}
        }
        // Fallback within the same tenant only (no cross-tenant scan).
        if (this.store.statuses) {
            for (const s of this.store.statuses.values()) {
                if ((s.agentId || s.id) === agentId && candidates.includes(s.tenantId)) {
                    return { ...s, _resolvedTenant: s.tenantId };
                }
            }
        }
        return null;
    }

    /**
     * Get Complete Command Center Overview Snapshot
     * @param {Object} options
     * @returns {Object} Command Center Snapshot
     */
    getOverview(options = {}) {
        const tenantId = options.tenantId || 'default';
        const scorecard = this.scorecardService.getScorecard({ tenantId });
        const attentionItems = this.attentionEngine.evaluateAttentionItems({ tenantId });
        const activeIncidents = this.getActiveIncidents({ tenantId });
        const healthSummary = this.getAgentHealthSummary({ tenantId });
        const runningAutomations = this.getRunningAutomations({ tenantId });
        const runningRemediations = this.getRunningRemediations({ tenantId });
        const recentChanges = this.changeFeedService.getChangeFeed({ tenantId, limit: 15 });
        const narrative = this.narrativeService.generateNarrative({ tenantId });

        return {
            timestamp: new Date().toISOString(),
            tenantId,
            monitoringStatus: 'ACTIVE',
            scorecard,
            attentionItems,
            activeIncidents,
            agentSummary: healthSummary,
            runningAutomations,
            runningRemediations,
            recentChanges,
            narrative
        };
    }

    /**
     * Get Operator Attention Items
     */
    getAttentionItems(options = {}) {
        return this.attentionEngine.evaluateAttentionItems(options);
    }

    /**
     * Get Active Incidents with Root Cause Candidates & Next Actions
     */
    getActiveIncidents(options = {}) {
        const tenantId = options.tenantId || 'default';
        if (!this.store) return [];

        const activeIncidents = typeof this.store.getActiveIncidents === 'function' && !this._isDefaultPairTenant(tenantId)
            ? this.store.getActiveIncidents(tenantId)
            : (this.store.incidents ? Array.from(this.store.incidents.values()).filter(i => this._matchesTenant(i.tenantId, tenantId) && i.status !== 'RESOLVED' && i.status !== 'RECOVERED') : []);

        return activeIncidents.map(inc => {
            const incId = inc.incidentId || inc.id;
            let rootCauseCandidates = [];
            let blastRadius = null;

            if (this.rootCauseAnalyzer && typeof this.rootCauseAnalyzer.analyzeRootCause === 'function') {
                try {
                    rootCauseCandidates = this.rootCauseAnalyzer.analyzeRootCause(inc.agentId, { tenantId });
                } catch (e) {
                    rootCauseCandidates = [];
                }
            }

            if (this.blastRadiusAnalyzer && typeof this.blastRadiusAnalyzer.calculateBlastRadius === 'function') {
                try {
                    blastRadius = this.blastRadiusAnalyzer.calculateBlastRadius(inc.agentId, { tenantId });
                } catch (e) {
                    blastRadius = null;
                }
            }

            const evidenceCount = (rootCauseCandidates.length > 0 ? 1 : 0) + (inc.triggerType ? 1 : 0);
            const evidenceStatus = evidenceCount > 1 ? 'CONFIRMED' : (evidenceCount > 0 ? 'INFERRED' : 'UNKNOWN');

            return {
                incidentId: incId,
                agentId: inc.agentId,
                title: inc.title || `Incident on ${inc.agentId}`,
                severity: inc.severity || 'HIGH',
                status: inc.status || 'OPEN',
                startedAt: inc.createdAt || new Date().toISOString(),
                durationSeconds: inc.createdAt ? Math.floor((Date.now() - new Date(inc.createdAt).getTime()) / 1000) : 0,
                triggerType: inc.triggerType || inc.type || 'HEALTH_CHECK',
                rootCauseCandidate: rootCauseCandidates.length > 0 ? rootCauseCandidates[0] : null,
                blastRadius: blastRadius ? blastRadius.affectedAgentsCount || 0 : 0,
                evidenceStatus,
                lastAction: inc.lastAction || 'Incident reported',
                nextOperatorAction: 'Review timeline, investigate root-cause candidates, and verify automated recovery.'
            };
        });
    }

    /**
     * Get Summary of Monitored Agent Health & Status
     */
    getAgentHealthSummary(options = {}) {
        const tenantId = options.tenantId || 'default';
        if (!this.store) return [];

        const agents = this._getAgents(tenantId);

        return agents.map(a => {
            const agentId = a.agentId || a.id;

            const isExternal = Boolean((a.metadata && a.metadata.isExternal) || agentId === 'compa-agent-ext' || agentId === 'repa-agent-ext');
            // Execution support requires real evidence: a recorded execution
            // result or a discovered execution-like capability. Never inferred
            // from agent IDs, categories, or operator-typed capability words.
            const discoveredForExec = Array.isArray(a.capabilities) ? a.capabilities : [];
            const hasExecutionEvidence = Boolean(a.lastExecutionResult) || discoveredForExec.some(c => {
                const n = String((c && (c.id || c.name)) || c || '');
                return /execut|invoke|trigger|action|operation/i.test(n);
            });
            const executionSupport = hasExecutionEvidence ? 'SUPPORTED' : 'UNSUPPORTED';
            const externalNote = isExternal ? 'External agent probed via HTTP. Internal telemetry and execution APIs are unsupported.' : null;

            let risk = { level: 'LOW', score: 0.0 };
            if (this.riskEngine && typeof this.riskEngine.getRiskScores === 'function') {
                const scores = this.riskEngine.getRiskScores(tenantId);
                if (scores[agentId]) risk = scores[agentId];
            }

            let anomalyState = 'NONE';
            if (this.anomalyService && typeof this.anomalyService.getRecentAnomalies === 'function') {
                const anomalies = this.anomalyService.getRecentAnomalies(tenantId);
                if (anomalies && anomalies.some(an => an.agentId === agentId)) {
                    anomalyState = 'DETECTED';
                }
            }

            const hasActiveIncident = this.store.incidents
                ? Array.from(this.store.incidents.values()).some(i => i.agentId === agentId && this._matchesTenant(i.tenantId, tenantId) && i.status !== 'RESOLVED' && i.status !== 'RECOVERED')
                : false;

            return {
                agentId,
                name: a.name || agentId,
                status: (a.status || a.healthStatus || a.currentState || 'UNKNOWN').toUpperCase(),
                // Honest nulls only: never fabricate 100% availability or 0 ms
                // latency. Callers render null as INSUFFICIENT/NEVER CHECKED.
                availabilityPercent: a.metrics?.availabilityPercent ?? a.availabilityPercent ?? a.availabilityPercentage ?? null,
                latencyMs: a.metrics?.latencyMs ?? a.latencyMs ?? a.latency?.lastLatencyMs ?? null,
                riskLevel: risk.level || 'LOW',
                riskScore: risk.score || 0.0,
                anomalyState,
                incidentState: hasActiveIncident ? 'ACTIVE_INCIDENT' : 'CLEAR',
                isExternal,
                executionSupport,
                externalNote,
                lastChecked: a.lastChecked || a.updatedAt || null
            };
        });
    }

    /**
     * Get Risk Summary
     */
    getRiskSummary(options = {}) {
        const tenantId = options.tenantId || 'default';
        if (!this.riskEngine || typeof this.riskEngine.getRiskScores !== 'function') {
            return { status: 'NOT_AVAILABLE', reason: 'PredictiveRiskEngine unavailable.', timestamp: new Date().toISOString() };
        }
        const scores = this.riskEngine.getRiskScores(tenantId);
        const highRiskAgents = [];
        for (const [agentId, r] of Object.entries(scores)) {
            if (r && (r.level === 'HIGH' || r.level === 'CRITICAL' || r.score >= 0.7)) {
                highRiskAgents.push({ agentId, level: r.level, score: r.score, reasons: r.reasons || [] });
            }
        }
        return {
            status: 'OPERATIONAL',
            totalScoredAgents: Object.keys(scores).length,
            highRiskCount: highRiskAgents.length,
            highRiskAgents,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get Anomaly Summary
     */
    getAnomalySummary(options = {}) {
        const tenantId = options.tenantId || 'default';
        if (!this.anomalyService || typeof this.anomalyService.getRecentAnomalies !== 'function') {
            return { status: 'NOT_AVAILABLE', reason: 'AnomalyDetectionService unavailable.', timestamp: new Date().toISOString() };
        }
        const anomalies = this.anomalyService.getRecentAnomalies(tenantId) || [];
        return {
            status: 'OPERATIONAL',
            anomalyCount: anomalies.length,
            anomalies: anomalies.map(an => ({
                anomalyId: an.anomalyId || an.id,
                agentId: an.agentId,
                metric: an.metric || 'latencyMs',
                severity: an.severity || 'MEDIUM',
                detectedAt: an.detectedAt || an.timestamp || new Date().toISOString(),
                value: an.value,
                baselineExpected: an.baselineExpected
            })),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get Dependency Impact Analysis
     */
    getDependencyImpact(options = {}) {
        const tenantId = typeof options === 'string' ? options : (options.tenantId || 'default');
        if (!this.dependencyGraphService) {
            return { status: 'NOT_AVAILABLE', reason: 'DependencyGraphService unavailable.', timestamp: new Date().toISOString() };
        }
        const fn = (typeof this.dependencyGraphService.getTopology === 'function')
            ? this.dependencyGraphService.getTopology.bind(this.dependencyGraphService)
            : (typeof this.dependencyGraphService.getTopologyGraph === 'function' ? this.dependencyGraphService.getTopologyGraph.bind(this.dependencyGraphService) : null);

        if (!fn) {
            return { status: 'NOT_AVAILABLE', reason: 'DependencyGraphService getTopology method unavailable.', timestamp: new Date().toISOString() };
        }

        const graph = fn(tenantId);
        return {
            status: 'OPERATIONAL',
            totalDependencies: graph.edges ? graph.edges.length : 0,
            nodesCount: graph.nodes ? graph.nodes.length : 0,
            edges: graph.edges || [],
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get Running Automations & Workflow Orchestrations
     */
    getRunningAutomations(options = {}) {
        const tenantId = options.tenantId || 'default';
        const activeAutomations = [];
        if (this.automationDecisionService && typeof this.automationDecisionService.getDecisions === 'function') {
            const decisions = this.automationDecisionService.getDecisions(tenantId);
            for (const dec of decisions) {
                activeAutomations.push({
                    decisionId: dec.decisionId,
                    policyId: dec.policyId || dec.policyName,
                    agentId: dec.agentId,
                    action: dec.action,
                    status: dec.status,
                    approvalState: dec.status === 'PENDING' ? 'WAITING_APPROVAL' : 'APPROVED',
                    createdAt: dec.createdAt
                });
            }
        }
        return activeAutomations;
    }

    /**
     * Get Running & Recent Remediations
     */
    getRunningRemediations(options = {}) {
        const tenantId = options.tenantId || 'default';
        if (!this.store || !this.store.remediations) return [];

        const rems = Array.from(this.store.remediations.values()).filter(r => this._matchesTenant(r.tenantId, tenantId));
        return rems.map(r => ({
            remediationId: r.remediationId || r.id,
            agentId: r.agentId,
            incidentId: r.incidentId || null,
            action: r.action || r.type || 'RECOVERY',
            status: r.status || 'UNKNOWN',
            verificationState: r.verificationStatus || r.verified ? 'VERIFIED' : 'PENDING',
            startedAt: r.createdAt || new Date().toISOString(),
            completedAt: r.completedAt || r.updatedAt || null
        }));
    }

    /**
     * Get Recent Activity Timeline
     */
    getRecentActivity(options = {}) {
        return this.changeFeedService.getChangeFeed(options);
    }

    /**
     * Get Real-time Changes Feed
     */
    getRecentChanges(options = {}) {
        return this.changeFeedService.getChangeFeed(options);
    }

    /**
     * Get Investigation Highlights
     */
    getInvestigationHighlights(options = {}) {
        const tenantId = options.tenantId || 'default';
        const activeIncidents = this.getActiveIncidents({ tenantId });
        const highlights = [];

        for (const inc of activeIncidents) {
            let context = null;
            if (this.investigationContextService && typeof this.investigationContextService.getIncidentContext === 'function') {
                try {
                    context = this.investigationContextService.getIncidentContext(inc.incidentId, { tenantId });
                } catch (e) {
                    context = null;
                }
            }

            highlights.push({
                incidentId: inc.incidentId,
                agentId: inc.agentId,
                title: inc.title,
                severity: inc.severity,
                rootCauseCandidate: inc.rootCauseCandidate,
                evidenceChain: context ? context.evidenceChain : null,
                investigationSummary: context ? context.summary : null
            });
        }

        return highlights;
    }

    /**
     * Get Platform High-Level System Summary
     */
    getSystemSummary(options = {}) {
        const tenantId = options.tenantId || 'default';
        const scorecard = this.scorecardService.getScorecard({ tenantId });
        const narrative = this.narrativeService.generateNarrative({ tenantId });

        return {
            platform: 'Agent Watchtower Command Center',
            version: 'Phase 28',
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString(),
            scorecard,
            narrative
        };
    }

    /**
     * Canonical Agent 360 operational response — single source of truth for the
     * frontend Agent Detail view. Aggregates (by reference, no duplication):
     * agent, health, connectivity, capabilities, performance, telemetry,
     * problems, incidents, alerts, dependencies, history.
     * Honest states: NOT_EXPOSED / UNSUPPORTED / INSUFFICIENT_DATA where data
     * is unavailable. Never invents capabilities or metrics.
     * @param {string} agentId
     * @param {Object} options
     * @returns {Object} Agent 360 Command Center View
     */
    getAgentSummary(agentId, options = {}) {
        const requestedTenant = options.tenantId || 'default-tenant';

        if (!agentId) {
            throw new Error('agentId is required');
        }

        // Resolve from monitored store (tenant-tolerant), then registries.
        let monitored = this._findMonitoredRecord(agentId, requestedTenant);
        const effectiveTenant = (monitored && monitored._resolvedTenant) || requestedTenant;
        const tenantId = effectiveTenant;

        const agents = this._getAgents(requestedTenant);
        let agent = agents.find(a => (a.agentId || a.id) === agentId) || monitored || null;

        let registryAgent = null;
        if (this.agentService && typeof this.agentService.getAgent === 'function') {
            try {
                const g = this.agentService.getAgent(agentId);
                if (g) registryAgent = (typeof g.toJSON === 'function') ? g.toJSON() : g;
            } catch (_) {}
        }
        if (!registryAgent && this.agentRegistry && typeof this.agentRegistry.getAgent === 'function') {
            try {
                const g = this.agentRegistry.getAgent(agentId);
                if (g) registryAgent = (typeof g.toJSON === 'function') ? g.toJSON() : (typeof g.toJSON === 'undefined' && g.toJSON ? g : g);
                if (registryAgent && typeof registryAgent.toJSON === 'function' && !registryAgent.id) {
                    // UniversalAgentContract instance without toJSON flattening
                    registryAgent = registryAgent.toJSON();
                }
            } catch (_) {}
        }
        let systemRecord = null;
        const sysRegistry = this.agentRegistry && typeof this.agentRegistry.getSystem === 'function'
            ? this.agentRegistry
            : (this.monitoringService && this.monitoringService.systemRegistry);
        if (sysRegistry && typeof sysRegistry.getSystem === 'function') {
            try { systemRecord = sysRegistry.getSystem(agentId); } catch (_) {}
        }
        if (!agent && !registryAgent && !systemRecord) {
            return {
                status: 'NOT_FOUND',
                reason: `Agent ${agentId} was not found in registered or monitored stores.`,
                agentId,
                timestamp: new Date().toISOString()
            };
        }
        const base = agent || registryAgent || systemRecord || { agentId, id: agentId };

        const isExternal = agentId === 'compa-agent-ext' || agentId === 'repa-agent-ext'
            || Boolean((base.metadata && base.metadata.isExternal) || (registryAgent && registryAgent.metadata && registryAgent.metadata.isExternal) || (systemRecord && systemRecord.metadata && systemRecord.metadata.isExternal));
        // Execution support requires real evidence (computed below once the
        // canonical monitoring status is resolved): a recorded execution
        // result or a discovered execution-like capability. Never inferred
        // from agent IDs, categories, or operator-typed capability words.
        let executionSupport = 'UNSUPPORTED';
        const externalNote = isExternal ? 'External agent probed via HTTP. Internal telemetry and execution APIs are unsupported.' : null;

        // ---- Monitoring status / health / connectivity (single source: monitoring store)
        let monStatus = monitored;
        let monConfig = null;
        let timeline = [];
        let checkHistory = [];
        let agentIncidents = [];
        if (this.store) {
            try {
                if (typeof this.store.getStatus === 'function') monStatus = this.store.getStatus(agentId, tenantId);
            } catch (_) {}
            if (!monStatus) monStatus = monitored;
            try {
                if (typeof this.store.getConfig === 'function') monConfig = this.store.getConfig(agentId, tenantId);
            } catch (_) {}
            try {
                if (typeof this.store.getTimeline === 'function') timeline = this.store.getTimeline(agentId, tenantId, 50) || [];
            } catch (_) {}
            try {
                if (typeof this.store.getCheckHistory === 'function') checkHistory = this.store.getCheckHistory(agentId, tenantId, 50) || [];
            } catch (_) {}
            try {
                if (typeof this.store.listIncidents === 'function') agentIncidents = this.store.listIncidents(tenantId, agentId) || [];
            } catch (_) {}
            if ((!agentIncidents || agentIncidents.length === 0) && this.store.incidents) {
                try {
                    agentIncidents = Array.from(this.store.incidents.values()).filter(i => i.agentId === agentId);
                } catch (_) {}
            }
        }
        monStatus = monStatus || {};
        {
            const discoveredForExec = Array.isArray(monStatus.capabilities) ? monStatus.capabilities : [];
            const hasExecutionEvidence = Boolean(monStatus.lastExecutionResult) || discoveredForExec.some(c => {
                const n = String((c && (c.id || c.name)) || c || '');
                return /execut|invoke|trigger|action|operation/i.test(n);
            });
            if (hasExecutionEvidence) executionSupport = 'SUPPORTED';
        }
        const pickState = (...vals) => {
            for (const v of vals) {
                const s = String(v || '').toUpperCase();
                if (s && s !== 'UNKNOWN') return s;
            }
            return 'UNKNOWN';
        };
        const currentState = pickState(monStatus.currentState, monStatus.status, base.status, base.healthStatus, base.currentState);
        const monitoringEnabled = Boolean(monStatus.monitoringEnabled ?? monConfig?.enabled ?? false);
        const endpoint = (registryAgent && (registryAgent.connection?.endpoint || registryAgent.runner?.endpoint))
            || systemRecord?.baseUrl || systemRecord?.endpoint
            || systemRecord?.adapter?.baseUrl || systemRecord?.adapter?.connectionConfigRef
            || base.endpoint || base.baseUrl
            || monConfig?.endpointOverride || null;
        const registrationSource = systemRecord ? 'SYSTEM_REGISTRY' : (registryAgent ? 'AGENT_REGISTRY' : (monitored ? 'MONITORING_STORE' : 'UNKNOWN'));

        const health = {
            status: currentState,
            reason: monStatus.lastError || monStatus.latestDiagnosis?.summary || (currentState === 'UNKNOWN' ? 'INSUFFICIENT DATA — no monitoring checks recorded yet.' : null),
            evidence: monStatus.latestDiagnosis?.evidence || (monStatus.lastError ? [monStatus.lastError] : []),
            consecutiveFailures: monStatus.consecutiveFailures || 0,
            consecutiveRecoveries: monStatus.consecutiveRecoveries || 0,
            availabilityPercent: monStatus.availabilityPercentage ?? base.availabilityPercent ?? base.availabilityPercentage ?? null,
            totalChecks: monStatus.totalChecksCount || 0,
            totalFailures: monStatus.totalFailuresCount || 0,
            lastChecked: monStatus.lastCheckAt || base.lastChecked || base.updatedAt || null,
            nextCheckAt: monStatus.nextCheckAt || null,
            // Backward-compat aliases (honest nulls, never fabricated values)
            availability: monStatus.availabilityPercentage ?? base.availabilityPercent ?? null,
            latencyMs: monStatus.latency?.lastLatencyMs ?? base.latency?.lastLatencyMs ?? null
        };
        const connectivity = {
            state: monStatus.connectivity || (currentState === 'UNKNOWN' ? 'UNKNOWN' : 'UNKNOWN'),
            reachable: monStatus.connectivity === 'CONNECTED',
            lastChecked: monStatus.lastCheckAt || null,
            lastSuccessfulContact: monStatus.lastSuccessfulCheckAt || null,
            lastFailureAt: monStatus.lastFailureAt || null,
            latencyMs: monStatus.latency?.lastLatencyMs ?? null,
            endpoint: endpoint || 'NOT_EXPOSED'
        };

        // ---- Capabilities: ONE coherent flow via monitoring service view
        let capabilities = { status: 'NOT_EXPOSED', items: [], message: 'CAPABILITIES NOT EXPOSED' };
        try {
            if (this.monitoringService && typeof this.monitoringService.getCapabilityView === 'function') {
                capabilities = this.monitoringService.getCapabilityView(agentId, tenantId);
            } else {
                const declared = (registryAgent?.capabilities || systemRecord?.capabilities || []);
                const names = declared.map(c => (c && typeof c === 'object') ? (c.id || c.name || c.type) : String(c)).filter(Boolean);
                capabilities = names.length > 0
                    ? { status: 'AVAILABLE', items: names.map(n => ({ name: n, source: 'DECLARED_CONTRACT', status: 'AVAILABLE' })), declared: names, discovered: [], message: `${names.length} declared capability(ies).` }
                    : capabilities;
            }
        } catch (_) {}

        // ---- Performance: real history only, else INSUFFICIENT DATA
        const performance = { status: 'INSUFFICIENT_DATA', message: 'INSUFFICIENT DATA — not enough monitoring checks recorded yet.' };
        let historyByRange = {};
        if (this.store && typeof this.store.getAgentHistoryByRange === 'function') {
            for (const range of ['1h', '24h', '7d']) {
                try {
                    const h = this.store.getAgentHistoryByRange(agentId, range, tenantId);
                    historyByRange[range] = {
                        checkCount: h.checkCount || 0,
                        successfulChecks: h.successfulChecks || 0,
                        failedChecks: h.failedChecks || 0,
                        availability: h.checkCount > 0 ? h.availability : null,
                        failureRate: h.checkCount > 0 ? Math.round(((h.failedChecks || 0) / h.checkCount) * 10000) / 100 : null,
                        averageLatency: h.checkCount > 0 ? h.averageLatency : null,
                        minLatency: h.checkCount > 0 ? h.minLatency : null,
                        maxLatency: h.checkCount > 0 ? h.maxLatency : null,
                        p95Latency: h.checkCount >= 20 ? h.p95Latency : null,
                        p95Note: h.checkCount >= 20 ? null : 'INSUFFICIENT DATA for p95 (needs 20+ checks).',
                        incidentCount: h.incidentCount || 0
                    };
                } catch (_) {
                    historyByRange[range] = { checkCount: 0, availability: null };
                }
            }
            const h24 = historyByRange['24h'] || {};
            if ((h24.checkCount || 0) > 0) {
                performance.status = 'AVAILABLE';
                performance.message = undefined;
                performance.currentLatency = monStatus.latency?.lastLatencyMs ?? null;
                performance.averageLatency = h24.averageLatency;
                performance.minLatency = h24.minLatency;
                performance.maxLatency = h24.maxLatency;
                performance.p95Latency = h24.p95Latency;
                performance.availability = h24.availability;
                performance.failureRate = h24.failureRate;
                performance.successfulChecks = h24.successfulChecks;
                performance.failedChecks = h24.failedChecks;
                try {
                    if (typeof this.store.getAgentPerformance === 'function') {
                        const perf = this.store.getAgentPerformance(agentId, '24h', tenantId);
                        performance.latencyChangePercentage = perf.latencyChangePercentage ?? 0;
                        performance.degradationDetected = Boolean(perf.degradationDetected);
                    }
                } catch (_) {}
            } else {
                performance.ranges = historyByRange;
            }
            performance.ranges = historyByRange;
        }

        // ---- Telemetry / activity
        let telemetryEvents = [];
        try {
            if (this.telemetryIngestionService && typeof this.telemetryIngestionService.getAgentTimeline === 'function') {
                telemetryEvents = this.telemetryIngestionService.getAgentTimeline(agentId, { limit: 20 }) || [];
            }
        } catch (_) {}
        const healthTransitions = (timeline || []).filter(t => t.type === 'STATE_CHANGED' || t.type === 'RECOVERED');
        const errors = [
            ...((timeline || []).filter(t => /fail|error|offline|unhealthy/i.test(`${t.type} ${t.message} ${t.error || ''}`)).slice(0, 10).map(t => ({ timestamp: t.timestamp, type: t.type, message: t.message || t.error }))),
            ...((telemetryEvents || []).filter(e => /fail/i.test(`${e.eventType} ${e.status || ''}`)).slice(0, 10).map(e => ({ timestamp: e.timestamp, type: e.eventType, message: e.message || e.status })))
        ];
        const lastActivity = telemetryEvents[0]?.timestamp || timeline[0]?.timestamp || checkHistory[0]?.timestamp || monStatus.lastCheckAt || null;
        const telemetry = {
            recentChecks: (checkHistory || []).slice(0, 10),
            healthTransitions: healthTransitions.slice(0, 10),
            events: (telemetryEvents || []).slice(0, 20),
            errors,
            warnings: ((timeline || []).filter(t => /degraded|recovering|warn/i.test(`${t.type} ${t.message || ''}`)).slice(0, 10)),
            lastActivity,
            stale: lastActivity ? (Date.now() - new Date(lastActivity).getTime() > 300000) : true
        };

        // ---- Problems: current problems + active alerts + anomalies + incidents
        let activeAlerts = [];
        try {
            if (this.alertingService && typeof this.alertingService.listAlerts === 'function') {
                const all = this.alertingService.listAlerts() || [];
                activeAlerts = all.filter(a => (a.agentId === agentId || a.systemId === agentId || a.targetAgentId === agentId) && !['RESOLVED', 'DISMISSED'].includes(String(a.status)));
            }
        } catch (_) {}
        let anomalies = [];
        try {
            if (this.anomalyService && typeof this.anomalyService.getRecentAnomalies === 'function') {
                const allAn = this.anomalyService.getRecentAnomalies(tenantId) || [];
                anomalies = allAn.filter(a => a.agentId === agentId);
            } else if (this.anomalyService && typeof this.anomalyService.detectAnomalies === 'function') {
                anomalies = [];
            }
        } catch (_) {}
        const activeIncident = agentIncidents.find(i => !['RESOLVED', 'RECOVERED'].includes(String(i.status || i.state))) || null;
        const currentProblems = [];
        if (currentState === 'OFFLINE') currentProblems.push('Agent is unreachable (OFFLINE).');
        if (currentState === 'UNHEALTHY') currentProblems.push('Agent health probe is failing (UNHEALTHY).');
        if (currentState === 'DEGRADED') currentProblems.push('Agent performance is degraded (DEGRADED).');
        if (monStatus.lastError) currentProblems.push(monStatus.lastError);
        if (activeIncident) currentProblems.push(`Active incident ${activeIncident.id} (${activeIncident.severity || 'HIGH'}).`);
        let dependencyProblems = [];
        try {
            if (this.dependencyGraphService && typeof this.dependencyGraphService.getTopology === 'function') {
                const topo = this.dependencyGraphService.getTopology(tenantId) || {};
                const edges = topo.edges || [];
                const related = edges.filter(e => e.sourceAgentId === agentId || e.targetAgentId === agentId);
                dependencyProblems = related.filter(e => /fail|degraded|offline|blocked/i.test(JSON.stringify(e))).map(e => ({ edge: e, note: 'Related dependency reports a problem.' }));
            }
        } catch (_) {}
        const problems = {
            currentProblems,
            activeAlerts,
            anomalies,
            incidents: agentIncidents,
            activeIncident,
            dependencyProblems,
            hasProblems: currentProblems.length > 0 || activeAlerts.length > 0 || Boolean(activeIncident)
        };

        // ---- History
        const history = {
            recentHealth: (checkHistory || []).slice(0, 20).map(r => ({ timestamp: r.timestamp, state: r.healthState, latencyMs: r.responseTimeMs, httpStatus: r.httpStatus, success: r.success })),
            latencyHistory: (checkHistory || []).slice(0, 50).map(r => ({ timestamp: r.timestamp, latencyMs: r.responseTimeMs })),
            availabilityByRange: historyByRange,
            incidents: agentIncidents,
            stateChanges: (timeline || []).filter(t => t.type === 'STATE_CHANGED' || t.type === 'RECOVERED' || t.type === 'MONITORING_STARTED' || t.type === 'MONITORING_STOPPED').slice(0, 20),
            timeline: (timeline || []).slice(0, 50)
        };

        let investigationContext = null;
        if (this.investigationContextService && typeof this.investigationContextService.getAgentContext === 'function') {
            try {
                investigationContext = this.investigationContextService.getAgentContext(agentId, { tenantId });
            } catch (e) {
                investigationContext = null;
            }
        }

        let risk = { level: 'LOW', score: 0.0 };
        if (this.riskEngine && typeof this.riskEngine.getRiskScores === 'function') {
            try {
                const scores = this.riskEngine.getRiskScores(tenantId);
                if (scores[agentId]) risk = scores[agentId];
            } catch (_) {}
        }

        let dependencies = { upstream: [], downstream: [] };
        if (this.dependencyGraphService) {
            try {
                const fn = typeof this.dependencyGraphService.getTopology === 'function' ? this.dependencyGraphService.getTopology.bind(this.dependencyGraphService) : (typeof this.dependencyGraphService.getTopologyGraph === 'function' ? this.dependencyGraphService.getTopologyGraph.bind(this.dependencyGraphService) : null);
                if (fn) {
                    const topo = fn(tenantId);
                    dependencies.upstream = (topo.edges || []).filter(e => e.targetAgentId === agentId).map(e => e.sourceAgentId);
                    dependencies.downstream = (topo.edges || []).filter(e => e.sourceAgentId === agentId).map(e => e.targetAgentId);
                }
            } catch (e) {
                dependencies = { upstream: [], downstream: [] };
            }
        }

        let remediations = [];
        if (this.store && this.store.remediations) {
            try {
                remediations = Array.from(this.store.remediations.values()).filter(r => r.agentId === agentId);
            } catch (_) { remediations = []; }
        }

        return {
            agent: {
                id: agentId,
                name: registryAgent?.name || systemRecord?.name || base.name || agentId,
                category: registryAgent?.category || systemRecord?.category || base.category || 'UNIVERSAL_AGENT',
                version: registryAgent?.version || systemRecord?.version || base.version || '1.0.0',
                endpoint: endpoint || 'NOT_EXPOSED',
                monitoringStatus: monitoringEnabled ? 'MONITORING_ON' : 'MONITORING_OFF',
                registrationSource
            },
            identity: {
                agentId,
                name: registryAgent?.name || systemRecord?.name || base.name || agentId,
                category: registryAgent?.category || systemRecord?.category || base.category || 'UNIVERSAL_AGENT',
                version: registryAgent?.version || systemRecord?.version || base.version || '1.0.0',
                endpoint: endpoint || 'NOT_EXPOSED',
                monitoringStatus: monitoringEnabled ? 'MONITORING_ON' : 'MONITORING_OFF',
                registrationSource,
                isExternal,
                executionSupport,
                externalNote
            },
            monitoring: {
                enabled: monitoringEnabled,
                intervalSeconds: monConfig?.healthIntervalSeconds ?? null,
                nextCheckAt: monStatus.nextCheckAt || null,
                lastCheckAt: monStatus.lastCheckAt || null,
                totalChecks: monStatus.totalChecksCount || 0
            },
            connectivity,
            health: {
                status: currentState,
                availabilityPercent: health.availabilityPercent,
                latencyMs: health.latencyMs,
                lastChecked: health.lastChecked,
                reason: health.reason,
                evidence: health.evidence,
                consecutiveFailures: health.consecutiveFailures,
                totalChecks: health.totalChecks,
                totalFailures: health.totalFailures,
                // legacy numeric alias used by older UI/tests
                availability: health.availability
            },
            capabilities,
            performance,
            telemetry,
            problems,
            incidents: agentIncidents,
            alerts: activeAlerts,
            dependencies,
            history,
            intelligence: {
                riskLevel: risk.level || 'LOW',
                riskScore: risk.score || 0.0,
                anomalyState: anomalies.length > 0 ? 'DETECTED' : (investigationContext ? (investigationContext.anomalies?.length > 0 ? 'DETECTED' : 'CLEAR') : 'CLEAR')
            },
            anomalies,
            remediations,
            investigationContext,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = { AgentWatchtowerCommandCenterService };
