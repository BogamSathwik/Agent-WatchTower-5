/**
 * Connection Manager
 * Manages target connection lifecycle, timeout handling, authentication header injection, and secret security.
 */

const SENSITIVE_HEADER_KEYS = new Set([
    'authorization',
    'x-api-key',
    'api-key',
    'apikey',
    'cookie',
    'set-cookie',
    'secret',
    'token'
]);

class ConnectionManager {
    constructor() {
        this.activeConnections = new Map();
    }

    /**
     * Build authentication headers safely based on authRef.
     */
    static buildAuthHeaders(authRef = {}) {
        const headers = {};
        if (!authRef || !authRef.authType || authRef.authType === 'none') {
            return headers;
        }

        const authType = String(authRef.authType).toLowerCase();

        if (authType === 'api_key') {
            const keyName = authRef.keyName || 'X-API-Key';
            const token = authRef.secretKey || authRef.tokenRef || authRef.apiKey || 'default-api-key';
            headers[keyName] = token;
        } else if (authType === 'bearer') {
            const token = authRef.token || authRef.tokenRef || 'default-bearer-token';
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    /**
     * Sanitize request headers to prevent secret leakage in logs or responses.
     */
    static sanitizeHeaders(headers = {}) {
        const copy = {};
        for (const [key, val] of Object.entries(headers)) {
            const lowerKey = key.toLowerCase();
            if (SENSITIVE_HEADER_KEYS.has(lowerKey)) {
                copy[key] = '[REDACTED]';
            } else {
                copy[key] = val;
            }
        }
        return copy;
    }

    /**
     * Register or track an active target connection.
     */
    createConnection(systemId, connectionInfo = {}) {
        const connId = `conn_${systemId}_${Date.now()}`;
        const connObj = {
            id: connId,
            systemId,
            connectedAt: new Date().toISOString(),
            status: 'CONNECTED',
            ...connectionInfo
        };
        this.activeConnections.set(systemId, connObj);
        return connObj;
    }

    /**
     * Close and cleanup target connection.
     */
    closeConnection(systemId) {
        if (this.activeConnections.has(systemId)) {
            this.activeConnections.delete(systemId);
            return true;
        }
        return false;
    }

    /**
     * Get active connection state.
     */
    getConnection(systemId) {
        return this.activeConnections.get(systemId) || null;
    }
}

module.exports = {
    ConnectionManager
};
