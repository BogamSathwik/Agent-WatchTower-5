const BaseRule = require('./BaseRule');

/**
 * Rule 2: AI / LLM Reasoning (Core for modern AI agents)
 * The agent must utilize AI/LLM reasoning, prompting, or semantic inference.
 */
class Rule2AiReasoning extends BaseRule {
    constructor() {
        super({
            id: 'ai_reasoning',
            ruleNumber: 2,
            name: 'AI / LLM Reasoning',
            category: 'Core for modern AI agents',
            weight: 15,
            importance: 'CORE',
            description: 'Agent utilizes AI/LLM model reasoning, cognitive chains, prompts, or semantic inference.',
            remediation: 'Specify the AI/LLM model (e.g., GPT-4o, Claude 3.5, Gemini 1.5, Ollama) or reasoning framework used for cognitive prompt processing.'
        });

        this.aiKeywords = [
            'llm', 'gpt', 'claude', 'gemini', 'ollama', 'reasoning', 'openai', 'anthropic',
            'prompt', 'inference', 'embedding', 'model', 'nlp', 'tokens', 'transformer',
            'langchain', 'llama', 'mistral', 'deepseek', 'cot', 'chain-of-thought',
            'generatecontent', 'completions.create', 'systemprompt', 'system_message',
            'chatcompletion', 'temperature', 'groq', 'huggingface'
        ];
    }

    /**
     * @override
     */
    evaluate(contract = {}, codeText = '', runtimeContext = null) {
        const explicit = this.checkExplicitCompliance(contract);
        if (explicit) return explicit;

        const model = contract.model || (contract.metadata && contract.metadata.model) || contract.llm;
        if (this.isIndeterminateValue(model)) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: `Insufficient evidence: AI/LLM model is declared as "${model}"`
            };
        }

        if (contract.model === false || contract.model === 'none' || contract.isAi === false || contract.ruleBased === true) {
            return {
                followed: false,
                status: 'FAIL',
                evidence: 'Explicitly declared as non-AI / rule-based without cognitive LLM reasoning'
            };
        }

        if (contract.unprobed === true && !model && !codeText) {
            return {
                followed: false,
                status: 'UNKNOWN',
                evidence: 'Insufficient evidence: remote service AI model cannot be verified without telemetry or source code'
            };
        }

        if (model) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `LLM model configured: ${model}`
            };
        }

        const haystack = this.extractHaystack(contract, codeText);
        const matched = this.findMatches(haystack, this.aiKeywords);

        if (matched.length > 0) {
            return {
                followed: true,
                status: 'PASS',
                evidence: `Cognitive/LLM indicators detected: ${matched.slice(0, 4).join(', ')}`
            };
        }

        return {
            followed: false,
            status: 'FAIL',
            evidence: 'No AI/LLM model, prompt chain, or cognitive reasoning engine detected.'
        };
    }
}

module.exports = Rule2AiReasoning;
