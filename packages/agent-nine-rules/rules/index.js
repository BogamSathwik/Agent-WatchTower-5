const BaseRule = require('./BaseRule');
const Rule1GoalObjective = require('./Rule1GoalObjective');
const Rule2AiReasoning = require('./Rule2AiReasoning');
const Rule3ActionTaking = require('./Rule3ActionTaking');
const Rule4ToolCalling = require('./Rule4ToolCalling');
const Rule5AutonomousDecision = require('./Rule5AutonomousDecision');
const Rule6ExecutionLoop = require('./Rule6ExecutionLoop');
const Rule7EnvironmentContext = require('./Rule7EnvironmentContext');
const Rule8ObservationResults = require('./Rule8ObservationResults');
const Rule9AdaptationReplanning = require('./Rule9AdaptationReplanning');

const RULE_CLASSES = [
    Rule1GoalObjective,
    Rule2AiReasoning,
    Rule3ActionTaking,
    Rule4ToolCalling,
    Rule5AutonomousDecision,
    Rule6ExecutionLoop,
    Rule7EnvironmentContext,
    Rule8ObservationResults,
    Rule9AdaptationReplanning
];

const RULES_MAP = {
    goal_objective: Rule1GoalObjective,
    ai_reasoning: Rule2AiReasoning,
    action_taking: Rule3ActionTaking,
    tool_calling: Rule4ToolCalling,
    autonomous_decision: Rule5AutonomousDecision,
    execution_loop: Rule6ExecutionLoop,
    environment_context: Rule7EnvironmentContext,
    observation_results: Rule8ObservationResults,
    adaptation_replanning: Rule9AdaptationReplanning
};

/**
 * Instantiate a fresh array of all 9 standard autonomous agent rules.
 * @returns {BaseRule[]}
 */
function createStandardRules() {
    return RULE_CLASSES.map(RuleClass => new RuleClass());
}

/**
 * Canonical JSON specification of all 9 standard rules.
 */
const STANDARD_RULES_SPEC = createStandardRules().map(r => r.toJSON());

const ConfigurableRule = require('./ConfigurableRule');

module.exports = {
    BaseRule,
    ConfigurableRule,
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
};
