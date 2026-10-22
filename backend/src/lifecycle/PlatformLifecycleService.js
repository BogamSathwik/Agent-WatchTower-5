/**
 * Platform Lifecycle Service
 * Manages platform lifecycle state transitions, events, SSE broadcasts, and audit logging.
 */

const EventEmitter = require('events');
const { PLATFORM_STATES, isValidTransition } = require('./PlatformLifecycleState');
const LifecycleStore = require('./LifecycleStore');
const { sseManager } = require('../events/SSEManager');
const { auditLogService } = require('../audit/AuditLogService');

class PlatformLifecycleService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.store = options.store || new LifecycleStore();
        this.sseManager = options.sseManager || sseManager;
        this.auditLogService = options.auditLogService || auditLogService;
    }

    getCurrentState() {
        return this.store.getState();
    }

    getHistory(limit) {
        return this.store.getHistory(limit);
    }

    getUptimeSeconds() {
        return this.store.getUptimeSeconds();
    }

    setSubsystemStatus(name, status, details) {
        this.store.setSubsystemState(name, status, details);
    }

    getSubsystems() {
        return this.store.getSubsystems();
    }

    transitionTo(newState, reason = '', actor = 'system', metadata = {}, correlationId = null) {
        const currentState = this.getCurrentState();
        if (!isValidTransition(currentState, newState)) {
            const err = new Error(`Invalid platform lifecycle transition from '${currentState}' to '${newState}'`);
            err.statusCode = 400;
            err.code = 'INVALID_LIFECYCLE_TRANSITION';
            throw err;
        }

        const entry = this.store.recordTransition(currentState, newState, reason, actor, metadata);

        // Audit log event
        if (this.auditLogService && typeof this.auditLogService.logEvent === 'function') {
            this.auditLogService.logEvent({
                eventType: 'LIFECYCLE_TRANSITION',
                action: `transition_to_${newState.toLowerCase()}`,
                actor,
                role: 'admin',
                tenantId: metadata.tenantId || 'global',
                resourceType: 'platform_lifecycle',
                resourceId: 'platform',
                outcome: 'SUCCESS',
                severity: newState === 'FAILED' ? 'HIGH' : 'INFO',
                correlationId: correlationId || `corr_lifecycle_${Date.now()}`,
                metadata: { fromState: currentState, toState: newState, reason, ...metadata }
            });
        }

        // Broadcast SSE event
        if (this.sseManager && typeof this.sseManager.broadcast === 'function') {
            const sseEventName = `PLATFORM_${newState}`;
            this.sseManager.broadcast(sseEventName, {
                fromState: currentState,
                toState: newState,
                reason,
                timestamp: entry.timestamp
            });
        }

        this.emit('stateChange', { currentState, newState, entry });
        return entry;
    }

    getSummary() {
        return {
            state: this.getCurrentState(),
            uptimeSeconds: this.getUptimeSeconds(),
            startTime: this.store.startTime,
            lastTransitionAt: this.store.lastTransitionAt,
            subsystems: this.getSubsystems(),
            recentHistory: this.getHistory(5)
        };
    }

    reset() {
        this.store.reset();
    }
}

const defaultPlatformLifecycleService = new PlatformLifecycleService();

module.exports = {
    PlatformLifecycleService,
    defaultPlatformLifecycleService
};
