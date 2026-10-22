/**
 * File Persistence Adapter
 * Safe local filesystem state persistence with schema validation and secret redaction.
 */

const fs = require('fs');
const path = require('path');
const PersistenceAdapter = require('./PersistenceAdapter');

const SENSITIVE_KEYS = ['secret', 'apiKey', 'password', 'token', 'authorization', 'privateKey'];

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

class FilePersistenceAdapter extends PersistenceAdapter {
    constructor(filePath) {
        super();
        this.filePath = filePath || path.join(process.cwd(), 'data', 'platform_state.json');
        this.data = {
            schemaVersion: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            collections: {}
        };
        this.ensureDirExists();
        this.loadFromFile();
    }

    ensureDirExists() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
            } catch (_) {}
        }
    }

    loadFromFile() {
        if (!fs.existsSync(this.filePath)) {
            return false;
        }
        try {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            if (!raw || !raw.trim()) return false;
            const parsed = JSON.parse(raw);

            if (parsed && typeof parsed === 'object' && parsed.collections) {
                this.data = {
                    schemaVersion: parsed.schemaVersion || '1.0.0',
                    createdAt: parsed.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    collections: parsed.collections
                };
                return true;
            }
        } catch (err) {
            // Safe fallback if corrupted file encountered
            return false;
        }
        return false;
    }

    saveToFile() {
        try {
            this.ensureDirExists();
            this.data.updatedAt = new Date().toISOString();
            const redactedData = redactSensitiveData(this.data);
            fs.writeFileSync(this.filePath, JSON.stringify(redactedData, null, 2), 'utf8');
            return true;
        } catch (err) {
            return false;
        }
    }

    _getCollectionMap(collection) {
        if (!this.data.collections[collection]) {
            this.data.collections[collection] = {};
        }
        return this.data.collections[collection];
    }

    async get(collection, key) {
        const col = this._getCollectionMap(collection);
        const item = col[key];
        return item !== undefined ? JSON.parse(JSON.stringify(item)) : null;
    }

    async set(collection, key, value) {
        const col = this._getCollectionMap(collection);
        const redactedValue = redactSensitiveData(value);
        col[key] = redactedValue;
        this.saveToFile();
        return redactedValue;
    }

    async delete(collection, key) {
        const col = this._getCollectionMap(collection);
        if (col[key] !== undefined) {
            delete col[key];
            this.saveToFile();
            return true;
        }
        return false;
    }

    async list(collection) {
        const col = this._getCollectionMap(collection);
        return Object.values(col).map(v => JSON.parse(JSON.stringify(v)));
    }

    async clear(collection) {
        if (collection) {
            this.data.collections[collection] = {};
        } else {
            this.data.collections = {};
        }
        this.saveToFile();
        return true;
    }

    async has(collection, key) {
        const col = this._getCollectionMap(collection);
        return Object.prototype.hasOwnProperty.call(col, key);
    }

    async export() {
        return JSON.parse(JSON.stringify(this.data));
    }

    async import(data) {
        if (!data || !data.collections || typeof data.collections !== 'object') {
            throw new Error('Invalid persistence import data structure');
        }
        this.data.collections = redactSensitiveData(data.collections);
        this.saveToFile();
        return true;
    }
}

module.exports = FilePersistenceAdapter;
