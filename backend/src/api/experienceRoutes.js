/**
 * Universal Client Experience REST API Routes
 * Standardized endpoints for explicit feedback, ratings, operational issues, metrics, trends, and timelines.
 * AgentGenPro backend compatible router — strict /api route prefixing only.
 */

const express = require('express');
const { ExperienceStore } = require('../experience/ExperienceStore');
const { ExperienceAggregator } = require('../experience/ExperienceAggregator');
const { ClientFeedback } = require('../experience/ClientFeedback');
const { ClientIssue } = require('../experience/ClientIssue');
const { requireAuth, requireRole, ROLES } = require('../middleware/authMiddleware');

const defaultStore = new ExperienceStore();

function createExperienceRouter(store = defaultStore) {
    const router = express.Router();
    router.use(requireAuth);

    const aggregator = new ExperienceAggregator(store);

    /**
     * POST /api/v1/experience/feedback & /api/experience/feedback
     * Submit explicit feedback or rating.
     */
    router.post(['/api/v1/experience/feedback', '/api/experience/feedback'], (req, res) => {
        try {
            const validation = ClientFeedback.validate(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid feedback payload',
                    code: 'INVALID_FEEDBACK',
                    errors: validation.errors
                });
            }

            const feedback = store.recordFeedback(req.body);
            return res.status(201).json({
                success: true,
                message: `Feedback '${feedback.feedbackId}' submitted successfully`,
                data: feedback.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/experience/feedback & /api/experience/feedback
     * List feedback submissions with filtering.
     */
    router.get(['/api/v1/experience/feedback', '/api/experience/feedback'], (req, res) => {
        try {
            const { systemId, clientId, category, startTime, endTime, limit } = req.query;
            const feedbackList = store.listFeedback({
                systemId, clientId, category, startTime, endTime, limit
            });
            return res.status(200).json({
                success: true,
                count: feedbackList.length,
                data: feedbackList.map(f => f.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/experience/feedback/:id & /api/experience/feedback/:id
     * Get specific feedback by ID.
     */
    router.get(['/api/v1/experience/feedback/:id', '/api/experience/feedback/:id'], (req, res) => {
        try {
            const feedback = store.getFeedback(req.params.id);
            if (!feedback) {
                return res.status(404).json({
                    success: false,
                    error: `Feedback '${req.params.id}' not found`,
                    code: 'FEEDBACK_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                data: feedback.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/v1/experience/issues & /api/experience/issues
     * Create a new operational issue (Operator/Admin).
     */
    router.post(['/api/v1/experience/issues', '/api/experience/issues'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
        try {
            const validation = ClientIssue.validate(req.body);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid issue payload',
                    code: 'INVALID_ISSUE',
                    errors: validation.errors
                });
            }

            const issue = store.createIssue(req.body);
            return res.status(201).json({
                success: true,
                message: `Operational issue '${issue.issueId}' reported successfully`,
                data: issue.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/experience/issues & /api/experience/issues
     * List reported operational issues.
     */
    router.get(['/api/v1/experience/issues', '/api/experience/issues'], (req, res) => {
        try {
            const { systemId, clientId, status, severity, category, limit } = req.query;
            const issues = store.listIssues({
                systemId, clientId, status, severity, category, limit
            });
            return res.status(200).json({
                success: true,
                count: issues.length,
                data: issues.map(i => i.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/experience/issues/:issueId & /api/experience/issues/:issueId
     * Get specific issue by ID.
     */
    router.get(['/api/v1/experience/issues/:issueId', '/api/experience/issues/:issueId'], (req, res) => {
        try {
            const issue = store.getIssue(req.params.issueId);
            if (!issue) {
                return res.status(404).json({
                    success: false,
                    error: `Issue '${req.params.issueId}' not found`,
                    code: 'ISSUE_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                data: issue.toJSON()
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * PATCH /api/v1/experience/issues/:issueId & /api/experience/issues/:issueId
     * Update issue or perform lifecycle state transition (Operator/Admin).
     */
    router.patch(['/api/v1/experience/issues/:issueId', '/api/experience/issues/:issueId'], requireRole([ROLES.ADMIN, ROLES.OPERATOR]), (req, res) => {
        try {
            const updated = store.updateIssue(req.params.issueId, req.body);
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    error: `Issue '${req.params.issueId}' not found`,
                    code: 'ISSUE_NOT_FOUND'
                });
            }
            return res.status(200).json({
                success: true,
                message: `Issue '${req.params.issueId}' updated successfully`,
                data: updated.toJSON()
            });
        } catch (error) {
            const statusCode = error.message.includes('Invalid issue lifecycle transition') ? 400 : 500;
            return res.status(statusCode).json({
                success: false,
                error: error.message,
                code: statusCode === 400 ? 'INVALID_TRANSITION' : 'UPDATE_FAILED'
            });
        }
    });

    /**
     * GET /api/v1/experience/overview & /api/experience/overview
     * Platform-wide experience metrics overview.
     */
    router.get(['/api/v1/experience/overview', '/api/experience/overview'], (req, res) => {
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
     * GET /api/v1/experience/:systemId/overview & /api/experience/:systemId/overview
     * Factual experience overview for a system.
     */
    router.get(['/api/v1/experience/:systemId/overview', '/api/experience/:systemId/overview'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({
                systemId: req.params.systemId,
                window: req.query.window || '24h'
            });
            const recentFeedback = store.getFeedbackBySystem(req.params.systemId, { limit: 5 });
            const openIssues = store.getIssuesBySystem(req.params.systemId, { status: 'OPEN', limit: 5 });

            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                metrics,
                recentFeedback: recentFeedback.map(f => f.toJSON()),
                openIssues: openIssues.map(i => i.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/experience/:systemId/feedback & /api/experience/:systemId/feedback
     * Feedback for a specific system.
     */
    router.get(['/api/v1/experience/:systemId/feedback', '/api/experience/:systemId/feedback'], (req, res) => {
        try {
            const feedbackList = store.getFeedbackBySystem(req.params.systemId, { limit: req.query.limit });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                count: feedbackList.length,
                data: feedbackList.map(f => f.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/experience/:systemId/issues & /api/experience/:systemId/issues
     * Issues for a specific system.
     */
    router.get(['/api/v1/experience/:systemId/issues', '/api/experience/:systemId/issues'], (req, res) => {
        try {
            const issues = store.getIssuesBySystem(req.params.systemId, {
                status: req.query.status,
                severity: req.query.severity,
                limit: req.query.limit
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                count: issues.length,
                data: issues.map(i => i.toJSON())
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/experience/:systemId/metrics & /api/experience/:systemId/metrics
     * Metrics for a specific system.
     */
    router.get(['/api/v1/experience/:systemId/metrics', '/api/experience/:systemId/metrics'], (req, res) => {
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

    /**
     * GET /api/v1/experience/:systemId/trend & /api/experience/:systemId/trend
     * Trend buckets for a specific system.
     */
    router.get(['/api/v1/experience/:systemId/trend', '/api/experience/:systemId/trend'], (req, res) => {
        try {
            const metrics = aggregator.computeMetrics({
                systemId: req.params.systemId,
                window: req.query.window || '24h'
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                data: metrics.trend
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/v1/experience/:systemId/timeline & /api/experience/:systemId/timeline
     * Chronological experience timeline for a system.
     */
    router.get(['/api/v1/experience/:systemId/timeline', '/api/experience/:systemId/timeline'], (req, res) => {
        try {
            const timeline = aggregator.generateTimeline({
                systemId: req.params.systemId,
                clientId: req.query.clientId,
                limit: req.query.limit
            });
            return res.status(200).json({
                success: true,
                systemId: req.params.systemId,
                count: timeline.length,
                data: timeline
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

const mainRouter = createExperienceRouter(defaultStore);
mainRouter.createExperienceRouter = createExperienceRouter;
mainRouter.defaultStore = defaultStore;

module.exports = mainRouter;
