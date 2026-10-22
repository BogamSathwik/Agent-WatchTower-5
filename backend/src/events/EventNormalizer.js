/**
 * Phase 14 — Event Normalizer
 * Normalizes raw input into UniversalEvent contract with schema validation and error handling.
 */

const UniversalEvent = require('./UniversalEvent');
const EventValidator = require('./EventValidator');
const { EVENT_SEVERITIES, EVENT_CATEGORIES, EVENT_TYPES } = require('./EventStates');

class EventNormalizer {
    static normalize(rawInput = {}) {
        EventValidator.validateEvent(rawInput);

        const category = (rawInput.category || rawInput.sourceType || EVENT_CATEGORIES.SYSTEM).toUpperCase();
        const severity = (rawInput.severity || EVENT_SEVERITIES.INFO).toUpperCase();
        const eventType = rawInput.eventType || rawInput.type || EVENT_TYPES.CUSTOM;

        const normalizedCategory = EVENT_CATEGORIES[category] ? category : EVENT_CATEGORIES.SYSTEM;
        const normalizedSeverity = EVENT_SEVERITIES[severity] ? severity : EVENT_SEVERITIES.INFO;

        return new UniversalEvent({
            id: rawInput.id,
            eventId: rawInput.eventId || rawInput.id,
            source: rawInput.source || 'system',
            sourceType: normalizedCategory,
            systemId: rawInput.systemId || rawInput.targetSystemId || null,
            eventType,
            category: normalizedCategory,
            severity: normalizedSeverity,
            timestamp: rawInput.timestamp,
            correlationId: rawInput.correlationId,
            causationId: rawInput.causationId,
            payload: rawInput.payload || rawInput.data || {},
            metadata: rawInput.metadata || {}
        });
    }
}

module.exports = EventNormalizer;
