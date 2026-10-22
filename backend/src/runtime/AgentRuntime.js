/**
 * AgentRuntime Model
 * Encapsulates live runtime state, capabilities, active session, and operational metadata for a system.
 * Purely generic - works for AI agents, APIs, services, and web apps.
 */

const { RUNTIME_STATES } = require('./RuntimeStates');
const RuntimeSession = require('./RuntimeSession');

class AgentRuntime {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.systemId = raw.systemId ? String(raw.systemId).trim() : (raw.id ? String(raw.id).trim() : '');
        this.agentId = raw.agentId ? String(raw.agentId).trim() : this.systemId;
        this.name = raw.name ? String(raw.name).trim() : (this.systemId || 'Unnamed Agent');
        this.category = raw.category ? String(raw.category).trim() : 'service';
        this.adapterType = raw.adapterType ? String(raw.adapterType).trim() : 'http';

        this.state = raw.state && Object.values(RUNTIME_STATES).includes(raw.state)
            ? raw.state
            : RUNTIME_STATES.STOPPED;

        this.healthStatus = raw.healthStatus || 'UNKNOWN';
        this.activeSession = raw.activeSession ? (raw.activeSession instanceof RuntimeSession ? raw.activeSession : new RuntimeSession(raw.activeSession)) : null;

        this.capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : ['health', 'telemetry'];
        this.lastHeartbeat = raw.lastHeartbeat || null;
        this.lastOperation = raw.lastOperation || null;
        this.lastError = raw.lastError || null;
        this.createdAt = raw.createdAt || now;
        this.updatedAt = raw.updatedAt || now;
    }

    startSession(requestedBy = 'system', executionMode = 'AUTOMATIC') {
        this.state = RUNTIME_STATES.RUNNING;
        this.activeSession = new RuntimeSession({
            systemId: this.systemId,
            agentId: this.agentId,
            requestedBy,
            executionMode
        });
        this.lastHeartbeat = new Date().toISOString();
        this.updatedAt = this.lastHeartbeat;
        return this.activeSession;
    }

    stopSession(reason = 'Stopped') {
        if (this.activeSession) {
            this.activeSession.stop(reason);
        }
        this.state = RUNTIME_STATES.STOPPED;
        this.updatedAt = new Date().toISOString();
    }

    recordHeartbeat() {
        this.lastHeartbeat = new Date().toISOString();
        if (this.activeSession) {
            this.activeSession.updateHeartbeat();
        }
        this.updatedAt = this.lastHeartbeat;
    }

    toJSON() {
        return {
            systemId: this.systemId,
            agentId: this.agentId,
            name: this.name,
            category: this.category,
            adapterType: this.adapterType,
            state: this.state,
            healthStatus: this.healthStatus,
            activeSession: this.activeSession ? this.activeSession.toJSON() : null,
            capabilities: this.capabilities,
            lastHeartbeat: this.lastHeartbeat,
            lastOperation: this.lastOperation,
            lastError: this.lastError,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = AgentRuntime;
