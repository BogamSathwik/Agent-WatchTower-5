/**
 * McpToolRegistry
 * Manages MCP tool discovery, schemas, and allowlists across registered MCP servers.
 */

class McpToolRegistry {
    constructor() {
        this.tools = new Map();
    }

    registerTool(serverId, toolData = {}) {
        const toolName = toolData.name || toolData.id;
        if (!serverId || !toolName) return;

        const key = `${serverId}:${toolName}`;
        const entry = {
            serverId,
            name: toolName,
            description: toolData.description || '',
            inputSchema: toolData.inputSchema || {},
            outputSchema: toolData.outputSchema || {},
            allowedRoles: Array.isArray(toolData.allowedRoles) ? toolData.allowedRoles : ['admin', 'operator'],
            enabled: toolData.enabled !== false,
            registeredAt: new Date().toISOString()
        };

        this.tools.set(key, entry);
        return entry;
    }

    getTool(serverId, toolName) {
        return this.tools.get(`${serverId}:${toolName}`) || null;
    }

    listToolsForServer(serverId) {
        const result = [];
        for (const [key, tool] of this.tools.entries()) {
            if (tool.serverId === serverId) {
                result.push(tool);
            }
        }
        return result;
    }

    listAllTools() {
        return Array.from(this.tools.values());
    }
}

module.exports = { McpToolRegistry };
