/**
 * Operational Narrative Service
 * Generates deterministic, human-readable operational narratives strictly from actual platform records.
 * Disclaims false causality and explicitly tags assertions as CONFIRMED, INFERRED, or UNKNOWN.
 * 
 * Does NOT use an unrestricted LLM or invent facts.
 */

class OperationalNarrativeService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService;
        this.agentRegistry = options.agentRegistry;
        this.riskEngine = options.riskEngine;
        this.anomalyService = options.anomalyService;
        this.remediationService = options.remediationService;
        this.dependencyService = options.dependencyService;
        this.store = options.store || (this.monitoringService ? this.monitoringService.store : null);
    }

    _getAgents(tenantId) {
        if (this.store && this.store.statuses) {
            const list = Array.from(this.store.statuses.values())
                .filter(s => s.tenantId === tenantId || tenantId === 'all');
            if (list.length > 0) return list;
        }
        if (this.agentRegistry && typeof this.agentRegistry.getAllAgents === 'function') {
            return this.agentRegistry.getAllAgents(tenantId) || [];
        }
        return [];
    }

    /**
     * Generate deterministic narrative for platform or specific agent/incident
     * @param {Object} options { tenantId, agentId, incidentId }
     * @returns {Object} Structured narrative object
     */
    generateNarrative(options = {}) {
        const tenantId = options.tenantId || 'default';
        const agentId = options.agentId;
        const incidentId = options.incidentId;

        const whatIsHappening = [];
        const whatIsGood = [];
        const whatIsBad = [];
        const whatHasBeenDone = [];
        const whatShouldCheck = [];

        if (!this.store) {
            return {
                title: 'Operational Narrative',
                status: 'UNKNOWN',
                whatIsHappening: [{ text: 'Monitoring store is unavailable.', tag: 'UNKNOWN' }],
                whatIsGood: [],
                whatIsBad: [{ text: 'System metrics cannot be retrieved.', tag: 'UNKNOWN' }],
                whatHasBeenDone: [],
                whatShouldCheck: [{ text: 'Verify monitoring service initialization.', tag: 'CONFIRMED' }],
                timestamp: new Date().toISOString()
            };
        }

        // Context 1: Specific Incident Narrative
        if (incidentId) {
            const inc = this.store.incidents ? this.store.incidents.get(incidentId) : null;
            if (!inc) {
                return {
                    title: `Incident Narrative: ${incidentId}`,
                    status: 'UNKNOWN',
                    whatIsHappening: [{ text: `Incident ${incidentId} was not found in active records.`, tag: 'UNKNOWN' }],
                    whatIsGood: [],
                    whatIsBad: [],
                    whatHasBeenDone: [],
                    whatShouldCheck: [{ text: 'Verify incident ID.', tag: 'CONFIRMED' }],
                    timestamp: new Date().toISOString()
                };
            }

            whatIsHappening.push({
                text: `Incident ${inc.incidentId || inc.id} is currently ${inc.status || 'OPEN'} on agent ${inc.agentId}.`,
                tag: 'CONFIRMED'
            });

            if (inc.severity === 'CRITICAL' || inc.severity === 'HIGH') {
                whatIsBad.push({
                    text: `Incident severity is rated ${inc.severity}.`,
                    tag: 'CONFIRMED'
                });
            }

            if (inc.triggerType || inc.type) {
                whatIsHappening.push({
                    text: `Triggered by ${inc.triggerType || inc.type} failure at ${inc.createdAt}.`,
                    tag: 'CONFIRMED'
                });
            }

            // Remediations done
            if (this.store.remediations) {
                const rems = Array.from(this.store.remediations.values()).filter(r => r.incidentId === incidentId || r.agentId === inc.agentId);
                for (const r of rems) {
                    whatHasBeenDone.push({
                        text: `Remediation action ${r.action || r.type} executed with status: ${r.status}.`,
                        tag: r.status === 'SUCCESS' ? 'CONFIRMED' : 'INFERRED'
                    });
                }
            }

            // Dependencies
            if (this.dependencyService && typeof this.dependencyService.getDependencies === 'function') {
                const deps = this.dependencyService.getDependencies({ agentId: inc.agentId, tenantId });
                if (deps && deps.length > 0) {
                    const upstreams = deps.filter(d => d.sourceAgentId === inc.agentId).map(d => d.targetAgentId);
                    if (upstreams.length > 0) {
                        whatIsHappening.push({
                            text: `Agent ${inc.agentId} depends upstream on [${upstreams.join(', ')}].`,
                            tag: 'CONFIRMED'
                        });
                        whatShouldCheck.push({
                            text: `Inspect upstream dependency health for [${upstreams.join(', ')}].`,
                            tag: 'INFERRED'
                        });
                    }
                }
            }

            whatShouldCheck.push({
                text: `Inspect investigation timeline and root cause candidates for ${inc.agentId}.`,
                tag: 'CONFIRMED'
            });

            return {
                title: `Incident Narrative: ${inc.incidentId || inc.id}`,
                status: inc.status,
                whatIsHappening,
                whatIsGood,
                whatIsBad,
                whatHasBeenDone,
                whatShouldCheck,
                timestamp: new Date().toISOString()
            };
        }

        // Context 2: Platform Overview Narrative
        const agents = this._getAgents(tenantId);

        const activeIncidents = typeof this.store.getActiveIncidents === 'function'
            ? this.store.getActiveIncidents(tenantId)
            : [];

        const offlineAgents = agents.filter(a => (a.status || a.healthStatus || a.currentState) === 'OFFLINE');
        const degradedAgents = agents.filter(a => (a.status || a.healthStatus || a.currentState) === 'DEGRADED');
        const healthyAgents = agents.filter(a => (a.status || a.healthStatus || a.currentState) === 'HEALTHY' || (a.status || a.healthStatus || a.currentState) === 'ONLINE');

        if (activeIncidents.length > 0) {
            whatIsHappening.push({
                text: `Platform has ${activeIncidents.length} active incident(s) currently open.`,
                tag: 'CONFIRMED'
            });
            whatIsBad.push({
                text: `${activeIncidents.length} incident(s) require active investigation or resolution.`,
                tag: 'CONFIRMED'
            });
        } else {
            whatIsHappening.push({
                text: 'All operational agents are functioning without active incidents.',
                tag: 'CONFIRMED'
            });
            whatIsGood.push({
                text: 'No active platform incidents detected.',
                tag: 'CONFIRMED'
            });
        }

        if (offlineAgents.length > 0) {
            whatIsBad.push({
                text: `${offlineAgents.length} agent(s) are currently OFFLINE: [${offlineAgents.map(a => a.agentId || a.id).join(', ')}].`,
                tag: 'CONFIRMED'
            });
            whatShouldCheck.push({
                text: `Check network connectivity and endpoint availability for offline agent(s).`,
                tag: 'CONFIRMED'
            });
        }

        if (degradedAgents.length > 0) {
            whatIsBad.push({
                text: `${degradedAgents.length} agent(s) are currently DEGRADED: [${degradedAgents.map(a => a.agentId || a.id).join(', ')}].`,
                tag: 'CONFIRMED'
            });
            whatShouldCheck.push({
                text: `Review latency trends and error rates for degraded agent(s).`,
                tag: 'INFERRED'
            });
        }

        if (healthyAgents.length > 0) {
            whatIsGood.push({
                text: `${healthyAgents.length} out of ${agents.length} monitored agent(s) are HEALTHY.`,
                tag: 'CONFIRMED'
            });
        }

        // Remediations done
        if (this.store.remediations && this.store.remediations.size > 0) {
            const recentRems = Array.from(this.store.remediations.values()).slice(-5);
            for (const r of recentRems) {
                whatHasBeenDone.push({
                    text: `Remediation (${r.action || r.type}) executed for ${r.agentId} - status: ${r.status}.`,
                    tag: 'CONFIRMED'
                });
            }
        } else {
            whatHasBeenDone.push({
                text: 'No recent automated remediation actions were executed.',
                tag: 'CONFIRMED'
            });
        }

        if (whatShouldCheck.length === 0) {
            whatShouldCheck.push({
                text: 'Continue routine operational monitoring and baseline analysis.',
                tag: 'CONFIRMED'
            });
        }

        return {
            title: 'Platform Operational Narrative',
            status: activeIncidents.length > 0 ? 'ATTENTION_REQUIRED' : 'OPERATIONAL',
            whatIsHappening,
            whatIsGood,
            whatIsBad,
            whatHasBeenDone,
            whatShouldCheck,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = { OperationalNarrativeService };
