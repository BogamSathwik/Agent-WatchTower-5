/**
 * Generic Adapter REST API Routes
 * Endpoints for inspecting registered adapter drivers.
 * AgentGenPro backend compatible router — strict /api route prefixing only.
 */

const express = require('express');
const { AdapterRegistry } = require('../adapter/AdapterRegistry');
const { requireAuth } = require('../middleware/authMiddleware');

const defaultAdapterRegistry = new AdapterRegistry();

function createAdapterRouter(registry = defaultAdapterRegistry) {
    const router = express.Router();
    router.use(requireAuth);

    /**
     * GET /api/v1/adapters & /api/adapters
     * List all registered adapter driver types.
     */
    router.get(['/api/v1/adapters', '/api/adapters'], (req, res) => {
        try {
            const list = registry.listAdapters();
            return res.status(200).json({
                success: true,
                count: list.length,
                data: list
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Failed to list adapters',
                message: error.message
            });
        }
    });

    /**
     * GET /api/v1/adapters/:id & /api/adapters/:id
     * Get adapter type details.
     */
    router.get(['/api/v1/adapters/:id', '/api/adapters/:id'], (req, res) => {
        try {
            const type = req.params.id;
            const exists = registry.hasAdapter(type);
            if (!exists) {
                return res.status(404).json({
                    success: false,
                    error: `Adapter type '${type}' not found`,
                    code: 'UNKNOWN_ADAPTER'
                });
            }
            return res.status(200).json({
                success: true,
                data: {
                    type,
                    registered: true,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
}

const mainRouter = createAdapterRouter(defaultAdapterRegistry);
mainRouter.createAdapterRouter = createAdapterRouter;
mainRouter.defaultAdapterRegistry = defaultAdapterRegistry;

module.exports = mainRouter;
