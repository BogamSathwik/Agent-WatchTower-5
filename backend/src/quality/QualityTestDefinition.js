/**
 * Quality Test Definition Data Model
 * Generic schema and validator for quality and behavioral test definitions.
 * Purely domain-agnostic.
 */

const crypto = require('crypto');

class QualityTestDefinition {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.testId = raw.testId ? String(raw.testId).trim() : `test_${crypto.randomBytes(6).toString('hex')}`;
        this.name = raw.name ? String(raw.name).trim() : 'Generic Quality Test';
        this.description = raw.description ? String(raw.description).trim() : '';
        this.systemId = raw.systemId ? String(raw.systemId).trim() : '';
        this.capability = raw.capability ? String(raw.capability).trim().toLowerCase() : 'execute';
        this.operation = raw.operation ? String(raw.operation).trim().toLowerCase() : (this.capability || 'execute');

        this.input = (typeof raw.input === 'object' && raw.input !== null) ? raw.input : {};
        this.expectedBehavior = raw.expectedBehavior ? String(raw.expectedBehavior).trim() : '';
        this.assertions = Array.isArray(raw.assertions) ? raw.assertions : [];

        this.timeoutMs = Math.max(Number(raw.timeoutMs) || 5000, 100);
        this.retryPolicy = (typeof raw.retryPolicy === 'object' && raw.retryPolicy !== null)
            ? { maxRetries: Number(raw.retryPolicy.maxRetries) || 0, retryDelayMs: Number(raw.retryPolicy.retryDelayMs) || 100 }
            : { maxRetries: 0, retryDelayMs: 100 };

        this.enabled = raw.enabled !== false;
        this.tags = Array.isArray(raw.tags) ? raw.tags.map(t => String(t).trim().toLowerCase()) : [];
        this.metadata = (typeof raw.metadata === 'object' && raw.metadata !== null && !Array.isArray(raw.metadata)) ? raw.metadata : {};

        this.createdAt = raw.createdAt || now;
        this.updatedAt = raw.updatedAt || now;
    }

    /**
     * Validate raw test definition payload.
     */
    static validate(raw, options = {}) {
        const errors = [];
        const isUpdate = Boolean(options.isUpdate);

        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                valid: false,
                errors: [{ field: 'root', code: 'INVALID_PAYLOAD', message: 'Test definition must be a non-null object' }]
            };
        }

        if (!isUpdate || raw.name !== undefined) {
            if (!raw.name || typeof raw.name !== 'string' || !raw.name.trim()) {
                errors.push({ field: 'name', code: 'MISSING_REQUIRED_FIELD', message: 'Test name is required' });
            }
        }

        if (!isUpdate || raw.systemId !== undefined) {
            if (!raw.systemId || typeof raw.systemId !== 'string' || !raw.systemId.trim()) {
                errors.push({ field: 'systemId', code: 'MISSING_REQUIRED_FIELD', message: 'System ID is required' });
            }
        }

        if (raw.assertions !== undefined && !Array.isArray(raw.assertions)) {
            errors.push({ field: 'assertions', code: 'INVALID_TYPE', message: 'Assertions must be an array' });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    toJSON() {
        return {
            testId: this.testId,
            name: this.name,
            description: this.description,
            systemId: this.systemId,
            capability: this.capability,
            operation: this.operation,
            input: this.input,
            expectedBehavior: this.expectedBehavior,
            assertions: this.assertions,
            timeoutMs: this.timeoutMs,
            retryPolicy: this.retryPolicy,
            enabled: this.enabled,
            tags: this.tags,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = {
    QualityTestDefinition
};
