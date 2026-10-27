/**
 * Syncs src/ modules into the bundled server.js / router.js (__registry entries).
 * Zero-DDL guarantee: synced modules issue only SELECT/INSERT/UPDATE.
 * Run: node scripts/sync_persistence_bundle.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function adaptRequires(source, requireName) {
    // Bundle registries expose the scoped require under a fixed param name.
    // server.js uses `require`, router.js uses `__rq`.
    if (requireName === 'require') return source;
    return source.replace(/require\(/g, '__rq(');
}

function buildEntry(registryKey, source, requireName) {
    const body = adaptRequires(source, requireName);
    return `__registry[${JSON.stringify(registryKey)}] = function(module, exports, ${requireName}, __dirname, __filename) {\n${body}\n};`;
}

function patchBundle(bundlePath, requireName, modules) {
    let text = fs.readFileSync(bundlePath, 'utf8');
    for (const { key, src } of modules) {
        const srcText = fs.readFileSync(path.join(ROOT, src), 'utf8');
        const startMarker = `__registry[${JSON.stringify(key)}] = function`;
        const startIdx = text.indexOf(startMarker);
        const newEntry = buildEntry(key, srcText, requireName);
        if (startIdx === -1) {
            // New module (e.g. AgentDataStore): insert before the anchor module.
            throw new Error(`entry ${key} not found in ${bundlePath} (no anchor support for generic sync)`);
        }
        // Entry spans from its start marker to the next entry start (or EOF).
        const nextIdx = text.indexOf('__registry[', startIdx + startMarker.length);
        const endIdx = nextIdx === -1 ? text.length : nextIdx;
        text = text.slice(0, startIdx) + newEntry + '\n' + text.slice(endIdx);
        console.log(`  synced ${key} (${src})`);
    }
    fs.writeFileSync(bundlePath, text, 'utf8');
    console.log(`patched ${path.basename(bundlePath)}`);
}

// Insert-only helper for brand-new modules (no existing entry to replace).
function insertBefore(text, anchorKey, newEntry) {
    const anchorMarker = `__registry[${JSON.stringify(anchorKey)}] = function`;
    const idx = text.indexOf(anchorMarker);
    if (idx === -1) throw new Error(`anchor ${anchorKey} not found`);
    return text.slice(0, idx) + newEntry + '\n' + text.slice(idx);
}

function ensureEntry(bundlePath, requireName, key, src, anchorKey) {
    let text = fs.readFileSync(bundlePath, 'utf8');
    const marker = `__registry[${JSON.stringify(key)}] = function`;
    const srcText = fs.readFileSync(path.join(ROOT, src), 'utf8');
    const newEntry = buildEntry(key, srcText, requireName);
    if (text.includes(marker)) {
        const startIdx = text.indexOf(marker);
        const nextIdx = text.indexOf('__registry[', startIdx + marker.length);
        const endIdx = nextIdx === -1 ? text.length : nextIdx;
        text = text.slice(0, startIdx) + newEntry + '\n' + text.slice(endIdx);
        console.log(`  re-synced ${key}`);
    } else {
        text = insertBefore(text, anchorKey, newEntry);
        console.log(`  inserted ${key}`);
    }
    fs.writeFileSync(bundlePath, text, 'utf8');
}

function ensureStoreEntry(bundlePath, requireName) {
    ensureEntry(bundlePath, requireName,
        'src/persistence/AgentDataStore.js',
        'src/persistence/AgentDataStore.js',
        'src/persistence/MySqlPersistenceAdapter.js');
}

function ensureRegistryEntries(bundlePath, requireName) {
    ensureEntry(bundlePath, requireName,
        'src/registry/AgentMasterRegistrySource.js',
        'src/registry/AgentMasterRegistrySource.js',
        'src/registry/SystemRegistry.js');
    ensureEntry(bundlePath, requireName,
        'src/registry/AgentMasterEvaluator.js',
        'src/registry/AgentMasterEvaluator.js',
        'src/registry/SystemRegistry.js');
    ensureEntry(bundlePath, requireName,
        'src/registry/AgentFunctionalProfiler.js',
        'src/registry/AgentFunctionalProfiler.js',
        'src/registry/SystemRegistry.js');
    ensureEntry(bundlePath, requireName,
        'src/registry/AgentFunctionalTesting.js',
        'src/registry/AgentFunctionalTesting.js',
        'src/registry/SystemRegistry.js');
    ensureEntry(bundlePath, requireName,
        'src/registry/AgentFunctionalDecisions.js',
        'src/registry/AgentFunctionalDecisions.js',
        'src/registry/SystemRegistry.js');
    ensureEntry(bundlePath, requireName,
        'src/api/registryRoutes.js',
        'src/api/registryRoutes.js',
        'src/api/agentRoutes.js');
}

function ensureComplianceEntries(bundlePath, requireName) {
    ensureEntry(bundlePath, requireName,
        'src/quality/AgentComplianceEngine.js',
        'src/quality/AgentComplianceEngine.js',
        'src/quality/QualityTestRunner.js');
}

const SERVER_MODULES = [
    { key: 'src/persistence/MySqlReadAccessService.js', src: 'src/persistence/MySqlReadAccessService.js' },
    { key: 'src/persistence/MySqlPersistenceAdapter.js', src: 'src/persistence/MySqlPersistenceAdapter.js' },
    { key: 'src/persistence/PersistenceManager.js', src: 'src/persistence/PersistenceManager.js' },
    { key: 'src/agent/AgentService.js', src: 'src/agent/AgentService.js' },
    { key: 'src/agent/UniversalAgentContract.js', src: 'src/agent/UniversalAgentContract.js' },
    { key: 'src/api/agentRoutes.js', src: 'src/api/agentRoutes.js' },
    { key: 'src/registry/SystemRegistry.js', src: 'src/registry/SystemRegistry.js' },
    { key: 'src/config/ConfigurationService.js', src: 'src/config/ConfigurationService.js' },
    { key: 'src/adapter/profiles/ExternalAgentProfiles.js', src: 'src/adapter/profiles/ExternalAgentProfiles.js' },
    { key: 'src/monitoring/AgentMonitoringService.js', src: 'src/monitoring/AgentMonitoringService.js' },
    { key: 'src/mcp/McpPolicy.js', src: 'src/mcp/McpPolicy.js' },
    { key: 'src/mcp/McpRequestValidator.js', src: 'src/mcp/McpRequestValidator.js' },
    { key: 'src/mcp/McpClient.js', src: 'src/mcp/McpClient.js' },
    { key: 'src/mcp/McpService.js', src: 'src/mcp/McpService.js' },
    { key: 'src/api/mcpRoutes.js', src: 'src/api/mcpRoutes.js' },
    { key: 'src/app.js', src: 'src/app.js' }
];

const ROUTER_MODULES = [
    { key: 'src/persistence/MySqlReadAccessService.js', src: 'src/persistence/MySqlReadAccessService.js' },
    { key: 'src/persistence/MySqlPersistenceAdapter.js', src: 'src/persistence/MySqlPersistenceAdapter.js' },
    { key: 'src/persistence/PersistenceManager.js', src: 'src/persistence/PersistenceManager.js' },
    { key: 'src/agent/AgentService.js', src: 'src/agent/AgentService.js' },
    { key: 'src/agent/UniversalAgentContract.js', src: 'src/agent/UniversalAgentContract.js' },
    { key: 'src/api/agentRoutes.js', src: 'src/api/agentRoutes.js' },
    { key: 'src/registry/SystemRegistry.js', src: 'src/registry/SystemRegistry.js' },
    { key: 'src/config/ConfigurationService.js', src: 'src/config/ConfigurationService.js' },
    { key: 'src/adapter/profiles/ExternalAgentProfiles.js', src: 'src/adapter/profiles/ExternalAgentProfiles.js' },
    { key: 'src/monitoring/AgentMonitoringService.js', src: 'src/monitoring/AgentMonitoringService.js' },
    { key: 'src/mcp/McpPolicy.js', src: 'src/mcp/McpPolicy.js' },
    { key: 'src/mcp/McpRequestValidator.js', src: 'src/mcp/McpRequestValidator.js' },
    { key: 'src/mcp/McpClient.js', src: 'src/mcp/McpClient.js' },
    { key: 'src/mcp/McpService.js', src: 'src/mcp/McpService.js' },
    { key: 'src/api/mcpRoutes.js', src: 'src/api/mcpRoutes.js' }
];

ensureStoreEntry(path.join(ROOT, 'server.js'), 'require');
ensureRegistryEntries(path.join(ROOT, 'server.js'), 'require');
ensureComplianceEntries(path.join(ROOT, 'server.js'), 'require');
patchBundle(path.join(ROOT, 'server.js'), 'require', SERVER_MODULES);

ensureStoreEntry(path.join(ROOT, 'router.js'), '__rq');
ensureRegistryEntries(path.join(ROOT, 'router.js'), '__rq');
ensureComplianceEntries(path.join(ROOT, 'router.js'), '__rq');
patchBundle(path.join(ROOT, 'router.js'), '__rq', ROUTER_MODULES);

console.log('bundle sync complete');
