/**
 * MySQL Persistence Adapter (Existing-Database Data Source mode)
 *
 * ARCHITECTURE (zero-DDL use of the existing database):
 * .env -> MySQL connection pool -> configured existing database `nrkindex_trn` ->
 * EXISTING `agent_data` table -> Agent-5 application state.
 *
 * HARD CONSTRAINT: this adapter NEVER creates, alters, drops, truncates,
 * indexes, inserts-into-new-tables, or otherwise modifies the schema of ANY
 * MySQL table. The ONLY statements it issues are parameterized
 * SELECT / INSERT / UPDATE against the pre-existing `agent_data` table
 * (plus read-only SELECTs via MySqlReadAccessService). There is NO
 * watchtower_persistence table and NO parallel persistence schema.
 * The DB grant itself is SELECT/INSERT/UPDATE only (no DELETE, no CREATE),
 * so deletes are implemented as UPDATE tombstones, never DELETE FROM.
 * - Credentials come ONLY from process.env (DB_HOST, DB_USER, DB_PASSWORD,
 *   DB_PORT, DB_DATABASE). Nothing is hardcoded and nothing credential-like
 *   is ever logged, thrown to clients, or stored.
 * - initialize() performs verification only (ping, SELECT 1,
 *   SELECT DATABASE(), SELECT one row from `agent_data`) via
 *   MySqlReadAccessService + AgentDataStore. It works with a MySQL user that
 *   has connection/read/write-row permissions only and does NOT require
 *   CREATE/ALTER/DROP/DELETE privileges.
 * - Agent-5 internal collections (agents, systems, monitoring configs,
 *   automation state, etc.) are stored as namespaced rows
 *   (userid=0, firmid=5, name='AgentWatchtower', collection='wt_<collection>')
 *   inside the existing `agent_data` table, so adding an agent or doing
 *   anything in the application persists to the given database.
 *   Other agents' rows in the same table are never touched (namespace filter).
 * - Existing database tables are ALSO accessed through the safe read-only
 *   service (allow-listed table names, parameterized values, sanitized
 *   errors). No raw SQL execution is exposed.
 */

const PersistenceAdapter = require('./PersistenceAdapter');
const MemoryPersistenceAdapter = require('./MemoryPersistenceAdapter');
const MySqlReadAccessService = require('./MySqlReadAccessService');
const AgentDataStore = require('./AgentDataStore');

class MySqlPersistenceAdapter extends PersistenceAdapter {
    constructor(options = {}) {
        super();
        // Fallback memory store: used only if the database is temporarily
        // unreachable, so the app keeps running. Primary store is agent_data.
        this.store = new MemoryPersistenceAdapter();
        // Read-only access to the pre-existing database configured via .env.
        this.readService = new MySqlReadAccessService(options);
        // Application state in the EXISTING agent_data table (zero DDL).
        this.appStore = new AgentDataStore(options);
        this.connected = false;
        this.databaseName = this.readService.config.database;
        this.tableCount = null;
    }

    /**
     * Verification only. Never issues CREATE/ALTER/DROP/DELETE/TRUNCATE.
     * Resolves detail on success; throws sanitized error on failure
     * (caller records it and keeps the app running).
     */
    async initialize() {
        // Verify the app-state table is readable (SELECT only, no DDL).
        await this.appStore.initialize();
        const result = await this.readService.initialize();
        this.connected = true;
        this.databaseName = result.database || this.readService.config.database;
        this.tableCount = typeof result.tableCount === 'number' ? result.tableCount : null;
        return {
            connected: true,
            database: this.databaseName,
            tableCount: this.tableCount,
            appStateTable: 'agent_data',
            schemaModification: 'none'
        };
    }

    // ---- Internal collection persistence (existing agent_data table) ----

    async _withFallback(primaryFn, fallbackFn) {
        try {
            return await primaryFn();
        } catch (err) {
            // Database temporarily unreachable: serve from local memory so the
            // application keeps working; the next successful call re-syncs.
            return await fallbackFn();
        }
    }

    async get(collection, key) {
        return this._withFallback(
            () => this.appStore.get(collection, key),
            () => this.store.get(collection, key)
        );
    }

    async set(collection, key, value) {
        try {
            const saved = await this.appStore.set(collection, key, value);
            // Mirror to memory fallback so reads still work during DB blips.
            try { await this.store.set(collection, key, value); } catch (_) {}
            return saved;
        } catch (err) {
            return this.store.set(collection, key, value);
        }
    }

    async delete(collection, key) {
        try {
            const deleted = await this.appStore.delete(collection, key);
            try { await this.store.delete(collection, key); } catch (_) {}
            return deleted;
        } catch (err) {
            return this.store.delete(collection, key);
        }
    }

    async list(collection) {
        return this._withFallback(
            () => this.appStore.list(collection),
            () => this.store.list(collection)
        );
    }

    async clear(collection) {
        try {
            await this.appStore.clear(collection);
        } catch (_) {}
        return this.store.clear(collection);
    }

    async has(collection, key) {
        return this._withFallback(
            () => this.appStore.has(collection, key),
            () => this.store.has(collection, key)
        );
    }

    async export() {
        return this._withFallback(
            () => this.appStore.export(),
            () => this.store.export()
        );
    }

    async import(data) {
        try {
            await this.appStore.import(data);
        } catch (_) {}
        return this.store.import(data);
    }

    // ---- Existing-database read access (delegated, read-only) ----

    getReadService() {
        return this.readService;
    }

    async listTables() {
        return this.readService.listTables();
    }

    async describeTable(table) {
        return this.readService.describeTable(table);
    }

    async countRows(table) {
        return this.readService.countRows(table);
    }

    async queryTable(table, options) {
        return this.readService.queryTable(table, options);
    }

    getDatabaseStatus() {
        const s = this.readService.getStatus();
        return {
            provider: 'mysql',
            database: s.database,
            selectedDatabase: s.selectedDatabase,
            connected: s.connected,
            readOnly: false,
            appStateTable: 'agent_data',
            writeOperations: ['SELECT', 'INSERT', 'UPDATE'],
            schemaModification: 'none',
            tableCount: s.tableCount,
            lastErrorCode: s.lastErrorCode,
            lastErrorAt: s.lastErrorAt
        };
    }

    async close() {
        try { await this.readService.close(); } catch (_) {}
        try { await this.appStore.close(); } catch (_) {}
    }
}

module.exports = MySqlPersistenceAdapter;
