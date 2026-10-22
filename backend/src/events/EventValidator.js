/**
 * Phase 14 — Event Validation & Security Guard
 * Enforces schema validation, prototype pollution protection, and payload safety.
 */

class EventValidator {
    static isPrototypePolluted(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 10) return false;

        try {
            const str = JSON.stringify(obj);
            if (str && (str.includes('"__proto__":') || str.includes('"constructor":') || str.includes('"prototype":'))) {
                return true;
            }
        } catch (e) {
            // ignore stringify errors for circular structures
        }

        const forbidden = ['__proto__', 'constructor', 'prototype'];
        for (const key of Object.getOwnPropertyNames(obj)) {
            if (forbidden.includes(key)) return true;
        }

        for (const key of Object.keys(obj)) {
            if (forbidden.includes(key)) return true;
            if (obj[key] && typeof obj[key] === 'object') {
                if (EventValidator.isPrototypePolluted(obj[key], depth + 1)) return true;
            }
        }
        return false;
    }

    static validateEventPayload(payload) {
        if (payload === undefined || payload === null) return;
        if (typeof payload === 'object' && EventValidator.isPrototypePolluted(payload)) {
            const err = new Error('Payload contains forbidden prototype properties');
            err.statusCode = 400;
            err.code = 'PROTOTYPE_POLLUTION';
            throw err;
        }
    }

    static validateEvent(eventData) {
        if (!eventData || typeof eventData !== 'object') {
            const err = new Error('Event data must be a valid object');
            err.statusCode = 400;
            err.code = 'INVALID_EVENT_PAYLOAD';
            throw err;
        }

        EventValidator.validateEventPayload(eventData.payload);

        if (eventData.eventType && typeof eventData.eventType !== 'string') {
            const err = new Error('eventType must be a string');
            err.statusCode = 400;
            err.code = 'INVALID_EVENT_TYPE';
            throw err;
        }
    }

    static validateRule(ruleData) {
        if (!ruleData || typeof ruleData !== 'object') {
            const err = new Error('Rule data must be an object');
            err.statusCode = 400;
            err.code = 'INVALID_RULE_DATA';
            throw err;
        }

        EventValidator.validateEventPayload(ruleData);

        if (!ruleData.name || typeof ruleData.name !== 'string' || !ruleData.name.trim()) {
            const err = new Error('Rule name is required');
            err.statusCode = 400;
            err.code = 'MISSING_RULE_NAME';
            throw err;
        }

        if (ruleData.conditions && !Array.isArray(ruleData.conditions)) {
            const err = new Error('Rule conditions must be an array');
            err.statusCode = 400;
            err.code = 'INVALID_RULE_CONDITIONS';
            throw err;
        }
    }

    static validateSource(sourceData) {
        if (!sourceData || typeof sourceData !== 'object') {
            const err = new Error('Source data must be an object');
            err.statusCode = 400;
            err.code = 'INVALID_SOURCE_DATA';
            throw err;
        }

        EventValidator.validateEventPayload(sourceData);

        if (!sourceData.name || typeof sourceData.name !== 'string' || !sourceData.name.trim()) {
            const err = new Error('Source name is required');
            err.statusCode = 400;
            err.code = 'MISSING_SOURCE_NAME';
            throw err;
        }
    }
}

module.exports = EventValidator;
