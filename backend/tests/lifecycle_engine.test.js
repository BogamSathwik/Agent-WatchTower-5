/**
 * Platform Lifecycle Engine Tests
 * Tests state machine, valid/invalid transitions, store recording, service events, and audit logging.
 */

const { PLATFORM_STATES, isValidPlatformState, isValidTransition } = require('../src/lifecycle/PlatformLifecycleState');
const LifecycleStore = require('../src/lifecycle/LifecycleStore');
const { PlatformLifecycleService } = require('../src/lifecycle/PlatformLifecycleService');

describe('Platform Lifecycle Engine', () => {
    let service;
    let mockSseManager;
    let mockAuditService;

    beforeEach(() => {
        mockSseManager = { broadcast: jest.fn() };
        mockAuditService = { logEvent: jest.fn() };
        service = new PlatformLifecycleService({
            store: new LifecycleStore(),
            sseManager: mockSseManager,
            auditLogService: mockAuditService
        });
    });

    test('should validate platform states correctly', () => {
        expect(isValidPlatformState('READY')).toBe(true);
        expect(isValidPlatformState('STARTING')).toBe(true);
        expect(isValidPlatformState('DEGRADED')).toBe(true);
        expect(isValidPlatformState('INVALID_STATE')).toBe(false);
    });

    test('should validate deterministic state transitions correctly', () => {
        expect(isValidTransition('STARTING', 'INITIALIZING')).toBe(true);
        expect(isValidTransition('INITIALIZING', 'READY')).toBe(true);
        expect(isValidTransition('READY', 'DEGRADED')).toBe(true);
        expect(isValidTransition('READY', 'DRAINING')).toBe(true);
        expect(isValidTransition('DRAINING', 'STOPPING')).toBe(true);
        expect(isValidTransition('STOPPING', 'STOPPED')).toBe(true);

        // Invalid transitions
        expect(isValidTransition('READY', 'STARTING')).toBe(false);
        expect(isValidTransition('STOPPED', 'READY')).toBe(false);
        expect(isValidTransition('INITIALIZING', 'DRAINING')).toBe(false);
    });

    test('should manage platform lifecycle state transitions and audit/SSE events', () => {
        expect(service.getCurrentState()).toBe('STOPPED');

        // STOPPED -> STARTING
        service.transitionTo('STARTING', 'Server boot initiated');
        expect(service.getCurrentState()).toBe('STARTING');
        expect(mockSseManager.broadcast).toHaveBeenCalledWith('PLATFORM_STARTING', expect.any(Object));
        expect(mockAuditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'LIFECYCLE_TRANSITION',
            action: 'transition_to_starting'
        }));

        // STARTING -> INITIALIZING
        service.transitionTo('INITIALIZING', 'Subsystems initializing');
        expect(service.getCurrentState()).toBe('INITIALIZING');

        // INITIALIZING -> READY
        service.transitionTo('READY', 'Platform fully initialized');
        expect(service.getCurrentState()).toBe('READY');

        // Verify summary
        const summary = service.getSummary();
        expect(summary.state).toBe('READY');
        expect(summary.recentHistory.length).toBe(3);
    });

    test('should throw error on invalid state transition', () => {
        expect(() => {
            service.transitionTo('READY', 'Bypassing initialization');
        }).toThrow(/Invalid platform lifecycle transition/);
    });

    test('should track subsystem statuses', () => {
        service.setSubsystemStatus('persistence', 'PASS', { mode: 'memory' });
        service.setSubsystemStatus('telemetry', 'PASS', { enabled: true });

        const subsystems = service.getSubsystems();
        expect(subsystems.length).toBe(2);
        expect(subsystems.find(s => s.name === 'persistence').status).toBe('PASS');
    });
});
