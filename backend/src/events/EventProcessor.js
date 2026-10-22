/**
 * Phase 14 — Event Processing Engine & Pipeline
 * Implements deterministic event ingestion, normalization, rule matching, policy evaluation,
 * dry-run simulation, approval routing, action execution, storm protection, and audit logging.
 */

const EventNormalizer = require('./EventNormalizer');
const EventAction = require('./EventAction');
const { EVENT_STATES, POLICY_MODES } = require('./EventStates');

class EventProcessor {
    constructor(options = {}) {
        this.store = options.store;
        this.actionDispatcher = new EventAction(options);
    }

    async processEvent(rawEvent, options = {}) {
        const isDryRun = Boolean(options.dryRun);
        const startTime = Date.now();

        // Step 1 & 2: Receive & Normalize
        const event = EventNormalizer.normalize(rawEvent);

        // Record incoming event in history
        if (!isDryRun) {
            this.store.recordEvent(event);
        }

        const pipelineSummary = {
            eventId: event.id,
            systemId: event.systemId,
            eventType: event.eventType,
            source: event.source,
            dryRun: isDryRun,
            matchedRulesCount: 0,
            executedActionsCount: 0,
            blockedReason: null,
            status: EVENT_STATES.RECEIVED,
            ruleResults: []
        };

        // Step 3: Validate Source
        const sourceObj = this.store.getSource(event.source);
        if (sourceObj && !sourceObj.enabled) {
            pipelineSummary.status = EVENT_STATES.BLOCKED;
            pipelineSummary.blockedReason = `Event source '${event.source}' is disabled`;
            return this.buildAuditRecord(event, pipelineSummary, startTime);
        }

        // Step 4: Event Storm & Loop Protection Check
        const stormKey = `storm_${event.fingerprint}`;
        if (this.store.isCooldownActive(stormKey, 2000)) { // 2s storm window
            pipelineSummary.status = EVENT_STATES.BLOCKED;
            pipelineSummary.blockedReason = `Event storm / duplicate suppressed for fingerprint '${event.fingerprint}'`;
            return this.buildAuditRecord(event, pipelineSummary, startTime);
        }
        if (!isDryRun) {
            this.store.recordCooldown(stormKey);
        }

        // Causation / Loop depth check
        if (event.metadata && event.metadata.causationDepth && Number(event.metadata.causationDepth) > 5) {
            pipelineSummary.status = EVENT_STATES.BLOCKED;
            pipelineSummary.blockedReason = 'Automation loop depth limit exceeded (>5 cascading events)';
            return this.buildAuditRecord(event, pipelineSummary, startTime);
        }

        // Step 5: Find Matching Rules (Sorted by Priority)
        const allRules = Array.from(this.store.rules.values())
            .filter(r => r.enabled)
            .sort((a, b) => b.priority - a.priority);

        const matchingRules = [];
        for (const rule of allRules) {
            if (rule.matches(event)) {
                matchingRules.push(rule);
            }
        }

        pipelineSummary.matchedRulesCount = matchingRules.length;

        if (matchingRules.length === 0) {
            pipelineSummary.status = EVENT_STATES.SKIPPED;
            pipelineSummary.blockedReason = 'No enabled rules matched the event criteria';
            return this.buildAuditRecord(event, pipelineSummary, startTime);
        }

        // Process each matching rule
        pipelineSummary.status = EVENT_STATES.RULE_MATCHED;

        for (const rule of matchingRules) {
            const ruleResult = {
                ruleId: rule.id,
                ruleName: rule.name,
                actions: [],
                status: 'EVALUATED'
            };

            // Rule Cooldown Check
            const ruleCooldownKey = `rule_cooldown_${rule.id}`;
            if (this.store.isCooldownActive(ruleCooldownKey, rule.cooldownMs)) {
                ruleResult.status = 'BLOCKED_COOLDOWN';
                ruleResult.reason = `Rule '${rule.name}' is in cooldown (${rule.cooldownMs}ms)`;
                pipelineSummary.ruleResults.push(ruleResult);
                continue;
            }

            // Policy Evaluation
            const policy = this.store.getPolicy(rule.policyId);

            if (policy.mode === POLICY_MODES.DISABLED) {
                ruleResult.status = 'BLOCKED_POLICY';
                ruleResult.reason = `Policy '${policy.name}' is disabled`;
                pipelineSummary.ruleResults.push(ruleResult);
                continue;
            }

            if (!isDryRun) {
                rule.recordMatch();
                this.store.recordCooldown(ruleCooldownKey);
            }

            // Process Rule Actions
            for (const actionDef of rule.actions) {
                const actionType = actionDef.actionType || actionDef.type;

                if (!policy.isActionAllowed(actionType)) {
                    ruleResult.actions.push({
                        actionType,
                        status: 'BLOCKED',
                        reason: `Action '${actionType}' is blocked by policy '${policy.name}'`
                    });
                    continue;
                }

                const requiresApproval = policy.requiresApproval(actionType, policy.riskLevel);

                if (requiresApproval && !options.approved) {
                    const approvalRecord = {
                        approvalId: `appr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                        eventId: event.id,
                        systemId: event.systemId,
                        ruleId: rule.id,
                        actionDef,
                        status: 'PENDING',
                        createdAt: new Date().toISOString()
                    };

                    if (!isDryRun) {
                        this.store.recordPendingApproval(approvalRecord);
                    }

                    ruleResult.actions.push({
                        actionType,
                        status: 'APPROVAL_REQUIRED',
                        approvalId: approvalRecord.approvalId,
                        requiresApproval: true
                    });
                    pipelineSummary.status = EVENT_STATES.APPROVAL_REQUIRED;
                    continue;
                }

                // Execute or Dry-Run Simulation
                if (isDryRun) {
                    ruleResult.actions.push({
                        actionType,
                        status: 'SIMULATED',
                        targetSystemId: actionDef.targetSystemId || event.systemId,
                        expectedExecution: true
                    });
                    pipelineSummary.executedActionsCount++;
                } else {
                    const execResult = await this.actionDispatcher.execute(actionDef, event, { rule, policy });
                    ruleResult.actions.push(execResult);
                    if (execResult.status === 'SUCCEEDED') {
                        pipelineSummary.executedActionsCount++;
                    }
                }
            }

            pipelineSummary.ruleResults.push(ruleResult);
        }

        if (pipelineSummary.status !== EVENT_STATES.APPROVAL_REQUIRED) {
            pipelineSummary.status = isDryRun ? 'SIMULATED' : (pipelineSummary.executedActionsCount > 0 ? EVENT_STATES.COMPLETED : EVENT_STATES.SKIPPED);
        }

        return this.buildAuditRecord(event, pipelineSummary, startTime);
    }

    buildAuditRecord(event, pipelineSummary, startTime) {
        const auditRecord = {
            executionId: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            eventId: event.id,
            systemId: event.systemId,
            source: event.source,
            eventType: event.eventType,
            severity: event.severity,
            correlationId: event.correlationId,
            status: pipelineSummary.status,
            dryRun: pipelineSummary.dryRun,
            matchedRulesCount: pipelineSummary.matchedRulesCount,
            executedActionsCount: pipelineSummary.executedActionsCount,
            blockedReason: pipelineSummary.blockedReason,
            ruleResults: pipelineSummary.ruleResults,
            durationMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };

        if (!pipelineSummary.dryRun) {
            this.store.recordExecution(auditRecord);
        }

        return {
            success: pipelineSummary.status !== EVENT_STATES.FAILED && pipelineSummary.status !== EVENT_STATES.BLOCKED,
            audit: auditRecord,
            event: event.toJSON()
        };
    }
}

module.exports = EventProcessor;
