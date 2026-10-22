/**
 * Persistence Engine Test Suite
 * Tests memory and file persistence adapters, get/set/delete/list operations, secret redaction,
 * schema metadata, and application state restoration.
 */

const fs = require('fs');
const path = require('path');
const MemoryPersistenceAdapter = require('../src/persistence/MemoryPersistenceAdapter');
const FilePersistenceAdapter = require('../src/persistence/FilePersistenceAdapter');
const { PersistenceManager } = require('../src/persistence/PersistenceManager');

describe('Phase 15 — Persistence Engine Test Suite', () => {
    const testFilePath = path.join(__dirname, '..', 'data', 'test_persistence.json');

    afterEach(() => {
        if (fs.existsSync(testFilePath)) {
            try { fs.unlinkSync(testFilePath); } catch (_) {}
        }
    });

    test('1. MemoryPersistenceAdapter get, set, delete, list, clear operations', async () => {
        const adapter = new MemoryPersistenceAdapter();
        await adapter.set('agents', 'ag-01', { id: 'ag-01', name: 'Test Agent' });

        expect(await adapter.has('agents', 'ag-01')).toBe(true);
        const item = await adapter.get('agents', 'ag-01');
        expect(item.name).toBe('Test Agent');

        const list = await adapter.list('agents');
        expect(list.length).toBe(1);

        await adapter.delete('agents', 'ag-01');
        expect(await adapter.has('agents', 'ag-01')).toBe(false);

        await adapter.set('agents', 'ag-02', { id: 'ag-02' });
        await adapter.clear('agents');
        expect((await adapter.list('agents')).length).toBe(0);
    });

    test('2. FilePersistenceAdapter persists data and redacts secrets', async () => {
        const adapter = new FilePersistenceAdapter(testFilePath);
        await adapter.set('credentials', 'cred-01', {
            id: 'cred-01',
            username: 'admin',
            password: 'super-secret-password-123',
            apiKey: 'secret-key-xyz'
        });

        const stored = await adapter.get('credentials', 'cred-01');
        expect(stored.username).toBe('admin');
        expect(stored.password).toBe('[REDACTED]');
        expect(stored.apiKey).toBe('[REDACTED]');

        // Verify file contains redacted secrets
        const rawFile = fs.readFileSync(testFilePath, 'utf8');
        expect(rawFile).not.toContain('super-secret-password-123');
        expect(rawFile).toContain('[REDACTED]');
    });

    test('3. FilePersistenceAdapter handles missing or empty file gracefully', async () => {
        const adapter = new FilePersistenceAdapter(testFilePath);
        expect(await adapter.get('systems', 'sys-01')).toBeNull();
        expect((await adapter.list('systems')).length).toBe(0);
    });

    test('4. PersistenceManager export and import workflow', async () => {
        const pm = new PersistenceManager({ mode: 'memory' });
        await pm.set('systems', 'sys-10', { id: 'sys-10', name: 'System Ten' });

        const exported = await pm.export();
        expect(exported.schemaVersion).toBe('1.0.0');
        expect(exported.collections.systems).toBeDefined();

        const pm2 = new PersistenceManager({ mode: 'memory' });
        await pm2.import(exported);
        const restoredItem = await pm2.get('systems', 'sys-10');
        expect(restoredItem.name).toBe('System Ten');
    });
});
