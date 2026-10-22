/**
 * OrchestrationStep Model
 * Represents a single executable monitoring step in an OrchestrationPlan.
 */

const { STEP_TYPES, STEP_STATES } = require('./OrchestrationStates');

class OrchestrationStep {
    constructor(data = {}) {
        this.id = data.id || `step_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.type = (data.type || '').toUpperCase();
        this.name = data.name || `${this.type} Step`;
        this.description = data.description || '';
        this.enabled = data.enabled !== false;
        this.dependsOn = Array.isArray(data.dependsOn) ? data.dependsOn : [];
        this.timeoutMs = typeof data.timeoutMs === 'number' && data.timeoutMs > 0 ? data.timeoutMs : 30000;
        
        this.retryPolicy = {
            maxAttempts: data.retryPolicy && typeof data.retryPolicy.maxAttempts === 'number' ? Math.max(1, data.retryPolicy.maxAttempts) : 1,
            backoffMs: data.retryPolicy && typeof data.retryPolicy.backoffMs === 'number' ? Math.max(0, data.retryPolicy.backoffMs) : 500,
            retryableErrors: data.retryPolicy && Array.isArray(data.retryPolicy.retryableErrors) ? data.retryPolicy.retryableErrors : ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'RATE_LIMITED']
        };

        this.continueOnFailure = data.continueOnFailure === true;
        this.configuration = data.configuration && typeof data.configuration === 'object' ? data.configuration : {};
    }

    validate() {
        const errors = [];
        if (!this.id || typeof this.id !== 'string') errors.push('Step id is required');
        if (!this.type || !Object.values(STEP_TYPES).includes(this.type)) {
            errors.push(`Step type must be one of: ${Object.values(STEP_TYPES).join(', ')}`);
        }
        if (!Array.isArray(this.dependsOn)) errors.push('dependsOn must be an array of step IDs');
        if (typeof this.timeoutMs !== 'number' || this.timeoutMs <= 0) errors.push('timeoutMs must be a positive integer');
        return { valid: errors.length === 0, errors };
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            description: this.description,
            enabled: this.enabled,
            dependsOn: this.dependsOn,
            timeoutMs: this.timeoutMs,
            retryPolicy: this.retryPolicy,
            continueOnFailure: this.continueOnFailure,
            configuration: this.configuration
        };
    }
}

module.exports = OrchestrationStep;
