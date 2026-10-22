/**
 * AgentFramework
 * Main agent framework abstraction layer that extends and wraps the Universal Agent Contract,
 * managing agent definitions, capability discovery, tool registries, security policies, and execution context.
 */

const { AgentDefinition } = require('./AgentDefinition');
const { AgentCapabilityRegistry } = require('./AgentCapabilityRegistry');
const { AgentToolRegistry } = require('./AgentToolRegistry');
const { AgentContext } = require('./AgentContext');
const { AgentExecutionContext } = require('./AgentExecutionContext');
const { AgentPolicy } = require('./AgentPolicy');
const { AgentFrameworkValidator } = require('./AgentFrameworkValidator');
const { auditLogService } = require('../audit/AuditLogService');

class AgentFramework {
    constructor(options = {}) {
        this.agentRegistry = options.agentRegistry || null;
        this.agentService = options.agentService || null;

        this.agents = new Map();
        this.capabilityRegistry = new AgentCapabilityRegistry();
        this.toolRegistry = new AgentToolRegistry();

        this._initDefaultAgents();
    }

    _initDefaultAgents() {
        const demoAgent = new AgentDefinition({
            id: 'TEST-AGENT-001',
            name: 'AgentOS Universal Test Agent',
            description: 'Universal Agent OS test agent supporting health check, task execution, workflow, reasoning, and tools.',
            version: '1.0.0',
            contractVersion: '1.0.0',
            category: 'testing',
            baseUrl: 'http://localhost:4001',
            healthEndpoint: '/health',
            executionEndpoint: '/agent',
            capabilities: ['health', 'execute', 'telemetry', 'testing', 'reasoning', 'mcp'],
            supportedOperations: ['health_check', 'task_execution', 'workflow_execution', 'tool_usage', 'reasoning_test'],
            tools: [
                { name: 'ping', description: 'Check target agent responsiveness', allowedRoles: ['admin', 'operator', 'viewer'] },
                { name: 'diagnostics', description: 'Run internal agent diagnostics', allowedRoles: ['admin', 'operator'] },
                { name: 'echo', description: 'Echo payload for testing', allowedRoles: ['admin', 'operator', 'viewer'] }
            ],
            workflowSupport: true,
            reasoningSupport: true,
            mcpSupport: true
        });

        this.registerAgent(demoAgent);
    }

    registerAgent(agentInput, actor = 'system') {
        const validation = AgentFrameworkValidator.validateAgentDefinition(agentInput);
        if (!validation.valid) {
            throw new Error(`Invalid agent framework profile: ${validation.errors.join(', ')}`);
        }

        const def = agentInput instanceof AgentDefinition ? agentInput : new AgentDefinition(agentInput);
        this.agents.set(def.id, def);

        // Register capabilities
        this.capabilityRegistry.registerAgentCapabilities(def.id, def.capabilities);

        // Register tools
        if (Array.isArray(def.tools)) {
            def.tools.forEach(t => this.toolRegistry.registerTool(def.id, t));
        }

        auditLogService.logEvent({
            eventType: 'AGENT_FRAMEWORK_REGISTERED',
            action: 'register_framework_agent',
            actor,
            role: 'admin',
            tenantId: def.tenantId,
            resourceType: 'agent',
            resourceId: def.id,
            outcome: 'SUCCESS',
            severity: 'INFO',
            metadata: { name: def.name, capabilitiesCount: def.capabilities.length }
        });

        return def;
    }

    getAgent(agentId) {
        return this.agents.get(agentId) || null;
    }

    listAgents(filters = {}) {
        let list = Array.from(this.agents.values());
        if (filters.tenantId) {
            list = list.filter(a => a.tenantId === filters.tenantId || a.tenantId === 'global');
        }
        if (filters.category) {
            list = list.filter(a => a.category === filters.category);
        }
        return list;
    }

    discoverCapabilities(agentId) {
        const ag = this.getAgent(agentId);
        if (!ag) return [];
        return ag.capabilities;
    }

    listTools(agentId) {
        return this.toolRegistry.listToolsForAgent(agentId);
    }

    createAgentContext(agentId, options = {}) {
        return new AgentContext({
            agentId,
            tenantId: options.tenantId || 'global',
            correlationId: options.correlationId,
            actor: options.actor,
            role: options.role,
            config: options.config
        });
    }

    createExecutionContext(agentId, operation, parameters = {}) {
        return new AgentExecutionContext({
            agentId,
            operation,
            parameters
        });
    }

    getOverview() {
        return {
            totalAgents: this.agents.size,
            agents: Array.from(this.agents.values()).map(a => a.toJSON()),
            capabilities: this.capabilityRegistry.listAllCapabilities(),
            toolsCount: this.toolRegistry.listAllTools().length
        };
    }
}

module.exports = { AgentFramework };
