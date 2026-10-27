const BaseRule = require('./BaseRule');

/**
 * Rule 4: Tool / Function Calling (Usually)
 * The agent must integrate with external tools, function schemas, REST APIs, or MCP servers.
 */
class Rule4ToolCalling extends BaseRule {
    constructor() {
        super({
            id: 'tool_calling',
            ruleNumber: 4,
            name: 'Tool / Function Calling',
            category: 'Usually',
            weight: 10,
            importance: 'USUALLY',
            description: 'Agent integrates external tools, function calls, REST APIs, or MCP servers.',
            remediation: 'Declare tool schemas, function declarations, or MCP integrations that the agent can invoke.'
        });

        this.toolKeywords = [
            'tool', 'tools', 'function_call', 'calltool', 'mcp', 'adapter',
            'plugin', 'calculator', 'search', 'api_call', 'bindtools',
            'tools:', 'functions:', 'tool_choice', 'system.tools'
        ];
    }

    /**
     * @override
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        const explicit = this.checkExplicitCompliance(contract);
        if (explicit) return explicit;

        if (this.isIndeterminateValue(contract.tools) || this.isIndeterminateValue(contract.toolsString)) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: tool integration specification is marked as unknown or indeterminate'
            };
        }

        if (contract.tools === false || contract.noTools === true) {
            return {
                followed: false,
                status: 'FAIL',
                evidence: 'Explicitly declared without external tool or function calling capabilities'
            };
        }

        if (contract.unprobed === true && !contract.tools && !contract.toolsString && !codeText) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: unprobed candidate without tool schemas or source code'
            };
        }

        if (Array.isArray(contract.tools) && contract.tools.length > 0) {
            const list = contract.tools.map(t => t.name || t.id || String(t)).slice(0, 3).join(', ');
            return {
                followed: true,
                status: 'PASS',
                evidence: `${contract.tools.length} tool(s) registered: ${list}`
            };
        }

        if (Array.isArray(contract.interfaces) && contract.interfaces.length > 0) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `${contract.interfaces.length} external interface(s) declared`
            };
        }

        if (contract.toolsString || (contract.metadata && contract.metadata.tools) || contract.mcpServers) {
            const desc = contract.toolsString || (contract.metadata && contract.metadata.tools) || 'MCP servers configured';
            return {
                followed: true,
                status: 'PASS',
                evidence: `Tools / MCP declared: ${desc}`
            };
        }

        const caps = Array.isArray(contract.capabilities) ? contract.capabilities : [];
        if (caps.length > 1) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Multi-capability toolset verified (${caps.length} capabilities)`
            };
        }

        const haystack = this.extractHaystack(contract, codeText);
        const matched = this.findMatches(haystack, this.toolKeywords);

        if (matched.length > 0) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Tool calling / MCP integration patterns found: ${matched.slice(0, 3).join(', ')}`
            };
        }

        return {
            followed: false,
            status: 'FAIL',
            evidence: 'No tool schemas, function definitions, or MCP server integrations found.'
        };
    }
}

module.exports = Rule4ToolCalling;
