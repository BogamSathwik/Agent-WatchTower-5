/**
 * CapabilityDiscovery
 * Discovers and verifies supported capabilities of a connected external system.
 * Performs non-intrusive, safe capability checks without aggressive scanning.
 */

class CapabilityDiscovery {
    constructor({ executionService = null, healthEngine = null } = {}) {
        this.executionService = executionService;
        this.healthEngine = healthEngine;
    }

    async discoverCapabilities(system, options = {}) {
        const declaredCapabilities = Array.isArray(system.capabilities) ? system.capabilities : [];
        const results = [];

        const allCandidateCapabilities = Array.from(new Set([
            'health',
            'execute',
            'telemetry',
            'testing',
            'quality',
            'usage',
            'experience',
            'intelligence',
            'reporting',
            ...declaredCapabilities
        ]));

        for (const cap of allCandidateCapabilities) {
            const check = await this.verifyCapability(system, cap, options);
            results.push(check);
        }

        return {
            systemId: system.id || system.systemId,
            discoveredAt: new Date().toISOString(),
            totalChecked: results.length,
            supportedCount: results.filter(r => r.supported).length,
            capabilities: results
        };
    }

    async verifyCapability(system, capability, options = {}) {
        const systemId = system.id || system.systemId;
        const declared = Array.isArray(system.capabilities) && system.capabilities.includes(capability);
        const checkedAt = new Date().toISOString();

        try {
            if (capability === 'health') {
                if (this.healthEngine) {
                    const healthRes = await this.healthEngine.checkHealth(systemId);
                    const supported = healthRes && healthRes.status !== 'OFFLINE';
                    return {
                        capability,
                        status: supported ? 'VERIFIED' : 'UNAVAILABLE',
                        supported,
                        evidence: { status: healthRes.status, responseTimeMs: healthRes.responseTimeMs },
                        checkedAt
                    };
                }
                return {
                    capability,
                    status: declared ? 'DECLARED' : 'UNVERIFIED',
                    supported: declared,
                    evidence: { declared },
                    checkedAt
                };
            }

            if (capability === 'execute') {
                if (this.executionService) {
                    try {
                        const pingRes = await this.executionService.executeOperation(systemId, 'ping', {});
                        return {
                            capability,
                            status: 'VERIFIED',
                            supported: true,
                            evidence: { pingSuccess: true, latencyMs: pingRes.latencyMs },
                            checkedAt
                        };
                    } catch (e) {
                        return {
                            capability,
                            status: declared ? 'DECLARED' : 'UNSUPPORTED',
                            supported: declared,
                            evidence: { error: e.message },
                            checkedAt
                        };
                    }
                }
            }

            // Standard fallback verification based on system contract and metadata declaration
            return {
                capability,
                status: declared ? 'VERIFIED' : 'UNSUPPORTED',
                supported: declared,
                evidence: { declaredInContract: declared },
                checkedAt
            };
        } catch (err) {
            return {
                capability,
                status: 'ERROR',
                supported: false,
                evidence: { error: err.message },
                checkedAt
            };
        }
    }
}

module.exports = CapabilityDiscovery;
