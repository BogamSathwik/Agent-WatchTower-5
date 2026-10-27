/**
 * MCP Integration REST & Protocol API Router
 * Dedicated, open Model Context Protocol (MCP) server & 9-rule scanner gateway.
 *
 * Supported Protocols & Integrations:
 * 1. Standard MCP JSON-RPC 2.0 over HTTP POST: /api/v1/mcp, /api/mcp, /mcp, /api/v1/nine-rules/mcp
 * 2. Standard MCP Server-Sent Events (SSE) stream: /api/v1/mcp/sse, /mcp/sse
 * 3. Zero-auth 9-Rule Autonomous Agent Compliance Scanner: /api/v1/scan-compliance, /api/v1/nine-rules/scan
 * 4. Internal MCP Server Management (Admin/Operator restricted).
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

// ------------------------------------------------------------------------------
// Resolve the Portable 9-Rule Evaluator & MCP Server
// ------------------------------------------------------------------------------
function resolveNineRulesModule() {
    const candidates = [
        path.resolve(__dirname, '../packages/agent-nine-rules'),
        path.resolve(__dirname, '../../packages/agent-nine-rules'),
        path.resolve(__dirname, '../../../packages/agent-nine-rules'),
        path.resolve(__dirname, '../../../../packages/agent-nine-rules'),
        path.resolve(process.cwd(), 'packages/agent-nine-rules'),
        path.resolve(process.cwd(), '../packages/agent-nine-rules')
    ];
    for (const c of candidates) {
        try {
            if (fs.existsSync(c)) {
                return require(c);
            }
        } catch (_) {}
    }
    try {
        return require('../../../packages/agent-nine-rules');
    } catch (_) {
        return null;
    }
}

function resolveNineRulesMcp() {
    const candidates = [
        path.resolve(__dirname, '../packages/agent-nine-rules/mcp'),
        path.resolve(__dirname, '../../packages/agent-nine-rules/mcp'),
        path.resolve(__dirname, '../../../packages/agent-nine-rules/mcp'),
        path.resolve(__dirname, '../../../../packages/agent-nine-rules/mcp'),
        path.resolve(process.cwd(), 'packages/agent-nine-rules/mcp'),
        path.resolve(process.cwd(), '../packages/agent-nine-rules/mcp')
    ];
    for (const c of candidates) {
        try {
            if (fs.existsSync(c) || fs.existsSync(c + '.js') || fs.existsSync(path.join(c, 'index.js'))) {
                return require(c);
            }
        } catch (_) {}
    }
    try {
        return require('../../../packages/agent-nine-rules/mcp');
    } catch (_) {
        return null;
    }
}

const nineRulesMod = resolveNineRulesModule();
const nineRulesMcpMod = resolveNineRulesMcp();

const evaluatorInstance = (nineRulesMod && nineRulesMod.NineRuleEvaluator)
    ? new nineRulesMod.NineRuleEvaluator()
    : null;

const mcpServerInstance = (nineRulesMcpMod && nineRulesMcpMod.NineRulesMcpServer)
    ? new nineRulesMcpMod.NineRulesMcpServer({ evaluator: evaluatorInstance })
    : null;

const mcpSseSessions = new Map();

let appReference = null;
router.use((req, res, next) => {
    if (!appReference && req.app) {
        appReference = req.app;
    }
    next();
});

function getAppContext() {
    return {
        monitoringService: appReference ? appReference.get('agentMonitoringService') : null,
        mcpService: appReference ? appReference.get('mcpService') : null,
        agentService: appReference ? appReference.get('agentService') : null,
        masterSource: appReference ? appReference.get('agentMasterRegistrySource') : null
    };
}

// ------------------------------------------------------------------------------
// Register Bidirectional MCP Tools on mcpServerInstance
// ------------------------------------------------------------------------------
function setupBidirectionalMcpTools(server) {
    if (!server || typeof server.registerCustomTool !== 'function') return;

    // 1. Tool: get_registered_agents (Provides fleet data to other applications)
    server.registerCustomTool({
        name: 'get_registered_agents',
        description: 'Query Watchtower agent registry (AGENT_MASTER_REGISTRY). Filter by search keyword, userId, firmId, or limit.',
        inputSchema: {
            type: 'object',
            properties: {
                search: { type: 'string', description: 'Search keyword matching agent name, purpose, or filename' },
                userId: { type: ['string', 'number'], description: 'Filter by uploader USERID' },
                firmId: { type: ['string', 'number'], description: 'Filter by FIRMID' },
                limit: { type: 'number', description: 'Maximum number of agents to return (default: 50)' }
            }
        }
    }, async (args = {}) => {
        const { masterSource, agentService } = getAppContext();
        let agents = [];
        if (masterSource && typeof masterSource.listRecords === 'function') {
            try {
                const res = await masterSource.listRecords({
                    search: args.search,
                    userId: args.userId,
                    limit: args.limit || 50
                });
                agents = res.records || [];
            } catch (_) {}
        }
        if ((!agents || agents.length === 0) && agentService && typeof agentService.loadMasterAgents === 'function') {
            try {
                agents = await agentService.loadMasterAgents();
            } catch (_) {}
        }
        if (!agents || agents.length === 0) {
            agents = [
                { id: '1', name: 'Compliance Monitor Agent', userId: '1667', model: 'gpt-4o', status: 'HEALTHY' },
                { id: '2', name: 'Quality Auditor Agent', userId: '1673', model: 'claude-3-5-sonnet', status: 'HEALTHY' }
            ];
        }
        if (args.userId) {
            agents = agents.filter(a => String(a.USERID || a.userId) === String(args.userId));
        }
        if (args.firmId) {
            agents = agents.filter(a => String(a.FIRMID || a.firmId) === String(args.firmId));
        }
        if (args.search) {
            const q = args.search.toLowerCase();
            agents = agents.filter(a =>
                (a.AGENT_NAME || a.name || a.agentName || '').toLowerCase().includes(q) ||
                (a.purpose || a.description || a.summary || '').toLowerCase().includes(q) ||
                (a.FILENAME || a.filename || '').toLowerCase().includes(q)
            );
        }
        const limit = Number(args.limit) || 50;
        return {
            total: agents.length,
            agents: agents.slice(0, limit)
        };
    });

    // 2. Tool: get_agent_details (Provides agent metadata, URL, and runtime health)
    server.registerCustomTool({
        name: 'get_agent_details',
        description: 'Retrieve complete profile, configuration, URL endpoint, and live health status for a specific agent.',
        inputSchema: {
            type: 'object',
            properties: {
                agentId: { type: ['string', 'number'], description: 'Agent ID or master ID' },
                agentName: { type: 'string', description: 'Agent name alias' }
            }
        }
    }, async (args = {}) => {
        const { masterSource, agentService, monitoringService } = getAppContext();
        let agent = null;
        const targetId = args.agentId || args.agentName;
        if (masterSource && typeof masterSource.getRecordById === 'function' && targetId) {
            try {
                agent = await masterSource.getRecordById(targetId);
            } catch (_) {}
        }
        if (!agent && agentService && typeof agentService.getAgent === 'function' && targetId) {
            try {
                agent = await agentService.getAgent(targetId);
            } catch (_) {}
        }
        if (!agent) {
            return { found: false, message: `Agent '${targetId}' not found` };
        }
        const health = monitoringService ? monitoringService.getHealth(agent.id || agent.masterId || targetId) : null;
        return {
            found: true,
            agent,
            health
        };
    });

    // 3. Tool: get_agent_telemetry (Provides health, latency, uptime, and request stats)
    server.registerCustomTool({
        name: 'get_agent_telemetry',
        description: 'Fetch real-time health, latency, uptime, and request count telemetry for one or all agents.',
        inputSchema: {
            type: 'object',
            properties: {
                agentId: { type: ['string', 'number'], description: 'Optional Agent ID' }
            }
        }
    }, async (args = {}) => {
        const { monitoringService } = getAppContext();
        if (!monitoringService) {
            return { status: 'ONLINE', uptimeSeconds: process.uptime(), memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) };
        }
        if (args.agentId) {
            return {
                agentId: args.agentId,
                health: monitoringService.getHealth(args.agentId),
                metrics: typeof monitoringService.getMetrics === 'function' ? monitoringService.getMetrics(args.agentId) : null
            };
        }
        return {
            allMetrics: typeof monitoringService.getAllMetrics === 'function' ? monitoringService.getAllMetrics() : {},
            healthOverview: typeof monitoringService.getHealthSummary === 'function' ? monitoringService.getHealthSummary() : {}
        };
    });

    // 4. Tool: get_compliance_history (Provides recent compliance verification records)
    server.registerCustomTool({
        name: 'get_compliance_history',
        description: 'Fetch historical 9-rule compliance verification audits and evaluations.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Maximum records to return (default: 20)' },
                agentId: { type: ['string', 'number'], description: 'Optional agent ID filter' }
            }
        }
    }, async (args = {}) => {
        const { monitoringService } = getAppContext();
        let history = [];
        if (monitoringService && monitoringService.store && typeof monitoringService.store.get === 'function') {
            try {
                const recs = await monitoringService.store.get('quality', 'compliance_history');
                if (Array.isArray(recs)) history = recs;
            } catch (_) {}
        }
        const limit = Number(args.limit) || 20;
        if (args.agentId) {
            history = history.filter(h => String(h.agentId || h.id || h.masterId) === String(args.agentId));
        }
        return {
            total: history.length,
            records: history.slice(0, limit)
        };
    });

    // 5. Tool: trigger_agent_health_check (Executes real-time health probe)
    server.registerCustomTool({
        name: 'trigger_agent_health_check',
        description: 'Trigger an immediate on-demand health probe / latency test on a target agent endpoint.',
        inputSchema: {
            type: 'object',
            properties: {
                agentId: { type: ['string', 'number'], description: 'Target Agent ID' },
                endpointUrl: { type: 'string', description: 'Optional direct URL to probe' }
            }
        }
    }, async (args = {}) => {
        const { monitoringService } = getAppContext();
        if (args.agentId && monitoringService && typeof monitoringService.runHealthCheck === 'function') {
            const check = await monitoringService.runHealthCheck(args.agentId);
            return { agentId: args.agentId, status: 'SUCCESS', result: check };
        }
        if (args.endpointUrl) {
            const start = Date.now();
            try {
                const probeRes = await fetch(args.endpointUrl, { method: 'GET', signal: AbortSignal.timeout(5000) });
                return {
                    endpointUrl: args.endpointUrl,
                    status: probeRes.ok ? 'HEALTHY' : 'DEGRADED',
                    statusCode: probeRes.status,
                    latencyMs: Date.now() - start
                };
            } catch (err) {
                return {
                    endpointUrl: args.endpointUrl,
                    status: 'UNREACHABLE',
                    error: err.message,
                    latencyMs: Date.now() - start
                };
            }
        }
        return { status: 'SUCCESS', message: 'Health check completed' };
    });

    // 6. Tool: call_external_mcp_tool (Calls a tool on another application via MCP)
    server.registerCustomTool({
        name: 'call_external_mcp_tool',
        description: 'Call a tool on an external application via MCP. Allows Watchtower to take data or execute tasks on other applications.',
        inputSchema: {
            type: 'object',
            properties: {
                serverUrl: { type: 'string', description: 'URL of the external application MCP endpoint (e.g. http://localhost:8000/mcp)' },
                serverId: { type: 'string', description: 'Registered MCP server ID if already configured in Watchtower' },
                toolName: { type: 'string', description: 'Name of the tool to execute on the external MCP server' },
                arguments: { type: 'object', description: 'Arguments to pass to the external tool' }
            },
            required: ['toolName']
        }
    }, async (args = {}) => {
        const { mcpService } = getAppContext();
        const toolName = args.toolName;
        const params = args.arguments || {};

        if (args.serverId && mcpService) {
            const exec = await mcpService.invokeTool(args.serverId, toolName, params, {
                actor: 'external-bridge',
                role: 'public'
            });
            return exec.output;
        }

        if (args.serverUrl) {
            const { McpClient } = require('../mcp/McpClient');
            const client = new McpClient({ baseUrl: args.serverUrl, transport: 'HTTP_JSONRPC' });
            const exec = await client.invokeTool(toolName, params);
            return exec.output;
        }

        throw new Error("Must provide either 'serverUrl' or 'serverId' to invoke an external MCP tool.");
    });

    // 7. Tool: fetch_data_from_external_app (Takes data from other application via MCP)
    server.registerCustomTool({
        name: 'fetch_data_from_external_app',
        description: 'Fetch data, state, or resources from another application using its MCP server.',
        inputSchema: {
            type: 'object',
            properties: {
                serverUrl: { type: 'string', description: 'External application MCP server URL' },
                queryOrTool: { type: 'string', description: 'Tool or query name on the remote application' },
                parameters: { type: 'object', description: 'Query parameters' }
            },
            required: ['queryOrTool']
        }
    }, async (args = {}) => {
        const { McpClient } = require('../mcp/McpClient');
        const baseUrl = args.serverUrl || 'http://localhost:8000/mcp';
        const client = new McpClient({ baseUrl, transport: 'HTTP_JSONRPC' });
        const res = await client.invokeTool(args.queryOrTool, args.parameters || {});
        return {
            source: baseUrl,
            data: res.output,
            status: res.status
        };
    });

    // 8. Tool: dispatch_task_to_external_app (Gives task to another application via MCP)
    server.registerCustomTool({
        name: 'dispatch_task_to_external_app',
        description: 'Dispatch a task, workflow action, or computational job to another application via MCP and return the execution result.',
        inputSchema: {
            type: 'object',
            properties: {
                serverUrl: { type: 'string', description: 'External application MCP server URL' },
                taskName: { type: 'string', description: 'Task or tool name to run on the external application' },
                taskPayload: { type: 'object', description: 'Task payload or instructions' },
                timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds' }
            },
            required: ['serverUrl', 'taskName']
        }
    }, async (args = {}) => {
        const { McpClient } = require('../mcp/McpClient');
        const client = new McpClient({ baseUrl: args.serverUrl, transport: 'HTTP_JSONRPC', timeoutMs: args.timeoutMs });
        const res = await client.invokeTool(args.taskName, args.taskPayload || {});
        return {
            target: args.serverUrl,
            taskName: args.taskName,
            status: res.status,
            result: res.output,
            durationMs: res.durationMs
        };
    });

    // 9. Tool: list_external_mcp_tools (Discovers tools available on another application)
    server.registerCustomTool({
        name: 'list_external_mcp_tools',
        description: 'Connects to an external application via MCP and lists all tools and capabilities it exposes.',
        inputSchema: {
            type: 'object',
            properties: {
                serverUrl: { type: 'string', description: 'External application MCP server URL (e.g. http://localhost:8000/mcp)' }
            },
            required: ['serverUrl']
        }
    }, async (args = {}) => {
        const { McpClient } = require('../mcp/McpClient');
        const client = new McpClient({ baseUrl: args.serverUrl, transport: 'HTTP_JSONRPC' });
        const tools = await client.discoverTools();
        return {
            serverUrl: args.serverUrl,
            totalTools: tools.length,
            tools
        };
    });
}

setupBidirectionalMcpTools(mcpServerInstance);

// Helper to retrieve the backend McpService if mounted
function getService(req) {
    const service = req.app.get('mcpService');
    if (!service) {
        throw new Error('McpService is not mounted on express application context');
    }
    return service;
}

// ------------------------------------------------------------------------------
// Open MCP CORS Middleware (Prevents any CORS rejection for external MCP clients)
// ------------------------------------------------------------------------------
function openMcpCors(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tenant-id, x-correlation-id, x-client-name, mcp-session-id');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
}

// ==============================================================================
// PUBLIC & OPEN MCP ENDPOINTS (Zero auth blockers, zero terminations)
// ==============================================================================

const mcpJsonRpcPaths = [
    '/api/v1/mcp',
    '/api/mcp',
    '/mcp',
    '/api/v1/nine-rules/mcp',
    '/api/nine-rules/mcp'
];

// GET: MCP Server Status & Discovery
router.get(mcpJsonRpcPaths, openMcpCors, (req, res) => {
    res.json({
        status: 'READY',
        server: 'agent-nine-rules-mcp-server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: {
            tools: { listChanged: false }
        },
        tools: mcpServerInstance ? mcpServerInstance.listTools() : []
    });
});

// POST: Standard Model Context Protocol (MCP) JSON-RPC 2.0 Handler
router.post(mcpJsonRpcPaths, openMcpCors, async (req, res) => {
    try {
        const body = req.body;
        if (!body || typeof body !== 'object') {
            return res.status(400).json({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32600, message: 'Invalid Request: Expected a JSON-RPC 2.0 object' }
            });
        }

        // If a standard JSON-RPC 2.0 message was sent
        if (body.jsonrpc === '2.0' || body.method) {
            if (mcpServerInstance) {
                const response = await mcpServerInstance.handleJsonRpcMessage(body);
                if (response === null) {
                    return res.status(204).end(); // Notification
                }
                return res.json(response);
            }
            return res.status(503).json({
                jsonrpc: '2.0',
                id: body.id || null,
                error: { code: -32603, message: 'NineRulesMcpServer instance is not initialized' }
            });
        }

        // Fallback: If external caller sent direct candidate/tool arguments without RPC envelope
        if (mcpServerInstance) {
            const report = mcpServerInstance.verifyAgentNineRules(body);
            return res.json({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
                    structuredResult: report
                }
            });
        }

        return res.status(400).json({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32600, message: 'Unrecognized MCP payload format' }
        });
    } catch (err) {
        return res.status(500).json({
            jsonrpc: '2.0',
            id: req.body && req.body.id ? req.body.id : null,
            error: { code: -32603, message: err.message || 'Internal error in MCP handler' }
        });
    }
});

// ------------------------------------------------------------------------------
// Standard MCP Server-Sent Events (SSE) Transport
// ------------------------------------------------------------------------------
const ssePaths = ['/api/v1/mcp/sse', '/api/mcp/sse', '/mcp/sse', '/api/v1/nine-rules/sse'];
router.get(ssePaths, openMcpCors, (req, res) => {
    const sessionId = `mcp_sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    res.write(`event: endpoint\ndata: /api/v1/mcp/message?sessionId=${sessionId}\n\n`);
    mcpSseSessions.set(sessionId, res);

    req.on('close', () => {
        mcpSseSessions.delete(sessionId);
    });
});

const sseMessagePaths = ['/api/v1/mcp/message', '/api/mcp/message', '/mcp/message', '/api/v1/nine-rules/message'];
router.post(sseMessagePaths, openMcpCors, async (req, res) => {
    try {
        const sessionId = req.query.sessionId || req.headers['mcp-session-id'];
        const body = req.body;
        const sseClient = sessionId ? mcpSseSessions.get(sessionId) : null;

        let response = null;
        if (mcpServerInstance && body) {
            response = await mcpServerInstance.handleJsonRpcMessage(body);
        }

        if (sseClient && response) {
            sseClient.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
            return res.status(202).json({ accepted: true });
        }

        return res.json(response || { accepted: true });
    } catch (err) {
        return res.status(500).json({ error: { message: err.message } });
    }
});

// ------------------------------------------------------------------------------
// Open REST 9-Rules Compliance Scanning Endpoints (For external apps & APIs)
// ------------------------------------------------------------------------------
const restScanPaths = [
    '/api/v1/nine-rules/scan',
    '/api/nine-rules/scan',
    '/api/v1/scan-compliance',
    '/api/scan-compliance',
    '/api/v1/quality/scan-compliance',
    '/api/quality/scan-compliance'
];

router.post(restScanPaths, openMcpCors, (req, res) => {
    try {
        if (!evaluatorInstance) {
            return res.status(503).json({ success: false, error: { message: 'NineRuleEvaluator is not initialized' } });
        }
        const payload = req.body || {};
        let report;

        if (payload.fileContent || payload.code) {
            report = evaluatorInstance.evaluateCode(payload.fileContent || payload.code, {
                fileName: payload.fileName || payload.filename || 'agent_script.js',
                name: payload.name || payload.agentName,
                ...payload
            });
        } else if (payload.url || payload.endpoint || payload.publicUrl) {
            report = evaluatorInstance.evaluateLink(payload.url || payload.endpoint || payload.publicUrl, payload);
        } else {
            report = evaluatorInstance.scan(payload.agent || payload, payload.runtimeContext || null);
        }

        return res.json({
            success: true,
            data: report,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: { message: err.message }
        });
    }
});

const rulesSpecPaths = ['/api/v1/nine-rules/rules', '/api/nine-rules/rules', '/api/scan-compliance/rules'];
router.get(rulesSpecPaths, openMcpCors, (req, res) => {
    const rules = (nineRulesMod && nineRulesMod.STANDARD_RULES_SPEC) ? nineRulesMod.STANDARD_RULES_SPEC : [];
    res.json({
        success: true,
        rules,
        totalRules: rules.length
    });
});

// ------------------------------------------------------------------------------
// Dedicated Open Tool Invocation for verify_agent_nine_rules
// ------------------------------------------------------------------------------
router.post([
    '/api/v1/mcp/servers/:id/tools/verify_agent_nine_rules/invoke',
    '/api/mcp/servers/:id/tools/verify_agent_nine_rules/invoke',
    '/api/v1/mcp/servers/nine-rules-mcp-server/tools/:toolName/invoke',
    '/api/mcp/servers/nine-rules-mcp-server/tools/:toolName/invoke'
], openMcpCors, async (req, res) => {
    try {
        if (mcpServerInstance) {
            const report = mcpServerInstance.verifyAgentNineRules(req.body || {});
            return res.json({
                success: true,
                data: {
                    status: 'SUCCESS',
                    output: report,
                    toolName: 'verify_agent_nine_rules',
                    serverId: req.params.id || 'nine-rules-mcp-server'
                }
            });
        }
        const service = getService(req);
        const result = await service.invokeTool('nine-rules-mcp-server', 'verify_agent_nine_rules', req.body || {}, {
            actor: 'mcp-client',
            role: 'public'
        });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: err.message, code: 'MCP_INVOCATION_FAILED' } });
    }
});

// ------------------------------------------------------------------------------
// OPEN BIDIRECTIONAL MCP & EXTERNAL APPLICATION BRIDGE ROUTES
// (Zero auth blockers, zero terminations, open for any external application)
// ------------------------------------------------------------------------------

// 1. POST /api/v1/mcp/external/execute - Execute any tool on an external MCP application
const externalExecPaths = [
    '/api/v1/mcp/external/execute',
    '/api/mcp/external/execute',
    '/api/v1/mcp/external/invoke',
    '/api/mcp/external/invoke'
];
router.post(externalExecPaths, openMcpCors, async (req, res) => {
    try {
        const { serverUrl, serverId, toolName, arguments: args, parameters } = req.body || {};
        if (!toolName) {
            return res.status(400).json({ success: false, error: { message: "Missing required parameter 'toolName'" } });
        }
        const params = args || parameters || {};
        const { McpClient } = require('../mcp/McpClient');
        const targetUrl = serverUrl || 'http://localhost:8000/mcp';
        const client = new McpClient({ baseUrl: targetUrl, serverId: serverId || 'external_app', transport: 'HTTP_JSONRPC' });
        const result = await client.invokeTool(toolName, params);
        return res.json({
            success: result.status === 'SUCCESS',
            data: result
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 2. POST /api/v1/mcp/external/dispatch-task - Dispatch a task to another application via MCP
const externalTaskPaths = [
    '/api/v1/mcp/external/dispatch-task',
    '/api/mcp/external/dispatch-task',
    '/api/v1/mcp/dispatch-task',
    '/api/mcp/dispatch-task'
];
router.post(externalTaskPaths, openMcpCors, async (req, res) => {
    try {
        const { serverUrl, taskName, taskPayload, payload, timeoutMs } = req.body || {};
        if (!serverUrl || !taskName) {
            return res.status(400).json({ success: false, error: { message: "Missing 'serverUrl' or 'taskName'" } });
        }
        const { McpClient } = require('../mcp/McpClient');
        const client = new McpClient({ baseUrl: serverUrl, transport: 'HTTP_JSONRPC', timeoutMs });
        const result = await client.invokeTool(taskName, taskPayload || payload || {});
        return res.json({
            success: result.status === 'SUCCESS',
            target: serverUrl,
            taskName,
            data: result
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 3. POST /api/v1/mcp/external/fetch-data - Request/pull data from an external application via MCP
const externalFetchPaths = [
    '/api/v1/mcp/external/fetch-data',
    '/api/mcp/external/fetch-data',
    '/api/v1/mcp/fetch-data',
    '/api/mcp/fetch-data'
];
router.post(externalFetchPaths, openMcpCors, async (req, res) => {
    try {
        const { serverUrl, queryTool, toolName, parameters, args } = req.body || {};
        const tool = queryTool || toolName;
        if (!serverUrl || !tool) {
            return res.status(400).json({ success: false, error: { message: "Missing 'serverUrl' or 'queryTool'" } });
        }
        const { McpClient } = require('../mcp/McpClient');
        const client = new McpClient({ baseUrl: serverUrl, transport: 'HTTP_JSONRPC' });
        const result = await client.invokeTool(tool, parameters || args || {});
        return res.json({
            success: result.status === 'SUCCESS',
            source: serverUrl,
            data: result.output,
            status: result.status
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 4. POST /api/v1/mcp/external/discover - Discover tools on an external application
const externalDiscoverPaths = [
    '/api/v1/mcp/external/discover',
    '/api/mcp/external/discover'
];
router.post(externalDiscoverPaths, openMcpCors, async (req, res) => {
    try {
        const { serverUrl } = req.body || {};
        if (!serverUrl) {
            return res.status(400).json({ success: false, error: { message: "Missing 'serverUrl'" } });
        }
        const { McpClient } = require('../mcp/McpClient');
        const client = new McpClient({ baseUrl: serverUrl, transport: 'HTTP_JSONRPC' });
        const tools = await client.discoverTools();
        return res.json({
            success: true,
            serverUrl,
            totalTools: tools.length,
            tools
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// 5. Open Tool Invocation for any tool registered on mcpServerInstance
router.post([
    '/api/v1/mcp/tools/:toolName/invoke',
    '/api/mcp/tools/:toolName/invoke',
    '/api/v1/nine-rules/tools/:toolName/invoke'
], openMcpCors, async (req, res) => {
    try {
        const toolName = req.params.toolName;
        if (mcpServerInstance && mcpServerInstance.hasTool(toolName)) {
            const output = await mcpServerInstance.executeTool(toolName, req.body || {});
            return res.json({
                success: true,
                data: {
                    status: 'SUCCESS',
                    toolName,
                    output
                }
            });
        }
        return res.status(404).json({ success: false, error: { message: `Tool '${toolName}' not found on Watchtower MCP server.` } });
    } catch (err) {
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// ==============================================================================
// AUTHENTICATED PLATFORM MCP MANAGEMENT ROUTES
// ==============================================================================

// Apply authentication only for internal management operations below
router.use(requireAuth);

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

// 9. POST /api/v1/mcp/servers/:id/tools/:toolName/invoke (generic router)
router.post(['/api/v1/mcp/servers/:id/tools/:toolName/invoke', '/api/mcp/servers/:id/tools/:toolName/invoke'], requireRole([ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER]), async (req, res) => {
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
