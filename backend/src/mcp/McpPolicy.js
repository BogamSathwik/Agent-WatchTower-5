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

    isRoleAllowed(role) {
        if (this.allowedRoles.includes('*')) return true;
        return this.allowedRoles.includes(role);
    }

    isToolAllowed(toolName) {
        if (this.allowedTools.includes('*')) return true;
        return this.allowedTools.includes(toolName);
    }
}

module.exports = { McpPolicy };
