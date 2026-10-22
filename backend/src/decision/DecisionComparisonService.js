/**
 * Phase 32 — Decision Comparison Service
 * Compares options across factual dimensions. Never ranks options as
 * best/worst and never assigns arbitrary overall scores.
 */

const COMPARISON_DIMENSIONS = Object.freeze([
    'supportingEvidence',
    'affectedScope',
    'dependencyImpact',
    'operationalRisk',
    'reversibility',
    'approvalRequirement',
    'investigationValue',
    'executionSupport'
]);

class DecisionComparisonService {
    compareOptions(options, risks, impact) {
        const riskByType = new Map((risks || []).map(r => [r.optionType, r]));
        return (options || []).map(opt => {
            const risk = riskByType.get(opt.optionType) || null;
            return {
                optionType: opt.optionType,
                dimensions: {
                    supportingEvidence: {
                        count: (opt.supportingEvidence || []).length,
                        items: (opt.supportingEvidence || []).slice(0, 4),
                        note: (opt.supportingEvidence || []).some(s => String(s).startsWith('INSUFFICIENT_DATA'))
                            ? 'Some supporting evidence is missing — see gaps.'
                            : 'Evidence references recorded Watchtower data.'
                    },
                    affectedScope: {
                        scope: opt.affectedScope || ((impact && impact.impactScope) || 'UNKNOWN'),
                        affectedAgentsCount: impact ? impact.affectedAgentsCount : 0
                    },
                    dependencyImpact: {
                        declaredEdges: impact ? impact.dependencyEdges.length : 0,
                        note: impact && impact.dependencyEdges.length > 0
                            ? 'Declared edges touch the scope (CONFIRMED topology).'
                            : 'No declared edges for scope.'
                    },
                    operationalRisk: risk
                        ? { level: risk.riskLevel, factorsCount: risk.factors.length, classification: risk.classification }
                        : { level: 'UNKNOWN', note: 'Risk not evaluated.' },
                    reversibility: opt.reversibility,
                    approvalRequirement: opt.approvalRequirement,
                    investigationValue: opt.investigationValue,
                    executionSupport: { status: opt.executionSupport, note: opt.statusNote || '' }
                }
            };
        });
    }
}

module.exports = { DecisionComparisonService, COMPARISON_DIMENSIONS };
