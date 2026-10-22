/**
 * Universal Workflow Service Facade
 * High-level orchestration facade managing workflows, execution engine, scheduling,
 * event triggers, and tenant isolation.
 * Purely domain-agnostic.
 */

const { Workflow } = require('./Workflow');
const { WorkflowStore } = require('./WorkflowStore');
const { WorkflowExecutionEngine } = require('./WorkflowExecutionEngine');
const { WORKFLOW_STATES } = require('./WorkflowStates');
const { auditLogService } = require('../audit/AuditLogService');

class WorkflowService {
    constructor(options = {}) {
        this.store = options.workflowStore || new WorkflowStore();
        this.engine = options.engine || new WorkflowExecutionEngine({
            workflowStore: this.store,
            agentService: options.agentService,
            systemRegistry: options.systemRegistry,
            executionService: options.executionService,
            healthEngine: options.healthEngine,
            alertingService: options.alertingService,
            remediationService: options.remediationService
        });

        // Register default demo workflows if store is empty
        this._initDefaultWorkflows();
    }

    _initDefaultWorkflows() {
        if (this.store.listWorkflows().length === 0) {
            const demoWf = new Workflow({
                id: 'wf_demo_continuous_monitoring',
                name: 'Continuous System & Agent Automated Health Verification',
                description: 'Runs automated system health check, capability verification, and notification on failure.',
                version: '1.0.0',
                status: WORKFLOW_STATES.READY,
                tenantId: 'global',
                trigger: { type: 'MANUAL', enabled: true },
                steps: [
                    {
                        id: 'step_health',
                        name: 'Check System & Agent Health',
                        type: 'HEALTH_CHECK',
                        target: 'GLOBAL',
                        continueOnFailure: false
                    },
                    {
                        id: 'step_verify',
                        name: 'Verify Target Availability',
                        type: 'VERIFICATION',
                        verification: { expectedStatus: 'HEALTHY' }
                    },
                    {
                        id: 'step_notify',
                        name: 'Broadcast Status Notification',
                        type: 'NOTIFICATION',
                        parameters: { message: 'Automated workflow health check completed successfully.' }
                    }
                ]
            });
            this.store.saveWorkflow(demoWf);
        }
    }

    createWorkflow(raw, tenantId = 'global', actor = 'system') {
        const finalTenantId = (raw && raw.tenantId) || tenantId || 'global';
        const wf = new Workflow({ ...raw, tenantId: finalTenantId });
        const validation = wf.validate();
        if (!validation.valid) {
            throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
        }

        wf.status = WORKFLOW_STATES.READY;
        this.store.saveWorkflow(wf);

        auditLogService.logEvent({
            eventType: 'WORKFLOW_CREATED',
            action: 'create_workflow',
            actor,
            role: 'admin',
            tenantId: finalTenantId,
            resourceType: 'workflow',
            resourceId: wf.id,
            outcome: 'SUCCESS',
            severity: 'INFO',
            metadata: { name: wf.name, stepsCount: wf.steps.length }
        });

        return wf;
    }

    getWorkflow(id, tenantId = null) {
        return this.store.getWorkflow(id, tenantId);
    }

    listWorkflows(filters = {}) {
        return this.store.listWorkflows(filters);
    }

    updateWorkflow(id, updates = {}, tenantId = null, actor = 'system') {
        const existing = this.getWorkflow(id, tenantId);
        if (!existing) throw new Error(`Workflow '${id}' not found`);

        const updated = new Workflow({
            ...existing.toJSON(),
            ...updates,
            id: existing.id,
            updatedAt: new Date().toISOString()
        });

        const validation = updated.validate();
        if (!validation.valid) {
            throw new Error(`Updated workflow validation failed: ${validation.errors.join(', ')}`);
        }

        this.store.saveWorkflow(updated);

        auditLogService.logEvent({
            eventType: 'WORKFLOW_UPDATED',
            action: 'update_workflow',
            actor,
            role: 'admin',
            tenantId: updated.tenantId,
            resourceType: 'workflow',
            resourceId: updated.id,
            outcome: 'SUCCESS',
            severity: 'INFO'
        });

        return updated;
    }

    deleteWorkflow(id, tenantId = null, actor = 'system') {
        const existing = this.getWorkflow(id, tenantId);
        if (!existing) throw new Error(`Workflow '${id}' not found`);

        const ok = this.store.deleteWorkflow(id, tenantId);

        if (ok) {
            auditLogService.logEvent({
                eventType: 'WORKFLOW_DELETED',
                action: 'delete_workflow',
                actor,
                role: 'admin',
                tenantId: existing.tenantId,
                resourceType: 'workflow',
                resourceId: id,
                outcome: 'SUCCESS',
                severity: 'INFO'
            });
        }
        return ok;
    }

    validateWorkflow(id, tenantId = null) {
        const wf = this.getWorkflow(id, tenantId);
        if (!wf) throw new Error(`Workflow '${id}' not found`);
        return wf.validate();
    }

    async executeWorkflow(id, options = {}) {
        const tenantId = options.tenantId || 'global';
        const wf = this.getWorkflow(id, tenantId);
        if (!wf) throw new Error(`Workflow '${id}' not found`);

        return await this.engine.executeWorkflow(wf, { ...options, tenantId });
    }

    pauseExecution(executionId, actor = 'operator') {
        return this.engine.pauseExecution(executionId, actor);
    }

    resumeExecution(executionId, actor = 'operator') {
        return this.engine.resumeExecution(executionId, actor);
    }

    cancelExecution(executionId, actor = 'operator') {
        return this.engine.cancelExecution(executionId, actor);
    }

    approveExecution(executionId, actor = 'admin', role = 'admin') {
        return this.engine.approveExecution(executionId, actor, role);
    }

    getExecution(executionId, tenantId = null) {
        return (this.engine && typeof this.engine.getExecution === 'function' && this.engine.getExecution(executionId)) || this.store.getExecution(executionId, tenantId);
    }

    listExecutions(filters = {}) {
        return this.store.listExecutions(filters);
    }

    getOverview(tenantId = null) {
        return this.store.getOverview(tenantId);
    }

    /**
     * Event trigger listener to execute matching event-driven workflows.
     */
    handlePlatformEvent(event = {}) {
        if (!event || !event.eventType) return;
        const matchingWorkflows = this.store.listWorkflows().filter(wf => {
            if (wf.status !== WORKFLOW_STATES.READY && wf.status !== WORKFLOW_STATES.SCHEDULED) return false;
            if (!wf.trigger || wf.trigger.type !== 'EVENT' || !wf.trigger.enabled) return false;

            if (wf.trigger.eventType && wf.trigger.eventType !== event.eventType) return false;
            if (wf.trigger.systemId && wf.trigger.systemId !== event.systemId) return false;
            if (wf.trigger.agentId && wf.trigger.agentId !== event.agentId) return false;

            return true;
        });

        matchingWorkflows.forEach(wf => {
            this.engine.executeWorkflow(wf, {
                tenantId: wf.tenantId,
                actor: 'event_engine',
                correlationId: event.correlationId || `corr_evt_wf_${Date.now()}`
            }).catch(() => {});
        });
    }
}

module.exports = {
    WorkflowService
};
