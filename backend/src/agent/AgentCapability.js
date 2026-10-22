/**
 * Agent Capability Model
 * Standardized representation of an operational capability declared by an agent.
 * Purely generic - no business domain logic.
 */

class AgentCapability {
    constructor(raw = {}) {
        this.id = raw.id ? String(raw.id).trim() : '';
        this.name = raw.name ? String(raw.name).trim() : this.id;
        this.description = raw.description ? String(raw.description).trim() : '';
        this.version = raw.version ? String(raw.version).trim() : '1.0.0';

        // Input and Output schemas (JSON schema objects or structure definitions)
        this.inputSchema = (typeof raw.inputSchema === 'object' && raw.inputSchema !== null && !Array.isArray(raw.inputSchema))
            ? raw.inputSchema
            : {};
        
        this.outputSchema = (typeof raw.outputSchema === 'object' && raw.outputSchema !== null && !Array.isArray(raw.outputSchema))
            ? raw.outputSchema
            : {};

        // Operations supported by this capability (array of strings or object definitions)
        this.operations = Array.isArray(raw.operations)
            ? raw.operations.map(op => (typeof op === 'string' ? op.trim() : (op && op.name ? String(op.name).trim() : ''))).filter(Boolean)
            : [];

        // Required permissions to execute this capability
        this.requiredPermissions = Array.isArray(raw.requiredPermissions)
            ? raw.requiredPermissions.map(p => String(p).trim()).filter(Boolean)
            : [];

        // Arbitrary generic metadata
        this.metadata = (typeof raw.metadata === 'object' && raw.metadata !== null && !Array.isArray(raw.metadata))
            ? raw.metadata
            : {};
    }

    static normalize(capability) {
        if (!capability) return null;
        if (capability instanceof AgentCapability) return capability;
        if (typeof capability === 'string') {
            return new AgentCapability({ id: capability, name: capability });
        }
        if (typeof capability === 'object' && capability !== null) {
            return new AgentCapability(capability);
        }
        return null;
    }

    static normalizeArray(capabilities) {
        if (!Array.isArray(capabilities)) return [];
        return capabilities
            .map(cap => AgentCapability.normalize(cap))
            .filter(cap => cap && cap.id.length > 0);
    }

    supportsOperation(operationName) {
        if (!operationName) return true; // Default match if operations array is empty or no operation specified
        if (this.operations.length === 0) return true;
        const normalized = String(operationName).trim().toLowerCase();
        return this.operations.some(op => op.toLowerCase() === normalized);
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            version: this.version,
            inputSchema: this.inputSchema,
            outputSchema: this.outputSchema,
            operations: this.operations,
            requiredPermissions: this.requiredPermissions,
            metadata: this.metadata
        };
    }
}

module.exports = {
    AgentCapability
};
