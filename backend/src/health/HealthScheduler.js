/**
 * Health Scheduler
 * Lightweight background scheduler running interval health audits for registered systems.
 */

class HealthScheduler {
    constructor(healthEngine) {
        this.healthEngine = healthEngine;
        this.timers = new Map(); // systemId -> IntervalTimer
        this.running = false;
    }

    /**
     * Start background health audit loop for a system.
     */
    scheduleSystem(systemId, intervalMs = 30000) {
        this.unscheduleSystem(systemId);

        const timer = setInterval(async () => {
            try {
                await this.healthEngine.checkHealth(systemId);
            } catch (err) {
                // Background execution errors caught safely
            }
        }, Math.max(intervalMs, 1000));

        this.timers.set(systemId, timer);
    }

    /**
     * Stop health audit loop for a system.
     */
    unscheduleSystem(systemId) {
        if (this.timers.has(systemId)) {
            clearInterval(this.timers.get(systemId));
            this.timers.delete(systemId);
        }
    }

    /**
     * Stop all background scheduler loops.
     */
    stopAll() {
        for (const timer of this.timers.values()) {
            clearInterval(timer);
        }
        this.timers.clear();
        this.running = false;
    }
}

module.exports = {
    HealthScheduler
};
