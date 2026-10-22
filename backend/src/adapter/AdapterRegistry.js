/**
 * Adapter Registry
 * Registry for managing available adapter implementations.
 * Purely generic - works for any integration mechanism.
 */

const { HttpAdapter } = require('./HttpAdapter');
const { MockAdapter } = require('./MockAdapter');
const { BaseAdapter } = require('./BaseAdapter');
const { ExternalAgentAdapter } = require('./ExternalAgentAdapter');

class AdapterRegistry {
    constructor() {
        this.adapters = new Map();

        // Seed core adapter types
        this.registerAdapter('http', HttpAdapter);
        this.registerAdapter('mock', MockAdapter);
        this.registerAdapter('webhook', HttpAdapter); // Webhook reuses HTTP client driver
        this.registerAdapter('sdk', BaseAdapter);
        this.registerAdapter('custom', BaseAdapter);
        this.registerAdapter('externalagentadapter', ExternalAgentAdapter);
        this.registerAdapter('external', ExternalAgentAdapter);
    }

    /**
     * Register a new adapter class constructor.
     * @param {string} type - Generic adapter type (e.g. 'http', 'grpc', 'mock')
     * @param {Class} adapterClass - Class extending BaseAdapter
     */
    registerAdapter(type, adapterClass) {
        if (!type || typeof type !== 'string') {
            throw new Error('Adapter type must be a non-empty string');
        }
        if (typeof adapterClass !== 'function') {
            throw new Error('Adapter class must be a valid constructor function');
        }

        const normalizedType = type.trim().toLowerCase();
        this.adapters.set(normalizedType, adapterClass);
        return true;
    }

    getAdapter(type) {
        if (!type || typeof type !== 'string') return null;
        return this.adapters.get(type.trim().toLowerCase()) || null;
    }

    hasAdapter(type) {
        if (!type || typeof type !== 'string') return false;
        return this.adapters.has(type.trim().toLowerCase());
    }

    listAdapters() {
        return Array.from(this.adapters.keys()).map(type => ({
            type,
            registeredAt: new Date().toISOString()
        }));
    }

    removeAdapter(type) {
        if (!type) return false;
        return this.adapters.delete(type.trim().toLowerCase());
    }
}

module.exports = {
    AdapterRegistry
};
