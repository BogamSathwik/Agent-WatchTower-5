/**
 * RuntimeValidator
 * Validates operational commands, state machine transitions, and capability execution payloads.
 */

const { RUNTIME_COMMANDS, RUNTIME_STATES, RuntimeStateMachine } = require('./RuntimeStates');

const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

class RuntimeValidator {
    static validateCommand(command, currentState, systemObj = null) {
        const errors = [];

        if (!command || !Object.values(RUNTIME_COMMANDS).includes(String(command).toUpperCase())) {
            errors.push(`Invalid runtime command '${command}'. Allowed: ${Object.values(RUNTIME_COMMANDS).join(', ')}`);
            return { valid: false, errors };
        }

        const cmd = String(command).toUpperCase();

        if (!systemObj) {
            errors.push('Target system is required for operational commands');
            return { valid: false, errors };
        }

        // State transition validation based on command
        let targetState = null;
        if (cmd === RUNTIME_COMMANDS.START) targetState = RUNTIME_STATES.RUNNING;
        if (cmd === RUNTIME_COMMANDS.STOP) targetState = RUNTIME_STATES.STOPPED;
        if (cmd === RUNTIME_COMMANDS.RESTART) targetState = RUNTIME_STATES.RUNNING;
        if (cmd === RUNTIME_COMMANDS.PAUSE) targetState = RUNTIME_STATES.PAUSED;
        if (cmd === RUNTIME_COMMANDS.RESUME) targetState = RUNTIME_STATES.RUNNING;

        if (targetState && currentState && !RuntimeStateMachine.canTransition(currentState, targetState)) {
            errors.push(`Invalid operational state transition from '${currentState}' to '${targetState}' via command '${cmd}'`);
        }

        return {
            valid: errors.length === 0,
            errors,
            targetState
        };
    }

    static checkPrototypePollution(payload, depth = 0) {
        if (!payload || typeof payload !== 'object' || depth > 10) return false;

        for (const key of FORBIDDEN_KEYS) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
                return true;
            }
        }

        for (const key of Object.keys(payload)) {
            if (typeof payload[key] === 'object' && payload[key] !== null) {
                if (this.checkPrototypePollution(payload[key], depth + 1)) {
                    return true;
                }
            }
        }

        return false;
    }
}

module.exports = RuntimeValidator;
