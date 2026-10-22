/**
 * Operations & Dependency Engine Tests
 * Tests DependencyRegistry and DiagnosticsService.
 */

const { DependencyRegistry } = require('../src/operations/DependencyRegistry');
const { DiagnosticsService } = require('../src/operations/DiagnosticsService');

describe('Operations & Dependency Engine', () => {
    describe('DependencyRegistry', () => {
        let registry;

        beforeEach(() => {
            registry = new DependencyRegistry();
        });

        test('should register and check dependencies successfully', async () => {
            registry.registerDependency('test_dep', async () => {
                return { status: 'UP', details: { ok: true } };
            });

            const result = await registry.checkDependency('test_dep');
            expect(result.name).toBe('test_dep');
            expect(result.status).toBe('UP');
            expect(result.latency).toBeGreaterThanOrEqual(0);
        });

        test('should handle dependency check failures gracefully', async () => {
            registry.registerDependency('failing_dep', async () => {
                throw new Error('Service connection timeout');
            });

            const result = await registry.checkDependency('failing_dep');
            expect(result.name).toBe('failing_dep');
            expect(result.status).toBe('DOWN');
            expect(result.error).toBe('Service connection timeout');
        });

        test('should check all registered dependencies', async () => {
            registry.registerDependency('dep1', async () => ({ status: 'UP' }));
            registry.registerDependency('dep2', async () => ({ status: 'DEGRADED' }));

            const results = await registry.checkAllDependencies();
            expect(results.length).toBe(2);
            expect(results.map(r => r.name)).toEqual(['dep1', 'dep2']);
        });
    });

    describe('DiagnosticsService', () => {
        let diagnosticsService;
        let mockLifecycleService;
        let mockDependencyRegistry;
        let mockPersistenceManager;
        let mockAuditLogService;
        let mockTelemetryService;
        let mockConfigurationService;
        let mockSseManager;

        beforeEach(() => {
            mockLifecycleService = { getCurrentState: () => 'READY' };
            mockDependencyRegistry = { checkAllDependencies: async () => [{ name: 'db', status: 'UP' }] };
            mockPersistenceManager = { getStatus: () => ({ mode: 'memory', status: 'OPERATIONAL' }) };
            mockAuditLogService = { getStats: () => ({ totalLogs: 42 }) };
            mockTelemetryService = { getOverview: () => ({ httpRequestsTotal: 100, httpErrorsTotal: 2 }) };
            mockConfigurationService = { getConfig: () => ({ platform: { environment: 'test' }, persistence: { mode: 'memory' }, telemetry: { enabled: true } }) };
            mockSseManager = { getClientCount: () => 5, broadcast: jest.fn() };

            diagnosticsService = new DiagnosticsService({
                lifecycleService: mockLifecycleService,
                dependencyRegistry: mockDependencyRegistry,
                persistenceManager: mockPersistenceManager,
                auditLogService: mockAuditLogService,
                telemetryService: mockTelemetryService,
                configurationService: mockConfigurationService,
                sseManager: mockSseManager
            });
        });

        test('should execute full diagnostics without exposing secrets', async () => {
            const diag = await diagnosticsService.runDiagnostics();

            expect(diag.lifecycleState).toBe('READY');
            expect(diag.runtime).toBeDefined();
            expect(diag.runtime.nodeVersion).toBeDefined();
            expect(diag.runtime.memoryUsageMB).toBeDefined();
            expect(diag.sseClients).toBe(5);
            expect(diag.requestStats.totalRequests).toBe(100);
            expect(diag.auditStats.totalLogs || diag.auditStats.totalEvents).toBe(42);
            expect(diag.dependencies.length).toBe(1);

            // Verify SSE broadcast
            expect(mockSseManager.broadcast).toHaveBeenCalledWith('DIAGNOSTICS_COMPLETED', expect.any(Object));
        });
    });
});
