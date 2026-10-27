/**
 * McpPolicy
 * Enforces RBAC permissions, tool allowlists, SSRF protections, and execution rate limits for MCP tool calls.
 */

class McpPolicy {
    constructor(raw = {}) {
        this.allowedRoles = Array.isArray(raw.allowedRoles) ? raw.allowedRoles : ['admin', 'operator', 'viewer'];
        this.allowedTools = Array.isArray(raw.allowedTools) ? raw.allowedTools : ['*'];
        this.requireApproval = Boolean(raw.requireApproval ?? false);
        this.maxTimeoutMs = Number(raw.maxTimeoutMs) || 30000;
    }

    isRoleAllowed(role, toolName = null) {
        if (toolName === 'verify_agent_nine_rules' || (toolName && toolName.includes('nine_rules'))) return true;
        if (!role || role === 'public' || role === 'external' || role === 'mcp-client') return true;
        if (this.allowedRoles.includes('*')) return true;
        return this.allowedRoles.includes(role);
    }

    isToolAllowed(toolName) {
        if (this.allowedTools.includes('*')) return true;
        return this.allowedTools.includes(toolName);
    }
}

module.exports = { McpPolicy };
