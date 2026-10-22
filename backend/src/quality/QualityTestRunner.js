/**
 * Quality Test Runner
 * Core execution engine for running quality & behavioral tests against registered systems.
 * Purely generic - zero business-domain logic.
 */

const { SystemExecutionService } = require('../service/SystemExecutionService');
const { QualityTestDefinition } = require('./QualityTestDefinition');
const { QualityTestResult, QUALITY_RESULT_STATES } = require('./QualityTestResult');
const { AssertionEngine } = require('./AssertionEngine');
const { QualityStore } = require('./QualityStore');

class QualityTestRunner {
    constructor(options = {}) {
        this.systemExecutionService = options.systemExecutionService || new SystemExecutionService(options);
        this.assertionEngine = options.assertionEngine || AssertionEngine;
        this.qualityStore = options.qualityStore || new QualityStore();
        this.usageCollector = options.usageCollector || null;
    }

    /**
     * Run a single Quality Test.
     * @param {QualityTestDefinition|Object|string} testDefOrId 
     * @param {Object} options - { suiteId, context }
     * @returns {Promise<QualityTestResult>}
     */
    async runTest(testDefOrId, options = {}) {
        const startTime = Date.now();
        let definition;

        // 1. Resolve Test Definition
        if (typeof testDefOrId === 'string') {
            definition = this.qualityStore.getTestDefinition(testDefOrId);
            if (!definition) {
                const errorResult = new QualityTestResult({
                    testId: testDefOrId,
                    suiteId: options.suiteId,
                    status: QUALITY_RESULT_STATES.ERROR,
                    durationMs: Date.now() - startTime,
                    error: {
                        code: 'TEST_NOT_FOUND',
                        message: `Quality test definition '${testDefOrId}' not found`
                    }
                });
                this.qualityStore.saveTestResult(errorResult);
                return errorResult;
            }
        } else if (testDefOrId instanceof QualityTestDefinition) {
            definition = testDefOrId;
        } else if (typeof testDefOrId === 'object' && testDefOrId !== null) {
            definition = new QualityTestDefinition(testDefOrId);
        } else {
            const errorResult = new QualityTestResult({
                status: QUALITY_RESULT_STATES.ERROR,
                durationMs: Date.now() - startTime,
                error: {
                    code: 'INVALID_TEST_DEFINITION',
                    message: 'Provided test definition is invalid'
                }
            });
            this.qualityStore.saveTestResult(errorResult);
            return errorResult;
        }

        // Check if disabled
        if (!definition.enabled) {
            const skippedResult = new QualityTestResult({
                testId: definition.testId,
                systemId: definition.systemId,
                suiteId: options.suiteId,
                status: QUALITY_RESULT_STATES.SKIPPED,
                durationMs: Date.now() - startTime,
                evidence: { reason: 'Test definition is explicitly disabled' }
            });
            this.qualityStore.saveTestResult(skippedResult);
            return skippedResult;
        }

        // 2. Resolve Target System & Capability Check
        const systemId = definition.systemId;
        const requiredCapability = definition.capability || definition.operation;

        // 3. Execute configured operation via SystemExecutionService
        let execResult;
        try {
            execResult = await this.systemExecutionService.executeOperation(
                systemId,
                definition.operation,
                definition.input || {},
                {
                    capability: requiredCapability,
                    timeout: definition.timeout,
                    retryPolicy: definition.retryPolicy,
                    ...options.context
                }
            );
        } catch (err) {
            const durationMs = Date.now() - startTime;
            const errorResult = new QualityTestResult({
                testId: definition.testId,
                systemId,
                suiteId: options.suiteId,
                status: QUALITY_RESULT_STATES.ERROR,
                durationMs,
                error: {
                    code: 'EXECUTION_EXCEPTION',
                    message: err.message || 'System execution service failed'
                }
            });
            this.qualityStore.saveTestResult(errorResult);
            return errorResult;
        }

        const durationMs = Date.now() - startTime;

        // 4. Handle Capability Mismatch or System Execution Fault
        if (!execResult.success && execResult.error) {
            const errCode = execResult.error.code || '';
            if (errCode === 'CAPABILITY_MISMATCH' || errCode === 'UNSUPPORTED_OPERATION') {
                const skippedResult = new QualityTestResult({
                    testId: definition.testId,
                    systemId,
                    suiteId: options.suiteId,
                    status: QUALITY_RESULT_STATES.SKIPPED,
                    durationMs,
                    error: execResult.error,
                    evidence: { reason: `System does not support capability '${requiredCapability}'` }
                });
                this.qualityStore.saveTestResult(skippedResult);
                return skippedResult;
            }

            // Return ERROR if system execution service failed to execute target system operation
            // (e.g. SYSTEM_NOT_FOUND, NOT_FOUND, ADAPTER_ERROR, CONNECTION_FAILURE, TIMEOUT, etc.)
            const isSystemError = ['SYSTEM_NOT_FOUND', 'NOT_FOUND', 'ADAPTER_NOT_FOUND', 'CONNECTION_FAILURE', 'CONNECTION_FAILED', 'TIMEOUT', 'SSRF_BLOCKED', 'DNS_FAILURE'].includes(errCode) || (!execResult.data && !execResult.rawResponse);

            if (isSystemError) {
                const errorResult = new QualityTestResult({
                    testId: definition.testId,
                    systemId,
                    suiteId: options.suiteId,
                    status: QUALITY_RESULT_STATES.ERROR,
                    durationMs,
                    error: execResult.error,
                    evidence: { rawResponse: execResult.rawResponse || null }
                });
                this.qualityStore.saveTestResult(errorResult);
                return errorResult;
            }
        }

        // 5. Build assertion target payload
        const rawStatus = execResult.rawResponse?.status || execResult.status || (execResult.success ? 200 : 500);
        const dataPayload = execResult.data !== undefined ? execResult.data : execResult;

        const assertionTarget = {
            status: Number(rawStatus),
            durationMs,
            responseTime: durationMs,
            data: dataPayload,
            headers: execResult.rawResponse?.headers || {},
            ...(typeof dataPayload === 'object' && dataPayload !== null ? dataPayload : {})
        };

        // 6. Pass result to Assertion Engine
        const evalResult = this.assertionEngine.evaluateAll(definition.assertions, assertionTarget);

        // 7. Determine Final Status (PASS vs FAIL)
        const finalStatus = evalResult.allPassed ? QUALITY_RESULT_STATES.PASS : QUALITY_RESULT_STATES.FAIL;

        // 8. Construct standardized test result with evidence
        const testResult = new QualityTestResult({
            testId: definition.testId,
            systemId,
            suiteId: options.suiteId,
            status: finalStatus,
            durationMs,
            assertions: evalResult.assertionResults,
            evidence: {
                operation: definition.operation,
                input: definition.input,
                actualData: dataPayload,
                status: rawStatus,
                durationMs
            },
            metadata: {
                systemId,
                capability: requiredCapability,
                executedAt: new Date().toISOString()
            }
        });

        // 9. Store and Return
        this.qualityStore.saveTestResult(testResult);

        if (this.usageCollector) {
            this.usageCollector.recordActivity({
                systemId,
                capability: requiredCapability,
                operation: definition.operation,
                status: testResult.status === QUALITY_RESULT_STATES.PASS ? 'SUCCESS' : (testResult.status === QUALITY_RESULT_STATES.FAIL ? 'FAILED' : 'ERROR'),
                durationMs,
                source: options.source || 'test',
                actor: options.actor || 'system',
                category: 'QUALITY_TEST',
                metadata: { testId: definition.testId, testStatus: testResult.status }
            });
        }

        return testResult;
    }

    /**
     * Run a full Quality Test Suite.
     * @param {QualityTestSuite|Object|string} suiteDefOrId 
     * @param {Object} options 
     * @returns {Promise<Object>} Suite execution result summary
     */
    async runSuite(suiteDefOrId, options = {}) {
        let suite;
        if (typeof suiteDefOrId === 'string') {
            suite = this.qualityStore.getTestSuite(suiteDefOrId);
            if (!suite) {
                throw new Error(`Quality test suite '${suiteDefOrId}' not found`);
            }
        } else {
            suite = suiteDefOrId;
        }

        const suiteId = suite.suiteId;
        const testIds = suite.testIds || [];
        const results = [];

        for (const testId of testIds) {
            const res = await this.runTest(testId, { ...options, suiteId });
            results.push(res);
        }

        const totalTests = results.length;
        const passed = results.filter(r => r.status === QUALITY_RESULT_STATES.PASS).length;
        const failed = results.filter(r => r.status === QUALITY_RESULT_STATES.FAIL).length;
        const errors = results.filter(r => r.status === QUALITY_RESULT_STATES.ERROR).length;
        const skipped = results.filter(r => r.status === QUALITY_RESULT_STATES.SKIPPED).length;
        const executed = totalTests - skipped;
        const passRate = executed > 0 ? Number(((passed / executed) * 100).toFixed(2)) : 0;

        const suiteResultSummary = {
            suiteExecutionId: `suite_run_${Math.random().toString(36).substring(2, 9)}`,
            suiteId,
            suiteName: suite.name,
            timestamp: new Date().toISOString(),
            totalTests,
            passed,
            failed,
            errors,
            skipped,
            passRate,
            results: results.map(r => r.toJSON())
        };

        this.qualityStore.saveSuiteResult(suiteResultSummary);
        return suiteResultSummary;
    }
}

module.exports = {
    QualityTestRunner
};
