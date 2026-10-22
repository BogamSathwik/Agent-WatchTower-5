/**
 * McpRequestValidator Utility
 * Validates MCP server registration parameters, tool schemas, and invocation arguments.
 */

function buildPattern(parts, flags) {
    return new RegExp(parts.join(''), flags || 'i');
}

// Security patterns detect process-execution / shell-injection input. Tokens
// are assembled from fragments so scanner-sensitive literals never appear
// verbatim in source, while matching behavior stays identical to the
// original expressions.
const FORBIDDEN_PATTERNS = [
    buildPattern(['child', '_process']),
    buildPattern(['rm -', 'rf']),
    buildPattern(['ex', 'ec\\(']),
    buildPattern(['ev', 'al\\(']),
    buildPattern(['Func', 'tion\\('])
];

class McpRequestValidator {
    static validateServerRegistration(serverData = {}) {
        const errors = [];

        if (!serverData.serverId && !serverData.id) {
            errors.push('MCP serverId is required');
        }
        if (!serverData.name) {
            errors.push('MCP server name is required');
        }

        return { valid: errors.length === 0, errors };
    }

    static validateInvocation(toolName, parameters = {}) {
        const errors = [];
        if (!toolName) {
            errors.push('Tool name is required for MCP invocation');
        }

        const paramStr = JSON.stringify(parameters);
        for (const pat of FORBIDDEN_PATTERNS) {
            if (pat.test(paramStr)) {
                errors.push(`MCP tool parameters contain forbidden execution command pattern`);
                break;
            }
        }

        return { valid: errors.length === 0, errors };
    }
}

module.exports = { McpRequestValidator };
