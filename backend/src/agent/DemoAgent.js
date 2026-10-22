/**
 * Agent Watchtower Demo Agent
 * Generic built-in test agent supporting NORMAL, DEGRADED, ERROR, and SLOW execution modes.
 * Used for testing Workflows, Orchestration, Reasoning, MCP, Monitoring, Quality, Usage, Alerting, and Reporting.
 * Purely domain-agnostic.
 */

class DemoAgent {
    constructor(options = {}) {
        this.agentId = options.agentId || 'TEST-AGENT-001';
        this.name = options.name || 'Agent Watchtower Demo Agent';
        this.version = options.version || '1.0.0';
        this.contractVersion = options.contractVersion || '1.0.0';
        this.category = 'testing';
        this.mode = options.mode || 'NORMAL'; // NORMAL, DEGRADED, ERROR, SLOW

        this.capabilities = [
            'health_check',
            'task_execution',
            'workflow_execution',
            'tool_usage',
            'reasoning_test',
            'telemetry'
        ];
    }

    emitTelemetryEvent(eventType, payload = {}) {
        return {
            eventId: `evt_demo_${Date.now()}`,
            eventType,
            agentId: this.agentId,
            executionId: payload.executionId || `exec_demo_${Date.now()}`,
            workflowId: payload.workflowId || null,
            timestamp: new Date().toISOString(),
            status: payload.status || 'OK',
            durationMs: payload.durationMs || 25,
            stepName: payload.stepName || null,
            message: payload.message || `DemoAgent telemetry event ${eventType}`,
            metrics: payload.metrics || { cpuUsage: 12, memoryMb: 128 },
            metadata: payload.metadata || { mode: this.mode }
        };
    }

    setMode(mode) {
        if (['NORMAL', 'DEGRADED', 'ERROR', 'SLOW'].includes(mode)) {
            this.mode = mode;
        }
        return this.mode;
    }

    async getContract() {
        return {
            id: this.agentId,
            name: this.name,
            version: this.version,
            contractVersion: this.contractVersion,
            category: this.category,
            capabilities: this.capabilities,
            mode: this.mode
        };
    }

    async getHealth() {
        if (this.mode === 'ERROR') {
            return {
                status: 'UNHEALTHY',
                connectivity: 'FAILED',
                error: 'Simulated Demo Agent connection failure',
                timestamp: new Date().toISOString()
            };
        }
        if (this.mode === 'DEGRADED') {
            return {
                status: 'DEGRADED',
                connectivity: 'CONNECTED',
                latencyMs: 3500,
                warning: 'Response latency above normal threshold',
                timestamp: new Date().toISOString()
            };
        }
        if (this.mode === 'SLOW') {
            await new Promise(r => setTimeout(r, 1200));
            return {
                status: 'HEALTHY',
                connectivity: 'CONNECTED',
                latencyMs: 1200,
                timestamp: new Date().toISOString()
            };
        }
        return {
            status: 'HEALTHY',
            connectivity: 'CONNECTED',
            latencyMs: 45,
            timestamp: new Date().toISOString()
        };
    }

    async executeCapability(capabilityName, parameters = {}) {
        if (this.mode === 'ERROR') {
            throw new Error(`Capability execution '${capabilityName}' failed due to Demo Agent ERROR mode`);
        }
        if (this.mode === 'SLOW') {
            await new Promise(r => setTimeout(r, 1000));
        }

        return {
            agentId: this.agentId,
            capability: capabilityName,
            status: 'SUCCESS',
            mode: this.mode,
            parameters,
            output: {
                message: `Demo Agent executed '${capabilityName}' cleanly in ${this.mode} mode.`,
                timestamp: new Date().toISOString()
            }
        };
    }
}

module.exports = { DemoAgent };
