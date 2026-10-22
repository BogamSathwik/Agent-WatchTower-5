/**
 * RuntimeExecutor
 * Core runner for operational runtime commands and capability-driven executions.
 * Integrates security, validation, adapters, and session tracking.
 */

const { RUNTIME_COMMANDS, RUNTIME_STATES } = require('./RuntimeStates');
const RuntimeValidator = require('./RuntimeValidator');
const RuntimeSession = require('./RuntimeSession');
const { ErrorNormalizer } = require('../adapter/ErrorNormalizer');
const { SsrfProtector } = require('../adapter/SsrfProtector');

class RuntimeExecutor {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.executionService = options.executionService || null;
        this.runtimeStore = options.runtimeStore || null;
    }

    /**
     * Execute operational command or capability operation.
     */
    async executeCommand(command, systemId, options = {}) {
        const startTime = Date.now();
        const cmd = String(command).toUpperCase();
        const requestedBy = options.actor || options.requestedBy || 'system';
        const payload = options.parameters || options.payload || {};

        if (!this.systemRegistry) {
            const err = new Error('System registry not initialized in RuntimeExecutor');
            err.statusCode = 500;
            throw err;
        }

        const systemObj = this.systemRegistry.getSystem(systemId);
        if (!systemObj) {
            const err = new Error(`Target system '${systemId}' not registered or found`);
            err.statusCode = 404;
            throw err;
        }

        const runtime = this.runtimeStore.getOrCreateRuntime(systemId, systemObj);

        // Prototype Pollution check
        if (RuntimeValidator.checkPrototypePollution(payload)) {
            const err = new Error('Invalid payload: Prototype pollution detected');
            err.statusCode = 400;
            throw err;
        }

        // Validate command & state machine
        const validation = RuntimeValidator.validateCommand(cmd, runtime.state, systemObj);
        if (!validation.valid) {
            const err = new Error(`Command validation failed: ${validation.errors.join('; ')}`);
            err.statusCode = 400;
            err.errors = validation.errors;
            throw err;
        }

        // Execution lock check
        const lockAcquired = this.runtimeStore.acquireLock(systemId, cmd);
        if (!lockAcquired) {
            const err = new Error(`Concurrent execution lock active for system '${systemId}:${cmd}'`);
            err.statusCode = 409;
            throw err;
        }

        try {
            let result = null;
            let finalState = runtime.state;

            if (cmd === RUNTIME_COMMANDS.START) {
                runtime.startSession(requestedBy, options.executionMode || 'AUTOMATIC');
                finalState = RUNTIME_STATES.RUNNING;
                result = { message: `System '${systemId}' started successfully`, session: runtime.activeSession.toJSON() };
            } else if (cmd === RUNTIME_COMMANDS.STOP) {
                runtime.stopSession(options.reason || 'Operator stopped system');
                finalState = RUNTIME_STATES.STOPPED;
                result = { message: `System '${systemId}' stopped successfully` };
            } else if (cmd === RUNTIME_COMMANDS.RESTART) {
                runtime.stopSession('Restarting');
                runtime.startSession(requestedBy, options.executionMode || 'AUTOMATIC');
                finalState = RUNTIME_STATES.RUNNING;
                result = { message: `System '${systemId}' restarted successfully`, session: runtime.activeSession.toJSON() };
            } else if (cmd === RUNTIME_COMMANDS.PAUSE) {
                runtime.state = RUNTIME_STATES.PAUSED;
                if (runtime.activeSession) runtime.activeSession.state = 'PAUSED';
                finalState = RUNTIME_STATES.PAUSED;
                result = { message: `System '${systemId}' paused` };
            } else if (cmd === RUNTIME_COMMANDS.RESUME) {
                runtime.state = RUNTIME_STATES.RUNNING;
                if (runtime.activeSession) runtime.activeSession.state = 'RUNNING';
                finalState = RUNTIME_STATES.RUNNING;
                result = { message: `System '${systemId}' resumed` };
            } else if (cmd === RUNTIME_COMMANDS.STATUS) {
                result = runtime.toJSON();
            } else if (cmd === RUNTIME_COMMANDS.CAPABILITIES) {
                result = { systemId, capabilities: runtime.capabilities };
            } else if (cmd === RUNTIME_COMMANDS.HEALTH_CHECK) {
                if (this.executionService && typeof this.executionService.executeOperation === 'function') {
                    result = await this.executionService.executeOperation(systemId, 'health', {}, { actor: requestedBy });
                } else {
                    result = { success: true, status: 'HEALTHY', latencyMs: 5 };
                }
                runtime.recordHeartbeat();
            } else if (cmd === RUNTIME_COMMANDS.EXECUTE) {
                const opName = options.capability || options.operation || 'execute';
                if (this.executionService && typeof this.executionService.executeOperation === 'function') {
                    result = await this.executionService.executeOperation(systemId, opName, payload, { actor: requestedBy });
                } else {
                    result = { success: true, operation: opName, output: { status: 'executed', payload } };
                }
                if (runtime.activeSession) {
                    runtime.activeSession.recordOperation(opName, result && result.success !== false);
                }
            }

            const prevState = runtime.state;
            runtime.state = finalState;
            runtime.lastOperation = cmd;
            runtime.recordHeartbeat();

            if (prevState !== finalState) {
                this.runtimeStore.recordEvent({
                    systemId,
                    eventType: 'STATE_CHANGED',
                    previousState: prevState,
                    currentState: finalState,
                    reason: `Command '${cmd}' executed by '${requestedBy}'`
                });
            }

            const executionRecord = this.runtimeStore.recordExecution({
                systemId,
                command: cmd,
                capability: options.capability || cmd,
                requestedBy,
                durationMs: Date.now() - startTime,
                status: 'SUCCEEDED',
                result: RuntimeSession.sanitize(result),
                correlationId: runtime.activeSession ? runtime.activeSession.correlationId : null
            });

            this.runtimeStore.releaseLock(systemId, cmd);

            return {
                success: true,
                systemId,
                command: cmd,
                state: finalState,
                durationMs: Date.now() - startTime,
                executionId: executionRecord.executionId,
                result: RuntimeSession.sanitize(result)
            };
        } catch (err) {
            this.runtimeStore.releaseLock(systemId, cmd);
            runtime.lastError = err.message;
            if (runtime.activeSession) {
                runtime.activeSession.recordOperation(cmd, false);
            }

            this.runtimeStore.recordExecution({
                systemId,
                command: cmd,
                capability: options.capability || cmd,
                requestedBy,
                durationMs: Date.now() - startTime,
                status: 'FAILED',
                error: err.message
            });

            const normalizedErr = ErrorNormalizer.normalize(err, { component: 'RuntimeExecutor', systemId });
            throw normalizedErr;
        }
    }
}

module.exports = RuntimeExecutor;
