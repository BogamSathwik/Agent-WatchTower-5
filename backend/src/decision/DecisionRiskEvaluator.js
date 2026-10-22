/**
 * Phase 32 — Decision Risk Evaluator
 * Evaluates risk per option using existing risk intelligence only.
 * No fake probabilities. Levels: LOW / MEDIUM / HIGH / CRITICAL / UNKNOWN.
 */

class DecisionRiskEvaluator {
    constructor(options = {}) {
        this.riskEngine = options.riskEngine || options.predictiveRiskEngine || null;
        this.earlyWarningService = options.earlyWarningService || options.earlyWarningCenterService || null;
    }

    evaluateRisks(scenario, options, evidence, impact, { tenantId = 'default-tenant', range = '24h' } = {}) {
        const agentId = scenario ? scenario.agentId : null;

        // Source risk level (reuse, never invent)
        let sourceRisk = { level: 'UNKNOWN', confidence: null, source: 'none' };
        if (this.riskEngine && agentId) {
            try {
                const r = this.riskEngine.evaluateRisk(agentId, { tenantId, range });
                if (r && r.riskLevel) sourceRisk = { level: r.riskLevel, confidence: r.confidence ?? null, source: 'PredictiveRiskEngine' };
            } catch (e) { /* keep UNKNOWN */ }
        }
        let warningSeverity = null;
        if (this.earlyWarningService && agentId) {
            try {
                const ew = this.earlyWarningService.getAgentEarlyWarning(agentId, { tenantId, range });
                const top = (ew.warnings || []).filter(w => w.status === 'ACTIVE')[0];
                if (top) warningSeverity = top.severity;
            } catch (e) { /* keep null */ }
        }

        const scopeWeight = { LOCAL: 0, AGENT: 1, DEPENDENCY: 2, MULTI_AGENT: 3, FLEET: 4, UNKNOWN: 1 };
        const scopeScore = scopeWeight[(impact && impact.impactScope) || 'UNKNOWN'] ?? 1;
        const recurrence = (evidence && evidence.observed.some(e => e.kind === 'RECURRING_PROBLEM')) ? 1 : 0;

        return (options || []).map(opt => {
            const factors = [];
            let level = 'LOW';

            // Base: stateful options carry more operational risk than read-only ones
            const stateful = opt.optionType === 'APPROVE_REMEDIATION' || opt.optionType === 'PREPARE_RESPONSE';
            if (stateful) {
                level = 'MEDIUM';
                factors.push('Option is stateful or prepares a stateful change (requires approval + verification).');
            } else {
                factors.push('Option is read-only or attention-only; no system state is changed by the option itself.');
            }

            if (sourceRisk.level === 'HIGH' || sourceRisk.level === 'CRITICAL') {
                level = stateful ? 'HIGH' : 'MEDIUM';
                factors.push(`Existing predictive risk is ${sourceRisk.level} (source: ${sourceRisk.source}${sourceRisk.confidence != null ? `, confidence ${sourceRisk.confidence}` : ''}).`);
            } else if (sourceRisk.level !== 'UNKNOWN') {
                factors.push(`Existing predictive risk is ${sourceRisk.level} (source: ${sourceRisk.source}).`);
            } else {
                factors.push('INSUFFICIENT_DATA: no calibrated predictive risk for scope — risk is assessed from scope and history only.');
            }

            if (warningSeverity === 'CRITICAL' || warningSeverity === 'HIGH') {
                if (level === 'LOW') level = 'MEDIUM';
                factors.push(`Active early warning severity is ${warningSeverity} (INFERRED warning, not a fact).`);
            }

            if (scopeScore >= 3) {
                level = level === 'LOW' ? 'MEDIUM' : 'HIGH';
                factors.push(`Impact scope ${(impact && impact.impactScope) || 'UNKNOWN'} touches ${impact ? impact.affectedAgentsCount : 0} agent(s) via recorded topology.`);
            } else if (scopeScore === 2) {
                factors.push('Declared dependency edges touch the scope; cascade is possible but not assumed.');
            }

            if (recurrence === 1) {
                factors.push('Scope matches a recorded recurring fleet pattern; recurrence raises attention priority, not a probability.');
            }

            if (opt.executionSupport === 'UNSUPPORTED') {
                factors.push('Execution is UNSUPPORTED for this scope (e.g. external agent): the option is planning/inspection only, so direct execution risk is none — but the underlying situation still needs a human.');
                if (!stateful) level = 'LOW';
            }

            return {
                optionType: opt.optionType,
                riskLevel: level,
                factors,
                sourceRisk,
                warningSeverity: warningSeverity || 'NONE_RECORDED',
                classification: 'QUALITATIVE_ASSESSMENT',
                note: 'Risk levels reuse existing intelligence and scope facts. No probabilities are computed.'
            };
        });
    }
}

module.exports = { DecisionRiskEvaluator };
