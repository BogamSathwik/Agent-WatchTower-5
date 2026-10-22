/**
 * Capability Registry
 * Manages generic capabilities supported by registered external systems.
 * Standard capability types: health, execute, telemetry, feedback, testing, webhook, reporting.
 */

const STANDARD_CAPABILITIES = Object.freeze([
    'health',
    'execute',
    'telemetry',
    'feedback',
    'testing',
    'webhook',
    'reporting'
]);

class CapabilityRegistry {
    constructor() {
        this.registeredCapabilities = new Map();
        // Seed standard capabilities
        STANDARD_CAPABILITIES.forEach(cap => {
            this.registerCapabilityType(cap, `Standard ${cap} capability`);
        });
    }

    registerCapabilityType(type, description = '') {
        if (typeof type !== 'string' || !type.trim()) {
            throw new Error('Capability type must be a non-empty string');
        }
        const normalized = type.trim().toLowerCase();
        if (!this.registeredCapabilities.has(normalized)) {
            this.registeredCapabilities.set(normalized, {
                type: normalized,
                description: description || `Capability type: ${normalized}`,
                registeredAt: new Date().toISOString()
            });
        }
        return this.registeredCapabilities.get(normalized);
    }

    getCapabilityType(type) {
        if (typeof type !== 'string') return null;
        return this.registeredCapabilities.get(type.trim().toLowerCase()) || null;
    }

    listCapabilityTypes() {
        return Array.from(this.registeredCapabilities.values());
    }

    /**
     * Validate capability array or object from system contract.
     * Accepts:
     * - Array of strings: ['health', 'telemetry']
     * - Array of objects: [{ type: 'health', enabled: true, config: {} }]
     * - Key-value map: { health: { enabled: true }, telemetry: true }
     */
    normalizeCapabilities(rawCapabilities) {
        const result = [];
        if (!rawCapabilities) return result;

        if (Array.isArray(rawCapabilities)) {
            for (const item of rawCapabilities) {
                if (typeof item === 'string' && item.trim()) {
                    const type = item.trim().toLowerCase();
                    this.registerCapabilityType(type);
                    result.push({ type, enabled: true, config: {} });
                } else if (item && typeof item === 'object' && typeof item.type === 'string') {
                    const type = item.type.trim().toLowerCase();
                    this.registerCapabilityType(type, item.description);
                    result.push({
                        type,
                        enabled: item.enabled !== false,
                        config: item.config || {},
                        description: item.description || ''
                    });
                }
            }
        } else if (typeof rawCapabilities === 'object') {
            for (const [key, val] of Object.entries(rawCapabilities)) {
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
                const type = key.trim().toLowerCase();
                this.registerCapabilityType(type);
                if (typeof val === 'boolean') {
                    result.push({ type, enabled: val, config: {} });
                } else if (val && typeof val === 'object') {
                    result.push({
                        type,
                        enabled: val.enabled !== false,
                        config: val.config || {},
                        description: val.description || ''
                    });
                }
            }
        }

        return result;
    }

    hasCapability(systemCapabilities, targetCapability) {
        if (!systemCapabilities || !targetCapability) return false;
        const normalizedTarget = targetCapability.trim().toLowerCase();

        const normalizedList = this.normalizeCapabilities(systemCapabilities);
        return normalizedList.some(c => c.type === normalizedTarget && c.enabled !== false);
    }
}

module.exports = {
    STANDARD_CAPABILITIES,
    CapabilityRegistry
};
