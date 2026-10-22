/**
 * Phase 31 — Early Warning Inference Engine
 * Converts OBSERVED + TREND signals into INFERRED early warnings.
 * Deterministic rules only. Never fabricates failure times. Active OFFLINE
 * outages are reported as CONFIRMED current incidents, not predictions.
 */

const WARNING_TYPES = Object.freeze({
    IMPENDING_OFFLINE_RISK: 'IMPENDING_OFFLINE_RISK',
    DEGRADATION_ESCALATION_RISK: 'DEGRADATION_ESCALATION_RISK',
    LATENCY_ESCALATION_RISK: 'LATENCY_ESCALATION_RISK',
    RECURRING_FAILURE_RESURGENCE: 'RECURRING_FAILURE_RESURGENCE',
    DEPENDENCY_CASCADE_RISK: 'DEPENDENCY_CASCADE_RISK',
    ELEVATED_WATCH: 'ELEVATED_WATCH'
});

const WARNING_SEVERITY = Object.freeze({
    INFO: 'INFO',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
});

function isExternalAgent(agentId) {
    if (!agentId) return false;
    const v = String(agentId).toLowerCase();
    return v.includes('compa') || v.includes('repa');
}

class EarlyWarningInferenceEngine {
    constructor(options = {}) {
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
        this.rootCauseAnalyzer = options.rootCauseAnalyzer || null;
        this.dependencyGraphService = options.dependencyGraphService || null;
    }

    /**
     * Infer warnings from aggregated signals.
     * @returns {Array} warnings with dataClassification INFERRED_WARNING (or CONFIRMED for active outage context)
     */
    inferWarnings({ observedSignals = [], trendSignals = [], tenantId = 'default-tenant' } = {}) {
        const byAgent = new Map();

        const push = (agentId, entry) => {
            if (!byAgent.has(agentId)) byAgent.set(agentId, { observed: [], trends: [] });
            byAgent.get(agentId).observed.push(entry);
        };
        const pushTrend = (agentId, entry) => {
            if (!byAgent.has(agentId)) byAgent.set(agentId, { observed: [], trends: [] });
            byAgent.get(agentId).trends.push(entry);
        };

        for (const s of observedSignals) {
            if (s.agentId && s.agentId !== 'fleet') push(s.agentId, s);
        }
        for (const t of trendSignals) {
            if (t.agentId && t.agentId !== 'fleet') pushTrend(t.agentId, t);
        }

        // Fleet-scoped recurring/hotspot signals apply as context to every agent
        const fleetObserved = observedSignals.filter(s => s.agentId === 'fleet');
        const warnings = [];

        for (const [agentId, groups] of byAgent.entries()) {
            const w = this._inferForAgent(agentId, groups.observed, groups.trends, fleetObserved, tenantId);
            for (const warning of w) warnings.push(warning);
        }

        // Sort: severity desc, then confidence desc
        const order = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
        warnings.sort((a, b) => (order[b.severity] || 0) - (order[a.severity] || 0) || (b.confidence - a.confidence));
        return warnings;
    }

    _inferForAgent(agentId, observed, trends, fleetObserved, tenantId) {
        const out = [];
        const hasKind = (k) => observed.some(s => s.kind === k || s.kind === `ANOMALY_${k}`);
        const anomalyOf = (t) => observed.find(s => s.kind === `ANOMALY_${t}`);
        const trendOf = (k) => trends.find(t => t.kind === k);
        const external = isExternalAgent(agentId);

        const stateSig = observed.find(s => s.kind === 'HEALTH_STATE');
        const currentState = stateSig ? stateSig.observedValue : 'UNKNOWN';
        const failsSig = observed.find(s => s.kind === 'CONSECUTIVE_FAILURES');
        const consecFails = failsSig ? parseInt(String(failsSig.observedValue).split(' ')[0], 10) || 0 : 0;
        const riskTrend = trendOf('PREDICTIVE_RISK');
        const baselineTrend = trendOf('BASELINE_TREND');

        const baseNarrative = {
            tenantId,
            agentId,
            evidenceLevel: 'INFERRED',
            evidenceLevelTag: 'INFERRED',
            dataClassification: 'INFERRED_WARNING',
            responseReadiness: external ? 'UNSUPPORTED' : 'SUPPORTED',
            responseReadinessReason: external
                ? 'External agent (Compa/Repa class): Watchtower monitors reachability but has no supported control/remediation interface. Read-only inspection and operator escalation only.'
                : 'Standard monitored agent: read-only inspection available immediately; stateful remediation requires approval workflow.',
            createdAt: new Date().toISOString()
        };

        const stableId = (type) => `ew_${String(agentId).replace(/[^a-zA-Z0-9_-]/g, '_')}_${type}`;

        // Rule 0: Active OFFLINE is a CONFIRMED current outage — surface as context, not prediction.
        if (currentState === 'OFFLINE' || currentState === 'UNHEALTHY') {
            out.push({
                ...baseNarrative,
                warningId: stableId('IMPENDING_OFFLINE_RISK'),
                warningType: 'IMPENDING_OFFLINE_RISK',
                title: `${agentId} is currently ${currentState} — confirmed outage, not a forecast`,
                severity: 'CRITICAL',
                dataClassification: 'OBSERVED',
                evidenceLevel: 'CONFIRMED',
                confidence: 0.99,
                leadTimeEstimate: 'NOW',
                horizonWindow: 'NOW',
                observedEvidence: [
                    `Health store state=${currentState}`,
                    failsSig ? failsSig.detail : 'Consecutive failure counter active',
                    ...(riskTrend ? riskTrend.evidence.slice(0, 2) : [])
                ],
                inferredReasoning: 'No inference required: outage is directly observed. Early-warning value is for dependent agents, not this agent.',
                recommendedOperatorActions: external
                    ? ['INSPECT_HEALTH', 'INSPECT_TIMELINE', 'ESCALATE_OPERATOR']
                    : ['INSPECT_HEALTH', 'INSPECT_TIMELINE', 'INSPECT_DEPENDENCIES', 'OPEN_RESPONSE_CENTER'],
                status: 'ACTIVE'
            });
            return out; // outage dominates; dependent cascade handled at fleet level
        }

        // Rule 1: 2+ consecutive failures + latency/risk signals => HIGH impending offline risk
        const latencySpike = anomalyOf('LATENCY_SPIKE');
        const failRate = anomalyOf('FAILURE_RATE_INCREASE');
        const consecPattern = anomalyOf('CONSECUTIVE_FAILURE_PATTERN');
        if (consecFails >= 2 && (latencySpike || failRate || consecPattern || (riskTrend && (riskTrend.observedValue === 'HIGH' || riskTrend.observedValue === 'CRITICAL')))) {
            out.push({
                ...baseNarrative,
                warningId: stableId('IMPENDING_OFFLINE_RISK'),
                warningType: 'IMPENDING_OFFLINE_RISK',
                title: `${agentId} shows early signs of a possible outage (${consecFails} consecutive failures)`,
                severity: consecFails >= 3 ? 'CRITICAL' : 'HIGH',
                confidence: consecFails >= 3 ? 0.9 : 0.82,
                leadTimeEstimate: 'SHORT_TERM',
                horizonWindow: 'NEXT_1H_TO_24H',
                observedEvidence: [
                    `${consecFails} consecutive failed health probes (CONFIRMED)`,
                    latencySpike ? latencySpike.detail : 'No latency spike recorded',
                    failRate ? failRate.detail : 'Failure-rate anomaly check recorded',
                    riskTrend ? `Predictive risk=${riskTrend.observedValue} (confidence ${riskTrend.confidence})` : 'Risk engine has no calibrated assessment'
                ],
                inferredReasoning: 'Multiple independent failure signals converge: repeated probe failures plus latency/failure-rate deviation from baseline. Pattern historically precedes OFFLINE transitions, but transition is not guaranteed.',
                recommendedOperatorActions: external
                    ? ['INSPECT_HEALTH', 'INSPECT_TIMELINE', 'ESCALATE_OPERATOR']
                    : ['INSPECT_HEALTH', 'INSPECT_TIMELINE', 'PREPARE_REMEDIATION_POLICY', 'OPEN_RESPONSE_CENTER'],
                status: 'ACTIVE'
            });
        }

        // Rule 2: DEGRADED state + health-degradation anomaly => escalation risk
        const healthDeg = anomalyOf('HEALTH_DEGRADATION');
        if (currentState === 'DEGRADED' || healthDeg) {
            const alreadyCritical = out.some(w => w.severity === 'CRITICAL');
            if (!alreadyCritical) {
                out.push({
                    ...baseNarrative,
                    warningId: stableId('DEGRADATION_ESCALATION_RISK'),
                    warningType: 'DEGRADATION_ESCALATION_RISK',
                    title: `${agentId} health is unstable — degradation may escalate`,
                    severity: currentState === 'DEGRADED' ? 'HIGH' : 'MEDIUM',
                    confidence: 0.78,
                    leadTimeEstimate: 'SHORT_TERM',
                    horizonWindow: 'NEXT_1H_TO_24H',
                    observedEvidence: [
                        `Current state=${currentState} (CONFIRMED)`,
                        healthDeg ? healthDeg.detail : 'No repeated-degradation anomaly recorded',
                        riskTrend ? `Predictive risk=${riskTrend.observedValue}` : 'No calibrated risk assessment'
                    ],
                    inferredReasoning: 'Repeated DEGRADED observations indicate instability. Escalation to OFFLINE is possible but not confirmed.',
                    recommendedOperatorActions: external
                        ? ['INSPECT_HEALTH', 'INSPECT_TIMELINE', 'ESCALATE_OPERATOR']
                        : ['INSPECT_HEALTH', 'INSPECT_DEPENDENCIES', 'OPEN_RESPONSE_CENTER'],
                    status: 'ACTIVE'
                });
            }
        }

        // Rule 3: Upward latency trend => gradual escalation risk (long horizon)
        if (baselineTrend && (baselineTrend.observedValue === 'UPWARD_TREND' || (baselineTrend.trendChangePercent || 0) >= 25)) {
            out.push({
                ...baseNarrative,
                warningId: stableId('LATENCY_ESCALATION_RISK'),
                warningType: 'LATENCY_ESCALATION_RISK',
                title: `${agentId} response time is trending upward (+${baselineTrend.trendChangePercent || 0}%)`,
                severity: (baselineTrend.trendChangePercent || 0) >= 50 ? 'MEDIUM' : 'LOW',
                confidence: 0.72,
                leadTimeEstimate: 'LONG_TERM',
                horizonWindow: 'NEXT_24H_TO_7D',
                observedEvidence: [
                    `Baseline trend=${baselineTrend.observedValue} (+${baselineTrend.trendChangePercent}% over window)`,
                    `Baseline avg=${baselineTrend.baselineValue ? baselineTrend.baselineValue.averageResponseTimeMs : 'unknown'}ms, current=${baselineTrend.currentLatencyMs}ms`
                ],
                inferredReasoning: 'Sustained latency increase suggests growing load or downstream slowdown. No outage is predicted; this is a watch condition.',
                recommendedOperatorActions: ['INSPECT_TIMELINE', 'REVIEW_BASELINE_TRENDS', 'INSPECT_DEPENDENCIES'],
                status: 'ACTIVE'
            });
        }

        // Rule 4: Fleet recurring problem touches this agent => resurgence risk
        const fleetMatch = fleetObserved.find(f => f.kind === 'RECURRING_PROBLEM');
        if (fleetMatch && (hasKind('FAILURE_RATE_INCREASE') || hasKind('AVAILABILITY_DEGRADATION') || consecFails >= 1)) {
            out.push({
                ...baseNarrative,
                warningId: stableId('RECURRING_FAILURE_RESURGENCE'),
                warningType: 'RECURRING_FAILURE_RESURGENCE',
                title: `${agentId} matches a known recurring fleet problem pattern`,
                severity: 'MEDIUM',
                confidence: 0.75,
                leadTimeEstimate: 'SHORT_TERM',
                horizonWindow: 'NEXT_24H',
                observedEvidence: [
                    `Fleet recurring problem: ${fleetMatch.detail}`,
                    `${consecFails} consecutive failures on this agent`
                ],
                inferredReasoning: 'Current failure signals resemble a previously seen fleet-wide pattern. Resurgence is plausible; root cause should be compared via Knowledge Graph similar-incident search.',
                recommendedOperatorActions: ['INSPECT_TIMELINE', 'OPEN_KNOWLEDGE_INVESTIGATION', 'INSPECT_EVIDENCE'],
                status: 'ACTIVE'
            });
        }

        // Rule 5: Dependency blast-radius exposure (only if topology + degraded/risk signals)
        if (this.blastRadiusAnalyzer && (currentState === 'DEGRADED' || (riskTrend && riskTrend.observedValue !== 'LOW'))) {
            let blastInfo = null;
            try {
                if (typeof this.blastRadiusAnalyzer.analyzeBlastRadius === 'function') {
                    blastInfo = this.blastRadiusAnalyzer.analyzeBlastRadius(agentId, { tenantId });
                } else if (typeof this.blastRadiusAnalyzer.getBlastRadius === 'function') {
                    blastInfo = this.blastRadiusAnalyzer.getBlastRadius(agentId, { tenantId });
                }
            } catch (e) {
                blastInfo = null;
            }
            const affected = blastInfo && (blastInfo.affectedAgents || blastInfo.impactedAgents || blastInfo.affectedCount);
            const count = Array.isArray(affected) ? affected.length : (typeof affected === 'number' ? affected : 0);
            if (blastInfo && count > 0) {
                out.push({
                    ...baseNarrative,
                    warningId: stableId('DEPENDENCY_CASCADE_RISK'),
                    warningType: 'DEPENDENCY_CASCADE_RISK',
                    title: `Degradation of ${agentId} may affect ${count} dependent agent(s)`,
                    severity: 'HIGH',
                    confidence: 0.8,
                    leadTimeEstimate: 'SHORT_TERM',
                    horizonWindow: 'NEXT_1H_TO_24H',
                    observedEvidence: [
                        `Blast-radius analysis reports ${count} potentially affected node(s) (CONFIRMED topology)`,
                        `Source agent state=${currentState}`
                    ],
                    inferredReasoning: 'Topology shows downstream dependents. Cascade is possible if source remains degraded; impact depends on dependency criticality, which is not assumed.',
                    recommendedOperatorActions: ['INSPECT_DEPENDENCIES', 'REVIEW_BLAST_RADIUS', 'ESCALATE_OPERATOR'],
                    status: 'ACTIVE'
                });
            }
        }

        // Rule 6 (catch-all): HIGH/CRITICAL predictive risk with no other warning => ELEVATED_WATCH
        if (out.length === 0 && riskTrend && (riskTrend.observedValue === 'HIGH' || riskTrend.observedValue === 'CRITICAL')) {
            out.push({
                ...baseNarrative,
                warningId: stableId('ELEVATED_WATCH'),
                warningType: 'ELEVATED_WATCH',
                title: `${agentId} carries ${riskTrend.observedValue} predictive risk — elevated watch`,
                severity: riskTrend.observedValue === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
                confidence: riskTrend.confidence || 0.7,
                leadTimeEstimate: 'UNKNOWN',
                horizonWindow: 'NEXT_24H',
                observedEvidence: riskTrend.evidence || [`Risk engine assessment=${riskTrend.observedValue}`],
                inferredReasoning: 'Risk engine score is elevated but no converging anomaly pattern is observed. This is a watch condition, not a failure forecast.',
                recommendedOperatorActions: ['INSPECT_HEALTH', 'REVIEW_RISK_DIAGNOSIS'],
                status: 'ACTIVE'
            });
        }

        return out;
    }
}

module.exports = { EarlyWarningInferenceEngine, WARNING_TYPES, WARNING_SEVERITY, isExternalAgent };
