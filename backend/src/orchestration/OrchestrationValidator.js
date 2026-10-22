/**
 * OrchestrationValidator
 * Validates plan structure, step DAG dependencies, targets, and execution configuration.
 */

const { STEP_TYPES, TARGET_MODES, EXECUTION_MODES, FAILURE_POLICIES } = require('./OrchestrationStates');

class OrchestrationValidator {
    static validatePlan(plan) {
        const errors = [];

        if (!plan) {
            return { valid: false, errors: ['Plan object is null or undefined'] };
        }

        if (!plan.id || typeof plan.id !== 'string') errors.push('Plan id is required and must be a string');
        if (!plan.name || typeof plan.name !== 'string') errors.push('Plan name is required and must be a string');

        if (!Object.values(TARGET_MODES).includes(plan.targetMode)) {
            errors.push(`Invalid targetMode '${plan.targetMode}'. Allowed: ${Object.values(TARGET_MODES).join(', ')}`);
        }

        if (plan.targetMode === TARGET_MODES.SYSTEM || plan.targetMode === TARGET_MODES.SYSTEMS) {
            if (!Array.isArray(plan.targets) || plan.targets.length === 0) {
                errors.push(`targetMode '${plan.targetMode}' requires a non-empty 'targets' array of system IDs`);
            }
        }

        if (!Object.values(EXECUTION_MODES).includes(plan.executionMode)) {
            errors.push(`Invalid executionMode '${plan.executionMode}'. Allowed: ${Object.values(EXECUTION_MODES).join(', ')}`);
        }

        if (!Object.values(FAILURE_POLICIES).includes(plan.failurePolicy)) {
            errors.push(`Invalid failurePolicy '${plan.failurePolicy}'. Allowed: ${Object.values(FAILURE_POLICIES).join(', ')}`);
        }

        if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
            errors.push('Plan must contain at least one step');
            return { valid: false, errors };
        }

        const stepMap = new Map();
        plan.steps.forEach(s => stepMap.set(s.id, s));

        // Step validation & dependency check
        plan.steps.forEach((step, idx) => {
            if (!step.id) errors.push(`Step at index ${idx} is missing an id`);
            if (!step.type || !Object.values(STEP_TYPES).includes(step.type)) {
                errors.push(`Step '${step.id}' has invalid step type '${step.type}'`);
            }

            if (Array.isArray(step.dependsOn)) {
                step.dependsOn.forEach(depId => {
                    if (!stepMap.has(depId)) {
                        errors.push(`Step '${step.id}' depends on missing step '${depId}'`);
                    } else {
                        const depStep = stepMap.get(depId);
                        if (!depStep.enabled) {
                            errors.push(`Step '${step.id}' depends on disabled step '${depId}'`);
                        }
                    }
                });
            }
        });

        // Detect circular dependencies using DFS graph traversal
        const cycleResult = OrchestrationValidator.detectCircularDependencies(plan.steps);
        if (cycleResult.hasCycle) {
            errors.push(`Circular dependency detected: ${cycleResult.cyclePath.join(' -> ')}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    static detectCircularDependencies(steps) {
        const graph = new Map();
        steps.forEach(s => {
            graph.set(s.id, s.dependsOn || []);
        });

        const visited = new Map(); // unvisited: 0, visiting: 1, visited: 2
        const path = [];
        let cyclePath = [];

        function dfs(nodeId) {
            visited.set(nodeId, 1);
            path.push(nodeId);

            const neighbors = graph.get(nodeId) || [];
            for (const neighbor of neighbors) {
                if (!graph.has(neighbor)) continue; // Handled by missing dependency check
                const state = visited.get(neighbor) || 0;
                if (state === 1) {
                    const cycleStartIndex = path.indexOf(neighbor);
                    cyclePath = path.slice(cycleStartIndex).concat(neighbor);
                    return true;
                }
                if (state === 0) {
                    if (dfs(neighbor)) return true;
                }
            }

            path.pop();
            visited.set(nodeId, 2);
            return false;
        }

        for (const nodeId of graph.keys()) {
            if ((visited.get(nodeId) || 0) === 0) {
                if (dfs(nodeId)) {
                    return { hasCycle: true, cyclePath };
                }
            }
        }

        return { hasCycle: false, cyclePath: [] };
    }

    static resolveExecutionOrder(steps) {
        // Topological sort (Kahn's algorithm)
        const inDegree = new Map();
        const graph = new Map();

        steps.forEach(s => {
            inDegree.set(s.id, (s.dependsOn || []).length);
            graph.set(s.id, []);
        });

        steps.forEach(s => {
            (s.dependsOn || []).forEach(depId => {
                if (graph.has(depId)) {
                    graph.get(depId).push(s.id);
                }
            });
        });

        const queue = [];
        steps.forEach(s => {
            if (inDegree.get(s.id) === 0) queue.push(s.id);
        });

        const sortedIds = [];
        while (queue.length > 0) {
            const u = queue.shift();
            sortedIds.push(u);

            const neighbors = graph.get(u) || [];
            neighbors.forEach(v => {
                inDegree.set(v, inDegree.get(v) - 1);
                if (inDegree.get(v) === 0) {
                    queue.push(v);
                }
            });
        }

        const stepMap = new Map(steps.map(s => [s.id, s]));
        return sortedIds.map(id => stepMap.get(id)).filter(Boolean);
    }
}

module.exports = OrchestrationValidator;
