/**
 * NineRulesMcpServer
 * Dedicated Model Context Protocol (MCP) Server for the 9-Rule Autonomous Agent & Web App Evaluator.
 * Exposes exactly one primary tool: verify_agent_nine_rules
 *
 * Architecture:
 * MCP Client -> Nine-Rule MCP Server -> packages/agent-nine-rules -> NineRuleEvaluator -> Rule1 ... Rule9
 */

const readline = require('readline');
const NineRuleEvaluator = require('../NineRuleEvaluator');

const TOOL_NAME = 'verify_agent_nine_rules';
const WEB_APP_SCAN_TOOL_NAME = 'scan_web_app_nine_rules';
const EXTERNAL_MCP_SCAN_TOOL_NAME = 'scan_external_app_via_mcp';

const TOOL_DEFINITION = {
    name: TOOL_NAME,
    description: 'Verifies an AI agent or web application against the 9 standard autonomous agent rules (Goal/Objective, AI/LLM Reasoning, Ability to Take Actions, Tool/Function Calling, Autonomous Decision Making, Execution/Agent Loop, Environment/Context, Observation of Results, Adaptation/Re-planning). Evaluates compliance score (0-100%), overall status (COMPLIANT/PARTIALLY_COMPLIANT/NON_COMPLIANT), lifecycle recommendation (KEEP/REVIEW/RETIRE), individual rule statuses (PASS/FAIL/UNKNOWN), and rule-by-rule empirical evidence and remediations while strictly preserving Watchtower master identity. Supports live web app URLs, source code, remote MCP endpoints, or agent specifications.',
    inputSchema: {
        type: 'object',
        properties: {
            agent: {
                type: 'object',
                description: 'Agent or web application specification to verify against the 9 rules',
                properties: {
                    ID: { type: ['string', 'number'], description: 'Master Registry Primary ID' },
                    USERID: { type: ['string', 'number'], description: 'Master Registry USERID' },
                    FIRMID: { type: ['string', 'number'], description: 'Master Registry FIRMID' },
                    FILENAME: { type: 'string', description: 'Master Registry FILENAME (source code or script)' },
                    AGENT_NAME: { type: 'string', description: 'Master Registry AGENT_NAME' },
                    PUBLIC_URL: { type: 'string', description: 'Master Registry PUBLIC_URL or endpoint' },
                    id: { type: ['string', 'number'], description: 'Agent ID alias' },
                    name: { type: 'string', description: 'Agent name alias' },
                    purpose: { type: 'string', description: 'Agent stated purpose or task goal (Rule 1)' },
                    description: { type: 'string', description: 'Description of agent role or mission (Rule 1)' },
                    model: { type: 'string', description: 'Primary AI/LLM model (e.g. gpt-4o, claude-3-5-sonnet, gemini-1.5-pro, ollama) (Rule 2)' },
                    runner: { type: 'object', description: 'Execution runner config, e.g. { type: "http", endpoint: "..." } (Rule 3)' },
                    endpoint: { type: 'string', description: 'Live HTTP action endpoint (Rule 3)' },
                    tools: { type: 'array', description: 'Registered tools, functions, or sub-agents (Rule 4)' },
                    toolsString: { type: 'string', description: 'Comma-separated tools or MCP integrations (Rule 4)' },
                    category: { type: 'string', description: 'Operating category, e.g. autonomous, automation (Rule 5)' },
                    decisionPolicy: { type: 'string', description: 'Routing policy or decision rules (Rule 5)' },
                    policy: { type: 'string', description: 'Autonomous policy specification (Rule 5)' },
                    monitoring: { type: 'object', description: 'Health check interval and quality testing config (Rule 6, 8)' },
                    schedule: { type: 'string', description: 'Execution cycle schedule or interval (Rule 6)' },
                    connection: { type: 'object', description: 'Connection profile, retries, and health endpoint (Rule 7, 8, 9)' },
                    environment: { type: 'object', description: 'Environment/context variables or profile (Rule 7)' },
                    tenantId: { type: 'string', description: 'Multi-tenant context identifier (Rule 7)' },
                    fileContent: { type: 'string', description: 'Raw source code text for static evaluation' },
                    codeSnippet: { type: 'string', description: 'Code snippet for heuristic evaluation' },
                    compliance: { type: 'object', description: 'Optional explicit boolean checklist overrides' }
                }
            },
            url: { type: 'string', description: 'Live web application URL or HTTP endpoint to scan (Rule 1, 3, 6, 8)' },
            endpoint: { type: 'string', description: 'HTTP endpoint alias for web app scanning' },
            publicUrl: { type: 'string', description: 'Public URL of web app or agent' },
            PUBLIC_URL: { type: 'string', description: 'Master Registry PUBLIC_URL alias' },
            code: { type: 'string', description: 'Source code or script text for static 9-rule evaluation' },
            fileContent: { type: 'string', description: 'File content alias for code evaluation' },
            serverUrl: { type: 'string', description: 'External MCP server URL to inspect and scan via MCP' },
            name: { type: 'string', description: 'Web app or agent name' },
            AGENT_NAME: { type: 'string', description: 'Master Registry agent name' },
            model: { type: 'string', description: 'AI/LLM model identifier' },
            purpose: { type: 'string', description: 'Stated goal or operational mission' },
            tools: { type: ['array', 'string'], description: 'Tools or APIs exposed by the web app' },
            runtimeContext: {
                type: 'object',
                description: 'Optional runtime telemetry context (health, last execution, tool status)',
                properties: {
                    health: { type: 'object', description: 'Health probe status (HEALTHY, UNHEALTHY, OFFLINE)' },
                    lastExecution: { type: 'object', description: 'Last execution report (success, retried, error)' },
                    toolStatus: { type: 'object', description: 'Tool availability status' }
                }
            }
        }
    }
};

const WEB_APP_SCAN_TOOL_DEFINITION = {
    name: WEB_APP_SCAN_TOOL_NAME,
    description: 'Scans an external web application or agent via live URL / HTTP endpoint against the 9 autonomous agent rules and returns a structured compliance audit report.',
    inputSchema: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'Web app URL or API endpoint to audit (e.g. http://localhost:5000/mock-app or https://my-agent.com)' },
            name: { type: 'string', description: 'Application or agent name' },
            purpose: { type: 'string', description: 'Stated purpose or operational goal of the web app' },
            model: { type: 'string', description: 'Underlying LLM model if known (e.g. gpt-4o, claude-3-5-sonnet)' },
            tools: { type: ['array', 'string'], description: 'Tools, APIs, or integrations used by the web app' },
            environment: { type: 'object', description: 'Environment context or runtime configuration' }
        },
        required: ['url']
    }
};

const EXTERNAL_MCP_SCAN_TOOL_DEFINITION = {
    name: EXTERNAL_MCP_SCAN_TOOL_NAME,
    description: 'Connects to an external web application or agent via its MCP server endpoint, discovers its exposed tools, resources, and capabilities, and evaluates it against the 9 autonomous agent rules.',
    inputSchema: {
        type: 'object',
        properties: {
            serverUrl: { type: 'string', description: 'URL of the external application MCP endpoint (e.g. http://localhost:5000/api/v1/mcp/mock-external-app)' },
            appName: { type: 'string', description: 'Optional name of the external application or agent' }
        },
        required: ['serverUrl']
    }
};

class NineRulesMcpServer {
    /**
     * @param {Object} [options]
     * @param {NineRuleEvaluator} [options.evaluator] - Optional custom evaluator instance
     * @param {string} [options.serverName] - Server name identifier
     * @param {string} [options.version] - Server version
     */
    constructor(options = {}) {
        this.evaluator = options.evaluator || new NineRuleEvaluator();
        this.serverName = options.serverName || 'agent-nine-rules-mcp-server';
        this.version = options.version || '1.0.0';
        this.protocolVersion = '2024-11-05';
        this.customTools = new Map();
        if (Array.isArray(options.extraTools)) {
            options.extraTools.forEach(t => this.registerCustomTool(t.definition, t.handler));
        }
    }

    /**
     * Registers a custom tool on this MCP server.
     * @param {Object} definition - Tool specification (name, description, inputSchema)
     * @param {Function} handler - Asynchronous or synchronous tool execution handler
     */
    registerCustomTool(definition, handler) {
        if (!definition || !definition.name) return;
        this.customTools.set(definition.name, { definition, handler });
    }

    /**
     * Checks if a tool is registered.
     * @param {string} toolName
     * @returns {boolean}
     */
    hasTool(toolName) {
        return toolName === TOOL_NAME ||
               toolName === WEB_APP_SCAN_TOOL_NAME ||
               toolName === EXTERNAL_MCP_SCAN_TOOL_NAME ||
               this.customTools.has(toolName);
    }

    /**
     * Returns tool specifications exposed by this server.
     * @returns {Array<Object>}
     */
    listTools() {
        const tools = [
            TOOL_DEFINITION,
            WEB_APP_SCAN_TOOL_DEFINITION,
            EXTERNAL_MCP_SCAN_TOOL_DEFINITION
        ];
        for (const entry of this.customTools.values()) {
            tools.push(entry.definition);
        }
        return tools;
    }

    /**
     * Returns the underlying rule evaluator instance.
     * @returns {NineRuleEvaluator}
     */
    getEvaluator() {
        return this.evaluator;
    }

    /**
     * Dynamically adds a new rule to this MCP server's evaluator.
     * @param {Object} ruleOrConfig
     */
    addRule(ruleOrConfig) {
        return this.evaluator.addRule(ruleOrConfig);
    }

    /**
     * Dynamically removes a rule by ID or number.
     * @param {string|number} ruleIdOrNumber
     */
    removeRule(ruleIdOrNumber) {
        return this.evaluator.removeRule(ruleIdOrNumber);
    }

    /**
     * Dynamically updates a rule configuration.
     * @param {string|number} ruleIdOrNumber
     * @param {Object} updates
     */
    updateRule(ruleIdOrNumber, updates) {
        return this.evaluator.updateRule(ruleIdOrNumber, updates);
    }

    /**
     * Replaces all rules with a new custom rule set.
     * @param {Array<Object>} newRules
     */
    setRules(newRules) {
        return this.evaluator.setRules(newRules);
    }

    /**
     * Resets back to the standard canonical 9 rules.
     */
    resetRules() {
        return this.evaluator.resetRules();
    }

    /**
     * Formats an evaluation report while strictly preserving Watchtower master identity fields:
     * Primary ID, USERID, FIRMID, FILENAME, AGENT_NAME, PUBLIC_URL.
     *
     * @private
     * @param {Object} report - Raw scan report from NineRuleEvaluator
     * @param {Object} candidate - Agent / web app candidate specification
     * @returns {Object} Standardized 9-rule compliance report
     */
    _formatReport(report, candidate = {}) {
        const identity = {
            ID: candidate.ID !== undefined ? candidate.ID : (candidate.masterId !== undefined ? candidate.masterId : (candidate.id !== undefined ? candidate.id : (candidate.agentId !== undefined ? candidate.agentId : null))),
            USERID: candidate.USERID !== undefined ? candidate.USERID : (candidate.userId !== undefined ? candidate.userId : null),
            FIRMID: candidate.FIRMID !== undefined ? candidate.FIRMID : (candidate.firmId !== undefined ? candidate.firmId : null),
            FILENAME: candidate.FILENAME !== undefined ? candidate.FILENAME : (candidate.fileName !== undefined ? candidate.fileName : (candidate.filename !== undefined ? candidate.filename : null)),
            AGENT_NAME: candidate.AGENT_NAME !== undefined ? candidate.AGENT_NAME : (candidate.agentName !== undefined ? candidate.agentName : (candidate.name !== undefined ? candidate.name : null)),
            PUBLIC_URL: candidate.PUBLIC_URL !== undefined ? candidate.PUBLIC_URL : (candidate.publicUrl !== undefined ? candidate.publicUrl : (candidate.url !== undefined ? candidate.url : (candidate.endpoint !== undefined ? candidate.endpoint : null))),
            // CamelCase aliases
            primaryId: candidate.ID !== undefined ? candidate.ID : (candidate.masterId !== undefined ? candidate.masterId : (candidate.id !== undefined ? candidate.id : (candidate.agentId !== undefined ? candidate.agentId : null))),
            masterId: candidate.ID !== undefined ? candidate.ID : (candidate.masterId !== undefined ? candidate.masterId : (candidate.id !== undefined ? candidate.id : (candidate.agentId !== undefined ? candidate.agentId : null))),
            userId: candidate.USERID !== undefined ? candidate.USERID : (candidate.userId !== undefined ? candidate.userId : null),
            firmId: candidate.FIRMID !== undefined ? candidate.FIRMID : (candidate.firmId !== undefined ? candidate.firmId : null),
            fileName: candidate.FILENAME !== undefined ? candidate.FILENAME : (candidate.fileName !== undefined ? candidate.fileName : (candidate.filename !== undefined ? candidate.filename : null)),
            agentName: candidate.AGENT_NAME !== undefined ? candidate.AGENT_NAME : (candidate.agentName !== undefined ? candidate.agentName : (candidate.name !== undefined ? candidate.name : null)),
            publicUrl: candidate.PUBLIC_URL !== undefined ? candidate.PUBLIC_URL : (candidate.publicUrl !== undefined ? candidate.publicUrl : (candidate.url !== undefined ? candidate.url : (candidate.endpoint !== undefined ? candidate.endpoint : null)))
        };

        return {
            identity,
            agentId: identity.ID || report.agentId,
            agentName: identity.AGENT_NAME || report.agentName,
            complianceScore: report.complianceScore,
            status: report.status,
            overallStatus: report.status,
            recommendation: report.recommendation,
            isFullyCompliant: report.isFullyCompliant,
            hasMissingCoreRules: report.hasMissingCoreRules,
            rulesFollowedCount: report.rulesFollowedCount,
            rulesMissingCount: report.rulesMissingCount,
            rulesUnknownCount: report.rulesUnknownCount,
            totalRules: report.totalRules,
            rules: report.rules || report.allRules,
            allRules: report.allRules,
            followedRules: report.followedRules,
            missingRules: report.missingRules,
            unknownRules: report.unknownRules,
            runtimeViolations: report.runtimeViolations,
            needsRemediation: report.needsRemediation,
            remediationActions: report.remediationActions,
            scannedAt: report.scannedAt
        };
    }

    /**
     * Evaluates an external web application or agent via live URL / HTTP endpoint.
     * Probes connectivity, checks headers, and evaluates compliance with all 9 rules.
     *
     * @param {Object} parameters - Scan parameters (url, name, purpose, model, tools, environment)
     * @returns {Promise<Object>} Complete 9-rule evaluation report with live probe diagnostics
     */
    async scanWebAppNineRules(parameters = {}) {
        let targetUrl = parameters.url || parameters.endpoint || parameters.publicUrl || parameters.PUBLIC_URL || parameters.appUrl;
        if (!targetUrl) {
            throw new Error("Missing required 'url' parameter for scan_web_app_nine_rules");
        }
        targetUrl = String(targetUrl).trim();
        if (!/^https?:\/\//i.test(targetUrl)) {
            targetUrl = 'http://' + targetUrl;
        }

        let probeLatency = 0;
        let probeStatus = 'UNKNOWN';
        let probeStatusCode = null;
        let probeHeaders = {};
        const startTime = Date.now();

        try {
            const probe = await fetch(targetUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(6000),
                headers: { 'User-Agent': 'Watchtower-Nine-Rules-Scanner/1.0' }
            });
            probeStatusCode = probe.status;
            probeLatency = Date.now() - startTime;
            probeStatus = probe.ok ? 'HEALTHY' : (probe.status < 500 ? 'DEGRADED' : 'UNHEALTHY');
            probeHeaders = {
                server: probe.headers.get('server') || null,
                contentType: probe.headers.get('content-type') || null
            };
        } catch (_) {
            probeLatency = Date.now() - startTime;
            probeStatus = 'UNHEALTHY';
        }

        let hostname = 'External Web App';
        try { hostname = new URL(targetUrl).hostname; } catch (_) {}
        const cleanName = parameters.name || parameters.AGENT_NAME || hostname;
        const purpose = parameters.purpose || `Web application or autonomous agent deployed at ${targetUrl}`;

        const candidate = {
            id: parameters.id || parameters.ID || `webapp-${Date.now()}`,
            name: cleanName,
            AGENT_NAME: cleanName,
            url: targetUrl,
            endpoint: targetUrl,
            PUBLIC_URL: targetUrl,
            purpose,
            description: purpose,
            model: parameters.model || null,
            tools: parameters.tools || null,
            toolsString: Array.isArray(parameters.tools) ? parameters.tools.join(', ') : (parameters.tools || null),
            runner: { type: 'http', endpoint: targetUrl },
            connection: { endpoint: targetUrl, retries: 3, healthEndpoint: `${targetUrl}/health` },
            monitoring: { endpoint: targetUrl, status: probeStatus },
            ...parameters
        };

        const runtimeContext = {
            health: {
                status: probeStatus,
                statusCode: probeStatusCode,
                latencyMs: probeLatency
            }
        };

        const report = this.evaluator.scan(candidate, runtimeContext);
        const formatted = this._formatReport(report, candidate);
        formatted.scanType = 'WEB_APP_URL';
        formatted.webAppProbe = {
            url: targetUrl,
            status: probeStatus,
            statusCode: probeStatusCode,
            latencyMs: probeLatency,
            headers: probeHeaders
        };
        return formatted;
    }

    /**
     * Connects to an external web application via its MCP server endpoint, discovers
     * exposed tools, prompts, and resources, and evaluates compliance with the 9 rules.
     *
     * @param {Object} parameters - Parameters (serverUrl, appName, model, tools)
     * @returns {Promise<Object>} Complete 9-rule evaluation report with MCP discovery diagnostics
     */
    async scanExternalAppViaMcp(parameters = {}) {
        let serverUrl = parameters.serverUrl || parameters.url || parameters.endpoint;
        if (!serverUrl) {
            throw new Error("Missing required 'serverUrl' parameter for scan_external_app_via_mcp");
        }
        serverUrl = String(serverUrl).trim();
        if (!/^https?:\/\//i.test(serverUrl)) {
            serverUrl = 'http://' + serverUrl;
        }

        let hostname = 'MCP Server';
        try { hostname = new URL(serverUrl).hostname; } catch (_) {}
        const appName = parameters.appName || parameters.name || `External App (${hostname})`;

        let discoveredTools = [];
        let discoveredResources = [];
        let serverInfo = { name: appName };
        let probeLatency = 0;
        let connectionStatus = 'HEALTHY';
        let probeError = null;

        const startTime = Date.now();
        try {
            // Step 1: Initialize handshake
            try {
                const initRes = await fetch(serverUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: `init_${Date.now()}`,
                        method: 'initialize',
                        params: {
                            protocolVersion: '2024-11-05',
                            capabilities: {},
                            clientInfo: { name: 'WatchtowerNineRulesScanner', version: '1.0.0' }
                        }
                    }),
                    signal: AbortSignal.timeout(6000)
                });

                if (initRes.ok) {
                    const initData = await initRes.json();
                    if (initData.result && initData.result.serverInfo) {
                        serverInfo = initData.result.serverInfo;
                    }
                }
            } catch (_) {}

            // Step 2: Discover tools
            const toolsRes = await fetch(serverUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: `tools_${Date.now()}`,
                    method: 'tools/list',
                    params: {}
                }),
                signal: AbortSignal.timeout(6000)
            });

            if (toolsRes.ok) {
                const toolsData = await toolsRes.json();
                if (toolsData.result && Array.isArray(toolsData.result.tools)) {
                    discoveredTools = toolsData.result.tools;
                }
            }

            // Step 3: Discover resources
            try {
                const resRes = await fetch(serverUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: `res_${Date.now()}`,
                        method: 'resources/list',
                        params: {}
                    }),
                    signal: AbortSignal.timeout(4000)
                });
                if (resRes.ok) {
                    const resData = await resRes.json();
                    if (resData.result && Array.isArray(resData.result.resources)) {
                        discoveredResources = resData.result.resources;
                    }
                }
            } catch (_) {}

            probeLatency = Date.now() - startTime;
        } catch (err) {
            probeError = err.message;
            connectionStatus = 'DEGRADED';
            probeLatency = Date.now() - startTime;
        }

        // Build candidate agent specification from MCP capabilities
        const toolNames = discoveredTools.map(t => t.name);
        const toolsDesc = discoveredTools.map(t => `${t.name}: ${t.description || 'action'}`).join('; ');
        const finalName = serverInfo.name || appName;
        const purpose = `External Web Application / Agent connected via MCP at ${serverUrl}. Discovered ${discoveredTools.length} tools (${toolNames.join(', ') || 'none'}).`;

        const candidate = {
            id: `mcp-${Date.now()}`,
            name: finalName,
            AGENT_NAME: finalName,
            url: serverUrl,
            endpoint: serverUrl,
            PUBLIC_URL: serverUrl,
            purpose,
            description: purpose,
            model: parameters.model || 'External LLM / MCP Agent',
            tools: toolNames.length > 0 ? toolNames : (parameters.tools || null),
            toolsString: toolsDesc || (toolNames.join(', ') || null),
            runner: { type: 'mcp_jsonrpc', endpoint: serverUrl },
            connection: { endpoint: serverUrl, retries: 3, healthEndpoint: serverUrl },
            monitoring: { endpoint: serverUrl, intervalSeconds: 30 },
            environment: {
                serverUrl,
                resourcesCount: discoveredResources.length,
                protocolVersion: '2024-11-05'
            },
            ...parameters
        };

        const runtimeContext = {
            health: {
                status: probeError ? 'UNHEALTHY' : 'HEALTHY',
                latencyMs: probeLatency,
                reason: probeError || 'MCP handshake successful'
            },
            discoveredToolsCount: discoveredTools.length,
            discoveredResourcesCount: discoveredResources.length
        };

        const report = this.evaluator.scan(candidate, runtimeContext);
        const formatted = this._formatReport(report, candidate);
        formatted.scanType = 'EXTERNAL_MCP_SERVER';
        formatted.mcpInspection = {
            serverUrl,
            serverInfo,
            discoveredToolsCount: discoveredTools.length,
            discoveredTools: discoveredTools.map(t => ({ name: t.name, description: t.description })),
            discoveredResourcesCount: discoveredResources.length,
            probeLatencyMs: probeLatency,
            connectionStatus,
            probeError
        };
        return formatted;
    }

    /**
     * Internal implementation of verify_agent_nine_rules tool.
     * Uses existing packages/agent-nine-rules/NineRuleEvaluator.js without duplicating rule logic.
     * Preserves exact Watchtower master identity fields: Primary ID, USERID, FIRMID, FILENAME, AGENT_NAME, PUBLIC_URL.
     * Supports live web app URLs, code snippets, remote MCP servers, or agent candidate specs.
     *
     * @param {Object} parameters - Tool parameters
     * @returns {Promise<Object>} Complete evaluation report
     */
    async verifyAgentNineRules(parameters = {}) {
        // Validation for malformed input
        if (!parameters || typeof parameters !== 'object') {
            throw new Error(`Invalid parameters: Expected an object, got ${typeof parameters}`);
        }

        // Mode 1: Remote MCP Server scanning
        if (parameters.serverUrl && !parameters.agent) {
            return await this.scanExternalAppViaMcp(parameters);
        }

        // Mode 2: Direct Web App URL scanning
        const directUrl = parameters.url || parameters.endpoint || parameters.publicUrl || parameters.PUBLIC_URL || parameters.appUrl;
        const directCode = parameters.code || parameters.fileContent || parameters.sourceCode || parameters.codeSnippet;

        if (directUrl && !parameters.agent && !directCode && !parameters.runner) {
            return await this.scanWebAppNineRules(parameters);
        }

        // Mode 3: Direct source code evaluation
        if (directCode && !parameters.agent && !directUrl) {
            const report = this.evaluator.evaluateCode(directCode, parameters);
            const formatted = this._formatReport(report, parameters);
            formatted.scanType = 'SOURCE_CODE';
            return formatted;
        }

        // Mode 4: Structured agent specification or top-level properties
        let candidate = parameters.agent;
        if (!candidate || typeof candidate !== 'object') {
            const hasAgentFields = Object.keys(parameters).some(k =>
                ['id', 'ID', 'name', 'AGENT_NAME', 'purpose', 'description', 'model', 'tools', 'toolsString', 'runner', 'endpoint', 'fileContent', 'FILENAME', 'url', 'URL', 'publicUrl', 'PUBLIC_URL', 'code', 'sourceCode', 'codeSnippet', 'serverUrl'].includes(k)
            );
            if (hasAgentFields) {
                candidate = parameters;
            } else {
                throw new Error("Invalid parameters: Missing required 'agent' object, 'url', or 'code' in arguments.");
            }
        }

        if (parameters.excludeRules && !candidate.excludeRules) {
            candidate.excludeRules = parameters.excludeRules;
        }
        if (parameters.customRules && !candidate.customRules) {
            candidate.customRules = parameters.customRules;
        }

        // If candidate is purely code without runtime runner
        if ((candidate.code || candidate.fileContent || candidate.sourceCode) && !candidate.runner && !candidate.endpoint) {
            const code = candidate.code || candidate.fileContent || candidate.sourceCode;
            const report = this.evaluator.evaluateCode(code, candidate);
            const formatted = this._formatReport(report, candidate);
            formatted.scanType = 'SOURCE_CODE';
            return formatted;
        }

        // If candidate is purely a link without code or runner
        if ((candidate.url || candidate.endpoint || candidate.publicUrl) && !candidate.fileContent && !candidate.runner) {
            const linkUrl = candidate.url || candidate.endpoint || candidate.publicUrl;
            const report = this.evaluator.evaluateLink(linkUrl, candidate);
            const formatted = this._formatReport(report, candidate);
            formatted.scanType = 'WEB_APP_URL';
            return formatted;
        }

        const runtimeContext = parameters.runtimeContext || candidate.runtimeContext || null;
        const report = this.evaluator.scan(candidate, runtimeContext);
        const formatted = this._formatReport(report, candidate);
        formatted.scanType = 'AGENT_SPECIFICATION';
        return formatted;
    }

    /**
     * Dispatches tool invocation by name.
     * Supports built-in verify_agent_nine_rules, scan_web_app_nine_rules,
     * scan_external_app_via_mcp, and any registered custom tools.
     *
     * @param {string} toolName
     * @param {Object} parameters
     * @returns {Promise<Object>} Tool execution result
     */
    async executeTool(toolName, parameters = {}) {
        if (toolName === TOOL_NAME) {
            return await this.verifyAgentNineRules(parameters);
        }
        if (toolName === WEB_APP_SCAN_TOOL_NAME) {
            return await this.scanWebAppNineRules(parameters);
        }
        if (toolName === EXTERNAL_MCP_SCAN_TOOL_NAME) {
            return await this.scanExternalAppViaMcp(parameters);
        }
        const custom = this.customTools.get(toolName);
        if (custom && typeof custom.handler === 'function') {
            return await Promise.resolve(custom.handler(parameters));
        }
        throw new Error(`Unknown tool: '${toolName}'. Available tools on this MCP server: ${this.listTools().map(t => t.name).join(', ')}`);
    }

    /**
     * Handles JSON-RPC 2.0 messages from MCP clients.
     * @param {Object} request - Parsed JSON-RPC message
     * @returns {Promise<Object|null>} JSON-RPC response or null if notification
     */
    async handleJsonRpcMessage(request) {
        if (!request || typeof request !== 'object') {
            return {
                jsonrpc: '2.0',
                id: null,
                error: { code: -32600, message: 'Invalid Request: Expected a JSON object' }
            };
        }

        const id = request.id !== undefined ? request.id : null;
        const method = request.method;

        // Notification (no id)
        if (id === null && method === 'notifications/initialized') {
            return null;
        }

        try {
            switch (method) {
                case 'initialize':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            protocolVersion: this.protocolVersion,
                            capabilities: {
                                tools: { listChanged: false }
                            },
                            serverInfo: {
                                name: this.serverName,
                                version: this.version
                            }
                        }
                    };

                case 'ping':
                    return { jsonrpc: '2.0', id, result: {} };

                case 'tools/list':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            tools: this.listTools()
                        }
                    };

                case 'tools/call': {
                    const params = request.params || {};
                    const name = params.name;
                    const args = params.arguments || {};

                    const result = await this.executeTool(name, args);

                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(result, null, 2)
                                }
                            ],
                            structuredResult: result
                        }
                    };
                }

                case 'resources/list':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            resources: [
                                {
                                    uri: 'mcp://watchtower/fleet/summary',
                                    name: 'Watchtower Fleet Summary',
                                    description: 'Overview of all registered agents, operational health, and fleet compliance.',
                                    mimeType: 'application/json'
                                },
                                {
                                    uri: 'mcp://watchtower/health',
                                    name: 'Platform Health Overview',
                                    description: 'Live platform and agent monitoring health status.',
                                    mimeType: 'application/json'
                                },
                                {
                                    uri: 'mcp://watchtower/compliance/rules',
                                    name: '9-Rule Autonomous Standards',
                                    description: 'Standard specification of the 9 autonomous agent rules.',
                                    mimeType: 'application/json'
                                }
                            ]
                        }
                    };

                case 'resources/read': {
                    const uri = (request.params && request.params.uri) || '';
                    let content = {};
                    if (uri.includes('compliance/rules')) {
                        content = {
                            standard: '9-Rule Autonomous Agent & Web App Criteria',
                            rules: [
                                'Rule 1: Goal/Objective Specification',
                                'Rule 2: AI/LLM Reasoning Engine',
                                'Rule 3: Action Execution Capability',
                                'Rule 4: Tool & Function Calling',
                                'Rule 5: Autonomous Decision Making',
                                'Rule 6: Execution Loop & Lifecycle',
                                'Rule 7: Context & Environment Isolation',
                                'Rule 8: Observation & Verification',
                                'Rule 9: Dynamic Adaptation & Self-Healing'
                            ]
                        };
                    } else if (uri.includes('health')) {
                        content = {
                            status: 'HEALTHY',
                            uptimeSeconds: process.uptime(),
                            nodeVersion: process.version,
                            timestamp: new Date().toISOString()
                        };
                    } else {
                        content = {
                            server: this.serverName,
                            version: this.version,
                            protocol: this.protocolVersion,
                            toolsCount: this.listTools().length,
                            timestamp: new Date().toISOString()
                        };
                    }
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            contents: [
                                {
                                    uri,
                                    mimeType: 'application/json',
                                    text: JSON.stringify(content, null, 2)
                                }
                            ]
                        }
                    };
                }

                case 'prompts/list':
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            prompts: [
                                {
                                    name: 'audit_agent_readiness',
                                    description: 'Prompt template to evaluate an autonomous agent or web application against the 9 rules.',
                                    arguments: [
                                        { name: 'agentName', description: 'Name of the agent', required: true },
                                        { name: 'sourceCode', description: 'Optional code snippet or URL', required: false }
                                    ]
                                },
                                {
                                    name: 'analyze_fleet_health',
                                    description: 'Prompt template to analyze the operational health and risk posture across the agent fleet.',
                                    arguments: []
                                }
                            ]
                        }
                    };

                case 'prompts/get': {
                    const promptName = request.params && request.params.name;
                    return {
                        jsonrpc: '2.0',
                        id,
                        result: {
                            description: `Prompt template for ${promptName}`,
                            messages: [
                                {
                                    role: 'user',
                                    content: {
                                        type: 'text',
                                        text: `Evaluate target '${(request.params && request.params.arguments && request.params.arguments.agentName) || 'agent'}' using Watchtower tool verify_agent_nine_rules and report compliance.`
                                    }
                                }
                            ]
                        }
                    };
                }

                default:
                    return {
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -32601,
                            message: `Method not found: '${method}'`
                        }
                    };
            }
        } catch (err) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: err.message || 'Internal server error during MCP tool execution'
                }
            };
        }
    }

    /**
     * Starts the MCP server on stdio (standard input/output) for CLI / external process clients.
     */
    startStdioTransport() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        rl.on('line', async (line) => {
            const trimmed = line.trim();
            if (!trimmed) return;

            try {
                const request = JSON.parse(trimmed);
                const response = await this.handleJsonRpcMessage(request);
                if (response !== null) {
                    process.stdout.write(JSON.stringify(response) + '\n');
                }
            } catch (err) {
                const errResponse = {
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32700,
                        message: `Parse error: ${err.message}`
                    }
                };
                process.stdout.write(JSON.stringify(errResponse) + '\n');
            }
        });

        process.stderr.write(`[NineRulesMcpServer] Started MCP server stdio transport (${this.serverName} v${this.version})\n`);
    }
}

module.exports = {
    NineRulesMcpServer,
    TOOL_NAME,
    TOOL_DEFINITION
};

if (require.main === module) {
    const server = new NineRulesMcpServer();
    server.startStdioTransport();
}
