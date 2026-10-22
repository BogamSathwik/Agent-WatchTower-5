/**
 * Phase 18 — Live Integration Probe Script
 * Executes optional live HTTP probes against public external agent endpoints (Compa, Repa).
 * Safe, non-failing script runnable via `npm run test:external-agents`.
 */

const { ExternalAgentAdapter } = require('../src/adapter/ExternalAgentAdapter');
const { COMPA_AGENT_PROFILE, REPA_AGENT_PROFILE } = require('../src/adapter/profiles/ExternalAgentProfiles');

async function probeExternalAgent(profile) {
    console.log(`\n==================================================`);
    console.log(`PROBING EXTERNAL AGENT: ${profile.name} (${profile.id})`);
    console.log(`Target Base URL: ${profile.baseUrl}`);
    console.log(`==================================================`);

    const adapter = new ExternalAgentAdapter(profile, { allowLocalhost: false });
    const startMs = Date.now();

    try {
        const result = await adapter.execute('health', {}, { systemId: profile.id });
        const elapsedMs = Date.now() - startMs;

        console.log(`Reachability:                ${result.success ? 'REACHABLE (HTTP 200)' : 'UNREACHABLE / PROBE FAILED'}`);
        console.log(`Health Status:               ${result.status}`);
        console.log(`Detected Content-Type:       ${result.contentType || 'N/A'}`);
        console.log(`Probe Duration:              ${elapsedMs} ms`);
        console.log(`Metadata (/contract):        ${profile.endpoints.contract.enabled ? 'CONFIGURED' : 'UNSUPPORTED'}`);
        console.log(`Capabilities (/capabilities): ${profile.endpoints.capabilities.enabled ? 'CONFIGURED' : 'UNSUPPORTED'}`);
        console.log(`Execution (/execute):        ${profile.endpoints.execution.enabled ? 'CONFIGURED' : 'UNSUPPORTED'}`);
        console.log(`Overall Monitoring Support:  ${result.success ? 'ACTIVE_MONITORING' : 'PARTIAL_MONITORING'}`);
        if (result.evidence && result.evidence.length > 0) {
            console.log(`Probe Evidence:              ${result.evidence.join(' | ')}`);
        }
        return result;
    } catch (err) {
        console.log(`Probe Failed With Exception: ${err.message}`);
        return { success: false, status: 'OFFLINE', error: err.message };
    }
}

async function runLiveProbes() {
    console.log(`Phase 18 Live External Agent Integration Probe Suite`);
    console.log(`Current Time: ${new Date().toISOString()}`);

    await probeExternalAgent(COMPA_AGENT_PROFILE);
    await probeExternalAgent(REPA_AGENT_PROFILE);

    console.log(`\n==================================================`);
    console.log(`Live Probe Suite Execution Finished.`);
    console.log(`==================================================\n`);
}

if (require.main === module) {
    runLiveProbes().catch(err => console.error('Error running live probes:', err));
}

module.exports = { probeExternalAgent, runLiveProbes };
