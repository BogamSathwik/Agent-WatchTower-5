/**
 * Activity Categories and Sources
 * Generic platform-level activity classifications and event source enumerations.
 * Purely domain-agnostic.
 */

const ACTIVITY_CATEGORIES = Object.freeze({
    EXECUTION: 'EXECUTION',
    HEALTH_CHECK: 'HEALTH_CHECK',
    QUALITY_TEST: 'QUALITY_TEST',
    MANUAL_ACTION: 'MANUAL_ACTION',
    SCHEDULED_ACTION: 'SCHEDULED_ACTION',
    SYSTEM_EVENT: 'SYSTEM_EVENT'
});

const EVENT_SOURCES = Object.freeze({
    API: 'api',
    USER: 'user',
    SCHEDULER: 'scheduler',
    SYSTEM: 'system',
    TEST: 'test'
});

const EXECUTION_STATUSES = Object.freeze({
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    ERROR: 'ERROR'
});

module.exports = {
    ACTIVITY_CATEGORIES,
    EVENT_SOURCES,
    EXECUTION_STATUSES
};
