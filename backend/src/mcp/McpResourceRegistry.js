/**
 * McpResourceRegistry
 * Manages MCP resource registrations and URIs across registered MCP servers.
 */

class McpResourceRegistry {
    constructor() {
        this.resources = new Map();
    }

    registerResource(serverId, resourceData = {}) {
        const uri = resourceData.uri || `mcp://${serverId}/${resourceData.name || Date.now()}`;
        const key = `${serverId}:${uri}`;
        const entry = {
            serverId,
            uri,
            name: resourceData.name || uri,
            description: resourceData.description || '',
            mimeType: resourceData.mimeType || 'application/json',
            registeredAt: new Date().toISOString()
        };

        this.resources.set(key, entry);
        return entry;
    }

    listResourcesForServer(serverId) {
        const list = [];
        for (const [key, res] of this.resources.entries()) {
            if (res.serverId === serverId) {
                list.push(res);
            }
        }
        return list;
    }

    listAllResources() {
        return Array.from(this.resources.values());
    }
}

module.exports = { McpResourceRegistry };
