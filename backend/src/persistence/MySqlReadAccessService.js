/**
 * MySQL Read-Only Access Service
 *
 * Agent-5 treats MySQL as an EXISTING DATABASE DATA SOURCE, not as an
 * application persistence database.
 *
 * Strict guarantees:
 * - Credentials come ONLY from process.env (DB_HOST, DB_USER, DB_PASSWORD,
 *   DB_PORT, DB_DATABASE). Nothing is hardcoded, logged, or thrown to clients.
 * - Initialization performs READ-ONLY verification only:
 *     ping -> SELECT 1 -> SELECT DATABASE() -> SHOW TABLES (discovery).
 *   It NEVER executes CREATE TABLE, ALTER TABLE, DROP TABLE, INSERT, UPDATE,
 *   DELETE, TRUNCATE, or any other write/DDL statement.
 * - All value SQL is parameterized (mysql2 execute with placeholders).
 * - Dynamic table/column identifiers are validated against a strict allow-list:
 *   (a) identifier pattern ^[A-Za-z0-9_]{1,64}$ and
 *   (b) membership in the discovered table list / INFORMATION_SCHEMA columns.
 *   Arbitrary user input is NEVER concatenated into SQL identifiers.
 * - No raw-SQL execution API is exposed.
 * - Errors are sanitized (host/user redacted, password never included).
 *
 * Read-only metadata discovery uses:
 * - SHOW TABLES (initialization discovery only)
 * - INFORMATION_SCHEMA.TABLES / INFORMATION_SCHEMA.COLUMNS (parameterized)
 */

const TABLE_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
const COLUMN_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
const MAX_LIMIT = 5000;
const DEFAULT_LIMIT = 20;

function readMysqlConfig(overrides = {}) {
    return {
        host: overrides.host || process.env.DB_HOST || '',
        user: overrides.user || process.env.DB_USER || '',
        password: overrides.password !== undefined ? overrides.password : (process.env.DB_PASSWORD || ''),
        database: overrides.database || process.env.DB_DATABASE || '',
        port: Number(overrides.port || process.env.DB_PORT || 3306)
    };
}

function assertMysqlConfigured(cfg) {
    const missing = [];
    if (!cfg.host) missing.push('DB_HOST');
    if (!cfg.user) missing.push('DB_USER');
    if (!cfg.password) missing.push('DB_PASSWORD');
    if (!cfg.database) missing.push('DB_DATABASE');
    if (missing.length > 0) {
        throw new Error(
            `MySQL read access is not configured: missing ${missing.join(', ')}. ` +
            `Set them in the environment (or .env) to enable database read access.`
        );
    }
    if (!Number.isInteger(cfg.port) || cfg.port <= 0 || cfg.port > 65535) {
        throw new Error('MySQL read access misconfigured: invalid DB_PORT.');
    }
}

class MySqlReadAccessService {
    constructor(options = {}) {
        this.config = readMysqlConfig(options);
        assertMysqlConfigured(this.config);
        // Pool is created lazily so requiring this module never opens a connection.
        this.pool = null;
        this.initPromise = null;
        this.connected = false;
        this.lastErrorCode = null;
        this.lastErrorAt = null;
        this.databaseName = this.config.database;
        this.cachedTables = null;
    }

    _getPool() {
        if (this.pool) return this.pool;
        let mysql;
        try {
            mysql = require('mysql2/promise');
        } catch (err) {
            throw new Error('MySQL read access requires the "mysql2" dependency. Run: npm install mysql2');
        }
        this.pool = mysql.createPool({
            host: this.config.host,
            port: this.config.port,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 200,
            connectTimeout: 5000,
            charset: 'utf8mb4'
        });
        return this.pool;
    }

    _recordFailure(err) {
        this.connected = false;
        this.lastErrorCode = (err && err.code) || 'UNKNOWN';
        this.lastErrorAt = new Date().toISOString();
    }

    _sanitizedError(err, what) {
        let message = (err && err.message) || 'Unknown database error';
        // Defensive redaction: mysql2 errors do not include the password, but
        // host/user are redacted so no credential-adjacent material leaks.
        try {
            if (this.config.host) message = message.split(this.config.host).join('***');
            if (this.config.user) message = message.split(this.config.user).join('***');
        } catch (_) {}
        const code = (err && err.code) || 'UNKNOWN';
        return new Error(`MySQL read access ${what} failed [${code}]: ${message}`);
    }

    /**
     * Read-only initialization. Verifies:
     * 1. host reachable + credentials valid (getConnection + ping)
     * 2. database selectable (SELECT DATABASE())
     * 3. simple read query succeeds (SELECT 1)
     * 4. existing tables discoverable (SHOW TABLES — inspection only)
     *
     * Executes ZERO write/DDL statements.
     */
    async initialize() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            const pool = this._getPool();
            let conn = null;
            try {
                conn = await pool.getConnection();
                await conn.ping();
                // Simple read-only query.
                await conn.query('SELECT 1 AS ok');
                // Verify the configured database can be selected.
                const [dbRows] = await conn.query('SELECT DATABASE() AS `db`');
                const selectedDb = dbRows && dbRows[0] ? dbRows[0].db : null;
                // Read-only discovery of existing tables (inspection only).
                const [tableRows] = await conn.query('SHOW TABLES');
                const tables = [];
                for (const row of tableRows || []) {
                    const vals = Object.values(row || {});
                    if (vals.length > 0 && typeof vals[0] === 'string') tables.push(vals[0]);
                }
                this.cachedTables = tables;
                this.connected = true;
                this.lastErrorCode = null;
                this.databaseName = selectedDb || this.config.database;
                return {
                    connected: true,
                    database: this.databaseName,
                    tableCount: tables.length,
                    schemaModification: 'none'
                };
            } catch (err) {
                this._recordFailure(err);
                this.initPromise = null;
                throw this._sanitizedError(err, 'initialization');
            } finally {
                if (conn) {
                    try { conn.release(); } catch (_) {}
                }
            }
        })();
        return this.initPromise;
    }

    async _executeReadOnly(sql, params) {
        await this.initialize();
        const pool = this._getPool();
        try {
            const [rows] = await pool.execute(sql, params);
            this.connected = true;
            return rows;
        } catch (err) {
            this._recordFailure(err);
            // On connection-level failures, allow next call to re-verify.
            if (err && (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT')) {
                this.initPromise = null;
                this.cachedTables = null;
            }
            throw this._sanitizedError(err, 'query');
        }
    }

    _assertValidTableName(table) {
        if (typeof table !== 'string' || !TABLE_NAME_PATTERN.test(table)) {
            throw new Error('Invalid table name.');
        }
    }

    async _assertAllowedTable(table) {
        this._assertValidTableName(table);
        const tables = await this.listTables();
        if (!tables.includes(table)) {
            throw new Error(`Table "${table}" is not in the allowed existing-table list.`);
        }
    }

    /**
     * List existing tables in the configured database.
     * Parameterized INFORMATION_SCHEMA query (read-only).
     */
    async listTables() {
        const rows = await this._executeReadOnly(
            'SELECT TABLE_NAME AS `name` FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME ASC',
            [this.config.database]
        );
        const tables = (rows || []).map(r => String(r.name)).filter(n => TABLE_NAME_PATTERN.test(n));
        this.cachedTables = tables;
        return tables.slice();
    }

    /**
     * Inspect existing table columns (read-only, parameterized).
     */
    async describeTable(table) {
        await this._assertAllowedTable(table);
        const rows = await this._executeReadOnly(
            'SELECT COLUMN_NAME AS `name`, COLUMN_TYPE AS `columnType`, DATA_TYPE AS `dataType`, ' +
            'IS_NULLABLE AS `isNullable`, COLUMN_KEY AS `columnKey`, EXTRA AS `extra` ' +
            'FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION ASC',
            [this.config.database, table]
        );
        return (rows || []).map(r => ({
            name: String(r.name),
            columnType: r.columnType != null ? String(r.columnType) : null,
            dataType: r.dataType != null ? String(r.dataType) : null,
            isNullable: r.isNullable != null ? String(r.isNullable) : null,
            columnKey: r.columnKey != null ? String(r.columnKey) : null,
            extra: r.extra != null ? String(r.extra) : null
        }));
    }

    _normalizeLimit(limit) {
        const n = Number(limit);
        if (!Number.isInteger(n) || n <= 0) return DEFAULT_LIMIT;
        return Math.min(n, MAX_LIMIT);
    }

    _normalizeOffset(offset) {
        const n = Number(offset);
        if (!Number.isInteger(n) || n < 0) return 0;
        return Math.min(n, 1000000);
    }

    /**
     * Count existing records in an allowed table (read-only).
     * Table identifier comes ONLY from the allow-list.
     */
    async countRows(table) {
        await this._assertAllowedTable(table);
        const rows = await this._executeReadOnly(`SELECT COUNT(*) AS \`count\` FROM \`${table}\``, []);
        const n = rows && rows[0] ? Number(rows[0].count) : 0;
        return Number.isFinite(n) ? n : 0;
    }

    /**
     * Query existing records using parameterized SQL.
     * - table: must be in discovered allow-list.
     * - columns: optional subset; each validated against INFORMATION_SCHEMA.
     * - filters: optional { col: value } equality map; keys validated, values parameterized.
     * - orderBy/orderDir: validated against columns; dir ASC/DESC only.
     * - limit/offset: clamped.
     */
    async queryTable(table, options = {}) {
        await this._assertAllowedTable(table);
        const columnsInfo = await this.describeTable(table);
        const allowedColumns = new Set(columnsInfo.map(c => c.name));

        let selectCols = ['*'];
        if (Array.isArray(options.columns) && options.columns.length > 0) {
            selectCols = [];
            for (const col of options.columns) {
                if (typeof col !== 'string' || !COLUMN_NAME_PATTERN.test(col) || !allowedColumns.has(col)) {
                    throw new Error(`Invalid or unknown column "${col}" for table "${table}".`);
                }
                selectCols.push(`\`${col}\``);
            }
        }

        const filters = options.filters && typeof options.filters === 'object' ? options.filters : {};
        const whereClauses = [];
        const params = [];
        for (const [col, val] of Object.entries(filters)) {
            if (!COLUMN_NAME_PATTERN.test(col) || !allowedColumns.has(col)) {
                throw new Error(`Invalid or unknown filter column "${col}" for table "${table}".`);
            }
            if (val === null || val === undefined) {
                whereClauses.push(`\`${col}\` IS NULL`);
            } else {
                whereClauses.push(`\`${col}\` = ?`);
                params.push(val);
            }
        }

        let orderClause = '';
        if (options.orderBy) {
            if (typeof options.orderBy !== 'string' || !COLUMN_NAME_PATTERN.test(options.orderBy) || !allowedColumns.has(options.orderBy)) {
                throw new Error(`Invalid orderBy column "${options.orderBy}" for table "${table}".`);
            }
            const dir = String(options.orderDir || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            orderClause = ` ORDER BY \`${options.orderBy}\` ${dir}`;
        }

        const limit = this._normalizeLimit(options.limit !== undefined ? options.limit : DEFAULT_LIMIT);
        const offset = this._normalizeOffset(options.offset !== undefined ? options.offset : 0);

        const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
        const sql = `SELECT ${selectCols.join(', ')} FROM \`${table}\`${whereSql}${orderClause} LIMIT ${limit} OFFSET ${offset}`;
        // LIMIT/OFFSET are embedded as validated integers (not user strings);
        // all filter values remain parameterized placeholders.
        const rows = await this._executeReadOnly(sql, params);
        return Array.isArray(rows) ? rows : [];
    }

    getStatus() {
        return {
            provider: 'mysql',
            database: this.config.database,
            selectedDatabase: this.databaseName || null,
            connected: this.connected === true,
            readOnly: true,
            schemaModification: 'none',
            tableCount: Array.isArray(this.cachedTables) ? this.cachedTables.length : null,
            lastErrorCode: this.connected === true ? null : (this.lastErrorCode || 'UNAVAILABLE'),
            lastErrorAt: this.lastErrorAt || null
        };
    }

    async close() {
        if (this.pool) {
            const pool = this.pool;
            this.pool = null;
            this.initPromise = null;
            this.cachedTables = null;
            try { await pool.end(); } catch (_) {}
        }
    }
}

module.exports = MySqlReadAccessService;
