/**
 * AgentToolRegistry
 * Manages tool definitions exposed by framework agents or MCP tools.
 */

class AgentToolRegistry {
    constructor() {
        this.tools = new Map();
    }

    registerTool(agentId, toolData = {}) {
        const name = toolData.name || toolData.id;
        if (!agentId || !name) return;

        const toolKey = `${agentId}:${name}`;
        const toolEntry = {
            agentId,
            name,
            description: toolData.description || '',
            inputSchema: toolData.inputSchema || {},
            outputSchema: toolData.outputSchema || {},
            allowedRoles: Array.isArray(toolData.allowedRoles) ? toolData.allowedRoles : ['admin', 'operator'],
            enabled: toolData.enabled !== false,
            registeredAt: new Date().toISOString()
        };

        this.tools.set(toolKey, toolEntry);
        return toolEntry;
    }

    getTool(agentId, toolName) {
        return this.tools.get(`${agentId}:${toolName}`) || null;
    }

    listToolsForAgent(agentId) {
        const list = [];
        for (const [key, tool] of this.tools.entries()) {
            if (tool.agentId === agentId) {
                list.push(tool);
            }
        }
        return list;
    }

    listAllTools() {
        return Array.from(this.tools.values());
    }
}

module.exports = { AgentToolRegistry };
