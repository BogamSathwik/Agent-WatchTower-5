/**
 * Phase 33 — Simulation History Service
 * Persists simulation records via the existing persistence abstraction
 * (best-effort) with an in-memory primary store.
 * Stores: simulation ID, scenario, creation time, source evidence,
 * assumptions, simulated path, outcome, uncertainty, operator, tenant.
 * History records analyses only — simulation never executes anything.
 */

class SimulationHistoryService {
    constructor(options = {}) {
        this.persistence = options.persistenceManager || options.persistence || null;
        this.simulations = new Map(); // simulationId -> record
        this.runs = new Map(); // simulationId -> [run records]
    }

    _persistBestEffort(collection, key, value) {
        try {
            if (this.persistence && typeof this.persistence.set === 'function') {
                const r = this.persistence.set(collection, key, value);
                if (r && typeof r.catch === 'function') r.catch(() => {});
            }
        } catch (e) { /* persistence is best-effort */ }
    }

    saveSimulation(record) {
        this.simulations.set(record.simulationId, record);
        this._persistBestEffort('simulations', `${record.tenantId}:${record.simulationId}`, record);
        return record;
    }

    updateSimulation(record) {
        this.simulations.set(record.simulationId, record);
        this._persistBestEffort('simulations', `${record.tenantId}:${record.simulationId}`, record);
        return record;
    }

    getSimulation(simulationId, tenantId = null) {
        const rec = this.simulations.get(simulationId);
        if (!rec) return null;
        if (tenantId && rec.tenantId !== tenantId) return null;
        return rec;
    }

    listSimulations(tenantId = null) {
        const all = [...this.simulations.values()];
        return tenantId ? all.filter(s => s.tenantId === tenantId) : all;
    }

    recordRun(simulationId, runRecord) {
        if (!this.runs.has(simulationId)) this.runs.set(simulationId, []);
        this.runs.get(simulationId).push(runRecord);
        this._persistBestEffort('simulation_runs', `${runRecord.tenantId}:${simulationId}:${runRecord.runId}`, runRecord);
        return runRecord;
    }

    getHistory(simulationId, tenantId = null) {
        const rec = this.simulations.get(simulationId);
        if (!rec) return null;
        if (tenantId && rec.tenantId !== tenantId) return null;
        return [...(this.runs.get(simulationId) || [])];
    }
}

module.exports = { SimulationHistoryService };
