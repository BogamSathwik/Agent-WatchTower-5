/**
 * Phase 34 — Response Learning Engine
 * Creates structured, evidence-based operational learning records.
 * Advisory only: never modifies safety policies, thresholds, capabilities,
 * configuration, topology, or health state. Learning informs future
 * intelligence; it never silently changes operational behavior.
 */

function sanitize(str) {
    return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
}

class ResponseLearningEngine {
    /**
     * Derive learning records from plan + outcome + comparison.
     * Each record links back to its source response/outcome.
     */
    learnFromOutcome({ adaptivePlan, outcomeAnalysis, comparison, tenantId = 'default-tenant' } = {}) {
        const records = [];
        const push = (statement, evidenceType, sourceRefs) => {
            records.push({
                learningId: `lrn_${sanitize(adaptivePlan ? adaptivePlan.agentId : 'fleet')}_${Date.now().toString(36)}_${records.length}`,
                adaptivePlanId: adaptivePlan ? adaptivePlan.adaptivePlanId : null,
                agentId: adaptivePlan ? adaptivePlan.agentId : null,
                tenantId,
                statement,
                evidenceType, // OBSERVED | INFERRED | INSUFFICIENT_DATA
                sourceRefs: sourceRefs || {},
                advisoryOnly: true,
                policyEffect: 'NONE — learning never modifies policies, thresholds, capabilities, configuration, or topology.',
                recordedAt: new Date().toISOString()
            });
        };

        if (!outcomeAnalysis || outcomeAnalysis.verificationState === 'INSUFFICIENT_DATA') {
            push(
                'Verification evidence was insufficient, so no outcome conclusion is recorded for this response.',
                'INSUFFICIENT_DATA',
                { responseCenterPlanId: adaptivePlan ? adaptivePlan.responseCenterPlanId : null }
            );
            return records;
        }

        const state = outcomeAnalysis.verificationState;
        const optType = adaptivePlan && adaptivePlan.selectedResponse ? adaptivePlan.selectedResponse.optionType : 'unknown option';

        if (state === 'VERIFIED_RECOVERED') {
            push(
                `Response '${optType}' succeeded for this problem type on '${adaptivePlan.agentId}' (verified recovery).`,
                'OBSERVED',
                { responseCenterPlanId: adaptivePlan.responseCenterPlanId, verificationState: state }
            );
        } else if (state === 'VERIFIED_IMPROVED' || state === 'PARTIALLY_IMPROVED') {
            push(
                `Response '${optType}' partially improved '${adaptivePlan.agentId}' but did not fully resolve the issue (state: ${state}).`,
                'OBSERVED',
                { responseCenterPlanId: adaptivePlan.responseCenterPlanId, verificationState: state }
            );
        } else if (state === 'UNCHANGED' || state === 'FAILED') {
            push(
                `Response '${optType}' did not resolve the issue on '${adaptivePlan.agentId}' (state: ${state}).`,
                'OBSERVED',
                { responseCenterPlanId: adaptivePlan.responseCenterPlanId, verificationState: state }
            );
        } else if (state === 'DEGRADED') {
            push(
                `Unexpected consequence: state worsened after response '${optType}' on '${adaptivePlan.agentId}'; investigation continues.`,
                'OBSERVED',
                { responseCenterPlanId: adaptivePlan.responseCenterPlanId, verificationState: state }
            );
        } else if (state === 'UNSUPPORTED') {
            push(
                `Response was unsupported for '${adaptivePlan.agentId}'; inspect-only and escalation paths remain the available options.`,
                'OBSERVED',
                { responseCenterPlanId: adaptivePlan.responseCenterPlanId, verificationState: state }
            );
        }

        if (adaptivePlan && adaptivePlan.approvalState === 'APPROVED') {
            push('Response required and received explicit operator approval before execution.', 'OBSERVED', { approvalState: 'APPROVED' });
        }

        if (comparison && comparison.matchAssessment === 'DIFFERED') {
            push(
                'Actual outcome differed from the expected outcome; the difference is recorded for future decision/simulation calibration.',
                'INFERRED',
                { matchAssessment: 'DIFFERED' }
            );
        }

        const pre = outcomeAnalysis.preState || {};
        const post = outcomeAnalysis.postState || {};
        if (pre.capturedAt && post.capturedAt) {
            const durationMs = new Date(post.capturedAt) - new Date(pre.capturedAt);
            if (!Number.isNaN(durationMs) && durationMs >= 0) {
                push(
                    `Response-to-verification observation window lasted ${Math.round(durationMs / 1000)}s (actual timestamps).`,
                    'OBSERVED',
                    { preCapturedAt: pre.capturedAt, postCapturedAt: post.capturedAt }
                );
            }
        }

        return records;
    }
}

module.exports = { ResponseLearningEngine };
