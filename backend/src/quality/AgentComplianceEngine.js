/**
 * Agent Compliance Engine
 * Scans, evaluates, and verifies agents against the 9 standard autonomous agent rules.
 * Powered by packages/agent-nine-rules (standalone, MCP-ready module).
 */

const path = require('path');

function resolveModule(subpath) {
    const candidateBases = [
        path.resolve(process.cwd(), 'packages/agent-nine-rules'),
        path.resolve(__dirname, '../../../packages/agent-nine-rules'),
        path.resolve(__dirname, '../../packages/agent-nine-rules'),
        path.resolve(__dirname, '../packages/agent-nine-rules'),
        path.resolve(__dirname, 'packages/agent-nine-rules')
    ];
    for (const base of candidateBases) {
        try {
            const target = path.join(base, subpath);
            return require(target);
        } catch (_) {}
    }
    return require(path.resolve(process.cwd(), 'packages/agent-nine-rules', subpath));
}

const NineRuleEvaluator = resolveModule('NineRuleEvaluator');
const { STANDARD_RULES_SPEC } = resolveModule('rules');

class AgentComplianceEngine extends NineRuleEvaluator {
    constructor(customRules = null) {
        super(customRules);
    }
}

const defaultComplianceEngine = new AgentComplianceEngine();

module.exports = {
    AgentComplianceEngine,
    defaultComplianceEngine,
    STANDARD_RULES_SPEC
};
