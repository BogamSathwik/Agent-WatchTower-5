/**
 * Command Center Scorecard Service
 * Provides platform-wide operational scorecard metrics calculated strictly from actual store data.
 * If data is unavailable, returns status: "NOT_AVAILABLE" with a clear reason.
 */

class CommandCenterScorecardService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService;
        this.agentRegistry = options.agentRegistry;
        this.riskEngine = options.riskEngine;
        this.anomalyService = options.anomalyService;
        this.remediationService = options.remediationService;
        this.automationDecisionService = options.decisionService;
        this.dependencyService = options.dependencyService;
        this.store = options.store || (this.monitoringService ? this.monitoringService.store : null);
    }

    _isDefaultPairTenant(tenantId) {
        return tenantId === 'default' || tenantId === 'default-tenant';
    }

    _matchesTenant(recordTenant, tenantId) {
        if (tenantId === 'all') return true;
        if (recordTenant === tenantId) return true;
        // The platform browser sends no tenant header: monitoring writes to
        // 'default-tenant' while command-center reads 'default'. Treat that
        // legacy pair as one operational tenant. All other tenants stay strict.
        if (this._isDefaultPairTenant(tenantId) && this._isDefaultPairTenant(recordTenant)) return true;
        return false;
    }

    _getAgents(tenantId) {
        if (this.store && this.store.statuses) {
            const list = Array.from(this.store.statuses.values())
                .filter(s => {
                    const id = s.agentId || s.id;
                    if (typeof id !== 'string' || !id || id.includes('[object Object]')) return false;
                    return this._matchesTenant(s.tenantId, tenantId);
                });
            if (list.length > 0) return list;
        }
        if (this.agentRegistry && typeof this.agentRegistry.getAllAgents === 'function') {
            return this.agentRegistry.getAllAgents(tenantId) || [];
        }
        return [];
    }

    /**
     * Compute platform operational scorecard
     * @param {Object} options
     * @returns {Object} Scorecard metrics or NOT_AVAILABLE structure
     */
    getScorecard(options = {}) {
        const tenantId = options.tenantId || 'default';

        if (!this.store) {
            return {
                status: 'NOT_AVAILABLE',
                reason: 'Monitoring store unavailable or uninitialized.',
                timestamp: new Date().toISOString()
            };
        }

        const agents = this._getAgents(tenantId);

        let healthyCount = 0;
        let degradedCount = 0;
        let offlineCount = 0;
        let unknownCount = 0;

        for (const agent of agents) {
            const status = String(agent.status || agent.healthStatus || agent.currentState || 'UNKNOWN').toUpperCase();
            if (status === 'HEALTHY' || status === 'ONLINE') {
                healthyCount++;
            } else if (status === 'DEGRADED' || status === 'RECOVERING') {
                degradedCount++;
            } else if (status === 'OFFLINE' || status === 'UNHEALTHY') {
                offlineCount++;
            } else {
                unknownCount++;
            }
        }

        // Active Incidents
        const activeIncidents = typeof this.store.getActiveIncidents === 'function'
            ? this.store.getActiveIncidents(tenantId)
            : (this.store.incidents ? Array.from(this.store.incidents.values()).filter(i => this._matchesTenant(i.tenantId, tenantId) && i.status !== 'RESOLVED' && i.status !== 'RECOVERED') : []);

        const criticalIncidentsCount = activeIncidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length;

        // Alerts
        const openAlertsCount = this.store.alerts
            ? Array.from(this.store.alerts.values()).filter(a => this._matchesTenant(a.tenantId, tenantId) && a.status !== 'RESOLVED').length
            : 0;

        // High Risk Agents
        let highRiskCount = 0;
        if (this.riskEngine && typeof this.riskEngine.getRiskScores === 'function') {
            const riskScores = this.riskEngine.getRiskScores(tenantId);
            for (const risk of Object.values(riskScores)) {
                if (risk && (risk.level === 'HIGH' || risk.level === 'CRITICAL' || risk.score >= 0.7)) {
                    highRiskCount++;
                }
            }
        }

        // Active Anomalies
        let activeAnomaliesCount = 0;
        if (this.anomalyService && typeof this.anomalyService.getRecentAnomalies === 'function') {
            const anomalies = this.anomalyService.getRecentAnomalies(tenantId);
            activeAnomaliesCount = anomalies ? anomalies.length : 0;
        }

        // Remediations
        let activeRemediationsCount = 0;
        let failedRemediationsCount = 0;
        if (this.store.remediations) {
            const rems = Array.from(this.store.remediations.values()).filter(r => this._matchesTenant(r.tenantId, tenantId));
            activeRemediationsCount = rems.filter(r => r.status === 'IN_PROGRESS' || r.status === 'EXECUTING').length;
            failedRemediationsCount = rems.filter(r => r.status === 'FAILED').length;
        }

        // Pending Approvals
        let pendingApprovalsCount = 0;
        if (this.automationDecisionService && typeof this.automationDecisionService.getPendingDecisions === 'function') {
            const pending = this.automationDecisionService.getPendingDecisions(tenantId);
            pendingApprovalsCount = pending ? pending.length : 0;
        }

        // Affected Dependency Chains
        let affectedDependencyChainsCount = 0;
        if (this.dependencyService && typeof this.dependencyService.getDependencies === 'function') {
            const deps = this.dependencyService.getDependencies({ tenantId });
            const degradedAgentsSet = new Set(agents.filter(a => (a.status || a.healthStatus || a.currentState) !== 'HEALTHY').map(a => a.agentId || a.id));
            if (deps && deps.length > 0) {
                affectedDependencyChainsCount = deps.filter(d => degradedAgentsSet.has(d.targetAgentId) || degradedAgentsSet.has(d.sourceAgentId)).length;
            }
        }

        // Recent Failures and Recoveries
        const recentFailuresCount = offlineCount + degradedCount;
        const recentRecoveriesCount = this.store.incidents
            ? Array.from(this.store.incidents.values()).filter(i => this._matchesTenant(i.tenantId, tenantId) && (i.status === 'RESOLVED' || i.status === 'RECOVERED')).length
            : 0;

        return {
            status: 'OPERATIONAL',
            timestamp: new Date().toISOString(),
            tenantId,
            totalAgents: agents.length,
            healthyAgents: healthyCount,
            degradedAgents: degradedCount,
            offlineAgents: offlineCount,
            unknownAgents: unknownCount,
            activeIncidents: activeIncidents.length,
            criticalIncidents: criticalIncidentsCount,
            openAlerts: openAlertsCount,
            highRiskAgents: highRiskCount,
            activeAnomalies: activeAnomaliesCount,
            activeRemediations: activeRemediationsCount,
            failedRemediations: failedRemediationsCount,
            pendingApprovals: pendingApprovalsCount,
            affectedDependencyChains: affectedDependencyChainsCount,
            recentFailures: recentFailuresCount,
            recentRecoveries: recentRecoveriesCount
        };
    }
}

module.exports = { CommandCenterScorecardService };
