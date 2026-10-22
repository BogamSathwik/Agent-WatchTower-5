/**
 * Dependency API Routes
 * Exposes REST endpoints for inter-agent dependency management, topology graphs,
 * blast radius calculations, upstream/downstream traversals, and root cause candidate analysis.
 */

const express = require('express');
const { requireRole, ROLES } = require('../middleware/authMiddleware');

function createDependencyRouter(dependencyService, graphService, blastRadiusAnalyzer, rootCauseAnalyzer) {
    const router = express.Router();

    // GET /api/v1/dependencies - List dependencies
    router.get('/', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const { agentId, sourceAgentId, targetAgentId, relationshipType, status, criticality } = req.query;
            const items = dependencyService.listDependencies({
                agentId,
                sourceAgentId,
                targetAgentId,
                relationshipType,
                status,
                criticality
            }, tenantId);

            res.json({
                success: true,
                count: items.length,
                data: items
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'DEPENDENCY_LIST_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/dependencies/graph - Render full service topology graph
    router.get('/graph', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const topology = graphService.getTopology(tenantId);
            res.json({
                success: true,
                data: topology
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'TOPOLOGY_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/dependencies/agents/:id/upstream - Upstream dependents
    router.get('/agents/:id/upstream', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const agentId = req.params.id;
            const dependents = graphService.getUpstreamDependents(agentId, tenantId);
            res.json({
                success: true,
                agentId,
                count: dependents.length,
                data: dependents
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'UPSTREAM_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/dependencies/agents/:id/downstream - Downstream dependencies
    router.get('/agents/:id/downstream', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const agentId = req.params.id;
            const dependencies = graphService.getDownstreamDependencies(agentId, tenantId);
            res.json({
                success: true,
                agentId,
                count: dependencies.length,
                data: dependencies
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'DOWNSTREAM_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/dependencies/agents/:id/blast-radius - Blast radius calculation
    router.get('/agents/:id/blast-radius', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const agentId = req.params.id;
            const analysis = blastRadiusAnalyzer.analyzeBlastRadius(agentId, tenantId);
            res.json({
                success: true,
                data: analysis
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'BLAST_RADIUS_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/dependencies/agents/:id/impact - Dependency health impact
    router.get('/agents/:id/impact', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const agentId = req.params.id;
            const downstream = graphService.getDirectDownstream(agentId, tenantId);
            
            res.json({
                success: true,
                agentId,
                downstreamCount: downstream.length,
                data: downstream
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'IMPACT_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/dependencies/root-cause/:incidentId - Root cause candidate analysis
    router.get('/root-cause/:incidentId', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const incidentId = req.params.incidentId;
            const analysis = rootCauseAnalyzer.analyzeRootCause({ incidentId }, tenantId);
            res.json({
                success: true,
                data: analysis
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'ROOT_CAUSE_ERROR', message: err.message }
            });
        }
    });

    // GET /api/v1/dependencies/:id - Dependency details
    router.get('/:id', (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const dependency = dependencyService.getDependency(req.params.id, tenantId);
            if (!dependency) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: `Dependency '${req.params.id}' not found.` }
                });
            }
            res.json({
                success: true,
                data: dependency
            });
        } catch (err) {
            res.status(500).json({
                success: false,
                error: { code: 'DEPENDENCY_FETCH_ERROR', message: err.message }
            });
        }
    });

    // POST /api/v1/dependencies - Create dependency
    router.post('/', requireRole([ROLES.OPERATOR, ROLES.ADMIN]), (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const created = dependencyService.registerDependency(req.body, tenantId);
            res.status(201).json({
                success: true,
                data: created
            });
        } catch (err) {
            const isValidation = err.message.includes('required') ||
                                 err.message.includes('Invalid') ||
                                 err.message.includes('Self-dependency') ||
                                 err.message.includes('Duplicate') ||
                                 err.message.includes('CIRCULAR_DEPENDENCY');
            res.status(isValidation ? 400 : 500).json({
                success: false,
                error: { code: isValidation ? 'BAD_REQUEST' : 'DEPENDENCY_CREATE_ERROR', message: err.message }
            });
        }
    });

    // PUT /api/v1/dependencies/:id - Update dependency
    router.put('/:id', requireRole([ROLES.OPERATOR, ROLES.ADMIN]), (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const updated = dependencyService.updateDependency(req.params.id, req.body, tenantId);
            res.json({
                success: true,
                data: updated
            });
        } catch (err) {
            const isNotFound = err.message.includes('not found');
            res.status(isNotFound ? 404 : 400).json({
                success: false,
                error: { code: isNotFound ? 'NOT_FOUND' : 'BAD_REQUEST', message: err.message }
            });
        }
    });

    // DELETE /api/v1/dependencies/:id - Delete dependency
    router.delete('/:id', requireRole([ROLES.OPERATOR, ROLES.ADMIN]), (req, res) => {
        try {
            const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
            const result = dependencyService.deleteDependency(req.params.id, tenantId);
            res.json({
                success: true,
                data: result
            });
        } catch (err) {
            const isNotFound = err.message.includes('not found');
            res.status(isNotFound ? 404 : 500).json({
                success: false,
                error: { code: isNotFound ? 'NOT_FOUND' : 'DELETE_ERROR', message: err.message }
            });
        }
    });

    return router;
}

module.exports = {
    createDependencyRouter
};
