/**
 * HealthDiagnosisGenerator
 * Generates human-readable operational health failure diagnostics for operators.
 * Translates health state metrics into clear, non-jargon explanations.
 */

class HealthDiagnosisGenerator {
    static generateDiagnosis(agentName, healthMeasurement = {}) {
        const name = agentName || healthMeasurement.systemId || 'Monitored Agent';
        const status = healthMeasurement.status || 'UNKNOWN';
        const httpStatus = healthMeasurement.httpStatus || 0;
        const latencyMs = healthMeasurement.responseTimeMs || 0;
        const errorMsg = healthMeasurement.errorMessage || healthMeasurement.errorCategory || 'None';

        let whatHappened = '';
        let evidence = [];
        let whatIsGood = [];
        let whatIsWrong = [];
        let actionTaken = '';
        let nextStep = '';

        if (status === 'HEALTHY') {
            whatHappened = `The agent responded successfully to the latest health check.`;
            whatIsGood = [
                'Endpoint reachable',
                'Valid HTTP response returned',
                `Response time (${latencyMs.toFixed(0)}ms) within SLA threshold`
            ];
            whatIsWrong = ['No failures or degraded conditions detected.'];
            actionTaken = 'Routine health probe completed.';
            nextStep = 'Maintain standard continuous monitoring schedule.';
        } else if (status === 'DEGRADED') {
            whatHappened = `The agent is responding but experiencing degraded health or high latency.`;
            evidence = healthMeasurement.evidence || [`Latency: ${latencyMs.toFixed(0)}ms`, `HTTP Status: ${httpStatus}`];
            whatIsGood = [
                'Agent service is reachable',
                healthMeasurement.lastSuccessfulCheck ? `Last successful check: ${healthMeasurement.lastSuccessfulCheck}` : 'Service still accepting connections'
            ];
            whatIsWrong = [
                latencyMs > 5000 ? `Response latency (${latencyMs.toFixed(0)}ms) exceeds threshold (5000ms)` : 'Intermittent errors detected',
                errorMsg !== 'None' ? `Error: ${errorMsg}` : 'Elevated response time'
            ];
            actionTaken = `Retry probe performed ${healthMeasurement.consecutiveFailures || 1} times. System marked DEGRADED.`;
            nextStep = 'Investigate potential external resource constraints or latency causes.';
        } else if (status === 'OFFLINE') {
            whatHappened = `Health probe failed. The external agent is unreachable or returning server errors.`;
            evidence = [
                errorMsg !== 'None' ? errorMsg : `HTTP probe returned status ${httpStatus}`,
                `Consecutive failures: ${healthMeasurement.consecutiveFailures || 1}`
            ];
            whatIsGood = [
                healthMeasurement.lastSuccessfulCheck ? `Last successful health check recorded at ${healthMeasurement.lastSuccessfulCheck}` : 'Historical configuration present'
            ];
            whatIsWrong = [
                'Target HTTP endpoint is not responding or unreachable',
                `Error category: ${healthMeasurement.errorCategory}`
            ];
            actionTaken = `Automated retry attempts (${healthMeasurement.consecutiveFailures || 3}) failed. Health Engine marked agent OFFLINE.`;
            nextStep = 'Verify external agent service process, network firewall, or URL configuration.';
        } else if (status === 'UNSUPPORTED') {
            whatHappened = `The target capability or endpoint is not supported by this agent configuration.`;
            whatIsGood = ['Agent endpoint reachability validated'];
            whatIsWrong = ['Specific API endpoint not configured or unsupported'];
            actionTaken = 'Capability status recorded as UNSUPPORTED.';
            nextStep = 'Update agent adapter endpoint configuration if endpoint is available.';
        } else {
            whatHappened = `Health state is currently unknown or unverified.`;
            whatIsGood = ['Agent profile registered'];
            whatIsWrong = ['Initial health probe pending'];
            actionTaken = 'Scheduled for initial monitoring probe.';
            nextStep = 'Run manual health check probe.';
        }

        return {
            status,
            agentName: name,
            whatHappened,
            evidence,
            whatIsGood,
            whatIsWrong,
            actionTaken,
            nextStep,
            technicalDetails: healthMeasurement
        };
    }
}

module.exports = { HealthDiagnosisGenerator };
