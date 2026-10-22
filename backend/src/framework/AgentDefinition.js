/**
 * AgentDefinition Model
 * Represents the complete framework profile of a registered agent, including contract,
 * endpoints, capabilities, tools, workflow support, reasoning support, MCP support, and telemetry.
 */

class AgentDefinition {
    constructor(raw = {}) {
        this.id = raw.id ? String(raw.id).trim() : `agent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.name = raw.name ? String(raw.name).trim() : this.id;
        this.description = raw.description ? String(raw.description).trim() : '';
        this.version = raw.version ? String(raw.version).trim() : '1.0.0';
        this.contractVersion = raw.contractVersion ? String(raw.contractVersion).trim() : '1.0.0';
        this.category = raw.category ? String(raw.category).trim() : 'automation';
        this.status = raw.status || raw.lifecycleState || 'MONITORING';
        this.tenantId = raw.tenantId || 'global';

        // Endpoints
        this.healthEndpoint = raw.healthEndpoint || raw.healthCheckUrl || '/health';
        this.executionEndpoint = raw.executionEndpoint || raw.baseUrl || raw.endpoint || '/execute';
        this.baseUrl = raw.baseUrl || raw.endpoint || 'http://localhost:4001';

        // Capabilities & Tools
        this.capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];
        this.supportedOperations = Array.isArray(raw.supportedOperations) ? raw.supportedOperations : ['health_check', 'task_execution'];
        this.tools = Array.isArray(raw.tools) ? raw.tools : [];

        // Integrations & Flags
        this.workflowSupport = Boolean(raw.workflowSupport ?? true);
        this.reasoningSupport = Boolean(raw.reasoningSupport ?? true);
        this.mcpSupport = Boolean(raw.mcpSupport ?? true);

        // Security & Authentication
        this.authentication = typeof raw.authentication === 'object' && raw.authentication !== null
            ? raw.authentication
            : { authType: 'none' };

        // Telemetry Metadata
        this.telemetry = typeof raw.telemetry === 'object' && raw.telemetry !== null ? raw.telemetry : {};
        this.metadata = typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
        this.createdAt = raw.createdAt || new Date().toISOString();
        this.updatedAt = raw.updatedAt || new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            version: this.version,
            contractVersion: this.contractVersion,
            category: this.category,
            status: this.status,
            tenantId: this.tenantId,
            healthEndpoint: this.healthEndpoint,
            executionEndpoint: this.executionEndpoint,
            baseUrl: this.baseUrl,
            capabilities: this.capabilities,
            supportedOperations: this.supportedOperations,
            tools: this.tools,
            workflowSupport: this.workflowSupport,
            reasoningSupport: this.reasoningSupport,
            mcpSupport: this.mcpSupport,
            authentication: this.authentication,
            telemetry: this.telemetry,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = { AgentDefinition };
