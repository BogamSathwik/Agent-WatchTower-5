/**
 * Phase 32 — Decision Option Engine
 * Generates ONLY options supported by existing platform capabilities.
 * No autonomous execution. No invented actions.
 */

const { isExternalAgent } = require('./DecisionEvidenceService');

const OPTION_TYPES = Object.freeze({
    CONTINUE_OBSERVATION: 'CONTINUE_OBSERVATION',
    INVESTIGATE: 'INVESTIGATE',
    ACKNOWLEDGE: 'ACKNOWLEDGE',
    ESCALATE: 'ESCALATE',
    PREPARE_RESPONSE: 'PREPARE_RESPONSE',
    APPROVE_REMEDIATION: 'APPROVE_REMEDIATION',
    CHECK_DEPENDENCY: 'CHECK_DEPENDENCY',
    REVIEW_SIMILAR_INCIDENTS: 'REVIEW_SIMILAR_INCIDENTS'
});

const OPTION_DEFINITIONS = Object.freeze({
    CONTINUE_OBSERVATION: {
        whatItMeans: 'Keep current monitoring cadence and re-evaluate at the next probe cycle. No state change.',
        reversibility: 'FULLY_REVERSIBLE', approvalRequirement: 'NONE', executionSupport: 'SUPPORTED',
        investigationValue: 'Confirms whether signals persist or return to baseline.'
    },
    INVESTIGATE: {
        whatItMeans: 'Open the Knowledge Graph / Investigation Center context for the scenario scope (read-only).',
        reversibility: 'FULLY_REVERSIBLE', approvalRequirement: 'NONE', executionSupport: 'SUPPORTED',
        investigationValue: 'Surfaces recorded incidents, warnings, dependencies, and similar history.'
    },
    ACKNOWLEDGE: {
        whatItMeans: 'Record operator awareness of the scenario/warning without changing system state.',
        reversibility: 'FULLY_REVERSIBLE', approvalRequirement: 'OPERATOR', executionSupport: 'SUPPORTED',
        investigationValue: 'Reduces duplicate triage; preserves timeline of operator decisions.'
    },
    ESCALATE: {
        whatItMeans: 'Notify the responsible operator/team via existing alerting channels (no automated remediation).',
        reversibility: 'FULLY_REVERSIBLE', approvalRequirement: 'OPERATOR', executionSupport: 'SUPPORTED',
        investigationValue: 'Brings human attention to emerging or dependency-spanning situations.'
    },
    PREPARE_RESPONSE: {
        whatItMeans: 'Draft (not execute) a Response Center plan so approval can be requested later.',
        reversibility: 'FULLY_REVERSIBLE', approvalRequirement: 'OPERATOR', executionSupport: 'CONDITIONAL',
        investigationValue: 'Shortens time-to-approval if the situation worsens.'
    },
    APPROVE_REMEDIATION: {
        whatItMeans: 'Approve a previously prepared remediation via the existing Response/Remediation approval workflow.',
        reversibility: 'REQUIRES_VERIFICATION', approvalRequirement: 'ADMIN_OR_OPERATOR', executionSupport: 'CONDITIONAL',
        investigationValue: 'Only meaningful where a supported remediation interface exists.'
    },
    CHECK_DEPENDENCY: {
        whatItMeans: 'Inspect declared dependency topology and health for the scenario scope (read-only).',
        reversibility: 'FULLY_REVERSIBLE', approvalRequirement: 'NONE', executionSupport: 'SUPPORTED',
        investigationValue: 'Shows which declared dependents could feel a cascade.'
    },
    REVIEW_SIMILAR_INCIDENTS: {
        whatItMeans: 'Review historically similar incidents matched by recorded attributes (read-only).',
        reversibility: 'FULLY_REVERSIBLE', approvalRequirement: 'NONE', executionSupport: 'SUPPORTED',
        investigationValue: 'Provides precedent for how similar situations previously evolved and recovered.'
    }
});

class DecisionOptionEngine {
    constructor(options = {}) {
        this.responseCenterService = options.responseCenterService || null;
    }

    /**
     * Generate supported options for a scenario + evidence + impact.
     */
    generateOptions(scenario, evidence, impact, { tenantId = 'default-tenant' } = {}) {
        const agentId = scenario ? scenario.agentId : null;
        const external = isExternalAgent(agentId);
        const gaps = evidence ? evidence.gaps : [];
        const hasInsufficient = (gaps || []).length > 0 && (evidence.observed || []).length === 0;
        // Stateful planning requires substantive operational evidence; without
        // it, preparation/approval options are explicitly UNSUPPORTED.
        const substantive = ((evidence ? evidence.observed : []) || []).filter(o =>
            o.kind !== 'RESPONSE_OPTIONS' && o.kind !== 'KNOWLEDGE_CONTEXT'
        ).length + ((evidence ? evidence.trends : []) || []).length + ((evidence ? evidence.inferred : []) || []).length;
        const evidenceBacked = substantive > 0;

        const responseSummary = this._inspectResponseOptions(agentId, tenantId, external);
        const options = [];

        const push = (type, extra = {}) => {
            const def = OPTION_DEFINITIONS[type];
            options.push({
                optionType: type,
                whatItMeans: def.whatItMeans,
                supportingEvidence: extra.supportingEvidence || [],
                affectedScope: (impact && impact.impactScope) || 'UNKNOWN',
                risks: extra.risks || [],
                reversibility: extra.reversibility || def.reversibility,
                approvalRequirement: def.approvalRequirement,
                executionSupport: extra.executionSupport || def.executionSupport,
                investigationValue: def.investigationValue,
                statusNote: extra.statusNote || 'Available for operator review. Selecting an option does not execute anything.'
            });
        };

        const obsRefs = (evidence ? evidence.observed : []).slice(0, 2).map(e => `${e.kind}: ${e.summary}`.slice(0, 200));
        const trendRefs = (evidence ? evidence.trends : []).slice(0, 2).map(e => `${e.kind}: ${e.summary}`.slice(0, 200));

        // Always-safe read-only options
        push(OPTION_TYPES.CONTINUE_OBSERVATION, {
            supportingEvidence: hasInsufficient
                ? ['INSUFFICIENT_DATA: continued collection is the only evidence-backed path.']
                : [...obsRefs, ...trendRefs].slice(0, 3)
        });
        push(OPTION_TYPES.INVESTIGATE, { supportingEvidence: obsRefs.slice(0, 2) });
        push(OPTION_TYPES.CHECK_DEPENDENCY, {
            supportingEvidence: (impact && impact.dependencyEdges.length > 0)
                ? [`${impact.dependencyEdges.length} declared edge(s) touch the scope (CONFIRMED).`]
                : ['INSUFFICIENT_DATA: no declared edges for scope — inspection will show empty topology, not an error.']
        });
        push(OPTION_TYPES.REVIEW_SIMILAR_INCIDENTS, {
            supportingEvidence: (evidence && evidence.inferred.find(i => i.kind === 'SIMILAR_INCIDENTS'))
                ? ['Historically similar incidents matched (INFERRED match over CONFIRMED records).']
                : ['INSUFFICIENT_DATA: no similar incidents matched yet.']
        });

        // Operator-attention options
        push(OPTION_TYPES.ACKNOWLEDGE, { supportingEvidence: obsRefs.slice(0, 1) });
        push(OPTION_TYPES.ESCALATE, {
            supportingEvidence: (impact && impact.affectedAgentsCount > 1)
                ? [`Scope touches ${impact.affectedAgentsCount} agent(s); human coordination is warranted.`]
                : obsRefs.slice(0, 1),
            risks: ['Escalation consumes operator attention; no system state is changed.']
        });

        // Response-adjacent options — truthful about support
        if (external) {
            push(OPTION_TYPES.PREPARE_RESPONSE, {
                executionSupport: 'UNSUPPORTED',
                supportingEvidence: [`${agentId} is an external agent: monitoring only, no control interface (CONFIRMED profile behavior).`],
                risks: ['No executable remediation exists for external agents; planning is limited to inspection and escalation.'],
                statusNote: 'Inspect-only: plan drafting references Response Center read-only options; nothing can be executed.'
            });
            // APPROVE_REMEDIATION deliberately omitted for external agents (unsupported).
        } else {
            push(OPTION_TYPES.PREPARE_RESPONSE, {
                executionSupport: !evidenceBacked ? 'UNSUPPORTED' : (responseSummary.supported ? 'CONDITIONAL' : 'UNSUPPORTED'),
                supportingEvidence: !evidenceBacked
                    ? ['INSUFFICIENT_DATA: no substantive evidence to base a response plan on.']
                    : (responseSummary.supported
                        ? [`Response Center exposes ${responseSummary.count} inspectable option(s) (CONFIRMED). Approval still required before anything executes.`]
                        : ['INSUFFICIENT_DATA: no Response Center options generated for scope yet.']),
                risks: ['A prepared plan has no effect until explicitly approved and executed in the Response Center.']
            });
            push(OPTION_TYPES.APPROVE_REMEDIATION, {
                executionSupport: !evidenceBacked ? 'UNSUPPORTED' : (responseSummary.supported ? 'CONDITIONAL' : 'UNSUPPORTED'),
                supportingEvidence: !evidenceBacked
                    ? ['INSUFFICIENT_DATA: nothing evidence-backed to approve.']
                    : (responseSummary.supported
                        ? ['Approval is handled entirely by the existing Response/Remediation workflow; Decision Intelligence only references it.']
                        : ['INSUFFICIENT_DATA: nothing prepared to approve.']),
                risks: ['Stateful remediation changes system behavior and requires verification; see Response Center safety state.'],
                reversibility: 'REQUIRES_VERIFICATION'
            });
        }

        return options;
    }

    _inspectResponseOptions(agentId, tenantId, external) {
        if (!agentId || external || !this.responseCenterService) {
            return { supported: false, count: 0, reason: external ? 'External agent: inspect-only.' : 'Response Center not wired or no agent scope.' };
        }
        try {
            const opts = typeof this.responseCenterService.generateResponseOptions === 'function'
                ? this.responseCenterService.generateResponseOptions({ agentId, tenantId }) || []
                : [];
            return { supported: opts.length > 0, count: opts.length, reason: opts.length > 0 ? `${opts.length} option(s) inspectable.` : 'No options generated.' };
        } catch (e) {
            return { supported: false, count: 0, reason: `Response inspection failed: ${e.message}` };
        }
    }
}

module.exports = { DecisionOptionEngine, OPTION_TYPES, OPTION_DEFINITIONS };
