/**
 * Knowledge & Investigation REST API Router
 * Exposes REST endpoints for knowledge graph queries, investigation context,
 * chronological incident timelines, evidence chains, similar incident lookup, and operational search.
 */

const express = require('express');
const { requireRole, ROLES } = require('../middleware/authMiddleware');

function createKnowledgeRouter(knowledgeGraphService, graphBuilder, contextService, similarAnalyzer, searchService) {
    const router = express.Router();

    // GET /api/v1/knowledge/graph - Full knowledge graph
    router.get('/graph', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            if (graphBuilder && typeof graphBuilder.syncGraph === 'function') {
                graphBuilder.syncGraph(tenantId);
            }
            const graph = knowledgeGraphService.getGraph(req.query, tenantId);
            res.json({
                success: true,
                data: graph
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'KNOWLEDGE_GRAPH_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/knowledge/agents/:id/context - Agent context
    router.get('/agents/:id/context', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const agentId = req.params.id;
            const ctx = contextService.getAgentContext(agentId, tenantId);
            res.json({
                success: true,
                data: ctx
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'AGENT_CONTEXT_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/knowledge/agents/:id/relationships - Agent graph relationships
    router.get('/agents/:id/relationships', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const agentId = req.params.id;
            const rels = knowledgeGraphService.listRelationships({ entityId: agentId }, tenantId);
            res.json({
                success: true,
                agentId,
                count: rels.length,
                data: rels
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'RELATIONSHIPS_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/knowledge/incidents/:id/context - Incident context
    router.get('/incidents/:id/context', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const incidentId = req.params.id;
            const ctx = contextService.getIncidentContext(incidentId, tenantId);
            res.json({
                success: true,
                data: ctx
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'INCIDENT_CONTEXT_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/knowledge/incidents/:id/timeline - Incident investigation timeline
    router.get('/incidents/:id/timeline', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const incidentId = req.params.id;
            const timeline = contextService.getIncidentTimeline(incidentId, tenantId);
            res.json({
                success: true,
                data: timeline
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'TIMELINE_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/knowledge/incidents/:id/evidence - Evidence chain
    router.get('/incidents/:id/evidence', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const incidentId = req.params.id;
            const chain = contextService.getEvidenceChain(incidentId, tenantId);
            res.json({
                success: true,
                data: chain
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'EVIDENCE_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/knowledge/incidents/:id/similar - Similar historical incidents
    router.get('/incidents/:id/similar', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const incidentId = req.params.id;
            const similar = similarAnalyzer.findSimilarIncidents(incidentId, tenantId);
            res.json({
                success: true,
                data: similar
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SIMILAR_INCIDENTS_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/knowledge/incidents/:id/summary - Investigation summary
    router.get('/incidents/:id/summary', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const incidentId = req.params.id;
            const summary = contextService.getInvestigationSummary(incidentId, tenantId);
            res.json({
                success: true,
                data: summary
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SUMMARY_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/knowledge/search - Operational search
    router.get('/search', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const queryStr = req.query.q || req.query.query || '';
            const searchRes = searchService.search(queryStr, req.query, tenantId);
            res.json({
                success: true,
                data: searchRes
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'SEARCH_ERROR', message: err.message }
            });
        }
    });

    return router;
}

module.exports = {
    createKnowledgeRouter
};
