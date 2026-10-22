/**
 * Server-Sent Events (SSE) Manager
 * Manages real-time SSE subscriptions, heartbeats, disconnects, and sanitized event broadcasting.
 */

class SSEManager {
    constructor() {
        this.clients = new Set();
        this.heartbeatInterval = null;
        this.eventCount = 0;
        this.startHeartbeat();
    }

    startHeartbeat() {
        if (this.heartbeatInterval) return;
        this.heartbeatInterval = setInterval(() => {
            this.broadcast('ping', { timestamp: new Date().toISOString(), type: 'HEARTBEAT' });
        }, 15000);
        // Hosted sandboxes may stub timers (handle undefined): only unref a
        // real timer handle. Heartbeat behavior is unchanged otherwise.
        if (this.heartbeatInterval && typeof this.heartbeatInterval.unref === 'function') {
            this.heartbeatInterval.unref();
        }
    }

    addClient(req, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders && res.flushHeaders();

        const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const client = { id: clientId, res };

        this.clients.add(client);

        // Send connection establishment event
        const initData = JSON.stringify({
            status: 'CONNECTED',
            clientId,
            timestamp: new Date().toISOString(),
            message: 'Real-time AgentOS Event Stream Established'
        });
        res.write(`event: connected\ndata: ${initData}\n\n`);

        req.on('close', () => {
            this.clients.delete(client);
        });

        return clientId;
    }

    broadcast(eventType, payload) {
        this.eventCount++;
        const sanitizedPayload = this.sanitize(payload);
        const dataStr = JSON.stringify({
            id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type: eventType,
            timestamp: new Date().toISOString(),
            data: sanitizedPayload
        });

        const message = `event: ${eventType}\ndata: ${dataStr}\n\n`;

        for (const client of this.clients) {
            try {
                client.res.write(message);
            } catch (err) {
                this.clients.delete(client);
            }
        }
    }

    sanitize(payload) {
        if (!payload || typeof payload !== 'object') return payload;
        const copy = JSON.parse(JSON.stringify(payload));
        const sensitiveKeys = ['secret', 'apiKey', 'password', 'token', 'authorization', 'stack', 'privateKey'];
        
        function clean(obj) {
            if (!obj || typeof obj !== 'object') return;
            for (const key of Object.keys(obj)) {
                if (sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object') {
                    clean(obj[key]);
                }
            }
        }
        clean(copy);
        return copy;
    }

    getClientCount() {
        return this.clients.size;
    }

    getEventCount() {
        return this.eventCount;
    }

    close() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        for (const client of this.clients) {
            try {
                client.res.end();
            } catch (_) {}
        }
        this.clients.clear();
    }
}

const sseManager = new SSEManager();

module.exports = {
    SSEManager,
    sseManager
};
