const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

const backendPort = process.env.BACKEND_PORT || process.env.PORT || 3000;
const frontendPort = process.env.FRONTEND_PORT || 5000;
const backendHost = process.env.BACKEND_HOST || 'localhost';
const host = process.env.HOST || '0.0.0.0';

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
