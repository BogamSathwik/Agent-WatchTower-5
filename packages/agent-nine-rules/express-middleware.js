/**
 * 9 Core Autonomous Agent Rules Scanner — Express Middleware & MCP Router
 * Drop-in router for ANY Express or Node.js application.
 *
 * Exposes:
 * 1. POST / (REST Agent compliance scan)
 * 2. POST /mcp & POST / (Full JSON-RPC 2.0 Model Context Protocol endpoint)
 * 3. GET /mcp/sse & POST /mcp/message (Server-Sent Events streaming transport)
 * 4. GET /rules (Canonical 9 rules specifications)
 */

const express = require('express');
const { NineRuleEvaluator, STANDARD_RULES_SPEC } = require('./index');
const { NineRulesMcpServer } = require('./mcp');

const router = express.Router();
const evaluator = new NineRuleEvaluator();
const mcpServer = new NineRulesMcpServer({ evaluator });
const sseClients = new Map();

// Open CORS for all incoming external requests
router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-name, x-correlation-id, mcp-session-id');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// JSON-RPC MCP Handler
function handleMcp(req, res) {
    try {
        const body = req.body;
        if (!body || typeof body !== 'object') {
            return res.status(400).json({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32600, message: 'Invalid Request: Expected a JSON-RPC 2.0 object' }
            });
        }
        const response = mcpServer.handleJsonRpcMessage(body);
        if (response === null) {
            return res.status(204).end();
        }
        return res.json(response);
    } catch (err) {
        return res.status(500).json({
            jsonrpc: '2.0',
            id: req.body && req.body.id ? req.body.id : null,
            error: { code: -32603, message: err.message }
        });
    }
}

// 1. Direct MCP JSON-RPC endpoint
router.post('/mcp', handleMcp);

// 2. Server-Sent Events (SSE) stream for MCP clients
router.get('/mcp/sse', (req, res) => {
    const sessionId = `mcp_sse_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    res.write(`event: endpoint\ndata: ./mcp/message?sessionId=${sessionId}\n\n`);
    sseClients.set(sessionId, res);

    req.on('close', () => {
        sseClients.delete(sessionId);
    });
});

router.post('/mcp/message', (req, res) => {
    try {
        const sessionId = req.query.sessionId || req.headers['mcp-session-id'];
        const client = sessionId ? sseClients.get(sessionId) : null;
        const response = mcpServer.handleJsonRpcMessage(req.body);

        if (client && response) {
            client.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
            return res.status(202).json({ accepted: true });
        }
        return res.json(response || { accepted: true });
    } catch (err) {
        return res.status(500).json({ error: { message: err.message } });
    }
});

// 3. POST / (Dual handler: detects MCP JSON-RPC vs REST Agent payload)
router.post('/', (req, res) => {
    const payload = req.body || {};

    // If caller sends JSON-RPC message
    if (payload.jsonrpc === '2.0' || payload.method) {
        return handleMcp(req, res);
    }

    // Otherwise standard REST Agent Scan
    try {
        let report;
        if (payload.fileContent || payload.code) {
            report = evaluator.evaluateCode(payload.fileContent || payload.code, {
                fileName: payload.fileName || payload.filename || 'agent_script.js',
                name: payload.name || payload.agentName,
                ...payload
            });
        } else if (payload.url || payload.endpoint || payload.publicUrl) {
            report = evaluator.evaluateLink(payload.url || payload.endpoint || payload.publicUrl, payload);
        } else {
            report = evaluator.scan(payload.agent || payload, payload.runtimeContext || null);
        }

        return res.json({
            success: true,
            data: report,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: {
                message: err.message,
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
            }
        });
    }
});

// 4. GET /rules - Get all 9 canonical rule specifications
router.get('/rules', (req, res) => {
    res.json({
        success: true,
        rules: STANDARD_RULES_SPEC,
        totalRules: STANDARD_RULES_SPEC.length
    });
});

module.exports = router;
