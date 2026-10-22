/**
 * Usage Store
 * In-memory persistence store for recorded usage events with retention policy management.
 * Purely generic - zero business-domain logic.
 */

class UsageStore {
    constructor(options = {}) {
        this.events = []; // Chronological list of UsageEvents
        this.maxEvents = Number(options.maxEvents) || 5000;
        this.retentionDays = Number(options.retentionDays) || 30;
    }

    /**
     * Record a new UsageEvent and enforce retention limits.
     */
    recordEvent(event) {
        if (!event) return null;
        this.events.push(event);

        // Apply retention policy
        this.applyRetentionPolicy();

        return event;
    }

    /**
     * Retrieve a specific event by eventId.
     */
    getEvent(eventId) {
        if (!eventId) return null;
        return this.events.find(e => e.eventId === String(eventId).trim()) || null;
    }

    /**
     * Filter and list usage events.
     */
    listEvents(filters = {}) {
        let list = [...this.events];

        if (filters.systemId) {
            const sid = String(filters.systemId).trim();
            list = list.filter(e => e.systemId === sid);
        }

        if (filters.capability) {
            const cap = String(filters.capability).trim().toLowerCase();
            list = list.filter(e => e.capability === cap);
        }

        if (filters.operation) {
            const op = String(filters.operation).trim().toLowerCase();
            list = list.filter(e => e.operation === op);
        }

        if (filters.category) {
            const cat = String(filters.category).trim().toUpperCase();
            list = list.filter(e => e.category === cat);
        }

        if (filters.source) {
            const src = String(filters.source).trim().toLowerCase();
            list = list.filter(e => e.source === src);
        }

        if (filters.status) {
            const st = String(filters.status).trim().toUpperCase();
            list = list.filter(e => e.status === st);
        }

        if (filters.startTime) {
            const startMs = new Date(filters.startTime).getTime();
            list = list.filter(e => new Date(e.timestamp).getTime() >= startMs);
        }

        if (filters.endTime) {
            const endMs = new Date(filters.endTime).getTime();
            list = list.filter(e => new Date(e.timestamp).getTime() <= endMs);
        }

        const limit = Number(filters.limit) || 500;
        return list.slice(-limit);
    }

    getEventsBySystem(systemId, filters = {}) {
        return this.listEvents({ ...filters, systemId });
    }

    getEventsByCapability(capability, filters = {}) {
        return this.listEvents({ ...filters, capability });
    }

    getEventsByOperation(operation, filters = {}) {
        return this.listEvents({ ...filters, operation });
    }

    getEventsByTimeRange(startTime, endTime, filters = {}) {
        return this.listEvents({ ...filters, startTime, endTime });
    }

    /**
     * Configure retention policy.
     */
    setRetentionConfig(config = {}) {
        if (config.maxEvents && Number(config.maxEvents) > 0) {
            this.maxEvents = Number(config.maxEvents);
        }
        if (config.retentionDays && Number(config.retentionDays) > 0) {
            this.retentionDays = Number(config.retentionDays);
        }
        this.applyRetentionPolicy();
        return this.getRetentionConfig();
    }

    getRetentionConfig() {
        return {
            maxEvents: this.maxEvents,
            retentionDays: this.retentionDays
        };
    }

    /**
     * Trim memory array based on maxEvents and retentionDays.
     */
    applyRetentionPolicy() {
        const cutoffMs = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
        this.events = this.events.filter(e => new Date(e.timestamp).getTime() >= cutoffMs);

        if (this.events.length > this.maxEvents) {
            const overflow = this.events.length - this.maxEvents;
            this.events.splice(0, overflow);
        }
    }

    clear() {
        this.events = [];
    }
}

module.exports = {
    UsageStore
};
