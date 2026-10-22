/**
 * Phase 33 — Simulation Comparison Service
 * Compares simulated paths across factual dimensions.
 * Never ranks paths as BEST/WORST/WINNER/RECOMMENDED and never assigns
 * arbitrary scores.
 */

const COMPARISON_DIMENSIONS = Object.freeze([
    'sourceEvidence',
    'assumptions',
    'affectedScope',
    'dependencyImpact',
    'operationalConsequences',
    'reversibility',
    'uncertainty',
    'unsupportedCapabilities',
    'operatorInvolvement'
]);

class SimulationComparisonService {
    comparePaths(paths, outcomes, impact, assumptions) {
        const outcomeByPath = new Map();
        (outcomes || []).forEach((o, i) => {
            const pid = (paths[i] && paths[i].pathId) || `PATH_${i}`;
            outcomeByPath.set(pid, o);
        });
        return (paths || []).map((p) => {
            const outcome = outcomeByPath.get(p.pathId) || (outcomes || [])[0] || null;
            const simulatedOnlySteps = (p.steps || []).filter(s => s.classification === 'SIMULATED_ONLY').length;
            return {
                pathId: p.pathId,
                pathName: p.pathName,
                dimensions: {
                    sourceEvidence: {
                        observedCount: this._count(p, 'OBSERVED'),
                        note: 'Observed steps reuse recorded Watchtower data.'
                    },
                    assumptions: {
                        count: (assumptions || []).length,
                        classes: [...new Set((assumptions || []).map(a => a.classification))],
                        note: 'All assumptions are listed explicitly on each simulation.'
                    },
                    affectedScope: {
                        scope: (impact && impact.impactScope) || 'UNKNOWN',
                        affectedAgentsCount: impact ? impact.affectedAgentsCount : 0
                    },
                    dependencyImpact: {
                        declaredEdges: impact ? impact.dependencyEdges.length : 0,
                        propagationNote: (impact && impact.propagationNote) || ''
                    },
                    operationalConsequences: outcome
                        ? { outcomeState: outcome.outcomeState, summary: outcome.summary }
                        : { outcomeState: 'INSUFFICIENT_DATA', summary: 'No outcome modeled.' },
                    reversibility: p.reversibility || 'UNKNOWN',
                    uncertainty: outcome ? outcome.uncertainty : 'Uncertainty not evaluated.',
                    unsupportedCapabilities: this._unsupportedNote(p),
                    operatorInvolvement: p.operatorInvolvement || 'REVIEW_ONLY',
                    simulatedOnlySteps
                }
            };
        });
    }

    _count(path, classification) {
        return (path.steps || []).filter(s => s.classification === classification).length;
    }

    _unsupportedNote(path) {
        const hasSimulatedOnly = (path.steps || []).some(s => s.classification === 'SIMULATED_ONLY');
        return hasSimulatedOnly
            ? 'Path contains SIMULATED_ONLY steps: modeled, never executed. Any real action needs Response Center approval.'
            : 'Path is observation/analysis only; no execution capability involved.';
    }
}

module.exports = { SimulationComparisonService, COMPARISON_DIMENSIONS };
