/**
 * Platform Lifecycle State Store
 * Persists and tracks current state, history, start time, and subsystem initialization statuses.
 */

class LifecycleStore {
    constructor() {
        this.currentState = 'STOPPED';
        this.startTime = null;
        this.lastTransitionAt = null;
        this.history = [];
        this.maxHistorySize = 100;
        this.subsystems = new Map();
    }

    getState() {
        return this.currentState;
    }

    recordTransition(fromState, toState, reason = '', actor = 'system', metadata = {}) {
        const timestamp = new Date().toISOString();
        this.currentState = toState;
        this.lastTransitionAt = timestamp;
        if (toState === 'STARTING' || (toState === 'INITIALIZING' && !this.startTime)) {
            this.startTime = timestamp;
        }

        const entry = {
            id: `trans_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            fromState,
            toState,
            reason,
            actor,
            timestamp,
            metadata
        };

        this.history.unshift(entry);
        if (this.history.length > this.maxHistorySize) {
            this.history.pop();
        }
        return entry;
    }

    setSubsystemState(name, status, details = {}) {
        this.subsystems.set(name, {
            name,
            status,
            updatedAt: new Date().toISOString(),
            details
        });
    }

    getSubsystems() {
        return Array.from(this.subsystems.values());
    }

    getHistory(limit = 50) {
        return this.history.slice(0, limit);
    }

    getUptimeSeconds() {
        if (!this.startTime) return 0;
        return Math.floor((Date.now() - new Date(this.startTime).getTime()) / 1000);
    }

    reset() {
        this.currentState = 'STOPPED';
        this.startTime = null;
        this.lastTransitionAt = null;
        this.history = [];
        this.subsystems.clear();
    }
}

module.exports = LifecycleStore;
