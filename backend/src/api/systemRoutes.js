/**
 * Generic System REST API Routes
 * Standardized endpoints for system registration, discovery, lifecycle, capabilities, metadata, adapters, and execution.
 * AgentGenPro backend compatible router — strict /api route prefixing only.
 */

const express = require('express');
const { SystemRegistry } = require('../registry/SystemRegistry');
const { SystemExecutionService } = require('../service/SystemExecutionService');
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

const systemRegistry = new SystemRegistry();
const executionService = new SystemExecutionService({ systemRegistry, allowLocalhost: process.env.NODE_ENV === 'test' });

function createSystemRouter(registry = systemRegistry, service = executionService) {
    const router = express.Router();

    router.use(requireAuth);

    /**
     * POST /api/v1/systems/register & /api/systems/register
     * Register a new external system contract.
     */
    router.post(['/api/v1/systems/register', '/api/systems/register'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
        try {
            const system = registry.registerSystem(req.body);
            return res.status(201).json({
                success: true,
                message: 'System registered successfully',
                data: system
            });
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                error: error.message,
                code: error.code || 'REGISTRATION_ERROR',
                errors: error.errors || []
            });
        }
    });

    /**
     * GET /api/v1/systems & /api/systems
     * List registered systems with optional query filters.
     */
    router.get(['/api/v1/systems', '/api/systems'], (req, res) => {
        try {
            const { category, lifecycleState, capability, search } = req.query;
            let systems;

            if (search) {
                systems = registry.searchSystems(search);
            } else {
                systems = registry.getAllSystems({ category, lifecycleState, capability });
            }

            return res.status(200).json({
                success: true,
                count: systems.length,
                data: systems
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Failed to retrieve systems',
                details: error.message
            });
        }
    });

    /**
     * GET /api/v1/systems/:id & /api/systems/:id
     * Get system detail by ID.
     */
    router.get(['/api/v1/systems/:id', '/api/systems/:id'], (req, res) => {
        try {
            const system = registry.getSystem(req.params.id);
            return res.status(200).json({
                success: true,
                data: system
            });
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                error: error.message,
                code: error.code || 'SYSTEM_FETCH_ERROR',
                errors: error.errors || []
            });
        }
    });

    /**
     * GET /api/v1/systems/:id/summary & /api/systems/:id/summary
     * Get human-readable operational summary for a system onboarding profile.
     */
    router.get(['/api/v1/systems/:id/summary', '/api/systems/:id/summary'], (req, res) => {
        try {
            let system = null;
            try {
                system = registry.getSystem(req.params.id);
            } catch (err) {
                system = { id: req.params.id, name: req.params.id, onboardStatus: 'UNKNOWN' };
            }
            const OperationalSummaryService = require('../intelligence/OperationalSummaryService');
            const summaryService = req.app.get('operationalSummaryService') || new OperationalSummaryService();
            const summary = summaryService.generateSystemSummary(system);

            return res.status(200).json({
                success: true,
                data: summary
            });
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                error: error.message,
                code: error.code || 'SUMMARY_ERROR'
            });
        }
    });

    /**
     * PATCH /api/v1/systems/:id & /api/systems/:id
     * Update an existing system.
     */
    router.patch(['/api/v1/systems/:id', '/api/systems/:id'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
        try {
            const updated = registry.updateSystem(req.params.id, req.body);
            return res.status(200).json({
                success: true,
                message: 'System updated successfully',
                data: updated
            });
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                error: error.message,
                code: error.code || 'UPDATE_ERROR',
                errors: error.errors || []
            });
        }
    });

    /**
     * POST /api/v1/systems/:id/activate & /api/systems/:id/activate
     * Transition system lifecycle state to ACTIVE.
     */
    router.post(['/api/v1/systems/:id/activate', '/api/systems/:id/activate'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
        try {
            const updated = registry.activateSystem(req.params.id);
            return res.status(200).json({
                success: true,
                message: `System '${req.params.id}' activated`,
                data: updated
            });
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                error: error.message,
                code: error.code || 'LIFECYCLE_ERROR',
                errors: error.errors || []
            });
        }
    });

    /**
     * POST /api/v1/systems/:id/deactivate & /api/systems/:id/deactivate
     * Transition system lifecycle state to INACTIVE.
     */
    router.post(['/api/v1/systems/:id/deactivate', '/api/systems/:id/deactivate'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
        try {
            const updated = registry.deactivateSystem(req.params.id);
            return res.status(200).json({
                success: true,
                message: `System '${req.params.id}' deactivated`,
                data: updated
            });
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                error: error.message,
                code: error.code || 'LIFECYCLE_ERROR',
                errors: error.errors || []
            });
        }
    });

    /**
     * POST /api/v1/systems/:id/retire & /api/systems/:id/retire
     * Transition system lifecycle state to RETIRED.
     */
    router.post(['/api/v1/systems/:id/retire', '/api/systems/:id/retire'], requireRole([ROLES.ADMIN]), (req, res) => {
        try {
            const updated = registry.retireSystem(req.params.id);
            return res.status(200).json({
                success: true,
                message: `System '${req.params.id}' retired`,
                data: updated
            });
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                error: error.message,
                code: error.code || 'LIFECYCLE_ERROR',
                errors: error.errors || []
            });
        }
    });

    /**
     * GET /api/v1/systems/:id/capabilities & /api/systems/:id/capabilities
     * Retrieve capability details for a registered system.
     */
    router.get(['/api/v1/systems/:id/capabilities', '/api/systems/:id/capabilities'], (req, res) => {
        try {
            const capabilities = registry.getSystemCapabilities(req.params.id);
            return res.status(200).json({
                success: true,
                data: capabilities
            });
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                error: error.message,
                code: error.code || 'CAPABILITIES_FETCH_ERROR'
            });
        }
    });

    /**
     * GET /api/v1/systems/:id/metadata & /api/systems/:id/metadata
     * Retrieve adapter metadata and configuration references for a registered system.
     */
    router.get(['/api/v1/systems/:id/metadata', '/api/systems/:id/metadata'], (req, res) => {
        try {
            const metadata = registry.getSystemMetadata(req.params.id);
            return res.status(200).json({
                success: true,
                data: metadata
            });
        } catch (error) {
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                error: error.message,
                code: error.code || 'METADATA_FETCH_ERROR'
            });
        }
    });

    // ==================================================
    // PHASE 2 ADAPTER & EXECUTION ENDPOINTS
    // ==================================================

    /**
     * POST /api/v1/systems/:id/connect & /api/systems/:id/connect
     * Connect to external system via adapter.
     */
    router.post(['/api/v1/systems/:id/connect', '/api/systems/:id/connect'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
        try {
            const result = await service.connectSystem(req.params.id, req.body);
            return res.status(result.status || 200).json(result);
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/v1/systems/:id/disconnect & /api/systems/:id/disconnect
     * Disconnect from external system adapter.
     */
    router.post(['/api/v1/systems/:id/disconnect', '/api/systems/:id/disconnect'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
        try {
            const result = await service.disconnectSystem(req.params.id);
            return res.status(result.status || 200).json(result);
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/v1/systems/:id/execute & /api/systems/:id/execute
     * Execute generic operation payload on external system via adapter framework.
     */
    router.post(['/api/v1/systems/:id/execute', '/api/systems/:id/execute'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
        try {
            const { operation = 'execute', payload = {} } = req.body || {};
            const result = await service.executeOperation(req.params.id, operation, payload, {
                callerRole: req.userRole
            });
            const statusCode = result.status || (result.success ? 200 : 400);
            return res.status(statusCode).json(result);
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/systems/:id/adapter & /api/systems/:id/adapter
     * Get configured adapter metadata for a system.
     */
    router.get(['/api/v1/systems/:id/adapter', '/api/systems/:id/adapter'], (req, res) => {
        try {
            const adapterInfo = service.getSystemAdapter(req.params.id);
            return res.status(200).json({
                success: true,
                data: adapterInfo
            });
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
}

const mainRouter = createSystemRouter(systemRegistry, executionService);
mainRouter.createSystemRouter = createSystemRouter;
mainRouter.systemRegistry = systemRegistry;
mainRouter.executionService = executionService;

module.exports = mainRouter;
