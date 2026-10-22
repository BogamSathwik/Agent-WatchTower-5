/**
 * Quality Test Result Data Model
 * Standardized data model for quality test execution results and assertion evidence.
 */

const crypto = require('crypto');

const QUALITY_RESULT_STATES = Object.freeze({
    PASS: 'PASS',
    FAIL: 'FAIL',
    ERROR: 'ERROR',
    SKIPPED: 'SKIPPED'
});

class QualityTestResult {
    constructor(raw = {}) {
        this.resultId = raw.resultId || `qres_${crypto.randomBytes(8).toString('hex')}`;
        this.testId = raw.testId || 'unknown-test';
        this.systemId = raw.systemId || 'unknown-system';
        this.suiteId = raw.suiteId || null;
        this.timestamp = raw.timestamp || new Date().toISOString();
        
        this.status = Object.values(QUALITY_RESULT_STATES).includes(raw.status)
            ? raw.status
            : QUALITY_RESULT_STATES.ERROR;

        this.durationMs = Number(raw.durationMs) || 0;
        this.assertions = Array.isArray(raw.assertions) ? raw.assertions : [];
        
        this.passedAssertions = this.assertions.filter(a => a.status === 'PASS').length;
        this.failedAssertions = this.assertions.filter(a => a.status === 'FAIL').length;
        
        this.error = raw.error || null;
        this.evidence = raw.evidence || {};
        this.metadata = raw.metadata || {};
    }

    toJSON() {
        return {
            resultId: this.resultId,
            testId: this.testId,
            systemId: this.systemId,
            suiteId: this.suiteId,
            timestamp: this.timestamp,
            status: this.status,
            durationMs: this.durationMs,
            assertions: this.assertions,
            passedAssertions: this.passedAssertions,
            failedAssertions: this.failedAssertions,
            error: this.error,
            evidence: this.evidence,
            metadata: this.metadata
        };
    }
}

module.exports = {
    QUALITY_RESULT_STATES,
    QualityTestResult
};
