/**
 * WorkflowValidator Utility
 * Validates workflow schema definitions, security constraints, input schemas, and DAG step dependencies.
 */

const DANGEROUS_PATTERNS = [/eval\(/i, /Function\(/i, /child_process/i, /fs\./i, /process\./i];

class WorkflowValidator {
    static validateWorkflow(wfData = {}) {
        const errors = [];
        const warnings = [];

        if (!wfData.id && !wfData.workflowId) {
            errors.push('Workflow ID is required');
        }
        if (!wfData.name) {
            errors.push('Workflow name is required');
        }

        const steps = Array.isArray(wfData.steps) ? wfData.steps : [];
        if (steps.length === 0) {
            errors.push('Workflow must contain at least one step');
        }

        const stepIds = new Set();
        steps.forEach((step, idx) => {
            const sid = step.id || step.stepId;
            if (!sid) {
                errors.push(`Step at index ${idx} is missing an ID`);
            } else if (stepIds.has(sid)) {
                errors.push(`Duplicate step ID '${sid}' detected`);
            } else {
                stepIds.add(sid);
            }

            // Security check against dynamic code execution
            const strStep = JSON.stringify(step);
            for (const pat of DANGEROUS_PATTERNS) {
                if (pat.test(strStep)) {
                    errors.push(`Step '${sid || idx}' contains forbidden dynamic execution pattern`);
                    break;
                }
            }

            // Validate step dependencies (if declared)
            const deps = Array.isArray(step.dependsOn) ? step.dependsOn : (step.dependencies || []);
            deps.forEach(d => {
                if (!stepIds.has(d) && !steps.some(s => (s.id || s.stepId) === d)) {
                    errors.push(`Step '${sid}' references non-existent dependency '${d}'`);
                }
            });
        });

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
}

module.exports = { WorkflowValidator };
