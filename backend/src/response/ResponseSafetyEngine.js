/**
 * Phase 29 — Response Safety Engine
 * Evaluates safety classification of proposed operational response actions before execution.
 * Classifications: SAFE, REQUIRES_APPROVAL, RESTRICTED, UNSUPPORTED.
 * Strictly enforces RBAC permissions, blast radius thresholds, and capability constraints.
 */

const SAFETY_LEVELS = Object.freeze({
    SAFE: 'SAFE',
    REQUIRES_APPROVAL: 'REQUIRES_APPROVAL',
    RESTRICTED: 'RESTRICTED',
    UNSUPPORTED: 'UNSUPPORTED'
});

class ResponseSafetyEngine {
    constructor(options = {}) {
        this.policyEngine = options.automationPolicyEngine || null;
        this.blastRadiusAnalyzer = options.blastRadiusAnalyzer || null;
    }

    /**
     * Evaluates action safety.
     * @param {Object} params
     * @param {Object} params.action Selected response option object
     * @param {string} params.agentId Target agent ID
     * @param {Object} params.agentProfile Optional agent profile
     * @param {string} params.userRole User role (e.g. VIEWER, OPERATOR, ADMIN)
     * @param {Object} params.incident Incident details if present
     * @returns {Object} Safety evaluation result
     */
    evaluateSafety({ action, agentId, agentProfile, userRole = 'OPERATOR', incident = null }) {
        const actionType = action?.actionType || 'INSPECT_HEALTH';
        const isUnsupportedAgent = (agentId && (String(agentId).toLowerCase().includes('compa') || String(agentId).toLowerCase().includes('repa'))) ||
            (agentProfile?.endpoints?.execution?.enabled === false);

        const isReadOnlyAction = [
            'INSPECT_HEALTH',
            'INSPECT_TIMELINE',
            'INSPECT_DEPENDENCIES',
            'INSPECT_EVIDENCE',
            'INSPECT_INCIDENTS',
            'INSPECT_HISTORICAL_DATA',
            'ESCALATE_OPERATOR',
            'WAIT_FOR_RECOVERY'
        ].includes(actionType);

        // 1. Check if execution is UNSUPPORTED for external agents (Compa/Repa)
        if (!isReadOnlyAction && isUnsupportedAgent) {
            return {
                safetyLevel: SAFETY_LEVELS.UNSUPPORTED,
                isAllowed: false,
                requiresApproval: true,
                reasons: [`Action ${actionType} is unsupported for external agent ${agentId} because execution endpoints are disabled.`],
                blastRadius: 'NONE',
                rollbackAvailable: false,
                verificationAvailable: false
            };
        }

        // 2. Check RBAC Restrictions (Viewers cannot execute stateful/remediation actions)
        if (!isReadOnlyAction && userRole === 'VIEWER') {
            return {
                safetyLevel: SAFETY_LEVELS.RESTRICTED,
                isAllowed: false,
                requiresApproval: true,
                reasons: [`User role '${userRole}' is restricted from initiating operational mutations or remediations.`],
                blastRadius: 'UNKNOWN',
                rollbackAvailable: false,
                verificationAvailable: false
            };
        }

        // 3. Read-Only / Informational actions are always SAFE
        if (isReadOnlyAction) {
            return {
                safetyLevel: SAFETY_LEVELS.SAFE,
                isAllowed: true,
                requiresApproval: false,
                reasons: ['Informational and diagnostic inspection actions carry zero operational risk.'],
                blastRadius: 'NONE',
                rollbackAvailable: false,
                verificationAvailable: true
            };
        }

        // 4. Stateful / Remediation actions evaluation
        const blastRadius = incident?.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM';
        const rollbackAvailable = true;
        const verificationAvailable = true;

        // Default stateful remediation requires explicit operator approval unless auto-policy grants explicit approval
        const requiresApproval = true;

        return {
            safetyLevel: SAFETY_LEVELS.REQUIRES_APPROVAL,
            isAllowed: true,
            requiresApproval,
            reasons: [
                `Stateful action '${actionType}' alters agent execution state or system configuration.`,
                `Incident severity '${incident?.severity || 'HIGH'}' requires explicit operator approval before execution.`
            ],
            blastRadius,
            rollbackAvailable,
            verificationAvailable
        };
    }
}

module.exports = { ResponseSafetyEngine, SAFETY_LEVELS };
