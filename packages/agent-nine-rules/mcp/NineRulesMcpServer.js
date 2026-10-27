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

const TOOL_DEFINITION = {
    name: TOOL_NAME,
    description: 'Verifies an AI agent or web application against the 9 standard autonomous agent rules (Goal/Objective, AI/LLM Reasoning, Ability to Take Actions, Tool/Function Calling, Autonomous Decision Making, Execution/Agent Loop, Environment/Context, Observation of Results, Adaptation/Re-planning). Evaluates compliance score (0-100%), overall status (COMPLIANT/PARTIALLY_COMPLIANT/NON_COMPLIANT), lifecycle recommendation (KEEP/REVIEW/RETIRE), individual rule statuses (PASS/FAIL/UNKNOWN), and rule-by-rule empirical evidence and remediations while strictly preserving Watchtower master identity.',
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
            runtimeContext: {
                type: 'object',
                description: 'Optional runtime telemetry context (health, last execution, tool status)',
                properties: {
                    health: { type: 'object', description: 'Health probe status (HEALTHY, UNHEALTHY, OFFLINE)' },
                    lastExecution: { type: 'object', description: 'Last execution report (success, retried, error)' },
                    toolStatus: { type: 'object', description: 'Tool availability status' }
                }
            }
        },
        required: ['agent']
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
        return toolName === TOOL_NAME || this.customTools.has(toolName);
    }

    /**
     * Returns tool specifications exposed by this server.
     * @returns {Array<Object>}
     */
    listTools() {
        const tools = [TOOL_DEFINITION];
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
     * Internal implementation of verify_agent_nine_rules tool.
     * Uses existing packages/agent-nine-rules/NineRuleEvaluator.js without duplicating rule logic.
     * Preserves exact Watchtower master identity fields: Primary ID, USERID, FIRMID, FILENAME, AGENT_NAME, PUBLIC_URL.
     *
     * @param {Object} parameters - Tool parameters
     * @returns {Object} Complete evaluation report
     */
    verifyAgentNineRules(parameters = {}) {
        // Validation for malformed input
        if (!parameters || typeof parameters !== 'object') {
            throw new Error(`Invalid parameters: Expected an object, got ${typeof parameters}`);
        }

        // Support both { agent: { ... }, runtimeContext: { ... } } and direct candidate object
        let candidate = parameters.agent;
        if (!candidate || typeof candidate !== 'object') {
            // Check if properties were passed at the top level
            const hasAgentFields = Object.keys(parameters).some(k =>
                ['id', 'ID', 'name', 'AGENT_NAME', 'purpose', 'description', 'model', 'tools', 'runner', 'endpoint', 'fileContent', 'FILENAME'].includes(k)
            );
            if (hasAgentFields) {
                candidate = parameters;
            } else {
                throw new Error("Invalid parameters: Missing required 'agent' object in arguments.");
            }
        }

        if (parameters.excludeRules && !candidate.excludeRules) {
            candidate.excludeRules = parameters.excludeRules;
        }
        if (parameters.customRules && !candidate.customRules) {
            candidate.customRules = parameters.customRules;
        }

        const runtimeContext = parameters.runtimeContext || candidate.runtimeContext || null;

        // Perform evaluation using existing NineRuleEvaluator
        const report = this.evaluator.scan(candidate, runtimeContext);

        // Preserve exact Agent Watchtower master identity
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
     * Dispatches tool invocation by name.
     * Supports built-in verify_agent_nine_rules and any registered custom tools.
     * @param {string} toolName
     * @param {Object} parameters
     * @returns {Promise<Object>} Tool execution result
     */
    async executeTool(toolName, parameters = {}) {
        if (toolName === TOOL_NAME) {
            return this.verifyAgentNineRules(parameters);
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
