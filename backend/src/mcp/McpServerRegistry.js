/**
 * McpServerRegistry Model
 * Registers and stores MCP (Model Context Protocol) server profiles.
 */

class McpServerRegistry {
    constructor() {
        this.servers = new Map();
        this._initDefaultServers();
    }

    _initDefaultServers() {
        this.registerServer({
            serverId: 'demo-mcp-server',
            name: 'Agent Watchtower Built-in MCP Server',
            description: 'Standard Model Context Protocol tool & resource server for Agent Watchtower.',
            transport: 'HTTP_JSONRPC',
            baseUrl: 'http://localhost:4001',
            status: 'CONNECTED',
            tenantId: 'global',
            tools: [
                {
                    name: 'get_system_diagnostics',
                    description: 'Retrieve real-time platform system diagnostics',
                    inputSchema: { type: 'object', properties: { depth: { type: 'string' } } },
                    allowedRoles: ['admin', 'operator'],
                    enabled: true
                },
                {
                    name: 'fetch_agent_telemetry',
                    description: 'Fetch detailed agent telemetry and latency metrics',
                    inputSchema: { type: 'object', properties: { agentId: { type: 'string' } } },
                    allowedRoles: ['admin', 'operator', 'viewer'],
                    enabled: true
                }
            ],
            resources: [
                {
                    uri: 'mcp://watchtower/health',
                    name: 'Platform Health Overview',
                    mimeType: 'application/json'
                }
            ]
        });

        this.registerServer({
            serverId: 'nine-rules-mcp-server',
            name: '9-Rule Autonomous Agent Evaluator MCP Server',
            description: 'Dedicated Model Context Protocol server exposing verify_agent_nine_rules to verify agents and web apps against the 9 standard autonomous rules.',
            transport: 'IN_PROCESS',
            baseUrl: 'mcp://packages/agent-nine-rules',
            status: 'CONNECTED',
            tenantId: 'global',
            tools: [
                {
                    name: 'verify_agent_nine_rules',
                    description: 'Verifies an AI agent or web application against the 9 standard autonomous agent rules while preserving Watchtower master identity.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            agent: { type: 'object', description: 'Agent or web app specification' },
                            runtimeContext: { type: 'object', description: 'Optional runtime telemetry' }
                        },
                        required: ['agent']
                    },
                    allowedRoles: ['admin', 'operator', 'viewer'],
                    enabled: true
                }
            ],
            resources: []
        });
    }


    registerServer(serverData = {}) {
        const serverId = serverData.serverId || serverData.id || `mcp_srv_${Date.now()}`;
        const profile = {
            serverId,
            id: serverId,
            name: serverData.name || serverId,
            description: serverData.description || '',
            transport: serverData.transport || 'HTTP_JSONRPC',
            baseUrl: serverData.baseUrl || 'http://localhost:4001',
            status: serverData.status || 'CONNECTED',
            tenantId: serverData.tenantId || 'global',
            tools: Array.isArray(serverData.tools) ? serverData.tools : [],
            resources: Array.isArray(serverData.resources) ? serverData.resources : [],
            metadata: typeof serverData.metadata === 'object' && serverData.metadata !== null ? serverData.metadata : {},
            registeredAt: serverData.registeredAt || new Date().toISOString(),
            lastConnectedAt: new Date().toISOString()
        };

        this.servers.set(serverId, profile);
        return profile;
    }

    getServer(serverId) {
        return this.servers.get(serverId) || null;
    }

    listServers(filters = {}) {
        let list = Array.from(this.servers.values());
        if (filters.tenantId) {
            list = list.filter(s => s.tenantId === filters.tenantId || s.tenantId === 'global');
        }
        return list;
    }
}

module.exports = { McpServerRegistry };
