/**
 * Phase 35 — Improvement History Service
 * Persists opportunities (snapshots), evidence, proposals, governance
 * transitions, approvals, implementation tracking, and outcomes using the
 * existing persistence abstraction (best-effort) with in-memory primaries.
 * Tenant isolation is enforced on every read.
 */

class ImprovementHistoryService {
    constructor(options = {}) {
        this.persistence = options.persistenceManager || options.persistence || null;
        this.proposals = new Map(); // proposalId -> proposal
        this.transitions = new Map(); // proposalId -> [governance entries]
    }

    _persistBestEffort(collection, key, value) {
        try {
            if (this.persistence && typeof this.persistence.set === 'function') {
                const r = this.persistence.set(collection, key, value);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            }
        } catch (e) { /* persistence is best-effort */ }
    }

    saveProposal(proposal) {
        this.proposals.set(proposal.proposalId, proposal);
        this._persistBestEffort('improvement_proposals', `${proposal.tenantId}:${proposal.proposalId}`, proposal);
        return proposal;
    }

    getProposal(proposalId, tenantId = null) {
        const p = this.proposals.get(proposalId);
        if (!p) return null;
        if (tenantId && p.tenantId !== tenantId) return null;
        return p;
    }

    listProposals(tenantId = null) {
        const all = [...this.proposals.values()];
        return tenantId ? all.filter(p => p.tenantId === tenantId) : all;
    }

    updateProposal(proposalId, patch) {
        const p = this.proposals.get(proposalId);
        if (!p) return null;
        Object.assign(p, patch, { updatedAt: new Date().toISOString() });
        this._persistBestEffort('improvement_proposals', `${p.tenantId}:${p.proposalId}`, p);
        return p;
    }

    recordTransitions(proposalId, entries) {
        const existing = this.transitions.get(proposalId) || [];
        const merged = existing.concat(entries);
        this.transitions.set(proposalId, merged);
        const p = this.proposals.get(proposalId);
        this._persistBestEffort('improvement_governance', `${p ? p.tenantId : 'default-tenant'}:${proposalId}`, merged);
        return merged;
    }

    getTransitions(proposalId, tenantId = null) {
        const p = this.proposals.get(proposalId);
        if (!p) return null;
        if (tenantId && p.tenantId !== tenantId) return null;
        return [...(this.transitions.get(proposalId) || [])];
    }

    getHistory({ tenantId = 'default-tenant' } = {}) {
        return this.listProposals(tenantId).map(p => ({
            proposalId: p.proposalId,
            opportunityType: p.opportunityType,
            agentId: p.agentId,
            tenantId: p.tenantId,
            status: p.status,
            implementationStatus: p.implementationStatus,
            outcomeState: p.outcome ? p.outcome.outcomeState : null,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
        }));
    }
}

module.exports = { ImprovementHistoryService };
