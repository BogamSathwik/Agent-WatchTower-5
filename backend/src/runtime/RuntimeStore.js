/**
 * RuntimeStore
 * Thread-safe in-memory repository for runtime states, operational sessions, executions, and runtime events.
 */

const AgentRuntime = require('./AgentRuntime');

class RuntimeStore {
    constructor() {
        this.runtimes = new Map(); // systemId -> AgentRuntime
        this.sessions = new Map(); // sessionId -> RuntimeSession
        this.executions = []; // execution history records
        this.events = []; // runtime events stream
        this.locks = new Set(); // execution locks
    }

    getOrCreateRuntime(systemId, systemData = {}) {
        const id = String(systemId).trim();
        if (!this.runtimes.has(id)) {
            const runtime = new AgentRuntime({
                systemId: id,
                name: systemData.name || id,
                category: systemData.category || 'service',
                capabilities: systemData.capabilities || ['health', 'telemetry'],
                adapterType: (systemData.adapter && systemData.adapter.adapterType) || 'http'
            });
            this.runtimes.set(id, runtime);
        }
        return this.runtimes.get(id);
    }

    getRuntime(systemId) {
        if (!systemId) return null;
        return this.runtimes.get(String(systemId).trim()) || null;
    }

    getAllRuntimes() {
        return Array.from(this.runtimes.values()).map(r => r.toJSON());
    }

    recordExecution(record) {
        const entry = {
            executionId: record.executionId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            systemId: record.systemId,
            command: record.command,
            capability: record.capability || record.command,
            requestedBy: record.requestedBy || 'system',
            timestamp: new Date().toISOString(),
            status: record.status || 'SUCCEEDED',
            durationMs: record.durationMs || 0,
            result: record.result || null,
            error: record.error || null,
            correlationId: record.correlationId || null
        };
        this.executions.unshift(entry);
        if (this.executions.length > 500) {
            this.executions.pop();
        }
        return entry;
    }

    listExecutions(filter = {}) {
        let list = [...this.executions];
        if (filter.systemId) {
            list = list.filter(e => e.systemId === filter.systemId);
        }
        if (filter.status) {
            list = list.filter(e => e.status === filter.status);
        }
        const limit = Number(filter.limit) || 50;
        return list.slice(0, limit);
    }

    recordEvent(event) {
        const entry = {
            eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            systemId: event.systemId,
            eventType: event.eventType || 'STATE_CHANGED',
            previousState: event.previousState || null,
            currentState: event.currentState,
            reason: event.reason || '',
            timestamp: new Date().toISOString()
        };
        this.events.unshift(entry);
        if (this.events.length > 1000) {
            this.events.pop();
        }
        return entry;
    }

    listEvents(filter = {}) {
        let list = [...this.events];
        if (filter.systemId) {
            list = list.filter(e => e.systemId === filter.systemId);
        }
        const limit = Number(filter.limit) || 50;
        return list.slice(0, limit);
    }

    acquireLock(systemId, opName) {
        const key = `${systemId}:${opName}`;
        if (this.locks.has(key)) return false;
        this.locks.add(key);
        return true;
    }

    releaseLock(systemId, opName) {
        const key = `${systemId}:${opName}`;
        this.locks.delete(key);
    }

    getOverviewMetrics() {
        const all = Array.from(this.runtimes.values());
        const running = all.filter(r => r.state === 'RUNNING').length;
        const stopped = all.filter(r => r.state === 'STOPPED').length;
        const degraded = all.filter(r => r.state === 'DEGRADED').length;
        const failed = all.filter(r => r.state === 'FAILED').length;
        const activeSessions = all.filter(r => r.activeSession && r.activeSession.state === 'RUNNING').length;

        return {
            totalSystems: all.length,
            runningCount: running,
            stoppedCount: stopped,
            degradedCount: degraded,
            failedCount: failed,
            activeSessionsCount: activeSessions,
            executionsCount: this.executions.length
        };
    }
}

module.exports = RuntimeStore;
