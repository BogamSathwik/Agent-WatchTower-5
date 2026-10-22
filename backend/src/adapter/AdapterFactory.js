/**
 * Adapter Factory
 * Instantiates concrete adapter instances based on registered adapter metadata.
 * ZERO system-name-based logic. Selection is strictly based on adapter metadata and registry.
 */

const { AdapterRegistry } = require('./AdapterRegistry');
const { AdapterMetadata } = require('./AdapterMetadata');

class AdapterFactory {
    constructor(registry = new AdapterRegistry()) {
        this.registry = registry;
    }

    /**
     * Create an adapter instance for a given adapter metadata object.
     * @param {Object} rawMetadata - System's adapter metadata payload
     * @param {Object} options - Runtime adapter options (e.g. { allowLocalhost })
     * @returns {BaseAdapter} Concrete adapter instance
     */
    createAdapter(rawMetadata = {}, options = {}) {
        const normalized = AdapterMetadata.normalize(rawMetadata);
        const adapterType = normalized.adapterType;

        const AdapterClass = this.registry.getAdapter(adapterType);

        if (!AdapterClass) {
            const err = new Error(`Unknown adapter type '${adapterType}'. No registered adapter driver found.`);
            err.statusCode = 400;
            err.code = 'UNKNOWN_ADAPTER_TYPE';
            throw err;
        }

        return new AdapterClass(normalized, options);
    }
}

module.exports = {
    AdapterFactory
};
