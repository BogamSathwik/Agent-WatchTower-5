/**
 * Phase 35 — Continuous Improvement Service (master facade)
 * Governed improvement lifecycle: opportunity → evidence → impact →
 * proposal → governance review → approval/rejection/deferral →
 * implementation tracking → observation → outcome → close.
 * Advisory only: nothing here changes thresholds, policies, configuration,
 * topology, capabilities, or production behavior. Reuses existing services.
 */

const { ImprovementOpportunityEngine } = require('./ImprovementOpportunityEngine');
const { ImprovementEvidenceService } = require('./ImprovementEvidenceService');
const { ImprovementImpactAnalyzer } = require('./ImprovementImpactAnalyzer');
const { ImprovementProposalService } = require('./ImprovementProposalService');
const { ImprovementGovernanceService } = require('./ImprovementGovernanceService');
const { ImprovementApprovalService } = require('./ImprovementApprovalService');
const { ImprovementOutcomeTracker } = require('./ImprovementOutcomeTracker');
const { ImprovementHistoryService } = require('./ImprovementHistoryService');
const { DecisionEvidenceService } = require('../decision/DecisionEvidenceService');

class ContinuousImprovementService {
    constructor(options = {}) {
        this.monitoringService = options.monitoringService || null;
        this.baseEvidenceService = options.baseEvidenceService || new DecisionEvidenceService(options);
        this.evidenceService = options.evidenceService || new ImprovementEvidenceService({ ...options, evidenceService: this.baseEvidenceService });
        this.opportunityEngine = options.opportunityEngine || new ImprovementOpportunityEngine(options);
        this.impactAnalyzer = options.impactAnalyzer || new ImprovementImpactAnalyzer(options);
        this.proposalService = options.proposalService || new ImprovementProposalService();
        this.governanceService = options.governanceService || new ImprovementGovernanceService();
        this.approvalService = options.approvalService || new ImprovementApprovalService({ governanceService: this.governanceService });
        this.outcomeTracker = options.outcomeTracker || new ImprovementOutcomeTracker({
            monitoringService: this.monitoringService,
            earlyWarningService: options.earlyWarningService || options.earlyWarningCenterService || null,
            adaptiveService: options.adaptiveService || options.adaptiveResponseService || null,
            governanceService: this.governanceService
        });
        this.historyService = options.historyService || new ImprovementHistoryService({
            persistenceManager: options.persistenceManager || options.persistence || null
        });
        this.auditService = options.auditService || options.auditLogService || null;
    }

    getOverview({ tenantId = 'default-tenant', range = '24h' } = {}) {
        const { opportunities, gaps } = this.opportunityEngine.detectOpportunities({ tenantId, range });
        const proposals = this.historyService.listProposals(tenantId);
        const byStatus = (s) => proposals.filter(p => p.status === s).length;
        return {
            tenantId,
            timestamp: new Date().toISOString(),
            scorecard: {
                activeOpportunitiesCount: opportunities.length,
                proposalsAwaitingReviewCount: byStatus('DRAFT') + byStatus('REVIEW_REQUIRED'),
                approvalsPendingCount: byStatus('APPROVAL_REQUIRED'),
                approvedCount: byStatus('APPROVED'),
                implementationTrackingCount: byStatus('IMPLEMENTATION_TRACKING') + byStatus('OBSERVATION'),
                completedCount: byStatus('COMPLETED') + byStatus('CLOSED'),
                insufficientDataCount: gaps.length
            },
            opportunities: opportunities.slice(0, 20),
            recentProposals: [...proposals].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10),
            unresolvedGaps: gaps,
            note: 'Governance only. Proposals describe changes; implementation happens externally with explicit approval.'
        };
    }

    getOpportunities({ tenantId = 'default-tenant', range = '24h' } = {}) {
        const { opportunities, gaps } = this.opportunityEngine.detectOpportunities({ tenantId, range });
        return { tenantId, count: opportunities.length, opportunities, gaps };
    }

    getOpportunity(opportunityId, { tenantId = 'default-tenant', range = '24h' } = {}) {
        const { opportunities } = this.opportunityEngine.detectOpportunities({ tenantId, range });
        const found = opportunities.find(o => o.opportunityId === opportunityId);
        if (!found) return { status: 'NOT_FOUND', opportunityId, tenantId };
        const evidence = this.evidenceService.collectEvidence({ tenantId, agentId: found.agentId, range });
        const impact = this.impactAnalyzer.analyzeImpact({ opportunity: found, agentId: found.agentId, tenantId });
        return { status: 'FOUND', opportunity: found, evidence, impact };
    }

    createProposal({ opportunityId, tenantId = 'default-tenant', range = '24h', operator = 'operator', title = null, detail = '' } = {}) {
        const located = this.getOpportunity(opportunityId, { tenantId, range });
        if (located.status === 'NOT_FOUND') return located;
        const evidence = this.evidenceService.collectEvidence({ tenantId, agentId: located.opportunity.agentId, range });
        const impact = this.impactAnalyzer.analyzeImpact({ opportunity: located.opportunity, agentId: located.opportunity.agentId, tenantId });
        const proposal = this.proposalService.buildProposal({
            opportunity: located.opportunity, evidence, impact, tenantId, operator, customTitle: title, customDetail: detail
        });
        this.historyService.saveProposal(proposal);
        // Creation enters governance explicitly at DRAFT.
        const entries = [this._recordCreation(proposal, operator, tenantId)];
        this.historyService.recordTransitions(proposal.proposalId, entries);
        this._audit('IMPROVEMENT_PROPOSAL_CREATED', proposal);
        return { status: 'CREATED', proposal, evidence, impact };
    }

    getProposal(proposalId, { tenantId = 'default-tenant' } = {}) {
        const proposal = this.historyService.getProposal(proposalId, tenantId);
        if (!proposal) return { status: 'NOT_FOUND', proposalId, tenantId };
        return { status: 'FOUND', proposal, transitions: this.historyService.getTransitions(proposalId, tenantId) || [] };
    }

    getEvidence(proposalId, { tenantId = 'default-tenant', range = '24h' } = {}) {
        const proposal = this.historyService.getProposal(proposalId, tenantId);
        if (!proposal) return { status: 'NOT_FOUND', proposalId, tenantId };
        const evidence = this.evidenceService.collectEvidence({ tenantId, agentId: proposal.agentId, range });
        return { status: 'FOUND', proposalId, tenantId, snapshotAtCreation: proposal.evidence, current: evidence };
    }

    analyzeImpact(proposalId, { tenantId = 'default-tenant' } = {}) {
        const proposal = this.historyService.getProposal(proposalId, tenantId);
        if (!proposal) return { status: 'NOT_FOUND', proposalId, tenantId };
        const opportunity = { type: proposal.opportunityType, agentId: proposal.agentId, relatedAgents: (proposal.affectedScope && proposal.affectedScope.affectedAgents) || [] };
        const impact = this.impactAnalyzer.analyzeImpact({ opportunity, agentId: proposal.agentId, tenantId });
        return { status: 'FOUND', proposalId, tenantId, impact, snapshotAtCreation: proposal.affectedScope };
    }

    approveProposal(proposalId, { tenantId = 'default-tenant', actor = 'operator', userRole = 'OPERATOR', reason = '' } = {}) {
        return this._governed(proposalId, tenantId, (p) => this.approvalService.approve(p, { actor, userRole, reason, tenantId }), 'IMPROVEMENT_PROPOSAL_APPROVED');
    }

    rejectProposal(proposalId, { tenantId = 'default-tenant', actor = 'operator', userRole = 'OPERATOR', reason = '' } = {}) {
        return this._governed(proposalId, tenantId, (p) => this.approvalService.reject(p, { actor, userRole, reason, tenantId }), 'IMPROVEMENT_PROPOSAL_REJECTED');
    }

    deferProposal(proposalId, { tenantId = 'default-tenant', actor = 'operator', userRole = 'OPERATOR', reason = '' } = {}) {
        return this._governed(proposalId, tenantId, (p) => this.approvalService.defer(p, { actor, userRole, reason, tenantId }), 'IMPROVEMENT_PROPOSAL_DEFERRED');
    }

    reopenProposal(proposalId, { tenantId = 'default-tenant', actor = 'operator', userRole = 'OPERATOR', reason = '' } = {}) {
        return this._governed(proposalId, tenantId, (p) => this.approvalService.reopen(p, { actor, userRole, reason, tenantId }), 'IMPROVEMENT_PROPOSAL_REOPENED');
    }

    closeProposal(proposalId, { tenantId = 'default-tenant', actor = 'operator', userRole = 'OPERATOR', reason = '' } = {}) {
        return this._governed(proposalId, tenantId, (p) => this.approvalService.close(p, { actor, userRole, reason, tenantId }), 'IMPROVEMENT_PROPOSAL_CLOSED');
    }

    startImplementationTracking(proposalId, { tenantId = 'default-tenant', actor = 'operator', userRole = 'OPERATOR', reason = '', implementationRef = '' } = {}) {
        const proposal = this.historyService.getProposal(proposalId, tenantId);
        if (!proposal) return { status: 'NOT_FOUND', proposalId, tenantId };
        const entries = this.approvalService.startImplementationTracking(proposal, { actor, userRole, reason, implementationRef, tenantId });
        proposal.implementationStartedAt = new Date().toISOString();
        this.historyService.updateProposal(proposalId, {
            status: proposal.status,
            implementationStatus: proposal.implementationStatus,
            implementationRef: proposal.implementationRef,
            implementationStartedAt: proposal.implementationStartedAt
        });
        this.historyService.recordTransitions(proposalId, entries);
        this._audit('IMPROVEMENT_IMPLEMENTATION_TRACKING', proposal);
        return { status: 'FOUND', proposal, transitions: entries };
    }

    recordOutcome(proposalId, { tenantId = 'default-tenant', actor = 'operator', userRole = 'OPERATOR', note = '' } = {}) {
        const proposal = this.historyService.getProposal(proposalId, tenantId);
        if (!proposal) return { status: 'NOT_FOUND', proposalId, tenantId };
        if (String(userRole).toUpperCase() === 'VIEWER') {
            const err = new Error("RBAC Access Denied: User role 'VIEWER' is read-only for improvement governance.");
            err.statusCode = 403;
            throw err;
        }
        const { outcome, transitions } = this.outcomeTracker.recordOutcome(proposal, { actor, tenantId, note });
        this.historyService.updateProposal(proposalId, {
            status: proposal.status,
            outcome: proposal.outcome,
            implementationStatus: proposal.implementationStatus
        });
        this.historyService.recordTransitions(proposalId, transitions);
        this._audit('IMPROVEMENT_OUTCOME_RECORDED', proposal);
        return { status: 'FOUND', proposal, outcome, transitions };
    }

    getHistory({ tenantId = 'default-tenant' } = {}) {
        return { tenantId, proposals: this.historyService.getHistory({ tenantId }) };
    }

    getAgentImprovements(agentId, { tenantId = 'default-tenant' } = {}) {
        const proposals = this.historyService.listProposals(tenantId).filter(p => p.agentId === agentId);
        return { tenantId, agentId, count: proposals.length, proposals };
    }

    getFleetImprovements({ tenantId = 'default-tenant', range = '24h' } = {}) {
        const { opportunities } = this.opportunityEngine.detectOpportunities({ tenantId, range });
        const proposals = this.historyService.listProposals(tenantId).filter(p => !p.agentId);
        return {
            tenantId,
            fleetOpportunities: opportunities.filter(o => !o.agentId),
            fleetProposals: proposals,
            note: 'Fleet opportunities aggregate recorded fleet patterns; calculations in Fleet Intelligence are not modified.'
        };
    }

    _governed(proposalId, tenantId, action, auditEvent) {
        const proposal = this.historyService.getProposal(proposalId, tenantId);
        if (!proposal) return { status: 'NOT_FOUND', proposalId, tenantId };
        const entries = action(proposal);
        this.historyService.updateProposal(proposalId, { status: proposal.status });
        this.historyService.recordTransitions(proposalId, entries);
        this._audit(auditEvent, proposal);
        return { status: 'FOUND', proposal, transitions: entries };
    }

    _recordCreation(proposal, operator, tenantId) {
        return {
            eventId: `gov_${Date.now().toString(36)}_create`,
            proposalId: proposal.proposalId,
            tenantId,
            previousState: null,
            newState: 'DRAFT',
            actor: operator,
            reason: 'Proposal created from recorded opportunity evidence.',
            recordedAt: new Date().toISOString()
        };
    }

    _audit(eventType, proposal) {
        try {
            if (this.auditService && typeof this.auditService.logEvent === 'function') {
                this.auditService.logEvent({
                    eventType,
                    action: 'improvement_governance',
                    actor: 'operator',
                    tenantId: proposal ? proposal.tenantId : 'default-tenant',
                    resourceType: 'improvement-proposal',
                    resourceId: proposal ? proposal.proposalId : 'unknown',
                    outcome: 'SUCCESS',
                    severity: 'INFO',
                    correlationId: `imp_${Date.now()}`,
                    metadata: { status: proposal ? proposal.status : null }
                });
            }
        } catch (e) { /* audit non-fatal */ }
    }
}

module.exports = { ContinuousImprovementService };
