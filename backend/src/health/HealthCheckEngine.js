/**
 * Health Check Engine
 * Universal engine executing health evaluations, measuring latency, tracking failure/recovery thresholds,
 * and updating generic health states independently from system lifecycle states.
 */

const { HEALTH_STATES, HEALTH_REASONS } = require('./HealthStates');
const { HealthConfig } = require('./HealthConfig');
const { HealthMeasurement } = require('./HealthMeasurement');
const { HealthStore } = require('./HealthStore');
const { SystemRegistry } = require('../registry/SystemRegistry');
const { CapabilityRegistry } = require('../registry/CapabilityRegistry');
const { SystemExecutionService } = require('../service/SystemExecutionService');
const { sseManager } = require('../events/SSEManager');

class HealthCheckEngine {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || new SystemRegistry();
        this.capabilityRegistry = options.capabilityRegistry || new CapabilityRegistry();
        this.executionService = options.executionService || new SystemExecutionService({
            systemRegistry: this.systemRegistry,
            capabilityRegistry: this.capabilityRegistry,
            allowLocalhost: true
        });
        this.healthStore = options.healthStore || new HealthStore();
        this.usageCollector = options.usageCollector || null;
    }

    /**
     * Execute a health check for a registered system.
     * @param {string} systemId 
     * @param {Object} options - { overrideConfig: Object, payload: Object }
     * @returns {Object} Normalized HealthMeasurement payload
     */
    async checkHealth(systemId, options = {}) {
        const startHr = process.hrtime.bigint();

        // 1. Resolve System Contract
        let system;
        try {
            system = this.systemRegistry.getSystemInstance(systemId);
        } catch (err) {
            const measurement = new HealthMeasurement({
                systemId,
                status: HEALTH_STATES.UNKNOWN,
                success: false,
                reason: HEALTH_REASONS.SYSTEM_NOT_FOUND,
                error: { code: 'SYSTEM_NOT_FOUND', message: `System '${systemId}' is not registered` }
            });
            this.healthStore.addMeasurement(measurement);
            return measurement.toJSON();
        }

        const currentState = this.healthStore.getSystemState(system.id);
        const previousStatus = currentState ? currentState.status : HEALTH_STATES.UNKNOWN;
        const storedConfig = this.healthStore.getHealthConfig(system.id);
        const config = HealthConfig.normalize({ ...storedConfig, ...options.overrideConfig });

        // 2. Capability Check
        const hasHealthCapability = this.capabilityRegistry.hasCapability(system.capabilities, config.healthOperation);
        if (!hasHealthCapability) {
            const measurement = new HealthMeasurement({
                systemId: system.id,
                status: HEALTH_STATES.UNKNOWN,
                success: false,
                reason: HEALTH_REASONS.HEALTH_CAPABILITY_UNAVAILABLE,
                error: {
                    code: 'HEALTH_CAPABILITY_UNAVAILABLE',
                    message: `System '${system.id}' does not possess '${config.healthOperation}' capability`
                },
                adapterInfo: system.adapter ? { adapterId: system.adapter.adapterId, adapterType: system.adapter.adapterType } : {}
            });

            this.updateAndNotifyState(system.id, previousStatus, HEALTH_STATES.UNKNOWN, {
                lastReason: HEALTH_REASONS.HEALTH_CAPABILITY_UNAVAILABLE
            });
            this.healthStore.addMeasurement(measurement);
            return measurement.toJSON();
        }

        // 3. Dispatch Health Operation
        const execResult = await this.executionService.executeOperation(system.id, config.healthOperation, {
            timeoutMs: config.timeoutMs,
            maxRetries: config.retryCount,
            retryDelayMs: config.retryDelayMs,
            ...(options.payload || {})
        }, {
            caller: 'HealthCheckEngine',
            source: 'system',
            category: 'HEALTH_CHECK'
        });

        const endHr = process.hrtime.bigint();
        const measuredMs = Number(endHr - startHr) / 1e6;
        const responseTimeMs = Number(measuredMs.toFixed(2));

        // 4. Threshold & Health State Evaluation
        let newStatus = previousStatus;
        let consecutiveFailures = currentState.consecutiveFailures;
        let consecutiveSuccesses = currentState.consecutiveSuccesses;
        let reason = HEALTH_REASONS.HEALTH_CHECK_SUCCESS;

        if (!execResult.success) {
            consecutiveFailures += 1;
            consecutiveSuccesses = 0;

            const errCode = execResult.error ? execResult.error.code : 'UNKNOWN';

            if (errCode === 'TIMEOUT') reason = HEALTH_REASONS.TIMEOUT;
            else if (errCode === 'DNS_FAILURE') reason = HEALTH_REASONS.DNS_FAILURE;
            else if (errCode === 'CONNECTION_FAILURE') reason = HEALTH_REASONS.CONNECTION_FAILURE;
            else if (errCode === 'AUTH_FAILURE') reason = HEALTH_REASONS.AUTH_FAILURE;
            else if (errCode === 'FORBIDDEN') reason = HEALTH_REASONS.FORBIDDEN;
            else if (errCode === 'SSRF_BLOCKED') reason = HEALTH_REASONS.SSRF_BLOCKED;
            else reason = HEALTH_REASONS.HTTP_SERVER_ERROR;

            if (consecutiveFailures >= config.failureThreshold) {
                newStatus = HEALTH_STATES.OFFLINE;
                reason = HEALTH_REASONS.CONSECUTIVE_FAILURES_EXCEEDED;
            } else if (previousStatus === HEALTH_STATES.HEALTHY) {
                newStatus = HEALTH_STATES.DEGRADED;
            }
        } else {
            consecutiveSuccesses += 1;
            consecutiveFailures = 0;

            if (responseTimeMs > config.degradedThresholdMs || responseTimeMs > config.latencyThresholdMs) {
                newStatus = HEALTH_STATES.DEGRADED;
                reason = HEALTH_REASONS.LATENCY_THRESHOLD_EXCEEDED;
            } else if (consecutiveSuccesses >= config.recoveryThreshold || previousStatus === HEALTH_STATES.UNKNOWN) {
                newStatus = HEALTH_STATES.HEALTHY;
                reason = HEALTH_REASONS.HEALTH_CHECK_SUCCESS;
            }
        }

        // 5. Build & Save Measurement
        const measurement = new HealthMeasurement({
            systemId: system.id,
            status: newStatus,
            responseTimeMs,
            success: execResult.success,
            error: execResult.error,
            consecutiveFailures,
            consecutiveSuccesses,
            reason,
            adapterInfo: {
                adapterId: execResult.adapterId,
                adapterType: system.adapter ? system.adapter.adapterType : 'custom'
            },
            operation: config.healthOperation,
            evidence: {
                ...execResult.evidence,
                latencyThresholdMs: config.latencyThresholdMs,
                degradedThresholdMs: config.degradedThresholdMs,
                failureThreshold: config.failureThreshold,
                recoveryThreshold: config.recoveryThreshold
            }
        });

        this.updateAndNotifyState(system.id, previousStatus, newStatus, {
            consecutiveFailures,
            consecutiveSuccesses,
            lastReason: reason
        });
        this.healthStore.addMeasurement(measurement);

        if (this.usageCollector) {
            this.usageCollector.recordActivity({
                systemId: system.id,
                capability: 'health',
                operation: config.healthOperation || 'health',
                status: measurement.success ? 'SUCCESS' : 'FAILED',
                durationMs: responseTimeMs,
                source: options.source || 'scheduler',
                actor: options.actor || 'system',
                category: 'HEALTH_CHECK',
                metadata: { healthStatus: newStatus, reason }
            });
        }

        return measurement.toJSON();
    }

    updateAndNotifyState(systemId, previousStatus, newStatus, stateDetails) {
        this.healthStore.updateSystemState(systemId, {
            status: newStatus,
            ...stateDetails
        });

        if (previousStatus !== newStatus) {
            let eventType = 'SYSTEM_HEALTH_CHANGED';
            if (newStatus === HEALTH_STATES.OFFLINE) eventType = 'SYSTEM_OFFLINE';
            else if (newStatus === HEALTH_STATES.HEALTHY && previousStatus === HEALTH_STATES.OFFLINE) eventType = 'SYSTEM_RECOVERED';

            sseManager.broadcast(eventType, {
                entityId: systemId,
                entityType: 'system',
                previousState: previousStatus,
                newState: newStatus,
                reason: stateDetails.lastReason || null,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = {
    HealthCheckEngine
};
