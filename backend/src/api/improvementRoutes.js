/**
 * Express REST API Router for Phase 35 Continuous Improvement & Operational Governance Center
 * Explicit /api/v1/improvements paths (mounted via app.use(router)).
 * Reads are viewer-visible. Proposal creation and every governance action are
 * operator-gated; viewers remain read-only. Governance records describe
 * changes — nothing here performs operational changes.
 */

const express = require('express');
const { requireRole, ROLES } = require('../middleware/authMiddleware');

function redactSecrets(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(redactSecrets);
    const redacted = {};
    const secretKeys = ['apikey', 'password', 'token', 'secret', 'authorization', 'auth'];
    for (const [key, val] of Object.entries(obj)) {
        if (secretKeys.includes(key.toLowerCase())) {
            redacted[key] = '[REDACTED]';
        } else if (typeof val === 'object' && val !== null) {
            redacted[key] = redactSecrets(val);
        } else {
            redacted[key] = val;
        }
    }
    return redacted;
}

function createImprovementRouter(improvementService) {
    const router = express.Router();

    function getTenant(req) {
        return req.tenantId || req.headers['x-tenant-id'] || req.query.tenantId || 'default-tenant';
    }

    function getOperator(req) {
        return req.headers['x-user'] || req.headers['x-role'] || 'operator';
    }

    function getRole(req) {
        return req.headers['x-role'] || req.headers['x-user-role'] || 'OPERATOR';
    }

    function notFound(res, kind, id, code) {
        return res.status(404).json({ success: false, error: `${kind} '${id}' not found`, code: code || 'IMPROVEMENT_NOT_FOUND' });
    }

    function forbidden(res, err) {
        return res.status(err.statusCode || 403).json({ success: false, error: err.message, code: 'FORBIDDEN' });
    }

    function conflict(res, err) {
        return res.status(err.statusCode || 409).json({ success: false, error: err.message, code: 'GOVERNANCE_CONFLICT' });
    }

    const viewerPlus = requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]);
    const operatorPlus = requireRole([ROLES.OPERATOR, ROLES.ADMIN]);

    // GET /api/v1/improvements/overview
    router.get('/api/v1/improvements/overview', viewerPlus, (req, res) => {
        try {
            const data = improvementService.getOverview({ tenantId: getTenant(req), range: req.query.range || '24h' });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/improvements/opportunities
    router.get('/api/v1/improvements/opportunities', viewerPlus, (req, res) => {
        try {
            const data = improvementService.getOpportunities({ tenantId: getTenant(req), range: req.query.range || '24h' });
            res.json({ success: true, count: data.count, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/improvements/opportunities/:id
    router.get('/api/v1/improvements/opportunities/:id', viewerPlus, (req, res) => {
        try {
            const data = improvementService.getOpportunity(req.params.id, { tenantId: getTenant(req), range: req.query.range || '24h' });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Opportunity', req.params.id, 'OPPORTUNITY_NOT_FOUND');
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /api/v1/improvements/proposals
    router.post('/api/v1/improvements/proposals', operatorPlus, (req, res) => {
        try {
            const body = req.body || {};
            if (!body.opportunityId) {
                return res.status(400).json({ success: false, error: 'opportunityId is required to create a proposal.', code: 'INVALID_PROPOSAL' });
            }
            const data = improvementService.createProposal({
                opportunityId: body.opportunityId,
                tenantId: getTenant(req),
                range: body.range || '24h',
                operator: getOperator(req),
                title: body.title || null,
                detail: body.detail || body.customDetail || ''
            });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Opportunity', body.opportunityId, 'OPPORTUNITY_NOT_FOUND');
            return res.status(201).json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/improvements/proposals
    router.get('/api/v1/improvements/proposals', viewerPlus, (req, res) => {
        try {
            const data = improvementService.getHistory({ tenantId: getTenant(req) });
            res.json({ success: true, count: data.proposals.length, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/improvements/history
    router.get('/api/v1/improvements/history', viewerPlus, (req, res) => {
        try {
            const data = improvementService.getHistory({ tenantId: getTenant(req) });
            res.json({ success: true, count: data.proposals.length, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/improvements/agents/:id
    router.get('/api/v1/improvements/agents/:id', viewerPlus, (req, res) => {
        try {
            const data = improvementService.getAgentImprovements(req.params.id, { tenantId: getTenant(req) });
            res.json({ success: true, count: data.count, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/improvements/fleet
    router.get('/api/v1/improvements/fleet', viewerPlus, (req, res) => {
        try {
            const data = improvementService.getFleetImprovements({ tenantId: getTenant(req), range: req.query.range || '24h' });
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/improvements/proposals/:id
    router.get('/api/v1/improvements/proposals/:id', viewerPlus, (req, res) => {
        try {
            const data = improvementService.getProposal(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Proposal', req.params.id, 'PROPOSAL_NOT_FOUND');
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/improvements/proposals/:id/evidence
    router.get('/api/v1/improvements/proposals/:id/evidence', viewerPlus, (req, res) => {
        try {
            const data = improvementService.getEvidence(req.params.id, { tenantId: getTenant(req), range: req.query.range || '24h' });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Proposal', req.params.id, 'PROPOSAL_NOT_FOUND');
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /api/v1/improvements/proposals/:id/impact
    router.get('/api/v1/improvements/proposals/:id/impact', viewerPlus, (req, res) => {
        try {
            const data = improvementService.analyzeImpact(req.params.id, { tenantId: getTenant(req) });
            if (data.status === 'NOT_FOUND') return notFound(res, 'Proposal', req.params.id, 'PROPOSAL_NOT_FOUND');
            res.json({ success: true, data: redactSecrets(data) });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    function governedRoute(path, fn) {
        router.post(path, operatorPlus, (req, res) => {
            try {
                const data = fn(req);
                if (data.status === 'NOT_FOUND') return notFound(res, 'Proposal', req.params.id, 'PROPOSAL_NOT_FOUND');
                res.json({ success: true, data: redactSecrets(data) });
            } catch (err) {
                if (err.statusCode === 403 || /Access Denied|not authorized|read-only/i.test(err.message)) return forbidden(res, err);
                if (err.statusCode === 409 || /not allowed|requires /i.test(err.message)) return conflict(res, err);
                res.status(500).json({ success: false, error: err.message });
            }
        });
    }

    // POST /api/v1/improvements/proposals/:id/approve
    governedRoute('/api/v1/improvements/proposals/:id/approve', (req) => improvementService.approveProposal(req.params.id, {
        tenantId: getTenant(req), actor: getOperator(req), userRole: getRole(req), reason: (req.body && req.body.reason) || ''
    }));

    // POST /api/v1/improvements/proposals/:id/reject
    governedRoute('/api/v1/improvements/proposals/:id/reject', (req) => improvementService.rejectProposal(req.params.id, {
        tenantId: getTenant(req), actor: getOperator(req), userRole: getRole(req), reason: (req.body && req.body.reason) || ''
    }));

    // POST /api/v1/improvements/proposals/:id/defer
    governedRoute('/api/v1/improvements/proposals/:id/defer', (req) => improvementService.deferProposal(req.params.id, {
        tenantId: getTenant(req), actor: getOperator(req), userRole: getRole(req), reason: (req.body && req.body.reason) || ''
    }));

    // POST /api/v1/improvements/proposals/:id/reopen
    governedRoute('/api/v1/improvements/proposals/:id/reopen', (req) => improvementService.reopenProposal(req.params.id, {
        tenantId: getTenant(req), actor: getOperator(req), userRole: getRole(req), reason: (req.body && req.body.reason) || ''
    }));

    // POST /api/v1/improvements/proposals/:id/implementation
    governedRoute('/api/v1/improvements/proposals/:id/implementation', (req) => improvementService.startImplementationTracking(req.params.id, {
        tenantId: getTenant(req), actor: getOperator(req), userRole: getRole(req),
        reason: (req.body && req.body.reason) || '', implementationRef: (req.body && req.body.implementationRef) || ''
    }));

    // POST /api/v1/improvements/proposals/:id/outcome
    governedRoute('/api/v1/improvements/proposals/:id/outcome', (req) => improvementService.recordOutcome(req.params.id, {
        tenantId: getTenant(req), actor: getOperator(req), userRole: getRole(req), note: (req.body && req.body.note) || ''
    }));

    // POST /api/v1/improvements/proposals/:id/close
    governedRoute('/api/v1/improvements/proposals/:id/close', (req) => improvementService.closeProposal(req.params.id, {
        tenantId: getTenant(req), actor: getOperator(req), userRole: getRole(req), reason: (req.body && req.body.reason) || ''
    }));

    return router;
}

module.exports = { createImprovementRouter };
