/**
 * OnboardingService
 * Unified service facade orchestrating system onboarding, adapter configuration,
 * connection testing, capability discovery, lifecycle transitions, and System Profile synthesis.
 */

const SystemOnboarding = require('./SystemOnboarding');
const ConnectionProfile = require('./ConnectionProfile');
const AuthenticationProfile = require('./AuthenticationProfile');
const MonitoringProfile = require('./MonitoringProfile');
const OnboardingValidator = require('./OnboardingValidator');
const OnboardingStore = require('./OnboardingStore');
const CapabilityDiscovery = require('./CapabilityDiscovery');
const { ONBOARDING_STATES, CONNECTION_TEST_RESULTS } = require('./OnboardingStates');
const { SsrfProtector } = require('../adapter/SsrfProtector');
const { ErrorNormalizer } = require('../adapter/ErrorNormalizer');

class OnboardingService {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || null;
        this.adapterRegistry = options.adapterRegistry || null;
        this.executionService = options.executionService || null;
        this.healthEngine = options.healthEngine || null;
        this.qualityRunner = options.qualityRunner || null;
        this.usageCollector = options.usageCollector || null;
        this.experienceStore = options.experienceStore || null;
        this.intelligenceService = options.intelligenceService || null;
        this.alertingService = options.alertingService || null;
        this.reportingService = options.reportingService || null;
        this.orchestrationService = options.orchestrationService || null;

        this.store = options.onboardingStore || new OnboardingStore();
        this.capabilityDiscovery = new CapabilityDiscovery({
            executionService: this.executionService,
            healthEngine: this.healthEngine
        });
    }

    async onboardSystem(payload = {}, options = {}) {
        const valRes = OnboardingValidator.validate(payload, options);
        if (!valRes.valid) {
            const err = new Error(`Onboarding validation failed: ${valRes.errors.join('; ')}`);
            err.statusCode = 400;
            err.errors = valRes.errors;
            throw err;
        }

        const systemId = payload.id.trim();

        // 1. Create Onboarding Model
        const onboarding = new SystemOnboarding(payload);
        onboarding.transitionTo(ONBOARDING_STATES.VALIDATING);

        // 2. Register with SystemRegistry
        if (this.systemRegistry) {
            try {
                this.systemRegistry.registerSystem({
                    id: systemId,
                    name: onboarding.name,
                    version: onboarding.version,
                    contractVersion: payload.contractVersion || '1.0.0',
                    category: onboarding.category,
                    description: onboarding.description,
                    capabilities: onboarding.capabilities,
                    adapter: {
                        adapterType: onboarding.connection.adapterType,
                        adapterId: payload.adapterId || `adapter-${systemId}`
                    }
                });
            } catch (err) {
                if (err.statusCode === 409) {
                    throw err; // Duplicate system
                }
                // If system exists, update
                if (this.systemRegistry.updateSystem) {
                    this.systemRegistry.updateSystem(systemId, {
                        name: onboarding.name,
                        version: onboarding.version,
                        category: onboarding.category,
                        description: onboarding.description,
                        capabilities: onboarding.capabilities
                    });
                }
            }
        }

        onboarding.transitionTo(ONBOARDING_STATES.CONFIGURED);
        this.store.saveOnboarding(onboarding);
        return onboarding;
    }

    getOnboarding(systemId) {
        return this.store.getOnboarding(systemId);
    }

    listOnboardings(filterFn = null) {
        return this.store.listOnboardings(filterFn);
    }

    async updateConfiguration(systemId, updatePayload = {}) {
        const onboarding = this.getOnboarding(systemId);
        if (!onboarding) {
            const err = new Error(`Onboarded system '${systemId}' not found`);
            err.statusCode = 404;
            throw err;
        }

        if (updatePayload.name) onboarding.name = String(updatePayload.name).trim();
        if (updatePayload.description !== undefined) onboarding.description = updatePayload.description;
        if (updatePayload.category) onboarding.category = updatePayload.category;
        if (updatePayload.version) onboarding.version = updatePayload.version;

        if (updatePayload.connection) {
            onboarding.connection = new ConnectionProfile({
                ...onboarding.connection.sanitize(),
                ...updatePayload.connection
            });
        }
        if (updatePayload.authentication) {
            onboarding.authentication = new AuthenticationProfile({
                ...onboarding.authentication.sanitize(),
                ...updatePayload.authentication
            });
        }
        if (updatePayload.monitoring) {
            onboarding.monitoring = new MonitoringProfile({
                ...onboarding.monitoring.toJSON(),
                ...updatePayload.monitoring
            });
        }
        if (Array.isArray(updatePayload.capabilities)) {
            onboarding.capabilities = updatePayload.capabilities;
        }

        const valRes = OnboardingValidator.validate(onboarding.sanitize());
        if (!valRes.valid) {
            const err = new Error(`Configuration update validation failed: ${valRes.errors.join('; ')}`);
            err.statusCode = 400;
            throw err;
        }

        this.store.saveOnboarding(onboarding);
        return onboarding;
    }

    async testConnection(systemId, options = {}) {
        const sid = String(systemId).trim();
        const onboarding = this.getOnboarding(sid);
        const startTime = Date.now();
        const checkedAt = new Date().toISOString();

        if (onboarding) {
            try {
                onboarding.transitionTo(ONBOARDING_STATES.CONNECTING);
            } catch (e) {}
        }

        // URL Security check
        const baseUrl = onboarding && onboarding.connection ? onboarding.connection.baseUrl : (options.baseUrl || '');
        if (baseUrl) {
            const ssrfCheck = SsrfProtector.validateUrl(baseUrl, { allowLocalhost: options.allowLocalhost !== false });
            if (!ssrfCheck.safe) {
                const testResult = {
                    systemId: sid,
                    status: CONNECTION_TEST_RESULTS.SECURITY_BLOCKED,
                    connected: false,
                    responseTimeMs: Date.now() - startTime,
                    checkedAt,
                    error: { message: `Security blocked: ${ssrfCheck.error}`, code: 'SSRF_BLOCKED' }
                };
                this.store.saveConnectionTestResult(sid, testResult);
                if (onboarding) try { onboarding.transitionTo(ONBOARDING_STATES.CONNECTION_FAILED); } catch (e) {}
                return testResult;
            }
        }

        try {
            let res = null;
            if (this.healthEngine) {
                res = await this.healthEngine.checkHealth(sid);
            } else if (this.executionService) {
                res = await this.executionService.executeOperation(sid, 'ping', {});
            } else {
                res = { status: 'HEALTHY', responseTimeMs: 10 };
            }

            const isSuccess = res && res.status !== 'OFFLINE' && res.status !== 'FAILED';
            const testResult = {
                systemId: sid,
                status: isSuccess ? CONNECTION_TEST_RESULTS.CONNECTED : CONNECTION_TEST_RESULTS.NETWORK_ERROR,
                connected: isSuccess,
                responseTimeMs: res.responseTimeMs !== undefined ? res.responseTimeMs : (Date.now() - startTime),
                checkedAt,
                details: { status: res.status || 'CONNECTED' }
            };

            this.store.saveConnectionTestResult(sid, testResult);
            if (onboarding && isSuccess) {
                try { onboarding.transitionTo(ONBOARDING_STATES.CONNECTED); } catch (e) {}
            }
            return testResult;
        } catch (err) {
            const normErr = ErrorNormalizer.normalize(err);
            let testStatus = CONNECTION_TEST_RESULTS.NETWORK_ERROR;
            if (normErr.code === 'TIMEOUT' || err.message.includes('timeout')) testStatus = CONNECTION_TEST_RESULTS.TIMEOUT;
            if (normErr.code === 'AUTH_FAILURE' || normErr.code === 'AUTHENTICATION_FAILED' || err.statusCode === 401) testStatus = CONNECTION_TEST_RESULTS.AUTHENTICATION_FAILED;
            if (normErr.code === 'FORBIDDEN' || normErr.code === 'AUTHORIZATION_FAILED' || err.statusCode === 403) testStatus = CONNECTION_TEST_RESULTS.AUTHORIZATION_FAILED;

            const testResult = {
                systemId: sid,
                status: testStatus,
                connected: false,
                responseTimeMs: Date.now() - startTime,
                checkedAt,
                error: { message: normErr.message, code: normErr.code }
            };

            this.store.saveConnectionTestResult(sid, testResult);
            if (onboarding) {
                try {
                    onboarding.transitionTo(testStatus === CONNECTION_TEST_RESULTS.AUTHENTICATION_FAILED ? ONBOARDING_STATES.AUTHENTICATION_FAILED : ONBOARDING_STATES.CONNECTION_FAILED);
                } catch (e) {}
            }
            return testResult;
        }
    }

    async discoverCapabilities(systemId, options = {}) {
        const sid = String(systemId).trim();
        const onboarding = this.getOnboarding(sid);
        const sysObj = onboarding ? onboarding.sanitize() : { id: sid, capabilities: ['health'] };

        const discoveryReport = await this.capabilityDiscovery.discoverCapabilities(sysObj, options);
        
        // Update declared capabilities
        const verifiedCapNames = discoveryReport.capabilities.filter(c => c.supported).map(c => c.capability);
        if (onboarding) {
            onboarding.capabilities = Array.from(new Set([...onboarding.capabilities, ...verifiedCapNames]));
            this.store.saveOnboarding(onboarding);
        }
        if (this.systemRegistry && this.systemRegistry.updateSystem) {
            try {
                this.systemRegistry.updateSystem(sid, { capabilities: verifiedCapNames });
            } catch (e) {}
        }

        return discoveryReport;
    }

    activateSystem(systemId) {
        const onboarding = this.getOnboarding(systemId);
        if (!onboarding) throw new Error(`Onboarded system '${systemId}' not found`);
        onboarding.transitionTo(ONBOARDING_STATES.MONITORING);
        this.store.saveOnboarding(onboarding);
        return onboarding;
    }

    deactivateSystem(systemId) {
        const onboarding = this.getOnboarding(systemId);
        if (!onboarding) throw new Error(`Onboarded system '${systemId}' not found`);
        onboarding.transitionTo(ONBOARDING_STATES.DISABLED);
        this.store.saveOnboarding(onboarding);
        return onboarding;
    }

    retireSystem(systemId) {
        const onboarding = this.getOnboarding(systemId);
        if (!onboarding) throw new Error(`Onboarded system '${systemId}' not found`);
        onboarding.transitionTo(ONBOARDING_STATES.RETIRED);
        this.store.saveOnboarding(onboarding);
        if (this.systemRegistry && this.systemRegistry.unregisterSystem) {
            try {
                this.systemRegistry.unregisterSystem(systemId);
            } catch (e) {}
        }
        return onboarding;
    }

    async getSystemProfile(systemId) {
        const sid = String(systemId).trim();
        const onboarding = this.getOnboarding(sid);
        const system = this.systemRegistry ? this.systemRegistry.getSystem(sid) : null;

        // Health info
        let healthInfo = null;
        if (this.healthEngine) {
            try {
                const latest = this.healthEngine.healthStore ? this.healthEngine.healthStore.getLatestMeasurement(sid) : null;
                const state = this.healthEngine.healthStore ? this.healthEngine.healthStore.getSystemState(sid) : null;
                healthInfo = {
                    currentHealth: state ? state.status : 'UNKNOWN',
                    availability: state ? state.availabilityPercent : 100,
                    latency: latest ? latest.responseTimeMs : null
                };
            } catch (e) {}
        }

        // Quality info
        let qualityInfo = null;
        if (this.qualityRunner && this.qualityRunner.qualityStore) {
            try {
                const summary = this.qualityRunner.qualityStore.getSystemSummary(sid);
                qualityInfo = {
                    passRate: summary ? summary.passRate : null,
                    totalTests: summary ? summary.totalTests : 0
                };
            } catch (e) {}
        }

        // Intelligence info
        let intelligenceInfo = null;
        if (this.intelligenceService) {
            try {
                const overview = this.intelligenceService.getSystemOverview(sid);
                intelligenceInfo = {
                    activeInsightsCount: overview ? (overview.activeInsights ? overview.activeInsights.length : 0) : 0
                };
            } catch (e) {}
        }

        // Alerting info
        let alertInfo = null;
        if (this.alertingService && this.alertingService.store) {
            try {
                const activeAlerts = this.alertingService.store.listAlerts({ systemId: sid });
                alertInfo = {
                    activeAlertsCount: activeAlerts.length
                };
            } catch (e) {}
        }

        return {
            system: {
                id: sid,
                name: onboarding ? onboarding.name : (system ? system.name : sid),
                category: onboarding ? onboarding.category : (system ? system.category : 'service'),
                version: onboarding ? onboarding.version : (system ? system.version : '1.0.0'),
                onboardingStatus: onboarding ? onboarding.status : 'CONFIGURED'
            },
            connection: onboarding ? onboarding.connection.sanitize() : null,
            authentication: onboarding ? onboarding.authentication.sanitize() : null,
            capabilities: onboarding ? onboarding.capabilities : (system ? system.capabilities : []),
            monitoring: onboarding ? onboarding.monitoring.toJSON() : null,
            lastConnectionTest: onboarding ? onboarding.lastConnectionTest : null,
            health: healthInfo,
            quality: qualityInfo,
            intelligence: intelligenceInfo,
            alerts: alertInfo
        };
    }
}

module.exports = OnboardingService;
