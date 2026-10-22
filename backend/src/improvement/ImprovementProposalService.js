/**
 * Phase 35 — Improvement Proposal Service
 * Converts opportunities into structured proposals. A proposal DESCRIBES a
 * change for governance review; it never performs the change.
 * Proposal templates are advisory text grounded in the opportunity evidence.
 */

function sanitize(str) {
    return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

const PROPOSAL_TEMPLATES = Object.freeze({
    RECURRING_FAILURE_PATTERN: {
        proposedImprovement: 'Review monitoring thresholds and runbooks for the recurring failure scope.',
        rationale: 'Recurrence across recorded history suggests the current detection or response path is not preventing repeats.',
        expectedBenefit: 'Earlier detection or fewer repeats could follow, if the review leads to an approved change.',
        risks: ['Threshold changes can increase noise if set without care; any change needs its own approval.'],
        reversibility: 'A threshold or runbook review is fully reversible; implementation happens externally with approval.'
    },
    REPEATED_RESPONSE_FAILURE: {
        proposedImprovement: 'Review whether the repeatedly unsuccessful response path fits the problem type.',
        rationale: 'Recorded outcomes show the same response type not resolving the issue more than once.',
        expectedBenefit: 'A better-matched response path could be selected in future incidents.',
        risks: ['Changing response selection without evidence could delay recovery; keep the current path until review completes.'],
        reversibility: 'Review-only; no operational change is made by the proposal.'
    },
    RECOVERY_DURATION_PATTERN: {
        proposedImprovement: 'Review recovery runbooks and verification cadence for slow recovery windows.',
        rationale: 'Recorded response-to-verification windows are long or unmeasured.',
        expectedBenefit: 'Faster, better-measured recovery could follow from runbook or cadence adjustments.',
        risks: ['Shortening verification windows without evidence could mark recovery prematurely.'],
        reversibility: 'Review-only until an externally approved change is implemented.'
    },
    DEPENDENCY_RELIABILITY_PATTERN: {
        proposedImprovement: 'Review dependency declarations and capacity planning for the hotspot area.',
        rationale: 'Operational load concentrates in one area across recorded aggregates.',
        expectedBenefit: 'Clearer ownership and capacity headroom could reduce hotspot pressure.',
        risks: ['Redeclaring dependencies without owner confirmation could misrepresent topology.'],
        reversibility: 'Review-only; topology changes remain externally governed.'
    },
    REPEATED_WARNING_PATTERN: {
        proposedImprovement: 'Review warning thresholds and monitoring coverage for the repeatedly warned agent.',
        rationale: 'Multiple active inferred warnings suggest thresholds may be miscalibrated or coverage may be thin.',
        expectedBenefit: 'Fewer noisy warnings or earlier true-positive detection could follow.',
        risks: ['Warnings are inferred; threshold changes act on uncertain signals and need care.'],
        reversibility: 'Review-only until an externally approved change is implemented.'
    },
    VERIFICATION_GAP: {
        proposedImprovement: 'Improve verification coverage for the response path that did not verify.',
        rationale: 'Verification could not confirm recovery, so outcomes remain unknown.',
        expectedBenefit: 'Better verification could distinguish real recovery from silent persistence.',
        risks: ['Additional probes add load; scope them to the affected agent first.'],
        reversibility: 'Coverage improvements are additive and removable.'
    },
    OBSERVABILITY_GAP: {
        proposedImprovement: 'Improve monitoring coverage or complete onboarding for the agent with no probe history.',
        rationale: 'No recorded probes means Watchtower cannot assess this agent at all.',
        expectedBenefit: 'Basic health visibility could be established for the agent.',
        risks: ['None operational; coverage work is additive.'],
        reversibility: 'Fully reversible.'
    },
    UNSUPPORTED_CAPABILITY_GAP: {
        proposedImprovement: 'Investigate inspect-only coverage and escalation paths for the unsupported scope (observability/process only).',
        rationale: 'Execution is unsupported here, so improvement is limited to visibility and process.',
        expectedBenefit: 'Faster human response could follow from better visibility and escalation clarity.',
        risks: ['This proposal must never suggest executable capabilities for the unsupported scope.'],
        reversibility: 'Review-only.'
    },
    RESPONSE_PROCESS_GAP: {
        proposedImprovement: 'Review the incident workflow and approval responsiveness for the unresolved scope.',
        rationale: 'Unresolved incidents accumulate, suggesting process latency rather than tooling failure.',
        expectedBenefit: 'Clearer ownership and faster approvals could reduce incident dwell time.',
        risks: ['Process changes need operator agreement; the proposal only frames the review.'],
        reversibility: 'Review-only.'
    },
    POLICY_REVIEW_OPPORTUNITY: {
        proposedImprovement: 'Review approval steps and evidence requirements in light of accumulated governed history.',
        rationale: 'Enough governed responses exist to assess whether the workflow helps or hinders.',
        expectedBenefit: 'A better-calibrated governance workflow could follow operator review.',
        risks: ['Governance changes affect safety posture; they require explicit operator approval.'],
        reversibility: 'Review-only; governance changes are separately approved.'
    }
});

class ImprovementProposalService {
    buildProposal({ opportunity, evidence, impact, tenantId = 'default-tenant', operator = 'operator', customTitle = null, customDetail = '' } = {}) {
        if (!opportunity) throw new Error('opportunity is required to build a proposal.');
        const template = PROPOSAL_TEMPLATES[opportunity.type] || {
            proposedImprovement: 'Review the opportunity scope with the owning operators.',
            rationale: 'Recorded evidence supports a review.',
            expectedBenefit: 'Better understanding of the scope could follow.',
            risks: ['Any change needs its own approval.'],
            reversibility: 'Review-only.'
        };
        const now = new Date().toISOString();
        return {
            proposalId: `imp_${sanitize(opportunity.type)}_${sanitize(opportunity.agentId || 'fleet')}_${Date.now().toString(36)}`,
            tenantId,
            opportunityId: opportunity.opportunityId,
            opportunityType: opportunity.type,
            title: customTitle || this._titleFor(opportunity),
            agentId: opportunity.agentId || null,
            status: 'DRAFT',
            evidence: {
                observed: (evidence.observed || []),
                confirmed: (evidence.confirmed || []),
                inferred: (evidence.inferred || []),
                predicted: (evidence.predicted || []),
                simulated: (evidence.simulated || []),
                gaps: (evidence.gaps || []),
                evidenceStrength: evidence.evidenceStrength || 'UNKNOWN'
            },
            affectedScope: {
                impactScope: impact.impactScope,
                affectedAgents: impact.affectedAgents,
                affectedAgentsCount: impact.affectedAgentsCount,
                dependencyEdges: impact.dependencyEdges,
                blastRadius: impact.blastRadius
            },
            proposedImprovement: template.proposedImprovement,
            customDetail: String(customDetail || '').slice(0, 500),
            rationale: template.rationale,
            expectedBenefit: template.expectedBenefit,
            operationalRisks: template.risks,
            dependencies: impact.implementationDependencies || [],
            reversibility: impact.reversibility || template.reversibility,
            uncertainty: impact.uncertainty || '',
            governanceRequirement: 'Explicit operator/admin review and approval before any real change; implementation tracked separately; outcome observed, never claimed.',
            implementationStatus: 'NOT_STARTED',
            implementationRef: null,
            outcome: null,
            createdBy: operator,
            createdAt: now,
            updatedAt: now
        };
    }

    _titleFor(opportunity) {
        const who = opportunity.agentId || 'fleet scope';
        return `Improve: ${opportunity.title} — review for ${who}`;
    }
}

module.exports = { ImprovementProposalService, PROPOSAL_TEMPLATES };
