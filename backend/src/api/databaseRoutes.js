/**
 * Existing-Database Read-Only API Routes
 *
 * Exposes the pre-existing MySQL database (configured via .env) through safe,
 * read-only endpoints. No raw SQL is accepted or executed; table names are
 * validated against the discovered allow-list and all values are parameterized.
 *
 * - GET /api/v1/database/status
 * - GET /api/v1/database/tables
 * - GET /api/v1/database/tables/:table/columns
 * - GET /api/v1/database/tables/:table/rows?limit=&offset=&orderBy=&orderDir=
 *   (any additional query param is treated as an equality filter on a known
 *   column and is parameterized)
 */

const express = require('express');
const { defaultPersistenceManager } = require('../persistence/PersistenceManager');
const { requireRole, ROLES } = require('../middleware/authMiddleware');

function sanitizeDbError(err) {
    const message = (err && err.message) || 'Database read failed';
    const code = (err && err.code) || undefined;
    return { message, ...(code ? { code } : {}) };
}

function createDatabaseRouter(persistenceManager = defaultPersistenceManager) {
    const router = express.Router();

    // GET /api/v1/database/status
    router.get('/api/v1/database/status', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), async (req, res, next) => {
        try {
            const status = persistenceManager.getStatus();
            res.json({
                success: true,
                database: status.database || { provider: persistenceManager.mode, connected: null }
            });
        } catch (err) {
            next(err);
        }
    });

    // GET /api/v1/database/tables
    router.get('/api/v1/database/tables', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), async (req, res) => {
        try {
            const tables = await persistenceManager.listDatabaseTables();
            res.json({ success: true, tables, count: tables.length });
        } catch (err) {
            res.status(503).json({ success: false, error: sanitizeDbError(err), code: 'DATABASE_READ_ERROR' });
        }
    });

    // GET /api/v1/database/tables/:table/columns
    router.get('/api/v1/database/tables/:table/columns', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), async (req, res) => {
        try {
            const columns = await persistenceManager.describeDatabaseTable(req.params.table);
            res.json({ success: true, table: req.params.table, columns, count: columns.length });
        } catch (err) {
            res.status(400).json({ success: false, error: sanitizeDbError(err), code: 'DATABASE_READ_ERROR' });
        }
    });

    // GET /api/v1/database/tables/:table/rows
    router.get('/api/v1/database/tables/:table/rows', requireRole([ROLES.VIEWER, ROLES.OPERATOR, ROLES.ADMIN]), async (req, res) => {
        try {
            const { limit, offset, orderBy, orderDir, ...rest } = req.query || {};
            const filters = {};
            for (const [k, v] of Object.entries(rest)) {
                if (typeof v === 'string' && v.length <= 256) filters[k] = v;
            }
            const rows = await persistenceManager.queryDatabaseTable(req.params.table, {
                limit: limit !== undefined ? Number(limit) : undefined,
                offset: offset !== undefined ? Number(offset) : undefined,
                orderBy: orderBy || undefined,
                orderDir: orderDir || undefined,
                filters
            });
            let total = null;
            try {
                if (Object.keys(filters).length === 0) {
                    total = await persistenceManager.countDatabaseRows(req.params.table);
                }
            } catch (_) {}
            res.json({ success: true, table: req.params.table, rows, count: rows.length, ...(total !== null ? { total } : {}) });
        } catch (err) {
            res.status(400).json({ success: false, error: sanitizeDbError(err), code: 'DATABASE_READ_ERROR' });
        }
    });

    return router;
}

module.exports = {
    createDatabaseRouter
};
