/**
 * External Agent Profile Definitions
 * Purely declarative configuration metadata for external agents (Compa, Repa, etc.).
 * Zero hardcoding in core business logic.
 */

const COMPA_AGENT_PROFILE = Object.freeze({
    id: 'compa-agent-ext',
    name: 'Compa Agent',
    category: 'market_intelligence',
    version: '1.0.0',
    contractVersion: '1.0.0',
    baseUrl: process.env.COMPA_AGENT_URL || 'https://myblocks.in/compa-agent/',
    adapterType: 'ExternalAgentAdapter',
    capabilities: ['health', 'monitoring'],
    endpoints: {
        health: { path: '', method: 'GET', enabled: true },
        contract: { path: '', method: 'GET', enabled: false },
        capabilities: { path: '', method: 'GET', enabled: false },
        status: { path: '', method: 'GET', enabled: false },
        execution: { path: '', method: 'POST', enabled: false }
    },
    authRef: { authType: 'none' },
    timeoutConfig: { connectTimeoutMs: parseInt(process.env.AGENT_CONNECT_TIMEOUT_MS, 10) || 5000, readTimeoutMs: parseInt(process.env.AGENT_READ_TIMEOUT_MS, 10) || 8000 },
    retryConfig: { maxRetries: parseInt(process.env.AGENT_MAX_RETRIES, 10) || 2, retryDelayMs: parseInt(process.env.AGENT_RETRY_DELAY_MS, 10) || 1000 }
});

const REPA_AGENT_PROFILE = Object.freeze({
    id: 'repa-agent-ext',
    name: 'Repa Agent',
    category: 'reputation_intelligence',
    version: '1.0.0',
    contractVersion: '1.0.0',
    baseUrl: process.env.REPA_AGENT_URL || 'http://myblocks.in/repa-agent/REPA_Agent.html',
    adapterType: 'ExternalAgentAdapter',
    capabilities: ['health', 'monitoring'],
    endpoints: {
        health: { path: '', method: 'GET', enabled: true },
        contract: { path: '', method: 'GET', enabled: false },
        capabilities: { path: '', method: 'GET', enabled: false },
        status: { path: '', method: 'GET', enabled: false },
        execution: { path: '', method: 'POST', enabled: false }
    },
    authRef: { authType: 'none' },
    timeoutConfig: { connectTimeoutMs: parseInt(process.env.AGENT_CONNECT_TIMEOUT_MS, 10) || 5000, readTimeoutMs: parseInt(process.env.AGENT_READ_TIMEOUT_MS, 10) || 8000 },
    retryConfig: { maxRetries: parseInt(process.env.AGENT_MAX_RETRIES, 10) || 2, retryDelayMs: parseInt(process.env.AGENT_RETRY_DELAY_MS, 10) || 1000 }
});

module.exports = {
    COMPA_AGENT_PROFILE,
    REPA_AGENT_PROFILE
};
