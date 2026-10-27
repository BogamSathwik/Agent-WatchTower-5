/**
 * AgentDataStore — Application state backed by the EXISTING `agent_data` table.
 *
 * HARD CONSTRAINT (user requirement): NEVER create / alter / drop / truncate
 * any table in `nrkindex_trn`. This store issues ONLY:
 *   SELECT, INSERT, UPDATE  (parameterized via mysql2 execute/placeholders)
 * against the pre-existing `agent_data` table. No DDL of any kind.
 *
 * Existing table shape (verified 2026-10-05, 38 rows):
 *   id INT AUTO_INCREMENT PK,
 *   userid INT NOT NULL, firmid INT NOT NULL DEFAULT 5,
 *   name VARCHAR(255), agent_id VARCHAR(100) NOT NULL,
 *   collection VARCHAR(100) NOT NULL, data JSON NOT NULL,
 *   created_at / updated_at TIMESTAMP
 *   KEY idx_agent_lookup (userid, firmid, agent_id, collection)
 * Grants for the app user: SELECT, INSERT, UPDATE only (NO DELETE, NO CREATE).
 *
 * Namespacing (avoids collisions with other agents' rows sharing this table):
 *   userid = 0, firmid = 5, name = 'AgentWatchtower'
 *   collection column = 'wt_' + <app collection>   (e.g. app 'agents' -> 'wt_agents')
 *   agent_id column  = <app key> (truncated/hashed if > 100 chars)
 *   data column (JSON envelope) = { key, collection, value, updatedAt }
 * A soft-delete tombstone envelope ({ ..., value: null, __deleted: true }) is
 * used for delete()/clear() because the DB grant has NO DELETE privilege.
 * All reads filter out tombstones, so callers observe normal Map semantics.
 */

const crypto = require('crypto');

const TABLE = process.env.STORE_TABLE || 'agent_data';
const STORE_USER_ID = process.env.STORE_USER_ID !== undefined ? parseInt(process.env.STORE_USER_ID, 10) : 0;
const STORE_FIRM_ID = process.env.STORE_FIRM_ID !== undefined ? parseInt(process.env.STORE_FIRM_ID, 10) : 5;
const STORE_NAME = process.env.STORE_NAME || 'AgentWatchtower';
const COLLECTION_PREFIX = process.env.STORE_COLLECTION_PREFIX || 'wt_';
const AGENT_ID_MAX_LEN = 100;
const COLLECTION_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

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
            `AgentDataStore is not configured: missing ${missing.join(', ')}. ` +
            `Set them in the environment (or .env).`
        );
    }
    if (!Number.isInteger(cfg.port) || cfg.port <= 0 || cfg.port > 65535) {
        throw new Error('AgentDataStore misconfigured: invalid DB_PORT.');
    }
}

function deepClone(value) {
    if (value === undefined) return null;
    return JSON.parse(JSON.stringify(value));
}

function toNamespacedCollection(collection) {
    if (typeof collection !== 'string' || !COLLECTION_PATTERN.test(collection)) {
        throw new Error(`Invalid collection name "${collection}".`);
    }
    const namespaced = `${COLLECTION_PREFIX}${collection}`;
    if (namespaced.length > 100) {
        throw new Error(`Namespaced collection name too long for "${collection}".`);
    }
    return namespaced;
}

function fromNamespacedCollection(namespaced) {
    if (typeof namespaced === 'string' && namespaced.startsWith(COLLECTION_PREFIX)) {
        return namespaced.slice(COLLECTION_PREFIX.length);
    }
    return namespaced;
}

function toAgentId(key) {
    const s = String(key == null ? '' : key);
    if (!s) throw new Error('Persistence key must be a non-empty string.');
    if (s.length <= AGENT_ID_MAX_LEN) return s;
    const hash = crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
    return `h_${hash}_${s.slice(0, AGENT_ID_MAX_LEN - 40)}`;
}

function parseEnvelope(raw) {
    try {
        if (raw && typeof raw === 'object') return raw;
        if (typeof raw === 'string') return JSON.parse(raw);
    } catch (_) {
        return null;
    }
    return null;
}

function isTombstone(envelope) {
    return Boolean(envelope && envelope.__deleted === true);
}

class AgentDataStore {
    constructor(options = {}) {
        this.config = readMysqlConfig(options);
        assertMysqlConfigured(this.config);
        this.pool = null;
        this.table = TABLE;
        this._listCache = new Map();
        this._listCacheTime = new Map();
        this._listCacheTtlMs = 30000;
    }

    _getPool() {
        if (this.pool) return this.pool;
        let mysql;
        try {
            mysql = require('mysql2/promise');
        } catch (err) {
            throw new Error('AgentDataStore requires the "mysql2" dependency. Run: npm install mysql2');
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

    _sanitizedError(err, what) {
        let message = (err && err.message) || 'Unknown database error';
        try {
            if (this.config.host) message = message.split(this.config.host).join('***');
            if (this.config.user) message = message.split(this.config.user).join('***');
        } catch (_) {}
        const code = (err && err.code) || 'UNKNOWN';
        return new Error(`AgentDataStore ${what} failed [${code}]: ${message}`);
    }

    /**
     * Read-only verification: ping + SELECT 1 + SELECT DATABASE() +
     * SELECT one row from the existing agent_data table (inspection only).
     * Issues ZERO writes and ZERO DDL.
     */
    async initialize() {
        const pool = this._getPool();
        let conn = null;
        try {
            conn = await pool.getConnection();
            await conn.ping();
            await conn.query('SELECT 1 AS ok');
            const [dbRows] = await conn.query('SELECT DATABASE() AS `db`');
            const selectedDb = dbRows && dbRows[0] ? dbRows[0].db : null;
            await conn.query(
                'SELECT `id` FROM `agent_data` LIMIT 1'
            );
            return {
                connected: true,
                database: selectedDb || this.config.database,
                table: this.table,
                schemaModification: 'none'
            };
        } catch (err) {
            throw this._sanitizedError(err, 'initialization');
        } finally {
            if (conn) {
                try { conn.release(); } catch (_) {}
            }
        }
    }

    async get(collection, key) {
        const nsCollection = toNamespacedCollection(collection);
        const agentId = toAgentId(key);
        const pool = this._getPool();
        try {
            const [rows] = await pool.execute(
                'SELECT `data` FROM `agent_data` WHERE `userid` = ? AND `firmid` = ? AND `name` = ? AND `collection` = ? AND `agent_id` = ? LIMIT 1',
                [STORE_USER_ID, STORE_FIRM_ID, STORE_NAME, nsCollection, agentId]
            );
            if (!rows || rows.length === 0) return null;
            const envelope = parseEnvelope(rows[0].data);
            if (!envelope || isTombstone(envelope)) return null;
            return deepClone(envelope.value !== undefined ? envelope.value : null);
        } catch (err) {
            throw this._sanitizedError(err, 'get');
        }
    }

    async set(collection, key, value) {
        const nsCollection = toNamespacedCollection(collection);
        const agentId = toAgentId(key);
        const storedValue = deepClone(value);
        const envelope = {
            key: String(key),
            collection: String(collection),
            value: storedValue,
            updatedAt: new Date().toISOString()
        };
        const envelopeJson = JSON.stringify(envelope);
        const pool = this._getPool();
        try {
            const [existing] = await pool.execute(
                'SELECT `id` FROM `agent_data` WHERE `userid` = ? AND `firmid` = ? AND `name` = ? AND `collection` = ? AND `agent_id` = ? LIMIT 1',
                [STORE_USER_ID, STORE_FIRM_ID, STORE_NAME, nsCollection, agentId]
            );
            if (existing && existing.length > 0) {
                await pool.execute(
                    'UPDATE `agent_data` SET `data` = CAST(? AS JSON) WHERE `id` = ?',
                    [envelopeJson, existing[0].id]
                );
            } else {
                await pool.execute(
                    'INSERT INTO `agent_data` (`userid`, `firmid`, `name`, `agent_id`, `collection`, `data`) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))',
                    [STORE_USER_ID, STORE_FIRM_ID, STORE_NAME, agentId, nsCollection, envelopeJson]
                );
            }
            this._listCache.delete(nsCollection);
            return deepClone(storedValue);
        } catch (err) {
            throw this._sanitizedError(err, 'set');
        }
    }

    async has(collection, key) {
        const value = await this.get(collection, key);
        return value !== null;
    }

    /**
     * Soft delete via UPDATE (tombstone) — the DB grant has NO DELETE
     * privilege, so a real DELETE would fail with ER_TABLEACCESS_DENIED_ERROR.
     */
    async delete(collection, key) {
        const nsCollection = toNamespacedCollection(collection);
        const agentId = toAgentId(key);
        const pool = this._getPool();
        try {
            const [existing] = await pool.execute(
                'SELECT `id` FROM `agent_data` WHERE `userid` = ? AND `firmid` = ? AND `name` = ? AND `collection` = ? AND `agent_id` = ? LIMIT 1',
                [STORE_USER_ID, STORE_FIRM_ID, STORE_NAME, nsCollection, agentId]
            );
            if (!existing || existing.length === 0) return false;
            const tombstone = JSON.stringify({
                key: String(key),
                collection: String(collection),
                value: null,
                __deleted: true,
                updatedAt: new Date().toISOString()
            });
            await pool.execute(
                'UPDATE `agent_data` SET `data` = CAST(? AS JSON) WHERE `id` = ?',
                [tombstone, existing[0].id]
            );
            this._listCache.delete(nsCollection);
            return true;
        } catch (err) {
            throw this._sanitizedError(err, 'delete');
        }
    }

    async list(collection) {
        const nsCollection = toNamespacedCollection(collection);
        const now = Date.now();
        const cached = this._listCache.get(nsCollection);
        const cachedTime = this._listCacheTime.get(nsCollection) || 0;
        if (cached && (now - cachedTime < this._listCacheTtlMs)) {
            return deepClone(cached);
        }
        const pool = this._getPool();
        try {
            const [rows] = await pool.execute(
                'SELECT `agent_id`, `data` FROM `agent_data` WHERE `userid` = ? AND `firmid` = ? AND `name` = ? AND `collection` = ?',
                [STORE_USER_ID, STORE_FIRM_ID, STORE_NAME, nsCollection]
            );
            const out = [];
            for (const row of rows || []) {
                const envelope = parseEnvelope(row.data);
                if (!envelope || isTombstone(envelope)) continue;
                out.push(envelope.value !== undefined ? envelope.value : null);
            }
            this._listCache.set(nsCollection, out);
            this._listCacheTime.set(nsCollection, now);
            return deepClone(out);
        } catch (err) {
            throw this._sanitizedError(err, 'list');
        }
    }

    /**
     * Soft clear via UPDATE tombstones (no DELETE privilege, no DDL).
     * With a collection: tombstones that collection's rows. Without: tombstones
     * every row in this store's 'wt_*' namespace (other agents' rows untouched).
     */
    async clear(collection) {
        this._listCache.clear();
        this._listCacheTime.clear();
        const pool = this._getPool();
        try {
            if (collection) {
                const nsCollection = toNamespacedCollection(collection);
                const [rows] = await pool.execute(
                    'SELECT `id`, `agent_id` FROM `agent_data` WHERE `userid` = ? AND `firmid` = ? AND `name` = ? AND `collection` = ?',
                    [STORE_USER_ID, STORE_FIRM_ID, STORE_NAME, nsCollection]
                );
                for (const row of rows || []) {
                    const tombstone = JSON.stringify({
                        key: String(row.agent_id),
                        collection: String(collection),
                        value: null,
                        __deleted: true,
                        updatedAt: new Date().toISOString()
                    });
                    await pool.execute(
                        'UPDATE `agent_data` SET `data` = CAST(? AS JSON) WHERE `id` = ?',
                        [tombstone, row.id]
                    );
                }
            } else {
                const [rows] = await pool.execute(
                    "SELECT `id`, `agent_id`, `collection` FROM `agent_data` WHERE `userid` = ? AND `firmid` = ? AND `name` = ? AND `collection` LIKE 'wt\\_%' ESCAPE '\\\\'",
                    [STORE_USER_ID, STORE_FIRM_ID, STORE_NAME]
                );
                for (const row of rows || []) {
                    const tombstone = JSON.stringify({
                        key: String(row.agent_id),
                        collection: fromNamespacedCollection(row.collection),
                        value: null,
                        __deleted: true,
                        updatedAt: new Date().toISOString()
                    });
                    await pool.execute(
                        'UPDATE `agent_data` SET `data` = CAST(? AS JSON) WHERE `id` = ?',
                        [tombstone, row.id]
                    );
                }
            }
            return true;
        } catch (err) {
            throw this._sanitizedError(err, 'clear');
        }
    }

    async export() {
        const pool = this._getPool();
        try {
            const [rows] = await pool.execute(
                "SELECT `collection`, `agent_id`, `data` FROM `agent_data` WHERE `userid` = ? AND `firmid` = ? AND `name` = ? AND `collection` LIKE 'wt\\_%' ESCAPE '\\\\'",
                [STORE_USER_ID, STORE_FIRM_ID, STORE_NAME]
            );
            const collections = {};
            for (const row of rows || []) {
                const envelope = parseEnvelope(row.data);
                if (!envelope || isTombstone(envelope)) continue;
                const appCollection = fromNamespacedCollection(row.collection);
                if (!COLLECTION_PATTERN.test(appCollection)) continue;
                if (!collections[appCollection]) collections[appCollection] = [];
                collections[appCollection].push(
                    deepClone(envelope.value !== undefined ? envelope.value : null)
                );
            }
            return {
                schemaVersion: '1.0.0',
                exportedAt: new Date().toISOString(),
                collections
            };
        } catch (err) {
            throw this._sanitizedError(err, 'export');
        }
    }

    async import(data) {
        if (!data || !data.collections || typeof data.collections !== 'object') {
            throw new Error('Invalid persistence import data structure');
        }
        for (const [collection, items] of Object.entries(data.collections)) {
            const list = Array.isArray(items) ? items : Object.values(items || {});
            for (const item of list) {
                const key = item && (item.id || item.key || item.agentId || item.agent_id)
                    ? String(item.id || item.key || item.agentId || item.agent_id)
                    : `item_${crypto.randomBytes(3).toString('hex')}`;
                await this.set(collection, key, item);
            }
        }
        return true;
    }

    getStatus() {
        return {
            provider: 'mysql',
            table: this.table,
            database: this.config.database,
            readOnly: false,
            writeOperations: ['SELECT', 'INSERT', 'UPDATE'],
            schemaModification: 'none',
            namespace: { userid: STORE_USER_ID, firmid: STORE_FIRM_ID, name: STORE_NAME, collectionPrefix: COLLECTION_PREFIX }
        };
    }

    async close() {
        if (this.pool) {
            const pool = this.pool;
            this.pool = null;
            try { await pool.end(); } catch (_) {}
        }
    }
}

module.exports = AgentDataStore;
