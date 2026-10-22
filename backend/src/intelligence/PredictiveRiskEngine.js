/**
 * Phase 23 — Predictive Risk Engine
 * Assesses operational risk based on historical baselines, detected anomalies, and health state transitions.
 * Generates human-readable 9-field diagnoses and predictive warnings.
 */

const { AnomalyDetectionService, SEVERITY_LEVELS } = require('./AnomalyDetectionService');
const { PredictiveBaselineEngine } = require('./PredictiveBaselineEngine');

const RISK_LEVELS = Object.freeze({
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL'
});

class PredictiveRiskEngine {
    constructor(options = {}) {
        this.store = options.store || null;
        this.baselineEngine = options.baselineEngine || new PredictiveBaselineEngine({ store: this.store });
        this.anomalyService = options.anomalyService || new AnomalyDetectionService({ store: this.store, baselineEngine: this.baselineEngine });
    }

    /**
     * Evaluate predictive risk for an agent.
     */
    evaluateRisk(agentId, options = {}) {
        const tenantId = options.tenantId || 'default-tenant';
        const range = options.range || '24h';
        const correlationId = options.correlationId || `corr_risk_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        if (!this.store) {
            return this._buildDefaultResponse(agentId, tenantId, 'INSUFFICIENT_DATA', correlationId);
        }

        const baseline = this.baselineEngine.calculateBaseline(agentId, range, tenantId, this.store);
        const status = this.store.getStatus(agentId, tenantId);
        const anomalies = this.anomalyService.detectAnomalies(agentId, { tenantId, range, correlationId });

        if (baseline.status === 'INSUFFICIENT_DATA') {
            return this._buildDefaultResponse(agentId, tenantId, 'INSUFFICIENT_DATA', correlationId);
        }

        let riskLevel = RISK_LEVELS.LOW;
        let confidence = 0.80;
        const contributingFactors = [];
        const evidence = [];

        // 1. Analyze Health State & Failures
        const state = status.currentState || 'UNKNOWN';
        const consecFails = status.consecutiveFailures || 0;

        if (state === 'OFFLINE' || state === 'UNHEALTHY' || consecFails >= 3) {
            riskLevel = RISK_LEVELS.CRITICAL;
            confidence = 0.95;
            contributingFactors.push('Agent is currently OFFLINE or UNHEALTHY');
            evidence.push(`Current health state is ${state} with ${consecFails} consecutive probe failures`);
        } else if (state === 'DEGRADED' || consecFails === 2) {
            riskLevel = RISK_LEVELS.HIGH;
            confidence = 0.90;
            contributingFactors.push('Agent health state is DEGRADED or accumulating probe failures');
            evidence.push(`Current state is ${state} with ${consecFails} consecutive probe failures`);
        }

        // 2. Analyze Anomalies
        const hasCriticalAnom = anomalies.some(a => a.severity === SEVERITY_LEVELS.CRITICAL);
        const hasHighAnom = anomalies.some(a => a.severity === SEVERITY_LEVELS.HIGH);
        const hasMediumAnom = anomalies.some(a => a.severity === SEVERITY_LEVELS.MEDIUM);

        anomalies.forEach(a => {
            contributingFactors.push(`${a.type}: ${a.humanReadableSummary}`);
            if (Array.isArray(a.evidence)) evidence.push(...a.evidence);
        });

        if (hasCriticalAnom && riskLevel !== RISK_LEVELS.CRITICAL) {
            riskLevel = RISK_LEVELS.CRITICAL;
            confidence = 0.92;
        } else if (hasHighAnom && (riskLevel === RISK_LEVELS.LOW || riskLevel === RISK_LEVELS.MEDIUM)) {
            riskLevel = RISK_LEVELS.HIGH;
            confidence = 0.88;
        } else if (hasMediumAnom && riskLevel === RISK_LEVELS.LOW) {
            riskLevel = RISK_LEVELS.MEDIUM;
            confidence = 0.85;
        }

        // 3. Recommended Action
        let recommendedAction = 'Continue standard monitoring.';
        if (riskLevel === RISK_LEVELS.CRITICAL) {
            recommendedAction = 'Execute approved remediation or manual operator intervention immediately.';
        } else if (riskLevel === RISK_LEVELS.HIGH) {
            recommendedAction = 'Prepare approved remediation policies and monitor closely for further degradation.';
        } else if (riskLevel === RISK_LEVELS.MEDIUM) {
            recommendedAction = 'Review agent endpoint logs and monitor response latency trends.';
        }

        // 4. Human-Readable 9-Field Diagnosis
        const humanReadableDiagnosis = this._formatStructuredDiagnosis(agentId, state, riskLevel, anomalies, baseline, status, recommendedAction);

        const riskAssessment = {
            agentId,
            tenantId,
            evaluatedAt: new Date().toISOString(),
            riskLevel,
            confidence,
            currentState: state,
            baselineStatus: baseline.status,
            anomaliesCount: anomalies.length,
            anomalies,
            contributingFactors,
            evidence: Array.from(new Set(evidence)),
            recommendedAction,
            humanReadableSummary: humanReadableDiagnosis.summary,
            structuredDiagnosis: humanReadableDiagnosis,
            correlationId
        };

        // Persist predictive risk assessment
        if (this.store.persistence && typeof this.store._persist === 'function') {
            this.store._persist('predictive_risks', `${tenantId}:${agentId}`, riskAssessment);
        }

        return riskAssessment;
    }

    _buildDefaultResponse(agentId, tenantId, status, correlationId) {
        return {
            agentId,
            tenantId,
            evaluatedAt: new Date().toISOString(),
            riskLevel: RISK_LEVELS.LOW,
            confidence: 0.50,
            currentState: 'UNKNOWN',
            baselineStatus: status,
            anomaliesCount: 0,
            anomalies: [],
            contributingFactors: ['Insufficient historical monitoring data'],
            evidence: ['Fewer than 3 health check records available'],
            recommendedAction: 'Continue collecting monitoring data to establish a historical baseline.',
            humanReadableSummary: 'No predictive risk conclusion yet — insufficient historical data.',
            structuredDiagnosis: {
                overallStatus: 'UNKNOWN',
                whatIsHappening: 'Monitoring system is initializing baseline collection.',
                whatIsGood: 'Monitoring probes are active.',
                whatIsWrong: 'Insufficient historical data to compute an accurate risk baseline.',
                whyItWasDetected: 'Fewer than 3 probe samples collected.',
                evidence: 'No baseline accumulated yet.',
                risk: 'LOW (uncalibrated)',
                recommendedAction: 'Continue monitoring.',
                nextStep: 'Wait for baseline data collection.'
            },
            correlationId
        };
    }

    _formatStructuredDiagnosis(agentId, state, riskLevel, anomalies, baseline, status, recommendedAction) {
        const overallStatus = state === 'HEALTHY' ? (anomalies.length > 0 ? 'Degrading' : 'Healthy') : state;
        const currentLatency = status.latency ? (status.latency.lastLatencyMs || 0) : 0;
        const avgLatency = baseline.averageResponseTimeMs || 0;

        let whatIsHappening = `${agentId} is responding normally.`;
        if (state === 'OFFLINE') whatIsHappening = `${agentId} is unreachable.`;
        else if (anomalies.length > 0) whatIsHappening = `${agentId} is experiencing anomalous telemetry behavior (${anomalies[0].type}).`;

        let whatIsGood = `Agent is responding to health probes in ${currentLatency}ms.`;
        if (state === 'OFFLINE') whatIsGood = `Watchtower monitoring service is active and probing endpoint.`;

        let whatIsWrong = `No significant operational issues detected.`;
        if (state === 'OFFLINE') whatIsWrong = `Connection to agent endpoint failed.`;
        else if (anomalies.length > 0) whatIsWrong = anomalies[0].humanReadableSummary;

        let whyItWasDetected = `Observed metrics match historical baseline.`;
        if (anomalies.length > 0) whyItWasDetected = `Observed telemetry deviated from historical baseline (${baseline.averageResponseTimeMs}ms average).`;
        else if (state !== 'HEALTHY') whyItWasDetected = `Health probe returned non-200 HTTP status or timed out.`;

        let evidenceText = `Baseline latency: ${avgLatency}ms, current latency: ${currentLatency}ms.`;
        if (anomalies.length > 0) evidenceText = anomalies.map(a => a.humanReadableSummary).join(' | ');

        const summary = `OVERALL STATUS: ${overallStatus}\n` +
            `WHAT IS HAPPENING: ${whatIsHappening}\n` +
            `WHAT IS GOOD: ${whatIsGood}\n` +
            `WHAT IS WRONG: ${whatIsWrong}\n` +
            `WHY IT WAS DETECTED: ${whyItWasDetected}\n` +
            `EVIDENCE: ${evidenceText}\n` +
            `RISK: ${riskLevel}\n` +
            `RECOMMENDED ACTION: ${recommendedAction}\n` +
            `NEXT STEP: Continue monitoring cycle.`;

        return {
            overallStatus,
            whatIsHappening,
            whatIsGood,
            whatIsWrong,
            whyItWasDetected,
            evidence: evidenceText,
            risk: riskLevel,
            recommendedAction,
            nextStep: 'Continue monitoring cycle.',
            summary
        };
    }
}

module.exports = {
    PredictiveRiskEngine,
    RISK_LEVELS
};
