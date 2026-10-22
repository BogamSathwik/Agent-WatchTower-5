/**
 * Phase 34 — Response Execution Coordinator
 * Coordinates PLAN → APPROVAL → EXISTING EXECUTION → VERIFICATION.
 * Delegates actual execution exclusively to the existing Response Center /
 * remediation execution infrastructure. Never implements its own execution.
 * Stops cleanly at UNSUPPORTED / APPROVAL_REQUIRED / BLOCKED states.
 */

const { ELIGIBILITY_STATES } = require('./ResponseEligibilityEngine');

class ResponseExecutionCoordinator {
    constructor(options = {}) {
        this.responseCenterService = options.responseCenterService || null;
        this.eligibilityEngine = options.eligibilityEngine || null;
        this.monitoringService = options.monitoringService || null;
    }

    _requireCenter() {
        if (!this.responseCenterService) throw new Error('ResponseCenterService not wired.');
    }

    _snapshot(agentId, tenantId) {
        try {
            const store = this.monitoringService ? this.monitoringService.store : null;
            if (!store || typeof store.getStatus !== 'function') {
                return { classification: 'INSUFFICIENT_DATA', reason: 'Monitoring store unavailable.', capturedAt: new Date().toISOString() };
            }
            const st = store.getStatus(agentId, tenantId);
            if (!st) return { classification: 'INSUFFICIENT_DATA', reason: 'No status recorded.', capturedAt: new Date().toISOString() };
            return {
                classification: 'CONFIRMED',
                currentState: st.currentState || st.status || 'UNKNOWN',
                consecutiveFailures: st.consecutiveFailures || 0,
                lastLatencyMs: st.latency ? (st.latency.lastLatencyMs || 0) : 0,
                availabilityPercentage: st.availabilityPercentage,
                capturedAt: new Date().toISOString()
            };
        } catch (e) {
            return { classification: 'INSUFFICIENT_DATA', reason: e.message, capturedAt: new Date().toISOString() };
        }
    }

    /**
     * Execute an adaptive plan through existing infrastructure.
     * Returns a coordination record; never bypasses approval.
     */
    async executeAdaptivePlan(adaptivePlan, { tenantId = 'default-tenant', operator = 'operator', userRole = 'OPERATOR' } = {}) {
        this._requireCenter();
        const preState = this._snapshot(adaptivePlan.agentId, tenantId);

        const eligibility = this.eligibilityEngine
            ? this.eligibilityEngine.checkEligibility(adaptivePlan, { tenantId, userRole })
            : { state: ELIGIBILITY_STATES.INSUFFICIENT_DATA, reasons: ['Eligibility engine not wired.'] };

        if (eligibility.state === ELIGIBILITY_STATES.UNSUPPORTED) {
            return { outcome: 'STOPPED_UNSUPPORTED', eligibility, preState, postState: null, executedAt: new Date().toISOString(), note: 'Execution is unsupported for this scope; stopped cleanly with UNSUPPORTED.' };
        }
        if (eligibility.state === ELIGIBILITY_STATES.APPROVAL_REQUIRED) {
            return { outcome: 'STOPPED_APPROVAL_REQUIRED', eligibility, preState, postState: null, executedAt: new Date().toISOString(), note: 'Approval is required; stopped at APPROVAL_REQUIRED without executing.' };
        }
        if (eligibility.state !== ELIGIBILITY_STATES.ELIGIBLE) {
            return { outcome: `STOPPED_${eligibility.state}`, eligibility, preState, postState: null, executedAt: new Date().toISOString(), note: `Execution blocked at eligibility state ${eligibility.state}.` };
        }

        // Delegate to existing execution (approval already satisfied).
        const result = await this.responseCenterService.executeResponse({
            planId: adaptivePlan.responseCenterPlanId, operatorId: operator, userRole, tenantId
        });
        const postState = this._snapshot(adaptivePlan.agentId, tenantId);
        return {
            outcome: result && result.success === false ? 'EXECUTION_FAILED' : 'EXECUTED_VIA_RESPONSE_CENTER',
            eligibility,
            preState,
            postState,
            executionResult: result,
            executedAt: new Date().toISOString(),
            note: 'Executed exclusively through the existing Response Center execution service.'
        };
    }

    /**
     * Verify through existing verification infrastructure.
     */
    async verifyAdaptivePlan(adaptivePlan, { tenantId = 'default-tenant' } = {}) {
        this._requireCenter();
        const verification = await this.responseCenterService.verifyResponse({
            planId: adaptivePlan.responseCenterPlanId, tenantId
        });
        const postState = this._snapshot(adaptivePlan.agentId, tenantId);
        return { verification, postState, verifiedAt: new Date().toISOString() };
    }
}

module.exports = { ResponseExecutionCoordinator };
