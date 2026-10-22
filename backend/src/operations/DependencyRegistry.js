/**
 * Dependency Registry
 * Provides a domain-agnostic registry for monitoring internal service and subsystem dependencies.
 */

class DependencyRegistry {
    constructor() {
        this.dependencies = new Map();
    }

    registerDependency(name, checkFn, metadata = {}) {
        if (!name || typeof checkFn !== 'function') {
            throw new Error('Dependency name and check function are required');
        }
        this.dependencies.set(name, {
            name,
            checkFn,
            metadata,
            lastStatus: null,
            lastCheckedAt: null,
            latency: 0,
            lastError: null
        });
    }

    unregisterDependency(name) {
        return this.dependencies.delete(name);
    }

    async checkDependency(name) {
        const dep = this.dependencies.get(name);
        if (!dep) {
            throw new Error(`Dependency '${name}' not found`);
        }
        const start = Date.now();
        try {
            const res = await dep.checkFn();
            const latency = Date.now() - start;
            dep.lastCheckedAt = new Date().toISOString();
            dep.latency = latency;
            dep.lastStatus = res.status || 'UP';
            dep.lastError = res.error || null;
            return {
                name: dep.name,
                status: dep.lastStatus,
                lastCheckedAt: dep.lastCheckedAt,
                latency: dep.latency,
                error: dep.lastError,
                details: res.details || {},
                metadata: dep.metadata
            };
        } catch (err) {
            const latency = Date.now() - start;
            dep.lastCheckedAt = new Date().toISOString();
            dep.latency = latency;
            dep.lastStatus = 'DOWN';
            dep.lastError = err.message;
            return {
                name: dep.name,
                status: 'DOWN',
                lastCheckedAt: dep.lastCheckedAt,
                latency: dep.latency,
                error: err.message,
                details: {},
                metadata: dep.metadata
            };
        }
    }

    async checkAllDependencies() {
        const results = [];
        for (const name of this.dependencies.keys()) {
            const res = await this.checkDependency(name);
            results.push(res);
        }
        return results;
    }

    getDependencyList() {
        return Array.from(this.dependencies.keys());
    }
}

const defaultDependencyRegistry = new DependencyRegistry();

module.exports = {
    DependencyRegistry,
    defaultDependencyRegistry
};
