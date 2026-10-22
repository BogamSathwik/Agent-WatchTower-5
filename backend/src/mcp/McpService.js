/**
 * McpService
 * High-level MCP facade providing MCP server registration, tool/resource discovery,
 * authorized tool invocation, connection management, audit logging, and secret redaction.
 */

const { McpServerRegistry } = require('./McpServerRegistry');
const { McpToolRegistry } = require('./McpToolRegistry');
const { McpResourceRegistry } = require('./McpResourceRegistry');
const { McpConnectionManager } = require('./McpConnectionManager');
const { McpClient, redactObject } = require('./McpClient');
const { McpPolicy } = require('./McpPolicy');
const { McpRequestValidator } = require('./McpRequestValidator');
const { auditLogService } = require('../audit/AuditLogService');

class McpService {
    constructor(options = {}) {
        this.serverRegistry = new McpServerRegistry();
        this.toolRegistry = new McpToolRegistry();
        this.resourceRegistry = new McpResourceRegistry();
        this.connectionManager = new McpConnectionManager(this.serverRegistry);
        this.clients = new Map();
        this.executionHistory = [];
        this.policy = new McpPolicy(options.policy || {});

        this._initRegistries();
    }

    _initRegistries() {
        const servers = this.serverRegistry.listServers();
        servers.forEach(srv => {
            const client = new McpClient(srv);
            this.clients.set(srv.serverId, client);
            if (Array.isArray(srv.tools)) {
                srv.tools.forEach(t => this.toolRegistry.registerTool(srv.serverId, t));
            }
            if (Array.isArray(srv.resources)) {
                srv.resources.forEach(r => this.resourceRegistry.registerResource(srv.serverId, r));
            }
        });
    }

    registerServer(serverData = {}, actor = 'system') {
        const validation = McpRequestValidator.validateServerRegistration(serverData);
        if (!validation.valid) {
            throw new Error(`Invalid MCP server profile: ${validation.errors.join(', ')}`);
        }

        const profile = this.serverRegistry.registerServer(serverData);
        const client = new McpClient(profile);
        this.clients.set(profile.serverId, client);

        if (Array.isArray(profile.tools)) {
            profile.tools.forEach(t => this.toolRegistry.registerTool(profile.serverId, t));
        }
        if (Array.isArray(profile.resources)) {
            profile.resources.forEach(r => this.resourceRegistry.registerResource(profile.serverId, r));
        }

        auditLogService.logEvent({
            eventType: 'MCP_SERVER_REGISTERED',
            action: 'register_mcp_server',
            actor,
            role: 'admin',
            tenantId: profile.tenantId,
            resourceType: 'mcp_server',
            resourceId: profile.serverId,
            outcome: 'SUCCESS',
            severity: 'INFO',
            metadata: { name: profile.name, transport: profile.transport }
        });

        return profile;
    }

    getServer(serverId) {
        return this.serverRegistry.getServer(serverId);
    }

    listServers(filters = {}) {
        return this.serverRegistry.listServers(filters);
    }

    async connectServer(serverId) {
        return this.connectionManager.connectServer(serverId);
    }

    async disconnectServer(serverId) {
        return this.connectionManager.disconnectServer(serverId);
    }

    async discoverTools(serverId) {
        const srv = this.getServer(serverId);
        if (!srv) throw new Error(`MCP Server '${serverId}' not found`);

        let client = this.clients.get(serverId);
        if (!client) {
            client = new McpClient(srv);
            this.clients.set(serverId, client);
        }

        const tools = await client.discoverTools();
        tools.forEach(t => this.toolRegistry.registerTool(serverId, t));
        return this.toolRegistry.listToolsForServer(serverId);
    }

    listTools(serverId) {
        return this.toolRegistry.listToolsForServer(serverId);
    }

    async invokeTool(serverId, toolName, parameters = {}, options = {}) {
        const role = options.role || 'operator';
        const actor = options.actor || 'system';
        const tenantId = options.tenantId || 'global';
        const correlationId = options.correlationId || `corr_mcp_${Date.now()}`;

        if (!this.policy.isRoleAllowed(role)) {
            throw new Error(`Role '${role}' is not authorized to invoke MCP tools`);
        }
        if (!this.policy.isToolAllowed(toolName)) {
            throw new Error(`MCP Tool '${toolName}' is not permitted by security policy`);
        }

        const validRes = McpRequestValidator.validateInvocation(toolName, parameters);
        if (!validRes.valid) {
            throw new Error(`Invalid MCP tool invocation: ${validRes.errors.join(', ')}`);
        }

        let client = this.clients.get(serverId);
        if (!client) {
            const srv = this.getServer(serverId);
            if (!srv) throw new Error(`MCP Server '${serverId}' not found`);
            client = new McpClient(srv);
            this.clients.set(serverId, client);
        }

        const sanitizedParams = redactObject(parameters);
        const result = await client.invokeTool(toolName, sanitizedParams, { correlationId });
        const sanitizedOutput = redactObject(result.output);

        const historyEntry = {
            executionId: `mcp_exec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            serverId,
            toolName,
            parameters: sanitizedParams,
            output: sanitizedOutput,
            durationMs: result.durationMs,
            status: result.status,
            actor,
            role,
            tenantId,
            correlationId,
            timestamp: new Date().toISOString()
        };

        this.executionHistory.unshift(historyEntry);
        if (this.executionHistory.length > 500) this.executionHistory.pop();

        auditLogService.logEvent({
            eventType: 'MCP_TOOL_INVOKED',
            action: 'invoke_mcp_tool',
            actor,
            role,
            tenantId,
            resourceType: 'mcp_tool',
            resourceId: `${serverId}:${toolName}`,
            outcome: result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
            severity: 'INFO',
            metadata: { correlationId, durationMs: result.durationMs }
        });

        return historyEntry;
    }

    getExecutionHistory(serverId = null) {
        if (!serverId) return this.executionHistory;
        return this.executionHistory.filter(h => h.serverId === serverId);
    }

    getOverview() {
        const servers = this.serverRegistry.listServers();
        const allTools = this.toolRegistry.listAllTools();
        const allResources = this.resourceRegistry.listAllResources();

        return {
            totalServers: servers.length,
            connectedServers: servers.filter(s => s.status === 'CONNECTED').length,
            totalTools: allTools.length,
            totalResources: allResources.length,
            recentExecutions: this.executionHistory.slice(0, 10),
            servers
        };
    }
}

module.exports = { McpService };
