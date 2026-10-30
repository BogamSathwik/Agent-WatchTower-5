const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

// Parse CLI flags: e.g. --frontend=8023 --backend=8024, --office, --ubuntu, or --host=0.0.0.0
const args = process.argv.slice(2);
let cliFrontend = null;
let cliBackend = null;
let cliHost = null;
let forceOfficeMode = false;

for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--frontend=')) cliFrontend = a.split('=')[1];
    else if (a.startsWith('--backend=')) cliBackend = a.split('=')[1];
    else if (a.startsWith('--host=')) cliHost = a.split('=')[1];
    else if (a === '-f' && args[i + 1]) cliFrontend = args[++i];
    else if (a === '-b' && args[i + 1]) cliBackend = args[++i];
    else if (a === '-h' && args[i + 1]) cliHost = args[++i];
    else if (a === '--office' || a === '--ubuntu' || a === '-o') forceOfficeMode = true;
}

const isLinux = process.platform === 'linux';
const isOffice = isLinux || forceOfficeMode || process.env.OFFICE_SERVER === 'true';

// Enforce port range 8000-9000 for office server / Ubuntu environments
function resolvePort(explicit, envKey, fallbackStandard, fallbackOffice, label) {
    let raw = explicit || process.env[envKey];
    if (raw) {
        const p = parseInt(raw, 10);
        if (!isNaN(p)) {
            if (isOffice && (p < 8000 || p > 9000)) {
                console.warn(`[PORT WARNING] ${label} port ${p} is outside permitted 8000-9000 range. Auto-remapping to ${fallbackOffice}.`);
                return fallbackOffice;
            }
            return p;
        }
    }
    return isOffice ? fallbackOffice : fallbackStandard;
}

const backendPort = resolvePort(cliBackend, 'BACKEND_PORT', (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000), 8024, 'Backend');
const frontendPort = resolvePort(cliFrontend, 'FRONTEND_PORT', 5000, 8023, 'Frontend');
const backendHost = process.env.BACKEND_HOST || 'localhost';
const host = cliHost || process.env.HOST || '0.0.0.0';

if (isOffice) {
    console.log(`[Office Server / Ubuntu Mode Active] Enforcing ports in 8000-9000 range: Frontend=${frontendPort}, Backend=${backendPort}`);
}

console.log(`Starting backend on port ${backendPort}...`);
const backendProc = spawn(process.execPath, [path.join(backendDir, 'server.js')], {
    cwd: backendDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, PORT: String(backendPort), HOST: host }
});
backendProc.unref();

console.log(`Starting frontend on port ${frontendPort} (proxying to backend on ${backendPort})...`);
const frontendProc = spawn(process.execPath, [path.join(frontendDir, 'server.js')], {
    cwd: frontendDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, PORT: String(frontendPort), HOST: host, BACKEND_PORT: String(backendPort), BACKEND_HOST: backendHost }
});
frontendProc.unref();

console.log('Both servers spawned detached successfully (Backend PID:', backendProc.pid, ', Frontend PID:', frontendProc.pid, ')');
