/**
 * Usage Event Collector
 * Asynchronous, secure collector receiving, validating, sanitizing, and persisting platform activity events.
 * Purely generic - zero business-domain logic.
 */

const { UsageEvent } = require('./UsageEvent');
const { UsageStore } = require('./UsageStore');

class UsageEventCollector {
    constructor(options = {}) {
        this.usageStore = options.usageStore || new UsageStore(options);
        this.enabled = options.enabled !== false;
    }

    /**
     * Record a raw activity event into the usage store.
     * @param {Object} rawEvent 
     * @returns {UsageEvent|null}
     */
    recordActivity(rawEvent = {}) {
        if (!this.enabled) return null;

        try {
            const validation = UsageEvent.validate(rawEvent);
            if (!validation.valid) {
                console.warn('[UsageEventCollector] Invalid event ignored:', validation.errors);
                return null;
            }

            const event = new UsageEvent(rawEvent);
            this.usageStore.recordEvent(event);
            return event;
        } catch (err) {
            console.error('[UsageEventCollector] Exception recording usage event:', err.message);
            return null;
        }
    }

    /**
     * Helper for recording an execution activity.
     */
    recordExecution(params = {}) {
        return this.recordActivity({
            category: 'EXECUTION',
            source: 'api',
            actor: 'user',
            ...params
        });
    }

    /**
     * Helper for recording a health check activity.
     */
    recordHealthCheck(params = {}) {
        return this.recordActivity({
            category: 'HEALTH_CHECK',
            source: 'system',
            actor: 'system',
            ...params
        });
    }

    /**
     * Helper for recording a quality test activity.
     */
    recordQualityTest(params = {}) {
        return this.recordActivity({
            category: 'QUALITY_TEST',
            source: 'test',
            actor: 'system',
            ...params
        });
    }
}

module.exports = {
    UsageEventCollector
};
