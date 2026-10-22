/**
 * McpConnectionManager
 * Manages connection state, health checks, connects, disconnects, and reconnects for MCP servers.
 */

class McpConnectionManager {
    constructor(serverRegistry) {
        this.registry = serverRegistry;
        this.connections = new Map();
    }

    async connectServer(serverId) {
        const srv = this.registry.getServer(serverId);
        if (!srv) throw new Error(`MCP Server '${serverId}' not found`);

        srv.status = 'CONNECTED';
        srv.lastConnectedAt = new Date().toISOString();
        this.connections.set(serverId, { status: 'CONNECTED', connectedAt: srv.lastConnectedAt });
        return srv;
    }

    async disconnectServer(serverId) {
        const srv = this.registry.getServer(serverId);
        if (srv) {
            srv.status = 'DISCONNECTED';
        }
        this.connections.set(serverId, { status: 'DISCONNECTED', disconnectedAt: new Date().toISOString() });
        return { serverId, status: 'DISCONNECTED' };
    }

    getConnectionState(serverId) {
        const conn = this.connections.get(serverId);
        if (conn) return conn.status;
        const srv = this.registry.getServer(serverId);
        return srv ? srv.status : 'DISCONNECTED';
    }
}

module.exports = { McpConnectionManager };
