/**
 * Backup Engine Tests
 * Tests backup creation, checksum integrity, secret redaction, tenant isolation, and restore validation.
 */

const { BackupService, redactSensitiveData } = require('../src/persistence/BackupService');

describe('Backup Engine', () => {
    let backupService;
    let mockPersistenceManager;
    let mockAuditLogService;
    let mockSseManager;

    beforeEach(() => {
        const fakeData = {
            collections: {
                systems: [{ id: 'sys1', name: 'System 1', apiKey: 'secret-key-123' }],
                agents: [{ id: 'agent1', name: 'Agent 1', password: 'my-super-secret-password' }]
            }
        };

        mockPersistenceManager = {
            export: jest.fn().mockResolvedValue(fakeData),
            import: jest.fn().mockResolvedValue(true),
            restoreApplicationState: jest.fn().mockResolvedValue({ success: true, restoredCollections: ['systems', 'agents'] })
        };
        mockAuditLogService = { logEvent: jest.fn() };
        mockSseManager = { broadcast: jest.fn() };

        backupService = new BackupService({
            persistenceManager: mockPersistenceManager,
            auditLogService: mockAuditLogService,
            sseManager: mockSseManager
        });
    });

    test('should redact sensitive keys from backup objects', () => {
        const obj = {
            id: 'test',
            apiKey: 'secret_value',
            password: 'secret_password',
            nested: { secret: 'top_secret', normal: 'visible' }
        };
        const redacted = redactSensitiveData(obj);
        expect(redacted.apiKey).toBe('[REDACTED]');
        expect(redacted.password).toBe('[REDACTED]');
        expect(redacted.nested.secret).toBe('[REDACTED]');
        expect(redacted.nested.normal).toBe('visible');
    });

    test('should create backup with valid schema version and integrity checksum', async () => {
        const backup = await backupService.createBackup('tenant-1', 'admin_user');

        expect(backup.id).toMatch(/^bkp_/);
        expect(backup.schemaVersion).toBe('1.0.0');
        expect(backup.tenantContext).toBe('tenant-1');
        expect(backup.createdBy).toBe('admin_user');
        expect(backup.checksum).toBeDefined();

        // Verify secrets in backup collections were redacted
        expect(backup.collections.systems[0].apiKey).toBe('[REDACTED]');
        expect(backup.collections.agents[0].password).toBe('[REDACTED]');

        expect(mockAuditLogService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'BACKUP_CREATED' }));
        expect(mockSseManager.broadcast).toHaveBeenCalledWith('BACKUP_CREATED', expect.any(Object));
    });

    test('should enforce tenant isolation when listing backups', async () => {
        await backupService.createBackup('tenant-A', 'admin_A');
        await backupService.createBackup('tenant-B', 'admin_B');
        await backupService.createBackup('global', 'system');

        const tenantABackups = backupService.listBackups('tenant-A');
        expect(tenantABackups.length).toBe(2); // tenant-A + global

        const tenantBBackups = backupService.listBackups('tenant-B');
        expect(tenantBBackups.length).toBe(2); // tenant-B + global
    });

    test('should validate backup integrity successfully', async () => {
        const backup = await backupService.createBackup('global', 'system');
        const validation = backupService.validateBackup(backup.id, 'global');

        expect(validation.valid).toBe(true);
        expect(validation.checksumValid).toBe(true);
        expect(validation.schemaCompatible).toBe(true);
        expect(validation.errors.length).toBe(0);
    });

    test('should fail validation and block restore for tampered or invalid backups', async () => {
        const backup = await backupService.createBackup('global', 'system');

        // Tamper with checksum directly in stored map
        const stored = backupService.backups.get(backup.id);
        stored.checksum = 'invalid_tampered_hash';

        const validation = backupService.validateBackup(backup.id, 'global');
        expect(validation.valid).toBe(false);
        expect(validation.checksumValid).toBe(false);

        // Attempting to restore must throw error
        await expect(backupService.restoreBackup(backup.id, null, 'global')).rejects.toThrow(/Cannot restore invalid backup/);
        expect(mockPersistenceManager.import).not.toHaveBeenCalled();
    });

    test('should restore valid backup state successfully', async () => {
        const backup = await backupService.createBackup('global', 'admin');
        const result = await backupService.restoreBackup(backup.id, {}, 'global', 'admin');

        expect(result.success).toBe(true);
        expect(mockPersistenceManager.import).toHaveBeenCalledWith({ collections: backup.collections });
        expect(mockAuditLogService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'BACKUP_RESTORED' }));
        expect(mockSseManager.broadcast).toHaveBeenCalledWith('BACKUP_RESTORED', expect.any(Object));
    });
});
