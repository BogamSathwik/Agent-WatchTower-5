/**
 * Quality Test Suite Data Model
 * Groups multiple quality test definitions into executable suites.
 */

const crypto = require('crypto');

class QualityTestSuite {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.suiteId = raw.suiteId ? String(raw.suiteId).trim() : `suite_${crypto.randomBytes(6).toString('hex')}`;
        this.name = raw.name ? String(raw.name).trim() : 'Generic Quality Test Suite';
        this.description = raw.description ? String(raw.description).trim() : '';
        this.systemId = raw.systemId ? String(raw.systemId).trim() : '';
        this.testIds = Array.isArray(raw.testIds) ? raw.testIds.map(id => String(id).trim()) : [];
        
        this.metadata = (typeof raw.metadata === 'object' && raw.metadata !== null) ? raw.metadata : {};
        this.createdAt = raw.createdAt || now;
        this.updatedAt = raw.updatedAt || now;
    }

    static validate(raw, options = {}) {
        const errors = [];
        const isUpdate = Boolean(options.isUpdate);

        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {
                valid: false,
                errors: [{ field: 'root', code: 'INVALID_PAYLOAD', message: 'Test suite must be a non-null object' }]
            };
        }

        if (!isUpdate || raw.name !== undefined) {
            if (!raw.name || typeof raw.name !== 'string' || !raw.name.trim()) {
                errors.push({ field: 'name', code: 'MISSING_REQUIRED_FIELD', message: 'Suite name is required' });
            }
        }

        if (raw.testIds !== undefined && !Array.isArray(raw.testIds)) {
            errors.push({ field: 'testIds', code: 'INVALID_TYPE', message: 'testIds must be an array of string test IDs' });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    toJSON() {
        return {
            suiteId: this.suiteId,
            name: this.name,
            description: this.description,
            systemId: this.systemId,
            testIds: this.testIds,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = {
    QualityTestSuite
};
