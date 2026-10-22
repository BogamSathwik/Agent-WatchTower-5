/**
 * Backup Service
 * Manages backup creation, validation, restoration, integrity verification, and secret redaction.
 */

const crypto = require('crypto');
const { defaultPersistenceManager } = require('./PersistenceManager');
const { auditLogService } = require('../audit/AuditLogService');
const { sseManager } = require('../events/SSEManager');

const SENSITIVE_KEYS = ['secret', 'apiKey', 'password', 'token', 'authorization', 'privateKey', 'credentials'];

function redactSensitiveData(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const copy = JSON.parse(JSON.stringify(obj));

    function clean(target) {
        if (!target || typeof target !== 'object') return;
        for (const key of Object.keys(target)) {
            if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
                target[key] = '[REDACTED]';
            } else if (typeof target[key] === 'object') {
                clean(target[key]);
            }
        }
    }
    clean(copy);
    return copy;
}

function calculateChecksum(payload) {
    const dataString = JSON.stringify(payload);
    return crypto.createHash('sha256').update(dataString).digest('hex');
}

class BackupService {
    constructor(options = {}) {
        this.persistenceManager = options.persistenceManager || defaultPersistenceManager;
        this.auditLogService = options.auditLogService || auditLogService;
        this.sseManager = options.sseManager || sseManager;
        this.backups = new Map();
        this.supportedSchemaVersion = '1.0.0';
    }

    async createBackup(tenantId = 'global', createdBy = 'system', correlationId = null) {
        const rawData = await this.persistenceManager.export();
        const collections = redactSensitiveData(rawData.collections || {});
        
        const backupId = `bkp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const createdAt = new Date().toISOString();

        const payload = {
            id: backupId,
            schemaVersion: this.supportedSchemaVersion,
            createdAt,
            tenantContext: tenantId,
            createdBy,
            collections
        };

        const checksum = calculateChecksum(payload);
        const backupRecord = {
            ...payload,
            checksum,
            itemCount: Object.values(collections).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0)
        };

        this.backups.set(backupId, backupRecord);

        // Audit log event
        if (this.auditLogService) {
            this.auditLogService.logEvent({
                eventType: 'BACKUP_CREATED',
                action: 'create_backup',
                actor: createdBy,
                role: 'admin',
                tenantId,
                resourceType: 'backup',
                resourceId: backupId,
                outcome: 'SUCCESS',
                severity: 'INFO',
                correlationId: correlationId || `corr_bkp_${Date.now()}`,
                metadata: { backupId, itemCount: backupRecord.itemCount, checksum }
            });
        }

        // SSE notification
        if (this.sseManager) {
            this.sseManager.broadcast('BACKUP_CREATED', {
                backupId,
                createdAt,
                tenantContext: tenantId,
                itemCount: backupRecord.itemCount
            });
        }

        return redactSensitiveData(backupRecord);
    }

    listBackups(tenantId = null) {
        let list = Array.from(this.backups.values());
        if (tenantId && tenantId !== 'global') {
            list = list.filter(b => b.tenantContext === tenantId || b.tenantContext === 'global');
        }
        return list.map(b => redactSensitiveData(b));
    }

    getBackup(backupId, tenantId = null) {
        const backup = this.backups.get(backupId);
        if (!backup) {
            const err = new Error(`Backup with ID '${backupId}' not found`);
            err.statusCode = 404;
            throw err;
        }
        if (tenantId && tenantId !== 'global' && backup.tenantContext !== tenantId && backup.tenantContext !== 'global') {
            const err = new Error(`Access denied to backup '${backupId}' for tenant '${tenantId}'`);
            err.statusCode = 403;
            throw err;
        }
        return redactSensitiveData(backup);
    }

    validateBackup(backupId, tenantId = null, correlationId = null) {
        const backup = this.getBackup(backupId, tenantId);
        
        const payload = {
            id: backup.id,
            schemaVersion: backup.schemaVersion,
            createdAt: backup.createdAt,
            tenantContext: backup.tenantContext,
            createdBy: backup.createdBy,
            collections: backup.collections
        };

        const expectedChecksum = calculateChecksum(payload);
        const checksumValid = expectedChecksum === backup.checksum;
        const schemaValid = backup.schemaVersion === this.supportedSchemaVersion;
        const isValid = checksumValid && schemaValid;

        const validationResult = {
            backupId,
            valid: isValid,
            schemaVersion: backup.schemaVersion,
            schemaCompatible: schemaValid,
            checksumValid,
            evaluatedAt: new Date().toISOString(),
            errors: []
        };

        if (!schemaValid) {
            validationResult.errors.push(`Incompatible schema version '${backup.schemaVersion}'. Expected '${this.supportedSchemaVersion}'.`);
        }
        if (!checksumValid) {
            validationResult.errors.push('Integrity checksum verification failed.');
        }

        // Audit log
        if (this.auditLogService) {
            this.auditLogService.logEvent({
                eventType: 'BACKUP_VALIDATED',
                action: 'validate_backup',
                actor: 'system',
                role: 'operator',
                tenantId: tenantId || 'global',
                resourceType: 'backup',
                resourceId: backupId,
                outcome: isValid ? 'SUCCESS' : 'FAILURE',
                severity: isValid ? 'INFO' : 'WARNING',
                correlationId: correlationId || `corr_val_${Date.now()}`,
                metadata: validationResult
            });
        }

        // SSE notification
        if (this.sseManager) {
            this.sseManager.broadcast('BACKUP_VALIDATED', {
                backupId,
                valid: isValid,
                errors: validationResult.errors
            });
        }

        return validationResult;
    }

    async restoreBackup(backupId, app = null, tenantId = null, restoredBy = 'system', correlationId = null) {
        const validation = this.validateBackup(backupId, tenantId, correlationId);
        if (!validation.valid) {
            const err = new Error(`Cannot restore invalid backup '${backupId}': ${validation.errors.join('; ')}`);
            err.statusCode = 400;
            err.code = 'BACKUP_VALIDATION_FAILED';
            throw err;
        }

        const backup = this.getBackup(backupId, tenantId);
        
        // Restore state in persistence manager
        await this.persistenceManager.import({ collections: backup.collections });

        // Restore application services if app provided
        let restorationSummary = null;
        if (app && typeof this.persistenceManager.restoreApplicationState === 'function') {
            restorationSummary = await this.persistenceManager.restoreApplicationState(app);
        }

        // Audit log
        if (this.auditLogService) {
            this.auditLogService.logEvent({
                eventType: 'BACKUP_RESTORED',
                action: 'restore_backup',
                actor: restoredBy,
                role: 'admin',
                tenantId: tenantId || 'global',
                resourceType: 'backup',
                resourceId: backupId,
                outcome: 'SUCCESS',
                severity: 'HIGH',
                correlationId: correlationId || `corr_rst_${Date.now()}`,
                metadata: { backupId, restoredCollections: Object.keys(backup.collections), restorationSummary }
            });
        }

        // SSE notification
        if (this.sseManager) {
            this.sseManager.broadcast('BACKUP_RESTORED', {
                backupId,
                restoredAt: new Date().toISOString(),
                restoredBy
            });
        }

        return {
            success: true,
            backupId,
            restoredAt: new Date().toISOString(),
            restorationSummary
        };
    }
}

const defaultBackupService = new BackupService();

module.exports = {
    BackupService,
    defaultBackupService,
    redactSensitiveData
};
