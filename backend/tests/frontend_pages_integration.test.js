/**
 * Frontend Pages Functional & API Integration Verification Suite
 * Verifies that the Agent Watchtower feature pages (including Workflows,
 * Live Operations, Agent Monitoring, Audit, Settings) are present,
 * connected to backend APIs, and return real operational data.
 *
 * Product cleanup note: Fleet Intelligence, Early Warning, Decision
 * Intelligence, Simulation, Adaptive Response, Continuous Improvement,
 * Response Center, Agent Framework, Reasoning Engine and MCP Integrations
 * were removed from the user-facing product (incomplete/placeholder
 * surface); only genuinely usable pages are asserted here.
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../src/app');

describe('Frontend Pages & API Integration Suite', () => {
    let indexHtmlContent;
    let app;

    const allTabs = [
        'agents', 'runtime', 'onboarding', 'agentMonitoring', 'health', 
        'quality', 'usage', 'experience', 'intelligence',
        'alerts', 'reports', 'workflows', 
        'orchestration', 'remediation', 'events', 'operations', 'audit', 'settings'
    ];

    beforeAll(() => {
        app = createApp();
        const candidates = [
            path.join(__dirname, '..', '..', 'frontend', 'index.html'),
            path.join(__dirname, '..', 'frontend', 'index.html'),
            path.join(__dirname, '..', 'index.html')
        ];
        const indexPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
        indexHtmlContent = fs.readFileSync(indexPath, 'utf8');
    });

    describe('1. HTML Structural & Panel Mounting Verification for Feature Pages', () => {
        allTabs.forEach(tab => {
            const panelId = 'panel' + tab.charAt(0).toUpperCase() + tab.slice(1);
            const btnId = 'tabBtn' + tab.charAt(0).toUpperCase() + tab.slice(1);

            test(`Page '${tab}' panel (${panelId}) & nav button (${btnId}) are mounted in DOM`, () => {
                expect(indexHtmlContent).toContain(`id="${panelId}"`);
                expect(indexHtmlContent).toContain(`id="${btnId}"`);
            });
        });
    });

    describe('2. Navigation & Fetch Handlers Verification for Feature Pages', () => {
        allTabs.forEach(tab => {
            test(`switchTab includes active dispatch handler for '${tab}'`, () => {
                expect(indexHtmlContent).toContain(`if (tab === '${tab}')`);
            });
        });

        test('Frontend overview fetch functions are defined', () => {
            expect(indexHtmlContent).toContain('async function fetchWorkflowsOverview()');
            expect(indexHtmlContent).toContain('async function fetchAgentMonitoringOverview()');
            expect(indexHtmlContent).toContain('async function fetchRuntimeOverview()');
        });

        test('Human-readable profile and inspector modals are connected', () => {
            expect(indexHtmlContent).toContain('function inspectWorkflowUI');
        });
    });

    describe('3. Backend API Connectivity for Feature Pages', () => {
        test('GET /api/v1/workflows/overview returns 200 with data for Workflows page', async () => {
            const res = await request(app)
                .get('/api/v1/workflows/overview')
                .set('x-user-role', 'admin');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('totalWorkflows');
            expect(res.body.data).toHaveProperty('activeWorkflows');
        });

        test('GET /api/v1/monitoring/agents returns 200 with data for Agent Monitoring page', async () => {
            const res = await request(app)
                .get('/api/v1/monitoring/agents')
                .set('x-user-role', 'admin');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
        });
    });
});
