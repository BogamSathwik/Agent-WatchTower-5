/**
 * Health Store
 * In-memory persistence store for historical health measurements and current health states.
 * Thread-safe, supports time-range queries and health overview aggregation.
 */

const { HEALTH_STATES, HEALTH_REASONS } = require('./HealthStates');
const { HealthConfig } = require('./HealthConfig');

class HealthStore {
    constructor() {
        this.measurements = new Map(); // systemId -> Array<HealthMeasurement>
        this.systemStates = new Map();  // systemId -> State Object
        this.configs = new Map();       // systemId -> HealthConfig
    }

    /**
     * Get or initialize current health state record for a system.
     */
    getSystemState(systemId) {
        if (!this.systemStates.has(systemId)) {
            this.systemStates.set(systemId, {
                systemId,
                status: HEALTH_STATES.UNKNOWN,
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                lastChecked: null,
                lastReason: HEALTH_REASONS.NO_EVIDENCE
            });
        }
        return this.systemStates.get(systemId);
    }

    /**
     * Update current system health state.
     */
    updateSystemState(systemId, update) {
        const current = this.getSystemState(systemId);
        const updated = { ...current, ...update, lastChecked: new Date().toISOString() };
        this.systemStates.set(systemId, updated);
        return updated;
    }

    /**
     * Record a health result (alias wrapper for updateSystemState).
     */
    recordResult(systemId, record) {
        return this.updateSystemState(systemId, {
            status: record.status || (record.healthy ? HEALTH_STATES.HEALTHY : HEALTH_STATES.OFFLINE),
            consecutiveFailures: typeof record.consecutiveFailures === 'number' ? record.consecutiveFailures : 0,
            consecutiveSuccesses: record.healthy ? (record.consecutiveSuccesses || 1) : 0,
            lastChecked: record.lastCheckTime || record.measuredAt || new Date().toISOString()
        });
    }

    /**
     * Set health check configuration for a system.
     */
    setHealthConfig(systemId, rawConfig) {
        const normalized = HealthConfig.normalize(rawConfig);
        this.configs.set(systemId, normalized);
        return normalized;
    }

    /**
     * Get health check configuration for a system.
     */
    getHealthConfig(systemId) {
        if (!this.configs.has(systemId)) {
            return HealthConfig.normalize({});
        }
        return this.configs.get(systemId);
    }

    /**
     * Add a health measurement entry.
     */
    addMeasurement(measurement) {
        const systemId = measurement.systemId;
        if (!this.measurements.has(systemId)) {
            this.measurements.set(systemId, []);
        }
        const history = this.measurements.get(systemId);
        history.push(measurement);

        // Cap history at 500 entries per system
        if (history.length > 500) {
            history.shift();
        }

        return measurement;
    }

    /**
     * Get latest measurement for a system.
     */
    getLatestMeasurement(systemId) {
        const history = this.measurements.get(systemId) || [];
        return history.length > 0 ? history[history.length - 1] : null;
    }

    /**
     * Query measurement history with filtering.
     * @param {string} systemId 
     * @param {Object} filters - { limit, status, startTime, endTime }
     */
    getHistory(systemId, filters = {}) {
        let history = (this.measurements.get(systemId) || []).map(m => m.toJSON());

        if (filters.status) {
            const targetStatus = String(filters.status).toUpperCase();
            history = history.filter(m => m.status === targetStatus);
        }

        if (filters.startTime) {
            const startMs = new Date(filters.startTime).getTime();
            history = history.filter(m => new Date(m.timestamp).getTime() >= startMs);
        }

        if (filters.endTime) {
            const endMs = new Date(filters.endTime).getTime();
            history = history.filter(m => new Date(m.timestamp).getTime() <= endMs);
        }

        const limit = Number(filters.limit) || 100;
        return history.slice(-limit);
    }

    /**
     * Generate platform-wide health overview.
     */
    getOverview(registeredSystemsList = []) {
        const overview = {
            totalMonitored: registeredSystemsList.length,
            healthyCount: 0,
            degradedCount: 0,
            offlineCount: 0,
            unknownCount: 0,
            overallAvailability: 100,
            systems: []
        };

        let totalAvailabilitySum = 0;
        let evaluatedCount = 0;

        registeredSystemsList.forEach(sys => {
            const state = this.getSystemState(sys.id);
            const latest = this.getLatestMeasurement(sys.id);

            switch (state.status) {
                case HEALTH_STATES.HEALTHY:
                    overview.healthyCount++;
                    break;
                case HEALTH_STATES.DEGRADED:
                    overview.degradedCount++;
                    break;
                case HEALTH_STATES.OFFLINE:
                    overview.offlineCount++;
                    break;
                default:
                    overview.unknownCount++;
                    break;
            }

            const avail = latest ? latest.availability : ([HEALTH_STATES.HEALTHY, HEALTH_STATES.DEGRADED].includes(state.status) ? 100 : 0);
            totalAvailabilitySum += avail;
            evaluatedCount++;

            overview.systems.push({
                systemId: sys.id,
                name: sys.name,
                category: sys.category,
                healthStatus: state.status,
                lastChecked: state.lastChecked,
                responseTimeMs: latest ? latest.responseTimeMs : null,
                availability: avail,
                consecutiveFailures: state.consecutiveFailures,
                consecutiveSuccesses: state.consecutiveSuccesses,
                lastReason: state.lastReason
            });
        });

        overview.overallAvailability = evaluatedCount > 0
            ? Number((totalAvailabilitySum / evaluatedCount).toFixed(2))
            : 100;

        return overview;
    }

    clear() {
        this.measurements.clear();
        this.systemStates.clear();
        this.configs.clear();
    }
}

module.exports = {
    HealthStore
};
