/**
 * Phase 14 — Event Automation Service Façade
 * High-level service interface for managing event sources, rules, policies, ingesting events,
 * running dry-run simulations, and querying automation metrics.
 */

const EventStore = require('./EventStore');
const EventProcessor = require('./EventProcessor');
const EventNormalizer = require('./EventNormalizer');
const EventValidator = require('./EventValidator');

class EventService {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.runtimeService = options.runtimeService || null;
        this.healthEngine = options.healthEngine || null;
        this.alertingService = options.alertingService || null;
        this.remediationService = options.remediationService || null;
        this.orchestrationService = options.orchestrationService || null;
        this.reportingService = options.reportingService || null;

        this.store = new EventStore();
        this.processor = new EventProcessor({
            store: this.store,
            runtimeService: this.runtimeService,
            remediationService: this.remediationService,
            alertingService: this.alertingService,
            orchestrationService: this.orchestrationService,
            reportingService: this.reportingService,
            healthEngine: this.healthEngine
        });

        this.attachEngineListeners();
    }

    attachEngineListeners() {
        // Wire Runtime events if RuntimeService emits them
        if (this.runtimeService && typeof this.runtimeService.on === 'function') {
            this.runtimeService.on('runtime:event', (evt) => {
                this.ingestEvent(evt).catch(() => {});
            });
        }

        // Wire Health events if HealthEngine emits them
        if (this.healthEngine && typeof this.healthEngine.on === 'function') {
            this.healthEngine.on('health:changed', (evt) => {
                this.ingestEvent({
                    source: 'health',
                    eventType: 'HEALTH_CHANGED',
                    severity: evt.status === 'UNHEALTHY' ? 'CRITICAL' : 'LOW',
                    systemId: evt.systemId,
                    payload: evt
                }).catch(() => {});
            });
        }
    }

    async ingestEvent(rawEvent, options = {}) {
        return this.processor.processEvent(rawEvent, options);
    }

    async dryRun(rawEvent) {
        return this.processor.processEvent(rawEvent, { dryRun: true });
    }

    // --- SOURCES ---
    listSources() {
        return this.store.listSources();
    }

    registerSource(sourceDef) {
        EventValidator.validateSource(sourceDef);
        return this.store.registerSource(sourceDef).toJSON();
    }

    updateSource(id, updates) {
        const source = this.store.getSource(id);
        if (!source) {
            const err = new Error(`Event source with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'SOURCE_NOT_FOUND';
            throw err;
        }

        if (updates.name !== undefined) source.name = updates.name;
        if (updates.type !== undefined) source.type = updates.type;
        if (updates.enabled !== undefined) source.enabled = Boolean(updates.enabled);
        if (updates.capabilities !== undefined) source.capabilities = updates.capabilities;
        if (updates.metadata !== undefined) source.metadata = updates.metadata;

        return source.toJSON();
    }

    deleteSource(id) {
        const deleted = this.store.deleteSource(id);
        if (!deleted) {
            const err = new Error(`Event source with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'SOURCE_NOT_FOUND';
            throw err;
        }
        return { success: true, id };
    }

    // --- RULES ---
    listRules() {
        return this.store.listRules();
    }

    getRule(id) {
        const rule = this.store.getRule(id);
        if (!rule) {
            const err = new Error(`Event rule with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'RULE_NOT_FOUND';
            throw err;
        }
        return rule.toJSON();
    }

    registerRule(ruleDef) {
        EventValidator.validateRule(ruleDef);
        return this.store.registerRule(ruleDef).toJSON();
    }

    updateRule(id, updates) {
        const rule = this.store.getRule(id);
        if (!rule) {
            const err = new Error(`Event rule with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'RULE_NOT_FOUND';
            throw err;
        }

        if (updates.name !== undefined) rule.name = updates.name;
        if (updates.description !== undefined) rule.description = updates.description;
        if (updates.enabled !== undefined) rule.enabled = Boolean(updates.enabled);
        if (updates.eventType !== undefined) rule.eventType = updates.eventType;
        if (updates.sourceId !== undefined) rule.sourceId = updates.sourceId;
        if (updates.conditions !== undefined) rule.conditions = updates.conditions;
        if (updates.priority !== undefined) rule.priority = Number(updates.priority);
        if (updates.cooldownMs !== undefined) rule.cooldownMs = Number(updates.cooldownMs);
        if (updates.actions !== undefined) rule.actions = updates.actions;
        if (updates.policyId !== undefined) rule.policyId = updates.policyId;

        rule.updatedAt = new Date().toISOString();
        return rule.toJSON();
    }

    deleteRule(id) {
        const deleted = this.store.deleteRule(id);
        if (!deleted) {
            const err = new Error(`Event rule with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'RULE_NOT_FOUND';
            throw err;
        }
        return { success: true, id };
    }

    // --- QUERIES & METRICS ---
    getOverview() {
        const sources = this.store.listSources();
        const rules = this.store.listRules();
        const executions = this.store.listExecutions(100);
        const events = this.store.listEvents(100);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const eventsToday = events.filter(e => new Date(e.timestamp) >= todayStart).length;
        const matchedRules = rules.reduce((acc, r) => acc + (r.matchCount || 0), 0);
        const activeRules = rules.filter(r => r.enabled).length;
        const blockedAutomations = executions.filter(e => e.status === 'BLOCKED').length;
        const pendingApprovals = this.store.listPendingApprovals().length;
        const failedAutomations = executions.filter(e => e.status === 'FAILED').length;

        return {
            success: true,
            metrics: {
                totalEvents: events.length,
                eventsToday,
                activeRules,
                matchedRules,
                executionsCount: executions.length,
                blockedAutomations,
                pendingApprovals,
                failedAutomations
            },
            sourcesCount: sources.length,
            rulesCount: rules.length,
            timestamp: new Date().toISOString()
        };
    }

    listEvents(limit = 100) {
        return this.store.listEvents(limit);
    }

    getEvent(id) {
        const evt = this.store.getEvent(id);
        if (!evt) {
            const err = new Error(`Event with ID '${id}' not found`);
            err.statusCode = 404;
            err.code = 'EVENT_NOT_FOUND';
            throw err;
        }
        return evt;
    }

    listExecutions(limit = 100) {
        return this.store.listExecutions(limit);
    }
}

module.exports = EventService;
