/**
 * @package agent-nine-rules
 * Core 9-Rule Verification and Quality Assurance Engine for Autonomous Agents & Web Apps.
 * Designed for standard imports, CLI usage, and seamless Model Context Protocol (MCP) tool integration.
 */

const NineRuleEvaluator = require('./NineRuleEvaluator');
const {
    BaseRule,
    Rule1GoalObjective,
    Rule2AiReasoning,
    Rule3ActionTaking,
    Rule4ToolCalling,
    Rule5AutonomousDecision,
    Rule6ExecutionLoop,
    Rule7EnvironmentContext,
    Rule8ObservationResults,
    Rule9AdaptationReplanning,
    RULE_CLASSES,
    RULES_MAP,
    createStandardRules,
    STANDARD_RULES_SPEC
} = require('./rules');

// Default singleton evaluator instance
const defaultEvaluator = new NineRuleEvaluator();

/**
 * Top-level convenience evaluation helpers
 */
function evaluate(contract, runtimeContext) {
    return defaultEvaluator.scan(contract, runtimeContext);
}

function evaluateCode(codeContent, metadata) {
    return defaultEvaluator.evaluateCode(codeContent, metadata);
}

function evaluateLink(url, metadata) {
    return defaultEvaluator.evaluateLink(url, metadata);
}

function evaluateAgent(agent, runtimeTelemetry) {
    return defaultEvaluator.evaluateAgent(agent, runtimeTelemetry);
}

function getNineRulesSpec() {
    return STANDARD_RULES_SPEC;
}

module.exports = {
    // Core Evaluator Class & Default Instance
    NineRuleEvaluator,
    defaultEvaluator,

    // Convenience Functions
    evaluate,
    evaluateCode,
    evaluateLink,
    evaluateAgent,
    getNineRulesSpec,

    // Rule Classes & Utilities
    BaseRule,
    ConfigurableRule: require('./rules').ConfigurableRule,
    createRule: NineRuleEvaluator.createRule,
    Rule1GoalObjective,
    Rule2AiReasoning,
    Rule3ActionTaking,
    Rule4ToolCalling,
    Rule5AutonomousDecision,
    Rule6ExecutionLoop,
    Rule7EnvironmentContext,
    Rule8ObservationResults,
    Rule9AdaptationReplanning,
    createStandardRules,

    // Constant Specifications
    RULE_CLASSES,
    RULES_MAP,
    STANDARD_RULES_SPEC,

    // Model Context Protocol (MCP) Server & Tool
    ...require('./mcp')
};
