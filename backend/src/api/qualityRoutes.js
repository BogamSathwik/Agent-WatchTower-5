/**
 * Universal Quality REST API Routes
 * Standardized endpoints for quality test management, suite execution, test history, metrics, and quality overview.
 * AgentGenPro backend compatible router — strict /api route prefixing only.
 */

const express = require('express');
const { QualityTestRunner } = require('../quality/QualityTestRunner');
const { QualityTestDefinition } = require('../quality/QualityTestDefinition');
const { QualityTestSuite } = require('../quality/QualityTestSuite');
const { QualityAggregator } = require('../quality/QualityAggregator');
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

const defaultRunner = new QualityTestRunner();

function createQualityRouter(runner = defaultRunner) {
    const router = express.Router();
    router.use(requireAuth);

    const store = runner.qualityStore;
    const aggregator = new QualityAggregator(store);

    /**
     * POST /api/v1/quality/tests & /api/quality/tests
     * Create a new Quality Test Definition (Admin only).
     */
    router.post(['/api/v1/quality/tests', '/api/quality/tests'], requireRole([ROLES.ADMIN]), (req, res) => {
        try {
            const validation = QualityTestDefinition.validate(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid test definition payload',
                    code: 'INVALID_TEST_DEF',
                    errors: validation.errors
                });
            }

            const testDef = new QualityTestDefinition(req.body);
            const saved = store.saveTestDefinition(testDef);
            return res.status(201).json({
                success: true,
                message: `Quality test definition '${saved.testId}' created successfully`,
                data: saved.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/quality/tests & /api/quality/tests
     * List Quality Test Definitions with filtering.
     */
    router.get(['/api/v1/quality/tests', '/api/quality/tests'], (req, res) => {
        try {
            const { systemId, capability, enabled, tag } = req.query;
            const tests = store.getTestDefinitions({ systemId, capability, enabled, tag });
            return res.status(200).json({
                success: true,
                count: tests.length,
                data: tests.map(t => t.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/quality/tests/:testId & /api/quality/tests/:testId
     * Get a specific Quality Test Definition by ID.
     */
    router.get(['/api/v1/quality/tests/:testId', '/api/quality/tests/:testId'], (req, res) => {
        try {
            const testDef = store.getTestDefinition(req.params.testId);
            if (!testDef) {
                return res.status(404).json({
                    success: false,
                    error: `Quality test definition '${req.params.testId}' not found`,
                    code: 'TEST_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                data: testDef.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * PATCH /api/v1/quality/tests/:testId & /api/quality/tests/:testId
     * Update an existing Quality Test Definition (Admin only).
     */
    router.patch(['/api/v1/quality/tests/:testId', '/api/quality/tests/:testId'], requireRole([ROLES.ADMIN]), (req, res) => {
        try {
            const updated = store.updateTestDefinition(req.params.testId, req.body);
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    error: `Quality test definition '${req.params.testId}' not found`,
                    code: 'TEST_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                message: `Quality test definition '${req.params.testId}' updated`,
                data: updated.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * DELETE /api/v1/quality/tests/:testId & /api/quality/tests/:testId
     * Delete a Quality Test Definition (Admin only).
     */
    router.delete(['/api/v1/quality/tests/:testId', '/api/quality/tests/:testId'], requireRole([ROLES.ADMIN]), (req, res) => {
        try {
            const deleted = store.deleteTestDefinition(req.params.testId);
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    error: `Quality test definition '${req.params.testId}' not found`,
                    code: 'TEST_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                message: `Quality test definition '${req.params.testId}' deleted`
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/v1/quality/tests/:testId/run & /api/quality/tests/:testId/run
     * Execute a single Quality Test manually (Operator/Admin).
     */
    router.post(['/api/v1/quality/tests/:testId/run', '/api/quality/tests/:testId/run'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
        try {
            const testResult = await runner.runTest(req.params.testId, {
                context: req.body.context || {}
            });

            return res.status(200).json({
                success: true,
                message: `Quality test '${req.params.testId}' executed`,
                data: testResult.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/quality/tests/:testId/results & /api/quality/tests/:testId/results
     * Get execution results history for a specific Quality Test.
     */
    router.get(['/api/v1/quality/tests/:testId/results', '/api/quality/tests/:testId/results'], (req, res) => {
        try {
            const { limit, status } = req.query;
            const results = store.getTestResults({
                testId: req.params.testId,
                status,
                limit
            });
            return res.status(200).json({
                success: true,
                testId: req.params.testId,
                count: results.length,
                data: results.map(r => r.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/v1/quality/suites & /api/quality/suites
     * Create a new Quality Test Suite (Admin only).
     */
    router.post(['/api/v1/quality/suites', '/api/quality/suites'], requireRole([ROLES.ADMIN]), (req, res) => {
        try {
            const validation = QualityTestSuite.validate(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid test suite payload',
                    code: 'INVALID_SUITE_DEF',
                    errors: validation.errors
                });
            }

            const suite = new QualityTestSuite(req.body);
            const saved = store.saveTestSuite(suite);
            return res.status(201).json({
                success: true,
                message: `Quality test suite '${saved.suiteId}' created successfully`,
                data: saved.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/quality/suites & /api/quality/suites
     * List all Quality Test Suites.
     */
    router.get(['/api/v1/quality/suites', '/api/quality/suites'], (req, res) => {
        try {
            const suites = store.getTestSuites();
            return res.status(200).json({
                success: true,
                count: suites.length,
                data: suites.map(s => s.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/quality/suites/:suiteId & /api/quality/suites/:suiteId
     * Get a specific Quality Test Suite by ID.
     */
    router.get(['/api/v1/quality/suites/:suiteId', '/api/quality/suites/:suiteId'], (req, res) => {
        try {
            const suite = store.getTestSuite(req.params.suiteId);
            if (!suite) {
                return res.status(404).json({
                    success: false,
                    error: `Quality test suite '${req.params.suiteId}' not found`,
                    code: 'SUITE_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                data: suite.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/v1/quality/suites/:suiteId/run & /api/quality/suites/:suiteId/run
     * Execute a Quality Test Suite manually (Operator/Admin).
     */
    router.post(['/api/v1/quality/suites/:suiteId/run', '/api/quality/suites/:suiteId/run'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), async (req, res) => {
        try {
            const suiteSummary = await runner.runSuite(req.params.suiteId, {
                context: req.body.context || {}
            });
            return res.status(200).json({
                success: true,
                message: `Quality suite '${req.params.suiteId}' executed`,
                data: suiteSummary
            });
        } catch (error) {
            const status = error.message.includes('not found') ? 404 : 500;
            return res.status(status).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/quality/overview & /api/quality/overview
     * Platform-wide quality metrics overview.
     */
    router.get(['/api/v1/quality/overview', '/api/quality/overview'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({ window: req.query.window || '24h' });
            return res.status(200).json({
                success: true,
                data: metrics
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/quality/:systemId/overview & /api/quality/:systemId/overview
     * System-specific quality overview.
     */
    router.get(['/api/v1/quality/:systemId/overview', '/api/quality/:systemId/overview'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({
                systemId: req.params.systemId,
                window: req.query.window || '24h'
            });
            const recentResults = store.getTestResults({
                systemId: req.params.systemId,
                limit: 10
            });

            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                metrics,
                recentResults: recentResults.map(r => r.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/quality/:systemId/metrics & /api/quality/:systemId/metrics
     * System-specific quality metrics with configurable window.
     */
    router.get(['/api/v1/quality/:systemId/metrics', '/api/quality/:systemId/metrics'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({
                systemId: req.params.systemId,
                window: req.query.window || '24h'
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                data: metrics
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
}

const mainRouter = createQualityRouter(defaultRunner);
mainRouter.createQualityRouter = createQualityRouter;
mainRouter.defaultRunner = defaultRunner;

module.exports = mainRouter;
