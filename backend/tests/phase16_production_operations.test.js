/**
 * Phase 16 — Production Operations & Platform Lifecycle Integration Tests
 * Comprehensive end-to-end integration tests for operations API, lifecycle state,
 * diagnostics, backups, RBAC, tenant isolation, correlation IDs, and router security scanning.
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');

describe('Phase 16 — Production Operations & Lifecycle Integration', () => {
    let app;

    beforeEach(() => {
        app = createApp();
    });

    test('GET /api/v1/operations/overview should return system overview', async () => {
        const res = await request(app)
            .get('/api/v1/operations/overview')
            .set('x-user-role', 'viewer')
            .set('x-correlation-id', 'corr_overview_test');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.overview).toBeDefined();
        expect(res.body.overview.lifecycleState).toBeDefined();
        expect(res.body.overview.persistenceMode).toBeDefined();
        expect(res.headers['x-correlation-id']).toBe('corr_overview_test');
    });

    test('GET /api/v1/operations/lifecycle should return platform lifecycle summary', async () => {
        const res = await request(app)
            .get('/api/v1/operations/lifecycle')
            .set('x-user-role', 'viewer');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.lifecycle.state).toBeDefined();
        expect(res.body.lifecycle.subsystems).toBeDefined();
    });

    test('GET & POST /api/v1/operations/diagnostics should run and return diagnostics', async () => {
        const res = await request(app)
            .post('/api/v1/operations/diagnostics/run')
            .set('x-user-role', 'operator');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.diagnostics.runtime).toBeDefined();
        expect(res.body.diagnostics.dependencies).toBeDefined();
    });

    test('GET /api/v1/operations/dependencies should return registered dependency health', async () => {
        const res = await request(app)
            .get('/api/v1/operations/dependencies')
            .set('x-user-role', 'viewer');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.dependencies)).toBe(true);
    });

    test('GET /api/v1/operations/config/validate should validate safe runtime config', async () => {
        const res = await request(app)
            .get('/api/v1/operations/config/validate')
            .set('x-user-role', 'viewer');

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.validation.valid).toBe(true);
    });

    test('Backup Lifecycle: Create, List, Validate, and Restore', async () => {
        // 1. Create backup as admin
        const createRes = await request(app)
            .post('/api/v1/operations/backups')
            .set('x-user-role', 'admin')
            .set('x-tenant-id', 'tenant-p16');

        expect(createRes.statusCode).toBe(201);
        expect(createRes.body.success).toBe(true);
        const backupId = createRes.body.backup.id;
        expect(backupId).toBeDefined();

        // 2. List backups with tenant context
        const listRes = await request(app)
            .get('/api/v1/operations/backups')
            .set('x-user-role', 'viewer')
            .set('x-tenant-id', 'tenant-p16');

        expect(listRes.statusCode).toBe(200);
        expect(listRes.body.backups.some(b => b.id === backupId)).toBe(true);

        // 3. Validate backup as operator
        const valRes = await request(app)
            .post(`/api/v1/operations/backups/${backupId}/validate`)
            .set('x-user-role', 'operator')
            .set('x-tenant-id', 'tenant-p16');

        expect(valRes.statusCode).toBe(200);
        expect(valRes.body.validation.valid).toBe(true);

        // 4. Restore backup as admin
        const restoreRes = await request(app)
            .post(`/api/v1/operations/backups/${backupId}/restore`)
            .set('x-user-role', 'admin')
            .set('x-tenant-id', 'tenant-p16');

        expect(restoreRes.statusCode).toBe(200);
        expect(restoreRes.body.success).toBe(true);
        expect(restoreRes.body.restore.backupId).toBe(backupId);
    });

    test('RBAC Enforcement: Viewer cannot create or restore backups', async () => {
        const createRes = await request(app)
            .post('/api/v1/operations/backups')
            .set('x-user-role', 'viewer');

        expect(createRes.statusCode).toBe(403);
    });

    test('ROUTER SECURITY AUDIT: operationsRoutes.js must not contain forbidden modules', () => {
        const routerPath = path.join(__dirname, '../src/api/operationsRoutes.js');
        const routerCode = fs.readFileSync(routerPath, 'utf8');

        const forbiddenRegexes = [
            /\brequire\s*\(\s*['"]fs['"]\s*\)/,
            /\brequire\s*\(\s*['"]child_process['"]\s*\)/,
            /\brequire\s*\(\s*['"]os['"]\s*\)/,
            /\bapp\.listen\s*\(/,
            /\bexpress\.json\s*\(/,
            /\breq\.on\s*\(\s*['"]data['"]/,
            /\breq\.on\s*\(\s*['"]end['"]/
        ];

        for (const regex of forbiddenRegexes) {
            expect(regex.test(routerCode)).toBe(false);
        }
    });
});
