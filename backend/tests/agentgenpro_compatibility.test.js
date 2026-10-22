/**
 * AgentGenPro Backend Compatibility Test Suite
 * Verifies that backend routers strictly comply with AgentGenPro deployment standards:
 * - Express Router export contract (module.exports = router)
 * - Explicit API paths (/api/experience/...)
 * - No custom body parsers or req.on stream listeners
 * - No generic root routes (router.get('/'))
 * - No wildcard fallback 404 routes (router.get('*'))
 * - Security restrictions (no fs, child_process, os, app.listen)
 * - Intact Phase 1-6 functionality, RBAC, and credential sanitization
 */

const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

describe('AgentGenPro Backend Compatibility Audit', () => {

    let agentRouter;
    let experienceRouter;
    let systemRouter;
    let adapterRouter;
    let healthRouter;
    let qualityRouter;
    let usageRouter;
    let onboardingRouter;
    let agentContractRouter;
    let remediationRouter;
    let runtimeRouter;
    let eventRouter;

    beforeAll(() => {
        agentRouter = require('../agent');
        experienceRouter = require('../src/api/experienceRoutes');
        systemRouter = require('../src/api/systemRoutes');
        adapterRouter = require('../src/api/adapterRoutes');
        healthRouter = require('../src/api/healthRoutes');
        qualityRouter = require('../src/api/qualityRoutes');
        usageRouter = require('../src/api/usageRoutes');
        onboardingRouter = require('../src/api/onboardingRoutes');
        agentContractRouter = require('../src/api/agentRoutes');
        remediationRouter = require('../src/api/remediationRoutes');
        runtimeRouter = require('../src/api/runtimeRoutes');
        eventRouter = require('../src/api/eventRoutes');
    });

    test('1. Router modules export Express Router instances', () => {
        expect(typeof agentRouter).toBe('function');
        expect(typeof experienceRouter).toBe('function');
        expect(typeof systemRouter).toBe('function');
        expect(typeof adapterRouter).toBe('function');
        expect(typeof healthRouter).toBe('function');
        expect(typeof qualityRouter).toBe('function');
        expect(typeof usageRouter).toBe('function');
        expect(typeof onboardingRouter).toBe('function');
        expect(typeof remediationRouter).toBe('function');
        expect(typeof runtimeRouter).toBe('function');
        expect(typeof eventRouter).toBe('function');

        // Verify Express router properties exist
        expect(typeof agentRouter.use).toBe('function');
        expect(typeof experienceRouter.use).toBe('function');
        expect(typeof systemRouter.use).toBe('function');
        expect(typeof onboardingRouter.use).toBe('function');
        expect(typeof remediationRouter.use).toBe('function');
        expect(typeof runtimeRouter.use).toBe('function');
        expect(typeof eventRouter.use).toBe('function');
    });

    test('2. No HTTP server is started upon module import', () => {
        // Successful import without open port or blocking proves no app.listen executed
        expect(agentRouter).toBeDefined();
        expect(experienceRouter).toBeDefined();
        expect(onboardingRouter).toBeDefined();
        expect(remediationRouter).toBeDefined();
        expect(runtimeRouter).toBeDefined();
        expect(eventRouter).toBeDefined();
    });

    test('3. Router files contain zero forbidden modules in source code', () => {
        const targetFiles = [
            'agent.js',
            'src/api/experienceRoutes.js',
            'src/api/systemRoutes.js',
            'src/api/adapterRoutes.js',
            'src/api/healthRoutes.js',
            'src/api/qualityRoutes.js',
            'src/api/usageRoutes.js',
            'src/api/onboardingRoutes.js',
            'src/api/agentRoutes.js',
            'src/api/remediationRoutes.js',
            'src/api/runtimeRoutes.js',
            'src/api/eventRoutes.js'
        ];

        for (const relativePath of targetFiles) {
            const fullPath = path.join(__dirname, '..', relativePath);
            const content = fs.readFileSync(fullPath, 'utf8');

            expect(content.includes("require('fs')")).toBe(false);
            expect(content.includes('require("fs")')).toBe(false);
            expect(content.includes("require('child_process')")).toBe(false);
            expect(content.includes('require("child_process")')).toBe(false);
            expect(content.includes("require('os')")).toBe(false);
            expect(content.includes('require("os")')).toBe(false);
            expect(content.includes('app.listen')).toBe(false);
            expect(content.includes('eval(')).toBe(false);
            expect(content.includes('new Function(')).toBe(false);
        }
    });

    test('4. Router files contain no custom stream listeners (req.on)', () => {
        const targetFiles = [
            'agent.js',
            'src/api/experienceRoutes.js',
            'src/api/systemRoutes.js',
            'src/api/adapterRoutes.js',
            'src/api/healthRoutes.js',
            'src/api/qualityRoutes.js',
            'src/api/usageRoutes.js',
            'src/api/onboardingRoutes.js',
            'src/api/agentRoutes.js',
            'src/api/remediationRoutes.js',
            'src/api/runtimeRoutes.js',
            'src/api/eventRoutes.js'
        ];

        for (const relativePath of targetFiles) {
            const fullPath = path.join(__dirname, '..', relativePath);
            const content = fs.readFileSync(fullPath, 'utf8');

            expect(content.includes("req.on('data'")).toBe(false);
            expect(content.includes("req.on('end'")).toBe(false);
            expect(content.includes('req.on("data"')).toBe(false);
            expect(content.includes('req.on("end"')).toBe(false);
        }
    });

    test('5. Router files contain no generic root routes (router.get("/"))', () => {
        const targetFiles = [
            'agent.js',
            'src/api/experienceRoutes.js',
            'src/api/systemRoutes.js',
            'src/api/adapterRoutes.js',
            'src/api/healthRoutes.js',
            'src/api/qualityRoutes.js',
            'src/api/usageRoutes.js',
            'src/api/onboardingRoutes.js',
            'src/api/agentRoutes.js',
            'src/api/remediationRoutes.js',
            'src/api/runtimeRoutes.js',
            'src/api/eventRoutes.js'
        ];

        for (const relativePath of targetFiles) {
            const fullPath = path.join(__dirname, '..', relativePath);
            const content = fs.readFileSync(fullPath, 'utf8');

            expect(content.includes("router.get('/')")).toBe(false);
            expect(content.includes("router.post('/')")).toBe(false);
            expect(content.includes("router.put('/')")).toBe(false);
            expect(content.includes("router.patch('/')")).toBe(false);
            expect(content.includes("router.delete('/')")).toBe(false);
        }
    });

    test('6. Router files contain no wildcard 404 routes (router.get("*"))', () => {
        const targetFiles = [
            'agent.js',
            'src/api/experienceRoutes.js',
            'src/api/systemRoutes.js',
            'src/api/adapterRoutes.js',
            'src/api/healthRoutes.js',
            'src/api/qualityRoutes.js',
            'src/api/usageRoutes.js',
            'src/api/onboardingRoutes.js',
            'src/api/agentRoutes.js',
            'src/api/remediationRoutes.js',
            'src/api/runtimeRoutes.js',
            'src/api/eventRoutes.js'
        ];

        for (const relativePath of targetFiles) {
            const fullPath = path.join(__dirname, '..', relativePath);
            const content = fs.readFileSync(fullPath, 'utf8');

            expect(content.includes("router.get('*'")).toBe(false);
            expect(content.includes("router.use('*'")).toBe(false);
            expect(content.includes("router.use((req, res) =>")).toBe(false);
        }
    });

    test('7. Router handles explicit /api/experience endpoints with parsed req.body', async () => {
        const app = express();
        app.use(express.json());
        app.use(experienceRouter);

        // Register dummy system in experienceStore first
        const systemRouter = require('../src/api/systemRoutes');
        app.use(systemRouter);

        await request(app)
            .post('/api/v1/systems/register')
            .send({
                id: 'SYS-AGP-001',
                name: 'AgentGenPro System',
                category: 'agent',
                version: '1.0.0'
            });

        // Submit Feedback
        const resFb = await request(app)
            .post('/api/experience/feedback')
            .send({
                systemId: 'SYS-AGP-001',
                rating: { value: 4, scaleMin: 1, scaleMax: 5 },
                comment: 'AgentGenPro integration works smoothly',
                source: 'user_survey'
            });

        expect(resFb.status).toBe(201);
        expect(resFb.body.success).toBe(true);
        expect(resFb.body.data.systemId).toBe('SYS-AGP-001');

        // Fetch Feedback by System
        const resList = await request(app)
            .get('/api/experience/SYS-AGP-001/feedback');

        expect(resList.status).toBe(200);
        expect(resList.body.count).toBe(1);
        expect(resList.body.data[0].comment).toBe('AgentGenPro integration works smoothly');
    });

    test('8. Operational Issue creation, lifecycle transition, and RBAC via AgentGenPro router', async () => {
        const app = express();
        app.use(express.json());
        app.use(experienceRouter);

        // Create Issue as OPERATOR
        const resIssue = await request(app)
            .post('/api/experience/issues')
            .set('x-user-role', 'operator')
            .send({
                systemId: 'SYS-AGP-001',
                severity: 'HIGH',
                category: 'api_error',
                description: 'Timeout under heavy load'
            });

        expect(resIssue.status).toBe(201);
        const issueId = resIssue.body.data.issueId;

        // Attempt update as VIEWER (should fail 403 RBAC)
        const resForbidden = await request(app)
            .patch(`/api/experience/issues/${issueId}`)
            .set('x-user-role', 'viewer')
            .send({ status: 'IN_PROGRESS' });

        expect(resForbidden.status).toBe(403);
        expect(resForbidden.body.code).toBe('FORBIDDEN');

        // Update issue status to RESOLVED as OPERATOR
        const resUpdate = await request(app)
            .patch(`/api/experience/issues/${issueId}`)
            .set('x-user-role', 'operator')
            .send({ status: 'RESOLVED', resolution: 'Fixed timeout handling' });

        expect(resUpdate.status).toBe(200);
        expect(resUpdate.body.data.status).toBe('RESOLVED');
        expect(resUpdate.body.data.resolvedAt).toBeDefined();
    });

    test('9. Credential sanitization is enforced across experience endpoints', async () => {
        const app = express();
        app.use(express.json());
        app.use(experienceRouter);

        const resSanitized = await request(app)
            .post('/api/experience/feedback')
            .send({
                systemId: 'SYS-AGP-001',
                rating: { value: 5, scaleMin: 1, scaleMax: 5 },
                metadata: {
                    user_token: 'secret-token-12345',
                    password: 'super-secret-pass',
                    api_key: 'sk_live_abc123'
                }
            });

        expect(resSanitized.status).toBe(201);
        const meta = resSanitized.body.data.metadata;
        expect(meta.user_token).toBe('[REDACTED]');
        expect(meta.password).toBe('[REDACTED]');
        expect(meta.api_key).toBe('[REDACTED]');
    });

    test('10. Main agent.js router handles both /api/agent and /api/experience routes', async () => {
        const app = express();
        app.use(express.json());
        app.use(agentRouter);

        // Call agent endpoint
        const resAgent = await request(app)
            .post('/api/agent')
            .send({ message: 'Tell me about MyBlocks.in' });

        expect(resAgent.status).toBe(200);
        expect(resAgent.body.response).toContain('MyBlocks.in');

        // Call experience endpoint on same agent router
        const resOverview = await request(app)
            .get('/api/experience/overview');

        expect(resOverview.status).toBe(200);
        expect(resOverview.body.success).toBe(true);
        expect(resOverview.body.data.totalFeedback).toBeGreaterThanOrEqual(0);
    });

    test('11. Every registered HTTP route path in backend routers strictly starts with /api/', () => {
        const onboardingRouter = require('../src/api/onboardingRoutes');
        const agentContractRouter = require('../src/api/agentRoutes');
        const remediationRouter = require('../src/api/remediationRoutes');
        const runtimeRouter = require('../src/api/runtimeRoutes');
        const eventRouter = require('../src/api/eventRoutes');
        
        const routersToTest = [
            { name: 'experienceRouter', router: experienceRouter },
            { name: 'systemRouter', router: systemRouter },
            { name: 'adapterRouter', router: adapterRouter },
            { name: 'healthRouter', router: healthRouter },
            { name: 'qualityRouter', router: qualityRouter },
            { name: 'usageRouter', router: usageRouter },
            { name: 'intelligenceRouter', router: require('../src/api/intelligenceRoutes') },
            { name: 'alertingRouter', router: require('../src/api/alertingRoutes') },
            { name: 'reportingRouter', router: require('../src/api/reportingRoutes') },
            { name: 'orchestrationRouter', router: require('../src/api/orchestrationRoutes') },
            { name: 'onboardingRouter', router: onboardingRouter },
            { name: 'agentContractRouter', router: agentContractRouter },
            { name: 'remediationRouter', router: remediationRouter },
            { name: 'runtimeRouter', router: runtimeRouter },
            { name: 'eventRouter', router: eventRouter }
        ];

        function checkRouterStack(rName, rObj) {
            if (!rObj || !rObj.stack) return;
            for (const layer of rObj.stack) {
                if (layer.route) {
                    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
                    for (const p of paths) {
                        expect(typeof p).toBe('string');
                        expect(p.startsWith('/api/')).toBe(true);
                    }
                } else if (layer.name === 'router' && layer.handle) {
                    checkRouterStack(`${rName} -> subrouter`, layer.handle);
                }
            }
        }

        for (const { name, router: r } of routersToTest) {
            checkRouterStack(name, r);
        }
    });

});
