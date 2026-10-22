/**
 * Abstract Persistence Adapter Interface
 * Defines common contracts for memory, file, and future database storage adapters.
 */

class PersistenceAdapter {
    async get(collection, key) {
        throw new Error('PersistenceAdapter.get() must be implemented by subclass');
    }

    async set(collection, key, value) {
        throw new Error('PersistenceAdapter.set() must be implemented by subclass');
    }

    async delete(collection, key) {
        throw new Error('PersistenceAdapter.delete() must be implemented by subclass');
    }

    async list(collection) {
        throw new Error('PersistenceAdapter.list() must be implemented by subclass');
    }

    async clear(collection) {
        throw new Error('PersistenceAdapter.clear() must be implemented by subclass');
    }

    async has(collection, key) {
        throw new Error('PersistenceAdapter.has() must be implemented by subclass');
    }

    async export() {
        throw new Error('PersistenceAdapter.export() must be implemented by subclass');
    }

    async import(data) {
        throw new Error('PersistenceAdapter.import() must be implemented by subclass');
    }
}

module.exports = PersistenceAdapter;
