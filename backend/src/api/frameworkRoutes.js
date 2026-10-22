/**
 * Agent Framework REST API Router
 * Purely domain-agnostic router for Agent Framework overview, agent capabilities, tools, and contexts.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

router.use(requireAuth);

function getFramework(req) {
    const fw = req.app.get('agentFramework');
    if (!fw) {
        throw new Error('AgentFramework is not mounted on express application context');
    }
    return fw;
}

// 1. GET /api/v1/framework/overview
router.get(['/api/v1/framework/overview', '/api/framework/overview'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const fw = getFramework(req);
        res.json({ success: true, data: fw.getOverview() });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 2. GET /api/v1/framework/agents/:id
router.get(['/api/v1/framework/agents/:id', '/api/framework/agents/:id'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const fw = getFramework(req);
        const agent = fw.getAgent(req.params.id);
        if (!agent) {
            return res.status(404).json({ success: false, error: { message: `Framework Agent '${req.params.id}' not found` } });
        }
        res.json({ success: true, data: agent.toJSON ? agent.toJSON() : agent });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3. GET /api/v1/framework/agents/:id/capabilities
router.get(['/api/v1/framework/agents/:id/capabilities', '/api/framework/agents/:id/capabilities'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const fw = getFramework(req);
        const capabilities = fw.discoverCapabilities(req.params.id);
        res.json({ success: true, data: { agentId: req.params.id, capabilities } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 4. GET /api/v1/framework/agents/:id/tools
router.get(['/api/v1/framework/agents/:id/tools', '/api/framework/agents/:id/tools'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const fw = getFramework(req);
        const tools = fw.listTools(req.params.id);
        res.json({ success: true, data: { agentId: req.params.id, tools } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 5. GET /api/v1/framework/agents/:id/context
router.get(['/api/v1/framework/agents/:id/context', '/api/framework/agents/:id/context'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), (req, res) => {
    try {
        const fw = getFramework(req);
        const tenantId = req.headers['x-tenant-id'] || 'global';
        const ctx = fw.createAgentContext(req.params.id, { tenantId });
        res.json({ success: true, data: ctx.toJSON() });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

module.exports = router;
