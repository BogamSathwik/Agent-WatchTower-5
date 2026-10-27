/**
 * Universal Agent Contract Model
 * Formal, domain-agnostic schema describing external agents, AI agents, APIs, microservices, or SaaS systems.
 * Purely generic - zero business-specific assumptions.
 */

const { AGENT_STATES } = require('./AgentStates');
const { AgentCapability } = require('./AgentCapability');
const { AgentRunner } = require('./AgentRunner');

class UniversalAgentContract {
    constructor(raw = {}) {
        const now = new Date().toISOString();

        this.id = raw.id ? String(raw.id).trim() : '';
        this.name = raw.name ? String(raw.name).trim() : '';
        this.description = raw.description ? String(raw.description).trim() : '';
        this.category = raw.category ? String(raw.category).trim().toLowerCase() : 'custom';
        this.version = raw.version ? String(raw.version).trim() : '1.0.0';
        this.contractVersion = raw.contractVersion ? String(raw.contractVersion).trim() : '1.0.0';
        this.systemId = raw.systemId ? String(raw.systemId).trim() : (raw.targetSystemId ? String(raw.targetSystemId).trim() : '');
        
        // Provider metadata (vendor / owner / team)
        this.provider = (typeof raw.provider === 'object' && raw.provider !== null)
            ? {
                name: raw.provider.name ? String(raw.provider.name).trim() : 'unknown',
                contact: raw.provider.contact ? String(raw.provider.contact).trim() : '',
                url: raw.provider.url ? String(raw.provider.url).trim() : ''
            }
            : { name: 'unknown', contact: '', url: '' };

        // Capabilities declaration
        this.capabilities = AgentCapability.normalizeArray(raw.capabilities);

        // Interfaces (API protocols / schemas / RPC mappings)
        this.interfaces = (typeof raw.interfaces === 'object' && raw.interfaces !== null && !Array.isArray(raw.interfaces))
            ? raw.interfaces
            : (Array.isArray(raw.interfaces) ? raw.interfaces : []);

        // Runner definition
        this.runner = AgentRunner.normalize(raw.runner || raw.adapter);

        // Connection metadata
        this.connection = (typeof raw.connection === 'object' && raw.connection !== null && !Array.isArray(raw.connection))
            ? {
                endpoint: raw.connection.endpoint ? String(raw.connection.endpoint).trim() : (this.runner.endpoint || ''),
                timeoutMs: Number(raw.connection.timeoutMs) || this.runner.timeoutMs || 10000,
                retries: Number(raw.connection.retries) || 3,
                healthEndpoint: raw.connection.healthEndpoint ? String(raw.connection.healthEndpoint).trim() : '/health'
            }
            : {
                endpoint: this.runner.endpoint || '',
                timeoutMs: this.runner.timeoutMs || 10000,
                retries: 3,
                healthEndpoint: '/health'
            };

        // Authentication configuration
        this.authentication = (typeof raw.authentication === 'object' && raw.authentication !== null && !Array.isArray(raw.authentication))
            ? raw.authentication
            : (this.runner.authentication || { authType: 'none' });

        // Monitoring settings
        this.monitoring = (typeof raw.monitoring === 'object' && raw.monitoring !== null && !Array.isArray(raw.monitoring))
            ? {
                healthCheckIntervalMs: Number(raw.monitoring.healthCheckIntervalMs) || 30000,
                qualityTestingEnabled: Boolean(raw.monitoring.qualityTestingEnabled ?? true),
                usageTrackingEnabled: Boolean(raw.monitoring.usageTrackingEnabled ?? true),
                experienceTrackingEnabled: Boolean(raw.monitoring.experienceTrackingEnabled ?? true),
                intelligenceEnabled: Boolean(raw.monitoring.intelligenceEnabled ?? true),
                alertingEnabled: Boolean(raw.monitoring.alertingEnabled ?? true)
            }
            : {
                healthCheckIntervalMs: 30000,
                qualityTestingEnabled: true,
                usageTrackingEnabled: true,
                experienceTrackingEnabled: true,
                intelligenceEnabled: true,
                alertingEnabled: true
            };

        // Lifecycle State
        this.lifecycleState = raw.lifecycleState && Object.values(AGENT_STATES).includes(raw.lifecycleState)
            ? raw.lifecycleState
            : AGENT_STATES.REGISTERED;

        // Generic Metadata
        this.metadata = (typeof raw.metadata === 'object' && raw.metadata !== null && !Array.isArray(raw.metadata))
            ? raw.metadata
            : {};

        // Compliance assessment against the 9 Core Agent Rules
        const { defaultComplianceEngine } = require('../quality/AgentComplianceEngine');
        this.compliance = (raw.compliance && typeof raw.compliance === 'object' && raw.compliance.complianceScore !== undefined)
            ? raw.compliance
            : defaultComplianceEngine.scan(raw);

        // Extended Agent Attributes (Agent Master Registry fields)
        this.userId = raw.userId || (raw.metadata && raw.metadata.masterUserId) || null;
        this.firmId = raw.firmId || (raw.metadata && raw.metadata.masterFirmId) || null;
        this.masterId = raw.masterId || (raw.metadata && raw.metadata.masterRegistryId) || null;
        this.addedAt = raw.addedAt || raw.insertDtm || (raw.metadata && raw.metadata.insertDtm) || raw.createdAt || now;
        this.purpose = raw.purpose || raw.summary || raw.description || null;
        this.agentType = raw.agentType || raw.type || (raw.hasBackend ? 'FULL STACK' : 'WEB APP');
        this.publicUrl = raw.publicUrl || (raw.connection && raw.connection.endpoint) || null;
        this.filename = raw.filename || (raw.metadata && raw.metadata.masterFilename) || null;
        this.hasBackend = raw.hasBackend !== undefined ? Boolean(raw.hasBackend) : false;

        this.createdAt = raw.createdAt || this.addedAt || now;
        this.updatedAt = raw.updatedAt || now;
    }

    /**
     * Return object with credentials redacted.
     */
    sanitize() {
        const json = this.toJSON();
        if (json.authentication) {
            const auth = { ...json.authentication };
            if (auth.token) auth.token = '[REDACTED]';
            if (auth.apiKey) auth.apiKey = '[REDACTED]';
            if (auth.secret) auth.secret = '[REDACTED]';
            if (auth.password) auth.password = '[REDACTED]';
            if (auth.key) auth.key = '[REDACTED]';
            json.authentication = auth;
        }
        if (json.runner) {
            json.runner = this.runner.sanitize();
        }
        return json;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            category: this.category,
            version: this.version,
            contractVersion: this.contractVersion,
            provider: this.provider,
            capabilities: this.capabilities.map(cap => cap.toJSON()),
            interfaces: this.interfaces,
            runner: this.runner.toJSON(),
            connection: this.connection,
            authentication: this.authentication,
            monitoring: this.monitoring,
            lifecycleState: this.lifecycleState,
            metadata: this.metadata,
            compliance: this.compliance,
            userId: this.userId,
            firmId: this.firmId,
            masterId: this.masterId,
            addedAt: this.addedAt,
            purpose: this.purpose,
            agentType: this.agentType,
            publicUrl: this.publicUrl,
            filename: this.filename,
            hasBackend: this.hasBackend,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = {
    UniversalAgentContract
};
