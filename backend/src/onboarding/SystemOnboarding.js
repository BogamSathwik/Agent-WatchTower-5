/**
 * SystemOnboarding Model
 * Central onboarding profile entity combining connection, auth, capabilities, and monitoring profiles.
 */

const ConnectionProfile = require('./ConnectionProfile');
const AuthenticationProfile = require('./AuthenticationProfile');
const MonitoringProfile = require('./MonitoringProfile');
const { ONBOARDING_STATES, isValidOnboardingTransition } = require('./OnboardingStates');

class SystemOnboarding {
    constructor(data = {}) {
        this.id = data.id ? String(data.id).trim() : `sys_${Date.now()}`;
        this.name = data.name ? String(data.name).trim() : 'Unnamed System';
        this.description = data.description || '';
        this.category = data.category || 'service';
        this.version = data.version || '1.0.0';
        
        this.status = data.status || ONBOARDING_STATES.DRAFT;
        
        this.connection = data.connection instanceof ConnectionProfile ? data.connection : new ConnectionProfile(data.connection || {});
        this.authentication = data.authentication instanceof AuthenticationProfile ? data.authentication : new AuthenticationProfile(data.authentication || {});
        
        this.capabilities = Array.isArray(data.capabilities) ? data.capabilities : ['health', 'telemetry'];
        this.monitoring = data.monitoring instanceof MonitoringProfile ? data.monitoring : new MonitoringProfile(data.monitoring || {});
        
        this.metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
        this.lastConnectionTest = data.lastConnectionTest || null;
        
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    transitionTo(nextStatus, reason = '') {
        if (!isValidOnboardingTransition(this.status, nextStatus)) {
            throw new Error(`Invalid onboarding state transition from '${this.status}' to '${nextStatus}'`);
        }
        this.status = nextStatus;
        this.updatedAt = new Date().toISOString();
        return this;
    }

    sanitize() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            category: this.category,
            version: this.version,
            status: this.status,
            baseUrl: this.connection ? this.connection.baseUrl : '',
            adapterType: this.connection ? this.connection.adapterType : 'mock',
            connection: this.connection ? this.connection.sanitize() : null,
            authentication: this.authentication ? this.authentication.sanitize() : null,
            capabilities: this.capabilities,
            monitoring: this.monitoring ? this.monitoring.toJSON() : null,
            metadata: this.metadata,
            lastConnectionTest: this.lastConnectionTest,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    toJSON() {
        return this.sanitize();
    }
}

module.exports = SystemOnboarding;
