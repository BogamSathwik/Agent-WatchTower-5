/**
 * ReasoningValidator Utility
 * Validates reasoning observation inputs, plans, and decisions.
 */

class ReasoningValidator {
    static validateObservation(observation) {
        const errors = [];
        if (!observation) {
            errors.push('Observation input is required');
        }
        return { valid: errors.length === 0, errors };
    }

    static validateActionRequest(actionRequest) {
        const errors = [];
        if (!actionRequest || typeof actionRequest !== 'object') {
            errors.push('Action request must be a valid object');
        } else if (!actionRequest.type) {
            errors.push('Action request must specify an action type');
        }
        return { valid: errors.length === 0, errors };
    }
}

module.exports = { ReasoningValidator };
