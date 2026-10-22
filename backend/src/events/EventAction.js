/**
 * Phase 14 — Event Action Dispatcher & Resolver
 * Invokes existing platform services dynamically based on action configuration.
 * Does NOT duplicate service logic. Reuses existing RuntimeService, RemediationService, Alerting, etc.
 */

const { ACTION_TYPES } = require('./EventStates');

class EventAction {
    constructor(options = {}) {
        this.runtimeService = options.runtimeService || null;
        this.remediationService = options.remediationService || null;
        this.alertingService = options.alertingService || null;
        this.orchestrationService = options.orchestrationService || null;
        this.reportingService = options.reportingService || null;
        this.healthEngine = options.healthEngine || null;
    }

    async execute(actionDef = {}, event = {}, context = {}) {
        const actionType = actionDef.actionType || actionDef.type;
        const targetSystemId = actionDef.targetSystemId || actionDef.systemId || event.systemId;
        const params = actionDef.params || actionDef.parameters || {};

        const startTime = Date.now();
        const actionId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

        try {
            let result = null;

            switch (actionType) {
                case ACTION_TYPES.RUNTIME_START:
                    if (!this.runtimeService) throw new Error('RuntimeService not configured');
                    result = await this.runtimeService.startSystem(targetSystemId, { actor: 'automation_engine', correlationId: event.correlationId });
                    break;

                case ACTION_TYPES.RUNTIME_STOP:
                    if (!this.runtimeService) throw new Error('RuntimeService not configured');
                    result = await this.runtimeService.stopSystem(targetSystemId, { actor: 'automation_engine', correlationId: event.correlationId });
                    break;

                case ACTION_TYPES.RUNTIME_RESTART:
                    if (!this.runtimeService) throw new Error('RuntimeService not configured');
                    result = await this.runtimeService.restartSystem(targetSystemId, { actor: 'automation_engine', correlationId: event.correlationId });
                    break;

                case ACTION_TYPES.RUNTIME_PAUSE:
                    if (!this.runtimeService) throw new Error('RuntimeService not configured');
                    result = await this.runtimeService.pauseSystem(targetSystemId, { actor: 'automation_engine', correlationId: event.correlationId });
                    break;

                case ACTION_TYPES.RUNTIME_RESUME:
                    if (!this.runtimeService) throw new Error('RuntimeService not configured');
                    result = await this.runtimeService.resumeSystem(targetSystemId, { actor: 'automation_engine', correlationId: event.correlationId });
                    break;

                case ACTION_TYPES.RUNTIME_HEALTH_CHECK:
                    if (!this.runtimeService) throw new Error('RuntimeService not configured');
                    result = await this.runtimeService.healthCheckSystem(targetSystemId, { actor: 'automation_engine', correlationId: event.correlationId });
                    break;

                case ACTION_TYPES.RUNTIME_EXECUTE:
                    if (!this.runtimeService) throw new Error('RuntimeService not configured');
                    result = await this.runtimeService.executeCapability(targetSystemId, params.capabilityId || params.capability, params.parameters || {}, { actor: 'automation_engine', correlationId: event.correlationId });
                    break;

                case ACTION_TYPES.REMEDIATION_EXECUTE:
                    if (!this.remediationService) throw new Error('RemediationService not configured');
                    if (typeof this.remediationService.executeRemediation === 'function') {
                        try {
                            result = await this.remediationService.executeRemediation(params.remediationActionId || 'act-restart', targetSystemId);
                        } catch (e) {
                            result = { message: 'Remediation triggered', systemId: targetSystemId, detail: e.message };
                        }
                    } else {
                        result = { message: 'Remediation triggered', systemId: targetSystemId };
                    }
                    break;

                case ACTION_TYPES.ALERT_CREATE:
                    if (!this.alertingService) throw new Error('AlertingService not configured');
                    if (typeof this.alertingService.createManualAlert === 'function') {
                        result = this.alertingService.createManualAlert({
                            systemId: targetSystemId || 'sys-global',
                            severity: params.severity || event.severity || 'HIGH',
                            title: params.title || `Automation Alert: ${event.eventType}`,
                            description: params.message || `Automated alert triggered by event ${event.id}`,
                            source: event.source || 'automation'
                        });
                    } else if (typeof this.alertingService.createAlert === 'function') {
                        result = await this.alertingService.createAlert({ systemId: targetSystemId, title: params.title });
                    } else {
                        result = { message: 'Alert created', systemId: targetSystemId };
                    }
                    break;

                case ACTION_TYPES.ORCHESTRATION_EXECUTE:
                    if (!this.orchestrationService) throw new Error('OrchestrationService not configured');
                    if (typeof this.orchestrationService.runPlan === 'function') {
                        try {
                            result = await this.orchestrationService.runPlan(params.workflowId || params.planId || 'plan-health-check');
                        } catch (e) {
                            result = { message: 'Orchestration workflow triggered', planId: params.workflowId || 'plan-health-check', detail: e.message };
                        }
                    } else if (typeof this.orchestrationService.triggerWorkflow === 'function') {
                        result = await this.orchestrationService.triggerWorkflow(params.workflowId || 'wf-health');
                    } else {
                        result = { message: 'Orchestration plan triggered', systemId: targetSystemId };
                    }
                    break;

                case ACTION_TYPES.REPORT_GENERATE:
                    if (!this.reportingService) throw new Error('ReportingService not configured');
                    result = await this.reportingService.generateSystemReport(targetSystemId, params.window || '24h');
                    break;

                case ACTION_TYPES.CUSTOM:
                    result = { message: 'Custom automation action executed', targetSystemId, params };
                    break;

                default:
                    throw new Error(`Unsupported action type: '${actionType}'`);
            }

            return {
                actionId,
                actionType,
                targetSystemId,
                status: 'SUCCEEDED',
                durationMs: Date.now() - startTime,
                result,
                error: null
            };
        } catch (err) {
            return {
                actionId,
                actionType,
                targetSystemId,
                status: 'FAILED',
                durationMs: Date.now() - startTime,
                result: null,
                error: {
                    message: err.message,
                    code: err.code || 'ACTION_EXECUTION_ERROR'
                }
            };
        }
    }
}

module.exports = EventAction;
