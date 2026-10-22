/**
 * Phase 35 — Improvement Governance Service
 * Explicit lifecycle state machine. No automatic approval, no hidden
 * transitions. Every transition is recorded with actor and timestamp.
 *
 * DRAFT → REVIEW_REQUIRED → APPROVAL_REQUIRED → APPROVED / REJECTED / DEFERRED
 * APPROVED → IMPLEMENTATION_TRACKING → OBSERVATION → COMPLETED → CLOSED
 * REJECTED / DEFERRED / CLOSED → DRAFT (via explicit reopen)
 */

const GOVERNANCE_STATES = Object.freeze({
    DRAFT: 'DRAFT',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    DEFERRED: 'DEFERRED',
    IMPLEMENTATION_TRACKING: 'IMPLEMENTATION_TRACKING',
    OBSERVATION: 'OBSERVATION',
    COMPLETED: 'COMPLETED',
    CLOSED: 'CLOSED'
});

// Allowed direct transitions. Multi-step approvals walk each step explicitly.
const ALLOWED_TRANSITIONS = Object.freeze({
    DRAFT: ['REVIEW_REQUIRED', 'APPROVAL_REQUIRED', 'APPROVED', 'REJECTED', 'DEFERRED', 'CLOSED'],
    REVIEW_REQUIRED: ['APPROVAL_REQUIRED', 'APPROVED', 'REJECTED', 'DEFERRED', 'CLOSED'],
    APPROVAL_REQUIRED: ['APPROVED', 'REJECTED', 'DEFERRED', 'CLOSED'],
    APPROVED: ['IMPLEMENTATION_TRACKING', 'CLOSED'],
    REJECTED: ['DRAFT', 'CLOSED'],
    DEFERRED: ['DRAFT', 'APPROVAL_REQUIRED', 'REJECTED', 'CLOSED'],
    IMPLEMENTATION_TRACKING: ['OBSERVATION', 'CLOSED'],
    OBSERVATION: ['COMPLETED', 'CLOSED'],
    COMPLETED: ['CLOSED'],
    CLOSED: ['DRAFT']
});

class ImprovementGovernanceService {
    transition(proposal, toState, { actor = 'operator', reason = '', tenantId = null } = {}) {
        const from = proposal.status;
        const allowed = ALLOWED_TRANSITIONS[from] || [];
        if (!allowed.includes(toState)) {
            const err = new Error(`Governance transition ${from} → ${toState} is not allowed.`);
            err.statusCode = 409;
            throw err;
        }
        proposal.status = toState;
        proposal.updatedAt = new Date().toISOString();
        const entry = {
            eventId: `gov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            proposalId: proposal.proposalId,
            tenantId: tenantId || proposal.tenantId,
            previousState: from,
            newState: toState,
            actor,
            reason: String(reason || '').slice(0, 500),
            recordedAt: new Date().toISOString()
        };
        return entry;
    }

    /**
     * Walk DRAFT → REVIEW_REQUIRED → APPROVAL_REQUIRED → APPROVED with an
     * explicit history entry per step (single operator action, no hidden jumps).
     */
    approveThroughStages(proposal, { actor, reason, tenantId }) {
        const entries = [];
        const path = [];
        if (proposal.status === 'DRAFT') path.push('REVIEW_REQUIRED');
        if (['DRAFT', 'REVIEW_REQUIRED'].includes(proposal.status)) path.push('APPROVAL_REQUIRED');
        path.push('APPROVED');
        for (const step of path) {
            entries.push(this.transition(proposal, step, { actor, reason, tenantId }));
        }
        return entries;
    }
}

module.exports = { ImprovementGovernanceService, GOVERNANCE_STATES, ALLOWED_TRANSITIONS };
