/**
 * MCP Integration REST API Router
 * Purely domain-agnostic router for Model Context Protocol (MCP) server registration, tool discovery, and tool invocation.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

router.use(requireAuth);

function getService(req) {
    const service = req.app.get('mcpService');
    if (!service) {
        throw new Error('McpService is not mounted on express application context');
    }
    return service;
}

// 1. GET /api/v1/mcp/overview
router.get(['/api/v1/mcp/overview', '/api/mcp/overview'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        res.json({ success: true, data: service.getOverview() });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 2. GET /api/v1/mcp/servers
router.get(['/api/v1/mcp/servers', '/api/mcp/servers'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const tenantId = req.headers['x-tenant-id'] || 'global';
        const servers = service.listServers({ tenantId });
        res.json({ success: true, data: servers });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3. POST /api/v1/mcp/servers
router.post(['/api/v1/mcp/servers', '/api/mcp/servers'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
    try {
        const service = getService(req);
        const actor = req.user ? req.user.username : 'operator';
        const server = service.registerServer(req.body, actor);
        res.status(201).json({ success: true, data: server });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message, code: 'MCP_REGISTRATION_FAILED' } });
    }
});

// 4. GET /api/v1/mcp/servers/:id
router.get(['/api/v1/mcp/servers/:id', '/api/mcp/servers/:id'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const server = service.getServer(req.params.id);
        if (!server) {
            return res.status(404).json({ success: false, error: { message: `MCP Server '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: server });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 5. POST /api/v1/mcp/servers/:id/connect
router.post(['/api/v1/mcp/servers/:id/connect', '/api/mcp/servers/:id/connect'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const connected = await service.connectServer(req.params.id);
        res.json({ success: true, data: connected });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// 6. POST /api/v1/mcp/servers/:id/disconnect
router.post(['/api/v1/mcp/servers/:id/disconnect', '/api/mcp/servers/:id/disconnect'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const disconnected = await service.disconnectServer(req.params.id);
        res.json({ success: true, data: disconnected });
    } catch (err) {
        res.status(400).json({ success: false, error: { message: err.message } });
    }
});

// 7. POST /api/v1/mcp/servers/:id/discover
router.post(['/api/v1/mcp/servers/:id/discover', '/api/mcp/servers/:id/discover'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const tools = await service.discoverTools(req.params.id);
        res.json({ success: true, data: { serverId: req.params.id, tools } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 8. GET /api/v1/mcp/servers/:id/tools
router.get(['/api/v1/mcp/servers/:id/tools', '/api/mcp/servers/:id/tools'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const service = getService(req);
        const tools = service.listTools(req.params.id);
        res.json({ success: true, data: tools });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 9. POST /api/v1/mcp/servers/:id/tools/:toolName/invoke
router.post(['/api/v1/mcp/servers/:id/tools/:toolName/invoke', '/api/mcp/servers/:id/tools/:toolName/invoke'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
    try {
        const service = getService(req);
        const actor = req.user ? req.user.username : 'operator';
        const role = req.user ? req.user.role : 'operator';
        const tenantId = req.headers['x-tenant-id'] || 'global';
        const correlationId = req.headers['x-correlation-id'] || `corr_mcp_${Date.now()}`;

        const result = await service.invokeTool(req.params.id, req.params.toolName, req.body || {}, { actor, role, tenantId, correlationId });
        res.json({ success: true, data: result });
    } catch (err) {
        const status = err.message.includes('authorized') || err.message.includes('permitted') ? 403 : 400;
        res.status(status).json({ success: false, error: { message: err.message, code: 'MCP_INVOCATION_FAILED' } });
    }
});

module.exports = router;
