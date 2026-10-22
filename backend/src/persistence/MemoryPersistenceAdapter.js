/**
 * Memory Persistence Adapter
 * Fast, thread-safe in-memory collection store for development and testing.
 */

const PersistenceAdapter = require('./PersistenceAdapter');

class MemoryPersistenceAdapter extends PersistenceAdapter {
    constructor() {
        super();
        this.store = new Map();
    }

    _getCollection(collection) {
        if (!this.store.has(collection)) {
            this.store.set(collection, new Map());
        }
        return this.store.get(collection);
    }

    async get(collection, key) {
        const col = this._getCollection(collection);
        const val = col.get(key);
        return val !== undefined ? JSON.parse(JSON.stringify(val)) : null;
    }

    async set(collection, key, value) {
        const col = this._getCollection(collection);
        const copy = JSON.parse(JSON.stringify(value));
        col.set(key, copy);
        return copy;
    }

    async delete(collection, key) {
        const col = this._getCollection(collection);
        return col.delete(key);
    }

    async list(collection) {
        const col = this._getCollection(collection);
        return Array.from(col.values()).map(v => JSON.parse(JSON.stringify(v)));
    }

    async clear(collection) {
        if (collection) {
            if (this.store.has(collection)) {
                this.store.get(collection).clear();
            }
        } else {
            this.store.clear();
        }
        return true;
    }

    async has(collection, key) {
        const col = this._getCollection(collection);
        return col.has(key);
    }

    async export() {
        const out = {
            schemaVersion: '1.0.0',
            exportedAt: new Date().toISOString(),
            collections: {}
        };
        for (const [colName, colMap] of this.store.entries()) {
            out.collections[colName] = Array.from(colMap.values());
        }
        return out;
    }

    async import(data) {
        if (!data || !data.collections || typeof data.collections !== 'object') {
            throw new Error('Invalid persistence import data structure');
        }
        this.store.clear();
        for (const [colName, items] of Object.entries(data.collections)) {
            const colMap = new Map();
            if (Array.isArray(items)) {
                for (const item of items) {
                    const key = item.id || item.key || `item_${Math.random().toString(36).substr(2, 6)}`;
                    colMap.set(key, item);
                }
            } else if (typeof items === 'object' && items !== null) {
                for (const [key, item] of Object.entries(items)) {
                    colMap.set(key, item);
                }
            }
            this.store.set(colName, colMap);
        }
        return true;
    }
}

module.exports = MemoryPersistenceAdapter;
