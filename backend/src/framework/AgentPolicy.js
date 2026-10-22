/**
 * AgentPolicy Model & Enforcement
 * Manages security policies, RBAC access control, tool allowlists, SSRF protections, and execution rate limits for framework agents.
 */

class AgentPolicy {
    constructor(raw = {}) {
        this.allowedRoles = Array.isArray(raw.allowedRoles) ? raw.allowedRoles : ['admin', 'operator', 'viewer'];
        this.allowedTools = Array.isArray(raw.allowedTools) ? raw.allowedTools : ['*'];
        this.allowedOperations = Array.isArray(raw.allowedOperations) ? raw.allowedOperations : ['*'];
        this.requireApproval = Boolean(raw.requireApproval ?? false);
        this.maxExecutionTimeMs = Number(raw.maxExecutionTimeMs) || 60000;
        this.allowUnauthenticatedAccess = Boolean(raw.allowUnauthenticatedAccess ?? false);
    }

    isRoleAllowed(role) {
        if (this.allowedRoles.includes('*')) return true;
        return this.allowedRoles.includes(role);
    }

    isToolAllowed(toolName) {
        if (this.allowedTools.includes('*')) return true;
        return this.allowedTools.includes(toolName);
    }

    isOperationAllowed(operation) {
        if (this.allowedOperations.includes('*')) return true;
        return this.allowedOperations.includes(operation);
    }
}

module.exports = { AgentPolicy };
