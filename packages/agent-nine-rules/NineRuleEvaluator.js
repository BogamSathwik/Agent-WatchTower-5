const { createStandardRules, STANDARD_RULES_SPEC, ConfigurableRule } = require('./rules');

/**
 * NineRuleEvaluator
 * Comprehensive engine to scan, evaluate, and certify AI agents and web applications
 * against autonomous agent rules. Designed to be fully adaptable: rules can be added,
 * removed, modified, or completely replaced dynamically.
 */
class NineRuleEvaluator {
    /**
     * @param {Array<Object>} [customRules] - Optional custom or overridden rule instances
     */
    constructor(customRules = null) {
        this.rules = Array.isArray(customRules) && customRules.length > 0
            ? this._normalizeRules(customRules)
            : createStandardRules();
    }

    /**
     * Helper to normalize rules: wraps plain objects into ConfigurableRule instances.
     * @private
     */
    _normalizeRules(rulesArray = []) {
        return rulesArray.map((r, idx) => {
            if (r && typeof r.evaluate === 'function') {
                return r;
            }
            return new ConfigurableRule({
                ruleNumber: r.ruleNumber || (idx + 1),
                ...r
            });
        });
    }

    /**
     * Returns the array of active rule instances.
     * @returns {Array<Object>}
     */
    getRules() {
        return this.rules;
    }

    /**
     * Finds an active rule instance by ID or rule number.
     * @param {string|number} ruleIdOrNumber
     * @returns {Object|null}
     */
    getRule(ruleIdOrNumber) {
        return this.rules.find(r => r.id === ruleIdOrNumber || r.ruleNumber === ruleIdOrNumber) || null;
    }

    /**
     * Dynamically adds a new rule to the evaluator.
     * @param {Object} ruleOrConfig - BaseRule instance or declarative configuration object
     * @returns {NineRuleEvaluator} this instance for chaining
     */
    addRule(ruleOrConfig) {
        if (!ruleOrConfig || typeof ruleOrConfig !== 'object') {
            throw new Error('addRule requires a valid rule instance or configuration object.');
        }

        let rule = ruleOrConfig;
        if (typeof rule.evaluate !== 'function') {
            rule = new ConfigurableRule({
                ruleNumber: ruleOrConfig.ruleNumber || (this.rules.length + 1),
                ...ruleOrConfig
            });
        }

        // If a rule with the same ID already exists, replace it; otherwise append
        const existingIdx = this.rules.findIndex(r => r.id === rule.id);
        if (existingIdx >= 0) {
            this.rules[existingIdx] = rule;
        } else {
            this.rules.push(rule);
        }
        return this;
    }

    /**
     * Dynamically removes an existing rule by ID or rule number.
     * @param {string|number} ruleIdOrNumber
     * @returns {boolean} True if a rule was removed, false otherwise
     */
    removeRule(ruleIdOrNumber) {
        const initialLen = this.rules.length;
        this.rules = this.rules.filter(r => r.id !== ruleIdOrNumber && r.ruleNumber !== ruleIdOrNumber);
        return this.rules.length < initialLen;
    }

    /**
     * Dynamically updates an existing rule's configuration (weights, keywords, name, remediation).
     * @param {string|number} ruleIdOrNumber
     * @param {Object} updates
     * @returns {Object|null} The updated rule or null if not found
     */
    updateRule(ruleIdOrNumber, updates = {}) {
        const rule = this.getRule(ruleIdOrNumber);
        if (!rule) return null;

        if (typeof rule.update === 'function') {
            rule.update(updates);
        } else {
            Object.assign(rule, updates);
        }
        return rule;
    }

    /**
     * Replaces an existing rule with a new rule or configuration.
     * @param {string|number} ruleIdOrNumber
     * @param {Object} newRuleOrConfig
     * @returns {boolean} True if replaced, false if original rule not found
     */
    replaceRule(ruleIdOrNumber, newRuleOrConfig) {
        const idx = this.rules.findIndex(r => r.id === ruleIdOrNumber || r.ruleNumber === ruleIdOrNumber);
        if (idx === -1) return false;

        let rule = newRuleOrConfig;
        if (typeof rule.evaluate !== 'function') {
            rule = new ConfigurableRule({
                ruleNumber: newRuleOrConfig.ruleNumber || this.rules[idx].ruleNumber,
                ...newRuleOrConfig
            });
        }
        this.rules[idx] = rule;
        return true;
    }

    /**
     * Replaces all active rules with a new custom rule set.
     * @param {Array<Object>} newRules
     * @returns {NineRuleEvaluator} this instance for chaining
     */
    setRules(newRules = []) {
        if (!Array.isArray(newRules)) {
            throw new Error('setRules requires an array of rule instances or configurations.');
        }
        this.rules = this._normalizeRules(newRules);
        return this;
    }

    /**
     * Resets the evaluator back to the standard canonical 9 rules.
     * @returns {NineRuleEvaluator} this instance for chaining
     */
    resetRules() {
        this.rules = createStandardRules();
        return this;
    }

    /**
     * Exports the current rules as a JSON-serializable array of specifications.
     * @returns {Array<Object>}
     */
    exportRules() {
        return this.rules.map(r => (typeof r.toJSON === 'function' ? r.toJSON() : {
            id: r.id,
            ruleNumber: r.ruleNumber,
            name: r.name,
            category: r.category,
            weight: r.weight,
            importance: r.importance,
            description: r.description,
            remediation: r.remediation
        }));
    }

    /**
     * Rehydrates rules from a JSON specification array.
     * @param {Array<Object>} ruleDefinitions
     * @returns {NineRuleEvaluator} this instance for chaining
     */
    loadRules(ruleDefinitions = []) {
        return this.setRules(ruleDefinitions);
    }

    /**
     * Creates an independent clone of this evaluator with identical rules.
     * @returns {NineRuleEvaluator}
     */
    clone() {
        const clonedRules = this.exportRules();
        return new NineRuleEvaluator(clonedRules);
    }

    /**
     * Static helper to create a declarative ConfigurableRule directly.
     * @param {Object} config
     * @returns {ConfigurableRule}
     */
    static createRule(config = {}) {
        return new ConfigurableRule(config);
    }

    /**
     * Core scan method: Evaluates an agent contract or candidate against active rules.
     * Supports one-off scan options:
     * - contract.excludeRules: array of rule IDs or numbers to skip for this scan
     * - contract.customRules: array of custom rules to use for this scan
     *
     * @param {Object} contract - Agent contract, link payload, or code candidate
     * @param {Object|null} [runtimeContext] - Optional live runtime telemetry
     * @returns {Object} Comprehensive evaluation audit report
     */
    scan(contract = {}, runtimeContext = null) {
        const results = [];
        let totalScore = 0;
        let maxScore = 0;
        const followed = [];
        const missing = [];
        const unknown = [];
        const runtimeViolations = [];

        // Determine active rules for this scan
        let activeRules = this.rules;
        if (Array.isArray(contract.customRules) && contract.customRules.length > 0) {
            activeRules = this._normalizeRules(contract.customRules);
        } else if (Array.isArray(contract.excludeRules) && contract.excludeRules.length > 0) {
            activeRules = activeRules.filter(r => !contract.excludeRules.includes(r.id) && !contract.excludeRules.includes(r.ruleNumber));
        }

        let codeText = [
            contract.fileContent,
            contract.codeSnippet,
            contract.scriptContent,
            contract.rawCode
        ].filter(Boolean).join('\n');

        if (Array.isArray(contract.files) && contract.files.length > 0) {
            const filesText = contract.files
                .filter(Boolean)
                .map(f => `// File: ${f.path || f.name || 'file'}\n${f.content || ''}`)
                .join('\n\n');
            codeText = [codeText, filesText].filter(Boolean).join('\n\n');
        }

        // Check for runtime health/telemetry overrides
        const rHealth = runtimeContext && (runtimeContext.health || (runtimeContext.status ? runtimeContext : null));
        const rExec = runtimeContext && runtimeContext.lastExecution;
        const rTools = runtimeContext && runtimeContext.toolStatus;

        for (const rule of activeRules) {
            maxScore += (rule.weight || 10);
            let evalResult = { followed: false, status: 'FAIL', evidence: null, remediation: null };

            try {
                const res = rule.evaluate(contract, codeText, runtimeContext);
                if (typeof res === 'object' && res !== null) {
                    evalResult = {
                        followed: Boolean(res.followed),
                        status: res.status || (res.followed ? 'PASS' : 'FAIL'),
                        evidence: res.evidence || null,
                        remediation: res.remediation || null
                    };
                } else {
                    evalResult = {
                        followed: Boolean(res),
                        status: res ? 'PASS' : 'FAIL',
                        evidence: res ? 'Verified from specification' : null,
                        remediation: null
                    };
                }
            } catch (err) {
                evalResult = {
                    followed: false,
                    status: 'FAIL',
                    evidence: `Evaluation error during scan: ${err.message}`,
                    remediation: null
                };
            }

            // Runtime Telemetry Degradation Probing
            if (rule.id === 'observation_results' && rHealth) {
                const hs = String(rHealth.status || rHealth.healthStatus || '').toUpperCase();
                if (hs === 'UNKNOWN' || hs === 'INDETERMINATE' || hs === 'UNPROBED' || hs === 'PENDING') {
                    evalResult.followed = false;
                    evalResult.status = 'UNKNOWN';
                    evalResult.evidence = `Runtime health probe inconclusive (${hs}): ${rHealth.reason || 'Telemetry endpoint returned unknown status'}`;
                } else if (hs === 'OFFLINE' || hs === 'UNHEALTHY') {
                    evalResult.followed = false;
                    evalResult.status = 'FAIL';
                    evalResult.evidence = `Runtime health probe failed (${hs}): ${rHealth.reason || 'Agent is unreachable or failing observation probes'}`;
                    runtimeViolations.push({
                        ruleId: rule.id,
                        ruleName: rule.name,
                        severity: 'CRITICAL',
                        message: `Health observation telemetry failure: agent reported ${hs}`,
                        detectedAt: new Date().toISOString()
                    });
                }
            } else if (rule.id === 'action_taking' && rExec && rExec.success === false) {
                evalResult.followed = false;
                evalResult.status = 'FAIL';
                evalResult.evidence = `Runtime execution failed: ${rExec.errorMessage || rExec.error || 'Action invocation error'}`;
                runtimeViolations.push({
                    ruleId: rule.id,
                    ruleName: rule.name,
                    severity: 'HIGH',
                    message: `Action execution runner failed: ${rExec.errorMessage || 'Execution error'}`,
                    detectedAt: new Date().toISOString()
                });
            } else if (rule.id === 'tool_calling' && rTools && rTools.available === false) {
                evalResult.followed = false;
                evalResult.status = 'FAIL';
                evalResult.evidence = `Runtime external tools unavailable: ${(rTools.failingTools || []).join(', ') || 'Connection lost'}`;
                runtimeViolations.push({
                    ruleId: rule.id,
                    ruleName: rule.name,
                    severity: 'MEDIUM',
                    message: `Integrated tool endpoints degraded`,
                    detectedAt: new Date().toISOString()
                });
            } else if (rule.id === 'adaptation_replanning' && rExec) {
                if (rExec.retried) {
                    evalResult.followed = true;
                    evalResult.status = 'PASS';
                    evalResult.evidence = `Runtime adaptation verified: recovered via automated retry policy (${rExec.retryCount || 1} retries)`;
                } else if (rExec.adaptationStatus === 'UNKNOWN' || rExec.recoveryStatus === 'UNKNOWN') {
                    evalResult.followed = false;
                    evalResult.status = 'UNKNOWN';
                    evalResult.evidence = 'Runtime adaptation and recovery telemetry is inconclusive';
                }
            }

            // Allowed rule statuses must strictly be: PASS, FAIL, UNKNOWN
            let ruleStatus = evalResult.status;
            if (!['PASS', 'FAIL', 'UNKNOWN'].includes(ruleStatus)) {
                ruleStatus = evalResult.followed ? 'PASS' : 'FAIL';
            }

            // Keep existing followed: true | false field for backward compatibility
            // followed is true ONLY when status is PASS
            const followedBool = ruleStatus === 'PASS';

            const ruleResult = {
                id: rule.id,
                ruleNumber: rule.ruleNumber,
                name: rule.name,
                category: rule.category,
                importance: rule.importance,
                description: rule.description,
                followed: followedBool,
                status: ruleStatus,
                weight: rule.weight || 10,
                evidence: evalResult.evidence,
                remediation: followedBool
                    ? null
                    : (evalResult.remediation || (ruleStatus === 'UNKNOWN' ? `Provide telemetry or specification to verify ${rule.name}.` : rule.remediation))
            };

            results.push(ruleResult);

            if (ruleStatus === 'PASS') {
                totalScore += (rule.weight || 10);
                followed.push(ruleResult);
            } else if (ruleStatus === 'UNKNOWN') {
                unknown.push(ruleResult);
            } else {
                missing.push(ruleResult);
            }
        }

        const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
        
        // Status determination (Preserves existing decision logic)
        let status = 'COMPLIANT';
        if (runtimeViolations.length > 0) {
            status = runtimeViolations.some(v => v.severity === 'CRITICAL') ? 'RUNTIME_CRITICAL' : 'RUNTIME_DEGRADED';
        } else if (missing.length > 0 || unknown.length > 0) {
            const nonPassCore = [...missing, ...unknown].filter(m => m.importance === 'CORE');
            status = (nonPassCore.length >= 3 || percentage < 60) ? 'NON_COMPLIANT' : 'PARTIALLY_COMPLIANT';
        }

        // Lifecycle recommendation determination (Preserves existing decision logic)
        let recommendation = 'KEEP';
        if (status === 'RUNTIME_CRITICAL' || status === 'NON_COMPLIANT' || percentage < 60) {
            recommendation = 'RETIRE';
        } else if (status === 'PARTIALLY_COMPLIANT' || status === 'RUNTIME_DEGRADED' || percentage < 90) {
            recommendation = 'REVIEW';
        }

        // Suggested operational remediations
        const suggestedRemediations = [];
        if (runtimeViolations.some(v => v.ruleId === 'observation_results')) {
            suggestedRemediations.push({ action: 'REPROBE_HEALTH', label: 'Re-probe Health & Verify Endpoint', description: 'Trigger immediate on-demand health check to test connectivity.' });
        }
        if (runtimeViolations.some(v => v.ruleId === 'action_taking')) {
            suggestedRemediations.push({ action: 'ATTACH_FALLBACK_RUNNER', label: 'Attach Fallback Runner', description: 'Switch endpoint to redundant fallback runner address.' });
        }
        if (missing.some(m => m.id === 'adaptation_replanning')) {
            suggestedRemediations.push({ action: 'ENABLE_RETRY_POLICY', label: 'Enable Automatic Retry Policy', description: 'Configure connection.retries = 3 for fault tolerance.' });
        }
        if (missing.some(m => m.id === 'ai_reasoning')) {
            suggestedRemediations.push({ action: 'CONFIGURE_MODEL', label: 'Configure AI Model', description: 'Attach an explicit model (e.g. GPT-4o, Claude 3.5, Gemini 1.5) to enable cognitive reasoning.' });
        }

        const primaryId = contract.ID !== undefined ? contract.ID : (contract.id !== undefined ? contract.id : (contract.masterId !== undefined ? contract.masterId : (contract.agentId !== undefined ? contract.agentId : null)));
        const userId = contract.USERID !== undefined ? contract.USERID : (contract.userId !== undefined ? contract.userId : null);
        const firmId = contract.FIRMID !== undefined ? contract.FIRMID : (contract.firmId !== undefined ? contract.firmId : null);
        const fileName = contract.FILENAME !== undefined ? contract.FILENAME : (contract.fileName !== undefined ? contract.fileName : (contract.filename !== undefined ? contract.filename : null));
        const agentName = contract.AGENT_NAME !== undefined ? contract.AGENT_NAME : (contract.agentName !== undefined ? contract.agentName : (contract.name !== undefined ? contract.name : 'Unnamed Agent'));
        const publicUrl = contract.PUBLIC_URL !== undefined ? contract.PUBLIC_URL : (contract.publicUrl !== undefined ? contract.publicUrl : (contract.url !== undefined ? contract.url : (contract.endpoint !== undefined ? contract.endpoint : null)));

        const identity = {
            ID: primaryId,
            USERID: userId,
            FIRMID: firmId,
            FILENAME: fileName,
            AGENT_NAME: agentName,
            PUBLIC_URL: publicUrl,
            primaryId,
            masterId: primaryId,
            userId,
            firmId,
            fileName,
            agentName,
            publicUrl
        };

        return {
            identity,
            agentId: primaryId || 'candidate-agent',
            agentName: agentName,
            scannedAt: new Date().toISOString(),
            complianceScore: percentage,
            rulesFollowedCount: followed.length,
            rulesMissingCount: missing.length,
            rulesUnknownCount: unknown.length,
            totalRules: activeRules.length,
            status,
            overallStatus: status,
            recommendation,
            isFullyCompliant: missing.length === 0 && unknown.length === 0 && runtimeViolations.length === 0,
            hasMissingCoreRules: missing.some(m => m.importance === 'CORE') || unknown.some(u => u.importance === 'CORE'),
            runtimeViolations,
            needsRemediation: runtimeViolations.length > 0 || percentage < 70,
            remediationActions: suggestedRemediations,
            followedRules: followed,
            missingRules: missing,
            unknownRules: unknown,
            rules: results,
            allRules: results
        };
    }

    /**
     * Alias for scan()
     */
    evaluate(contract, runtimeContext) {
        return this.scan(contract, runtimeContext);
    }

    /**
     * Evaluate agent source code or uploaded script text.
     * @param {string} codeContent - Source code content
     * @param {Object} [metadata] - Optional metadata (fileName, agentName)
     * @returns {Object} Audit report
     */
    evaluateCode(codeContent, metadata = {}) {
        const fileName = metadata.fileName || 'agent_script.js';
        const cleanName = metadata.name || fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        const payload = {
            id: metadata.id || `script-${Date.now()}`,
            name: cleanName,
            fileName: fileName,
            fileContent: codeContent,
            rawCode: codeContent,
            runner: { type: 'script_file', endpoint: `file://${fileName}` },
            connection: { retries: 2 },
            ...metadata
        };
        return this.scan(payload);
    }

    /**
     * Evaluate an agent or web app via live URL / link.
     * @param {string} url - Target URL
     * @param {Object} [metadata] - Optional metadata (name, model, tools, purpose, type)
     * @returns {Object} Audit report
     */
    evaluateLink(url, metadata = {}) {
        const cleanUrl = String(url || '').trim();
        const fallbackName = cleanUrl.replace(/^https?:\/\//, '').split('/')[0] || 'Web Agent Link';
        const name = metadata.name || fallbackName;
        const purpose = metadata.purpose || `Autonomous agent or web app deployed at ${cleanUrl}`;

        const payload = {
            id: metadata.id || `link-${Date.now()}`,
            name: name,
            url: cleanUrl,
            endpoint: cleanUrl,
            purpose: purpose,
            description: purpose,
            model: metadata.model || null,
            toolsString: metadata.tools || metadata.toolsString || null,
            runner: { type: 'http', endpoint: cleanUrl },
            connection: { endpoint: cleanUrl, retries: 3, healthEndpoint: `${cleanUrl}/health` },
            ...metadata
        };
        return this.scan(payload);
    }

    /**
     * Evaluate a registered agent object with optional live telemetry.
     * @param {Object} agent - Registered agent object
     * @param {Object} [runtimeTelemetry] - Telemetry (health, execs, tools)
     * @returns {Object} Audit report
     */
    evaluateAgent(agent, runtimeTelemetry = null) {
        return this.scan(agent, runtimeTelemetry);
    }

    /**
     * Returns canonical JSON specification of all 9 rules.
     */
    static getStandardSpec() {
        return STANDARD_RULES_SPEC;
    }
}

module.exports = NineRuleEvaluator;
