/**
 * Shutdown Engine Tests
 * Tests ShutdownCoordinator graceful shutdown sequence, cleanup task execution, and duplicate call prevention.
 */

const { ShutdownCoordinator } = require('../src/lifecycle/ShutdownCoordinator');

describe('Shutdown Engine', () => {
    let shutdownCoordinator;
    let mockLifecycleService;
    let mockSseManager;
    let mockAuditLogService;
    let mockPersistenceManager;

    beforeEach(() => {
        let state = 'READY';
        mockLifecycleService = {
            getCurrentState: jest.fn(() => state),
            transitionTo: jest.fn((newState) => { state = newState; })
        };
        mockSseManager = { close: jest.fn() };
        mockAuditLogService = { logEvent: jest.fn() };
        mockPersistenceManager = { export: jest.fn().mockResolvedValue({}) };

        shutdownCoordinator = new ShutdownCoordinator({
            lifecycleService: mockLifecycleService,
            sseManager: mockSseManager,
            auditLogService: mockAuditLogService,
            persistenceManager: mockPersistenceManager
        });
    });

    test('should execute graceful shutdown sequence', async () => {
        const mockTask = jest.fn().mockResolvedValue(true);
        shutdownCoordinator.registerCleanupTask(mockTask);

        const result = await shutdownCoordinator.initiateShutdown('Test shutdown request');

        expect(result.success).toBe(true);
        expect(mockLifecycleService.transitionTo).toHaveBeenCalledWith('DRAINING', 'Test shutdown request');
        expect(mockLifecycleService.transitionTo).toHaveBeenCalledWith('STOPPING', 'Test shutdown request');
        expect(mockLifecycleService.transitionTo).toHaveBeenCalledWith('STOPPED', 'Graceful shutdown completed');
        expect(mockTask).toHaveBeenCalled();
        expect(mockSseManager.close).toHaveBeenCalled();
        expect(mockPersistenceManager.export).toHaveBeenCalled();
        expect(mockAuditLogService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'SHUTDOWN_EVENT' }));
    });

    test('should prevent duplicate shutdown execution', async () => {
        shutdownCoordinator.isShuttingDown = true;
        const result = await shutdownCoordinator.initiateShutdown('Repeated shutdown request');

        expect(result.success).toBe(true);
        expect(result.message).toBe('Shutdown already in progress');
        expect(mockLifecycleService.transitionTo).not.toHaveBeenCalled();
    });
});
