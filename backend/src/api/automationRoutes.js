/**
 * Phase 25 — Automation REST API Router
 * Exposes endpoints for policy management, automation decisions, approval workflows,
 * dry-run simulations, and execution tracking.
 */

const express = require('express');

function createAutomationRouter(orchestrator, policyEngine, decisionService) {
    const router = express.Router();

    const getTenantId = (req) => req.headers['x-tenant-id'] || req.tenantId || 'default-tenant';
    const getCorrelationId = (req) => req.headers['x-correlation-id'] || req.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const getRole = (req) => req.headers['x-role'] || req.userRole || 'admin';

    const getEngine = (req) => {
        if (policyEngine) return policyEngine;
        if (req.app && req.app.get('automationPolicyEngine')) return req.app.get('automationPolicyEngine');
        throw new Error('AutomationPolicyEngine not initialized');
    };

    const getDecisions = (req) => {
        if (decisionService) return decisionService;
        if (req.app && req.app.get('automationDecisionService')) return req.app.get('automationDecisionService');
        throw new Error('AutomationDecisionService not initialized');
    };

    const getOrchestrator = (req) => {
        if (orchestrator) return orchestrator;
        if (req.app && req.app.get('intelligentWorkflowOrchestrator')) return req.app.get('intelligentWorkflowOrchestrator');
        throw new Error('IntelligentWorkflowOrchestrator not initialized');
    };

    // GET /overview — Automation System Overview
    router.get('/overview', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const pe = getEngine(req);
            const ds = getDecisions(req);

            const policies = pe.listPolicies(tenantId);
            const decisions = ds.listDecisions(tenantId);

            const activePolicies = policies.filter(p => p.enabled).length;
            const pendingApprovals = decisions.filter(d => d.status === 'APPROVAL_REQUIRED').length;
            const completedWorkflows = decisions.filter(d => d.status === 'COMPLETED').length;
            const failedWorkflows = decisions.filter(d => d.status === 'FAILED').length;

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: {
                    totalPolicies: policies.length,
                    activePolicies,
                    enabledPolicies: activePolicies,
                    pendingApprovals,
                    runningWorkflows: decisions.filter(d => d.status === 'EXECUTING').length,
                    completedWorkflows,
                    failedWorkflows,
                    totalDecisions: decisions.length,
                    policies,
                    recentDecisions: decisions.slice(0, 10)
                }
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'AUTOMATION_OVERVIEW_ERROR' }
            });
        }
    });

    // GET /policies — List Policies
    router.get('/policies', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const pe = getEngine(req);
            const list = pe.listPolicies(tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: list
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'LIST_POLICIES_ERROR' }
            });
        }
    });

    // POST /policies — Create Policy
    router.post('/policies', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const role = getRole(req);

            if (role === 'viewer') {
                return res.status(403).json({
                    success: false,
                    error: { message: "Role 'viewer' is not authorized to create automation policies.", code: 'FORBIDDEN' }
                });
            }

            const pe = getEngine(req);
            const policy = pe.savePolicy(req.body || {}, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.status(201).json({
                success: true,
                data: policy
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'CREATE_POLICY_ERROR' }
            });
        }
    });

    // GET /policies/:id — Get Policy Details
    router.get('/policies/:id', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const pe = getEngine(req);
            const policy = pe.getPolicy(req.params.id, tenantId);

            if (!policy) {
                return res.status(404).json({
                    success: false,
                    error: { message: `Policy '${req.params.id}' not found.`, code: 'POLICY_NOT_FOUND' }
                });
            }

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: policy
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'GET_POLICY_ERROR' }
            });
        }
    });

    // PUT /policies/:id — Update Policy
    router.put('/policies/:id', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const role = getRole(req);

            if (role === 'viewer') {
                return res.status(403).json({
                    success: false,
                    error: { message: "Role 'viewer' is not authorized to update automation policies.", code: 'FORBIDDEN' }
                });
            }

            const pe = getEngine(req);
            const updated = pe.savePolicy({ ...req.body, policyId: req.params.id }, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: updated
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'UPDATE_POLICY_ERROR' }
            });
        }
    });

    // DELETE /policies/:id — Delete Policy
    router.delete('/policies/:id', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const role = getRole(req);

            if (role === 'viewer') {
                return res.status(403).json({
                    success: false,
                    error: { message: "Role 'viewer' is not authorized to delete automation policies.", code: 'FORBIDDEN' }
                });
            }

            const pe = getEngine(req);
            const deleted = pe.deletePolicy(req.params.id, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                deleted
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'DELETE_POLICY_ERROR' }
            });
        }
    });

    // POST /policies/:id/test — Dry-Run Test Policy Evaluation
    router.post('/policies/:id/test', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const orch = getOrchestrator(req);
            const event = req.body || { eventType: 'AGENT_OFFLINE', agentId: 'TEST-AGENT-001' };

            const result = await orch.processEvent({ ...event, dryRun: true }, tenantId, { dryRun: true });

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: result
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'TEST_POLICY_ERROR' }
            });
        }
    });

    // GET /decisions — List Automation Decisions
    router.get('/decisions', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const ds = getDecisions(req);
            const list = ds.listDecisions(tenantId, req.query || {});

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: list
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'LIST_DECISIONS_ERROR' }
            });
        }
    });

    // GET /decisions/:id — Get Decision Details
    router.get('/decisions/:id', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const ds = getDecisions(req);
            const decision = ds.getDecision(req.params.id, tenantId);

            if (!decision) {
                return res.status(404).json({
                    success: false,
                    error: { message: `Decision '${req.params.id}' not found.`, code: 'DECISION_NOT_FOUND' }
                });
            }

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: decision
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'GET_DECISION_ERROR' }
            });
        }
    });

    // POST /decisions/:id/approve — Approve Decision
    router.post('/decisions/:id/approve', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const role = getRole(req);
            const actor = (req.body && req.body.actor) || 'operator';
            const ds = getDecisions(req);
            const orch = getOrchestrator(req);

            const approved = ds.approveDecision(req.params.id, actor, role, tenantId);

            // Trigger workflow execution after approval
            const execResult = await orch.executeDecision(req.params.id, { actor }, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: {
                    decision: approved,
                    execution: execResult
                }
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'APPROVE_DECISION_ERROR' }
            });
        }
    });

    // POST /decisions/:id/reject — Reject Decision
    router.post('/decisions/:id/reject', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const role = getRole(req);
            const actor = (req.body && req.body.actor) || 'operator';
            const ds = getDecisions(req);

            const rejected = ds.rejectDecision(req.params.id, actor, role, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: rejected
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'REJECT_DECISION_ERROR' }
            });
        }
    });

    // GET /executions — List Executions
    router.get('/executions', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const ds = getDecisions(req);
            const decisions = ds.listDecisions(tenantId);
            const executions = decisions.filter(d => d.executionId).map(d => ({
                executionId: d.executionId,
                decisionId: d.decisionId,
                policyId: d.policyId,
                agentId: d.agentId,
                status: d.status,
                dryRun: d.dryRun,
                createdAt: d.createdAt
            }));

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: executions
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'LIST_EXECUTIONS_ERROR' }
            });
        }
    });

    // GET /executions/:id — Get Execution Details
    router.get('/executions/:id', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const orch = getOrchestrator(req);
            const exec = orch.getExecution(req.params.id, tenantId);

            if (!exec) {
                return res.status(404).json({
                    success: false,
                    error: { message: `Execution '${req.params.id}' not found.`, code: 'EXECUTION_NOT_FOUND' }
                });
            }

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: exec
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'GET_EXECUTION_ERROR' }
            });
        }
    });

    // POST /executions/:id/cancel — Cancel Execution
    router.post('/executions/:id/cancel', async (req, res) => {
        try {
            const tenantId = getTenantId(req);
            const role = getRole(req);

            if (role === 'viewer') {
                return res.status(403).json({
                    success: false,
                    error: { message: "Role 'viewer' is not authorized to cancel workflow executions.", code: 'FORBIDDEN' }
                });
            }

            const orch = getOrchestrator(req);
            const cancelled = orch.cancelExecution(req.params.id, tenantId);

            res.setHeader('X-Correlation-ID', getCorrelationId(req));
            res.json({
                success: true,
                data: cancelled
            });
        } catch (err) {
            res.status(err.statusCode || 500).json({
                success: false,
                error: { message: err.message, code: 'CANCEL_EXECUTION_ERROR' }
            });
        }
    });

    return router;
}

module.exports = { createAutomationRouter };
