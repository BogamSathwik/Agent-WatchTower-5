/**
 * Persistence Manager
 * Coordinates storage adapters, mode selection (memory vs file vs mysql),
 * state loading, schema validation, and startup restoration metrics.
 *
 * MYSQL MODE (existing-database app-state store, zero DDL):
 * - MySQL is the EXISTING database `nrkindex_trn` configured via DB_* env
 *   vars. Agent-5 NEVER creates/alters/drops/truncates/indexes any table.
 *   The ONLY statements issued are parameterized SELECT / INSERT / UPDATE
 *   against the pre-existing `agent_data` table (namespaced rows:
 *   userid=0, firmid=5, name='AgentWatchtower', collection='wt_<collection>').
 *   Deletes use UPDATE tombstones because the grant has no DELETE privilege.
 *   Other agents' rows in the same table are never touched.
 * - MySQL is ALSO accessed read-only via MySqlReadAccessService (SELECT 1,
 *   SHOW TABLES / INFORMATION_SCHEMA discovery, parameterized reads).
 * - Mode never silently falls back to memory/file: mode stays "mysql" and only
 *   the connected flag reflects database reachability. In-memory mirror is a
 *   temporary fallback so the app keeps running during DB blips.
 * - Mode never silently falls back to memory/file: mode stays "mysql" and only
 *   the connected flag reflects database reachability. The app keeps running
 *   in both connected and unavailable states.
 */

const MemoryPersistenceAdapter = require('./MemoryPersistenceAdapter');
const FilePersistenceAdapter = require('./FilePersistenceAdapter');

function hasMysqlEnvConfig() {
    return Boolean(
        process.env.DB_HOST && String(process.env.DB_HOST).length > 0 &&
        process.env.DB_USER && String(process.env.DB_USER).length > 0 &&
        process.env.DB_PASSWORD && String(process.env.DB_PASSWORD).length > 0 &&
        process.env.DB_DATABASE && String(process.env.DB_DATABASE).length > 0
    );
}

function resolvePersistenceMode(options = {}) {
    if (options.mode) return options.mode;
    if (process.env.PERSISTENCE_MODE) return process.env.PERSISTENCE_MODE;
    // Become MySQL-backed automatically once complete DB credentials exist.
    if (hasMysqlEnvConfig()) return 'mysql';
    return 'memory';
}

class PersistenceManager {
    constructor(options = {}) {
        this.mode = resolvePersistenceMode(options);
        this.filePath = options.filePath || null;
        this.mysqlOptions = options.mysql || null;

        this.adapter = this._createAdapter(this.mode, this.filePath, this.mysqlOptions);

        this.readsCount = 0;
        this.writesCount = 0;
        this.failuresCount = 0;
        this.lastRestoration = null;
        this.lastWriteTime = null;
        this.readyPromise = null;
        this.databaseConnected = null;
        this.databaseErrorCode = null;
    }

    _createAdapter(mode, filePath, mysqlOptions) {
        if (mode === 'file') {
            return new FilePersistenceAdapter(filePath);
        }
        if (mode === 'mysql') {
            let MySqlPersistenceAdapter;
            try {
                MySqlPersistenceAdapter = require('./MySqlPersistenceAdapter');
            } catch (err) {
                throw new Error('Persistence mode "mysql" requires the "mysql2" dependency. Run: npm install mysql2');
            }
            // Throws a clear error when DB_* configuration is incomplete.
            return new MySqlPersistenceAdapter(mysqlOptions || {});
        }
        return new MemoryPersistenceAdapter();
    }

    setMode(mode, filePath = null) {
        const previousAdapter = this.adapter;
        this.mode = mode;
        if (mode === 'file') {
            this.filePath = filePath || this.filePath;
        }
        this.adapter = this._createAdapter(mode, this.filePath, this.mysqlOptions);
        this.readyPromise = null;
        this.databaseConnected = null;
        this.databaseErrorCode = null;
        if (previousAdapter && typeof previousAdapter.close === 'function') {
            try {
                const r = previousAdapter.close();
                if (r && typeof r.catch === 'function') r.catch(() => {});
            } catch (_) {}
        }
    }

    async initialize() {
        // Verifies the underlying store. For MySQL this checks the existing
        // `agent_data` table is reachable (ping, SELECT 1, SELECT DATABASE(),
        // SELECT one row) plus read-only SHOW TABLES discovery — no CREATE /
        // ALTER / DROP / DELETE / TRUNCATE is executed anywhere.
        // Never throws: the outcome is recorded and returned so the server
        // logs clearly while staying alive. No silent fallback to another
        // mode: mode stays as configured.
        if (!this.readyPromise) {
            this.readyPromise = (async () => {
                let initDetail = null;
                try {
                    if (this.adapter && typeof this.adapter.initialize === 'function') {
                        initDetail = await this.adapter.initialize();
                    }
                    this.databaseConnected = this.mode === 'mysql' ? true : null;
                    this.databaseErrorCode = null;
                } catch (err) {
                    this.databaseConnected = this.mode === 'mysql' ? false : null;
                    this.databaseErrorCode = (err && err.message) || 'UNKNOWN';
                }
                try {
                    const modeLabel = this.mode === 'mysql'
                        ? (this.databaseConnected ? 'mysql (connected)' : 'mysql (unavailable)')
                        : this.mode;
                    console.log(`[persistence] mode=${this.mode} status=${modeLabel}`);
                    if (this.mode === 'mysql' && this.databaseConnected) {
                        const dbName = (initDetail && initDetail.database)
                            || (this.adapter && this.adapter.databaseName)
                            || process.env.DB_DATABASE
                            || 'unknown';
                        const tableCount = initDetail && typeof initDetail.tableCount === 'number'
                            ? initDetail.tableCount
                            : (this.adapter && typeof this.adapter.tableCount === 'number' ? this.adapter.tableCount : null);
                        console.log(`[persistence] mysql database="${dbName}" schemaModification=none${tableCount !== null && tableCount !== undefined ? ` existingTables=${tableCount}` : ''}`);
                    }
                    if (this.mode === 'mysql' && !this.databaseConnected && this.databaseErrorCode) {
                        console.error(`[persistence] Database unavailable: ${this.databaseErrorCode}`);
                    }
                } catch (_) {}
                return { mode: this.mode, connected: this.databaseConnected };
            })();
        }
        return this.readyPromise;
    }

    async _ensureReady() {
        // Serializes all adapter use behind initialization (for MySQL: connect
        // + read-only verification) without ever throwing, so floating
        // restore/startup calls cannot race ahead of the database being ready.
        try {
            await this.initialize();
        } catch (_) {}
    }

    // ---- Existing-database read access (mysql mode only, read-only) ----

    getDatabaseService() {
        if (this.adapter && typeof this.adapter.getReadService === 'function') {
            return this.adapter.getReadService();
        }
        return null;
    }

    async listDatabaseTables() {
        if (this.adapter && typeof this.adapter.listTables === 'function') {
            await this._ensureReady();
            return this.adapter.listTables();
        }
        throw new Error('Database table listing is only available in mysql persistence mode.');
    }

    async describeDatabaseTable(table) {
        if (this.adapter && typeof this.adapter.describeTable === 'function') {
            await this._ensureReady();
            return this.adapter.describeTable(table);
        }
        throw new Error('Database table inspection is only available in mysql persistence mode.');
    }

    async queryDatabaseTable(table, options) {
        if (this.adapter && typeof this.adapter.queryTable === 'function') {
            await this._ensureReady();
            return this.adapter.queryTable(table, options);
        }
        throw new Error('Database querying is only available in mysql persistence mode.');
    }

    async countDatabaseRows(table) {
        if (this.adapter && typeof this.adapter.countRows === 'function') {
            await this._ensureReady();
            return this.adapter.countRows(table);
        }
        throw new Error('Database row counting is only available in mysql persistence mode.');
    }

    async get(collection, key) {
        try {
            await this._ensureReady();
            this.readsCount++;
            return await this.adapter.get(collection, key);
        } catch (err) {
            this.failuresCount++;
            throw err;
        }
    }

    async set(collection, key, value) {
        try {
            await this._ensureReady();
            this.writesCount++;
            this.lastWriteTime = new Date().toISOString();
            return await this.adapter.set(collection, key, value);
        } catch (err) {
            this.failuresCount++;
            throw err;
        }
    }

    async delete(collection, key) {
        try {
            await this._ensureReady();
            this.writesCount++;
            this.lastWriteTime = new Date().toISOString();
            return await this.adapter.delete(collection, key);
        } catch (err) {
            this.failuresCount++;
            throw err;
        }
    }

    async list(collection) {
        try {
            await this._ensureReady();
            this.readsCount++;
            return await this.adapter.list(collection);
        } catch (err) {
            this.failuresCount++;
            throw err;
        }
    }

    async clear(collection) {
        try {
            await this._ensureReady();
            this.writesCount++;
            this.lastWriteTime = new Date().toISOString();
            return await this.adapter.clear(collection);
        } catch (err) {
            this.failuresCount++;
            throw err;
        }
    }

    async has(collection, key) {
        try {
            await this._ensureReady();
            this.readsCount++;
            return await this.adapter.has(collection, key);
        } catch (err) {
            this.failuresCount++;
            throw err;
        }
    }

    async setSafe(collection, key, value) {
        // Best-effort write for fire-and-forget call sites (monitoring loop,
        // automation, response). Never throws, so a temporarily unavailable
        // database cannot crash the application via unhandled rejections.
        try {
            await this.set(collection, key, value);
            return true;
        } catch (_) {
            return false;
        }
    }

    async deleteSafe(collection, key) {
        try {
            await this.delete(collection, key);
            return true;
        } catch (_) {
            return false;
        }
    }

    async close() {
        if (this.adapter && typeof this.adapter.close === 'function') {
            try { await this.adapter.close(); } catch (_) {}
        }
    }

    async export() {
        try {
            await this._ensureReady();
            this.readsCount++;
            return await this.adapter.export();
        } catch (err) {
            this.failuresCount++;
            throw err;
        }
    }

    async import(data) {
        try {
            await this._ensureReady();
            this.writesCount++;
            this.lastWriteTime = new Date().toISOString();
            return await this.adapter.import(data);
        } catch (err) {
            this.failuresCount++;
            throw err;
        }
    }

    async restoreApplicationState(app) {
        const startTime = Date.now();
        const results = {
            success: true,
            mode: this.mode,
            restoredCollections: [],
            totalRestoredRecords: 0,
            durationMs: 0,
            error: null
        };

        try {
            const data = await this.export();
            const collections = data.collections || {};

            // 1. Restore Agents
            const agents = collections.agents || [];
            const agentService = app.get('agentService');
            if (agentService && Array.isArray(agents)) {
                let restoredCount = 0;
                for (const agentDef of agents) {
                    try {
                        if (agentDef.id && agentDef.name) {
                            agentService.registerAgent(agentDef);
                            restoredCount++;
                        }
                    } catch (_) {}
                }
                if (restoredCount > 0) {
                    results.restoredCollections.push('agents');
                    results.totalRestoredRecords += restoredCount;
                }
            }

            // 2. Restore Systems
            const systems = collections.systems || [];
            const systemRegistry = app.get('systemRegistry');
            if (systemRegistry && Array.isArray(systems)) {
                let restoredCount = 0;
                for (const sysDef of systems) {
                    try {
                        if (sysDef.id && sysDef.name) {
                            systemRegistry.registerSystem(sysDef);
                            restoredCount++;
                        }
                    } catch (_) {}
                }
                if (restoredCount > 0) {
                    results.restoredCollections.push('systems');
                    results.totalRestoredRecords += restoredCount;
                }
            }

            // 3. Restore Escalation Policies
            const escalationPolicies = collections.escalationPolicies || [];
            const alertingService = app.get('alertingService');
            if (alertingService && Array.isArray(escalationPolicies)) {
                let restoredCount = 0;
                for (const pol of escalationPolicies) {
                    try {
                        if (pol.id && pol.name) {
                            alertingService.saveEscalationPolicy(pol);
                            restoredCount++;
                        }
                    } catch (_) {}
                }
                if (restoredCount > 0) {
                    results.restoredCollections.push('escalationPolicies');
                    results.totalRestoredRecords += restoredCount;
                }
            }

            // 4. Restore Monitoring Configs, Statuses, Incidents & History
            const monitoringService = app.get('agentMonitoringService');
            if (monitoringService && monitoringService.store) {
                const store = monitoringService.store;
                const mConfigs = collections.monitoring_configs || [];
                for (const cfg of mConfigs) {
                    if (cfg.agentId) store.saveConfig(cfg.agentId, cfg, cfg.tenantId || 'default-tenant');
                }
                const mStatuses = collections.monitoring_statuses || [];
                for (const st of mStatuses) {
                    if (st.agentId) store.saveStatus(st.agentId, st, st.tenantId || 'default-tenant');
                }
                const mIncidents = collections.incidents || [];
                for (const inc of mIncidents) {
                    if (inc.id) store.saveIncident(inc, inc.tenantId || 'default-tenant');
                }
                const mHistories = collections.monitoring_histories || [];
                for (const h of mHistories) {
                    if (h.key && Array.isArray(h.history)) {
                        store.checkHistories.set(h.key, h.history);
                    }
                }
                const pRisks = collections.predictive_risks || [];
                for (const r of pRisks) {
                    if (r.agentId && typeof store._persist === 'function') {
                        store._persist('predictive_risks', `${r.tenantId || 'default-tenant'}:${r.agentId}`, r);
                    }
                }
                const pRemediations = collections.remediations || [];
                for (const rem of pRemediations) {
                    if (rem.agentId && typeof store._persist === 'function') {
                        store._persist('remediations', `${rem.tenantId || 'default-tenant'}:${rem.remediationId || rem.id}`, rem);
                    }
                }
                const monTotal = mConfigs.length + mStatuses.length + mIncidents.length + mHistories.length + pRisks.length + pRemediations.length;
                if (monTotal > 0) {
                    results.restoredCollections.push('monitoring');
                    results.totalRestoredRecords += monTotal;
                }
            }

            results.durationMs = Date.now() - startTime;
            this.lastRestoration = {
                timestamp: new Date().toISOString(),
                ...results
            };
            return results;
        } catch (err) {
            results.success = false;
            results.error = err.message;
            results.durationMs = Date.now() - startTime;
            this.lastRestoration = {
                timestamp: new Date().toISOString(),
                ...results
            };
            return results;
        }
    }

    getStatus() {
        let database = { provider: this.mode, connected: null, errorCode: null };
        try {
            if (this.adapter && typeof this.adapter.getDatabaseStatus === 'function') {
                const db = this.adapter.getDatabaseStatus();
                database = {
                    provider: 'mysql',
                    database: db.database || process.env.DB_DATABASE || null,
                    selectedDatabase: db.selectedDatabase || null,
                    connected: db.connected === true,
                    readOnly: true,
                    schemaModification: 'none',
                    tableCount: typeof db.tableCount === 'number' ? db.tableCount : null,
                    // Safe diagnostic only: error code + timestamp, never credentials.
                    errorCode: db.connected === true ? null : (db.lastErrorCode || 'UNAVAILABLE'),
                    lastErrorAt: db.lastErrorAt || null
                };
            } else if (this.mode === 'mysql') {
                database = {
                    provider: 'mysql',
                    connected: this.databaseConnected === true,
                    errorCode: this.databaseConnected === true
                        ? null
                        : (this.databaseErrorCode ? 'UNAVAILABLE' : 'NOT_INITIALIZED'),
                    lastErrorAt: null
                };
            }
        } catch (_) {}
        return {
            mode: this.mode,
            readsCount: this.readsCount,
            writesCount: this.writesCount,
            failuresCount: this.failuresCount,
            lastWriteTime: this.lastWriteTime,
            lastRestoration: this.lastRestoration,
            database,
            status: 'OPERATIONAL'
        };
    }
}

const defaultPersistenceManager = new PersistenceManager();

module.exports = {
    PersistenceManager,
    defaultPersistenceManager
};
