/**
 * TelemetryIngestionService
 * Ingests, normalizes, stores, and evaluates universal agent telemetry events.
 * Manages event timelines, execution/workflow updates, stale telemetry detection,
 * and alert generation with cooldown deduplication.
 */

const { UniversalTelemetryContract, TELEMETRY_EVENT_TYPES } = require('./UniversalTelemetryContract');

class TelemetryIngestionService {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.healthEngine = options.healthEngine || null;
        this.alertingService = options.alertingService || null;

        this.eventsBuffer = []; // In-memory telemetry log buffer (max 2000)
        this.maxBufferLength = options.maxBufferLength || 2000;

        this.executionStates = new Map(); // executionId -> state
        this.workflowStates = new Map();  // workflowId -> state
        this.agentLatestTelemetry = new Map(); // agentId -> event

        // Alert Cooldown Deduplication Map: alertKey -> timestamp
        this.alertCooldowns = new Map();
        this.cooldownWindowMs = options.cooldownWindowMs || 60000; // 60s cooldown
    }

    /**
     * Process and ingest an incoming telemetry payload.
     */
    ingestEvent(rawPayload = {}) {
        // 1. Validate & Normalize
        const event = UniversalTelemetryContract.validateAndNormalize(rawPayload);

        // 2. Buffer Event
        this.eventsBuffer.unshift(event);
        if (this.eventsBuffer.length > this.maxBufferLength) {
            this.eventsBuffer.pop();
        }

        // 3. Update Agent Latest Telemetry Timestamp
        this.agentLatestTelemetry.set(event.agentId, event);

        // 4. Update Execution State if executionId present
        if (event.executionId) {
            this._updateExecutionState(event);
        }

        // 5. Update Workflow State if workflowId present
        if (event.workflowId) {
            this._updateWorkflowState(event);
        }

        // 6. Alert Evaluation with Cooldown Deduplication
        this._evaluateAlertConditions(event);

        return event;
    }

    _updateExecutionState(event) {
        let exec = this.executionStates.get(event.executionId) || {
            executionId: event.executionId,
            agentId: event.agentId,
            workflowId: event.workflowId,
            startTime: event.timestamp,
            endTime: null,
            durationMs: 0,
            status: 'RUNNING',
            currentStep: event.stepName || null,
            completedSteps: [],
            failedSteps: [],
            retryCount: 0,
            errorCategory: null,
            errorMessage: null,
            toolUsage: []
        };

        if (event.eventType === TELEMETRY_EVENT_TYPES.EXECUTION_STARTED) {
            exec.status = 'RUNNING';
            exec.startTime = event.timestamp;
        } else if (event.eventType === TELEMETRY_EVENT_TYPES.EXECUTION_COMPLETED) {
            exec.status = 'SUCCESS';
            exec.endTime = event.timestamp;
            exec.durationMs = event.durationMs || (new Date(event.timestamp) - new Date(exec.startTime));
        } else if (event.eventType === TELEMETRY_EVENT_TYPES.EXECUTION_FAILED) {
            exec.status = 'FAILED';
            exec.endTime = event.timestamp;
            exec.durationMs = event.durationMs || (new Date(event.timestamp) - new Date(exec.startTime));
            exec.errorMessage = event.message || 'Execution failed';
            exec.errorCategory = event.status || 'EXECUTION_ERROR';
        }

        if (event.eventType === TELEMETRY_EVENT_TYPES.WORKFLOW_STEP_COMPLETED && event.stepName) {
            if (!exec.completedSteps.includes(event.stepName)) exec.completedSteps.push(event.stepName);
        }
        if (event.eventType === TELEMETRY_EVENT_TYPES.WORKFLOW_STEP_FAILED && event.stepName) {
            if (!exec.failedSteps.includes(event.stepName)) exec.failedSteps.push(event.stepName);
        }

        if (event.eventType === TELEMETRY_EVENT_TYPES.TOOL_COMPLETED || event.eventType === TELEMETRY_EVENT_TYPES.TOOL_STARTED) {
            exec.toolUsage.push({
                toolName: event.stepName || event.metadata?.toolName || 'unknown_tool',
                timestamp: event.timestamp,
                status: event.status
            });
        }

        this.executionStates.set(event.executionId, exec);
    }

    _updateWorkflowState(event) {
        let wf = this.workflowStates.get(event.workflowId) || {
            workflowId: event.workflowId,
            agentId: event.agentId,
            startTime: event.timestamp,
            currentStep: event.stepName || null,
            completedSteps: [],
            failedSteps: [],
            status: 'RUNNING'
        };

        if (event.stepName) wf.currentStep = event.stepName;

        if (event.eventType === TELEMETRY_EVENT_TYPES.WORKFLOW_STEP_COMPLETED && event.stepName) {
            if (!wf.completedSteps.includes(event.stepName)) wf.completedSteps.push(event.stepName);
        } else if (event.eventType === TELEMETRY_EVENT_TYPES.WORKFLOW_STEP_FAILED && event.stepName) {
            if (!wf.failedSteps.includes(event.stepName)) wf.failedSteps.push(event.stepName);
            wf.status = 'COMPLETED_WITH_WARNINGS';
        }

        this.workflowStates.set(event.workflowId, wf);
    }

    _evaluateAlertConditions(event) {
        if (!this.alertingService) return;

        const isFailure = [
            TELEMETRY_EVENT_TYPES.EXECUTION_FAILED,
            TELEMETRY_EVENT_TYPES.WORKFLOW_STEP_FAILED,
            TELEMETRY_EVENT_TYPES.TOOL_FAILED
        ].includes(event.eventType);

        if (isFailure) {
            const alertKey = `alert_${event.agentId}_${event.eventType}`;
            const lastAlertTime = this.alertCooldowns.get(alertKey) || 0;
            const now = Date.now();

            if (now - lastAlertTime >= this.cooldownWindowMs) {
                this.alertCooldowns.set(alertKey, now);
                const payload = {
                    title: `Telemetry Alert: ${event.eventType} on ${event.agentId}`,
                    description: event.message || `Telemetry event ${event.eventType} indicated failure`,
                    severity: event.eventType === TELEMETRY_EVENT_TYPES.EXECUTION_FAILED ? 'CRITICAL' : 'WARNING',
                    systemId: event.agentId,
                    agentId: event.agentId,
                    metadata: { agentId: event.agentId, executionId: event.executionId, eventType: event.eventType }
                };
                try {
                    if (typeof this.alertingService.createManualAlert === 'function') {
                        this.alertingService.createManualAlert(payload);
                    } else if (typeof this.alertingService.createAlert === 'function') {
                        this.alertingService.createAlert(payload);
                    } else if (typeof this.alertingService.sendAlert === 'function') {
                        this.alertingService.sendAlert({
                            title: payload.title,
                            message: payload.description,
                            severity: payload.severity,
                            metadata: payload.metadata
                        });
                    }
                } catch (_) {}
            }
        }
    }

    /**
     * Query filtered telemetry events.
     */
    getEvents(filters = {}) {
        return this.eventsBuffer.filter(evt => {
            if (filters.agentId && evt.agentId !== filters.agentId) return false;
            if (filters.executionId && evt.executionId !== filters.executionId) return false;
            if (filters.workflowId && evt.workflowId !== filters.workflowId) return false;
            if (filters.eventType && evt.eventType !== filters.eventType) return false;
            if (filters.status && evt.status !== filters.status) return false;
            if (filters.since && new Date(evt.timestamp) < new Date(filters.since)) return false;
            return true;
        });
    }

    /**
     * Get timeline events for an agent.
     */
    getAgentTimeline(agentId, options = {}) {
        const events = this.getEvents({ agentId });
        const limit = options.limit || 50;
        return events.slice(0, limit);
    }

    getExecution(executionId) {
        return this.executionStates.get(executionId) || null;
    }

    getWorkflow(workflowId) {
        return this.workflowStates.get(workflowId) || null;
    }

    isTelemetryStale(agentId, maxAgeMs = 300000) {
        const latest = this.agentLatestTelemetry.get(agentId);
        if (!latest) return true;
        const age = Date.now() - new Date(latest.timestamp).getTime();
        return age > maxAgeMs;
    }
}

module.exports = { TelemetryIngestionService };
