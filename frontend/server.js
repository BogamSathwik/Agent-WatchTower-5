/**
 * Agent Watchtower — Frontend Reverse-Proxy Server
 * Serves index.html and transparently proxies /api/* requests to backend (port 3000).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const isLinux = process.platform === 'linux';
const isOffice = isLinux || process.env.OFFICE_SERVER === 'true';

let rawFrontendPort = parseInt(process.env.PORT || process.env.FRONTEND_PORT, 10);
let PORT = rawFrontendPort;
if (isNaN(PORT)) {
    PORT = isOffice ? 8023 : 5000;
} else if (isOffice && (PORT < 8000 || PORT > 9000)) {
    console.warn(`[port-guard] Frontend port ${PORT} outside 8000-9000 range on office server. Defaulting to 8023.`);
    PORT = 8023;
}

let rawBackendPort = parseInt(process.env.BACKEND_PORT, 10);
let BACKEND_PORT = rawBackendPort;
if (isNaN(BACKEND_PORT)) {
    BACKEND_PORT = isOffice ? 8024 : 3000;
} else if (isOffice && (BACKEND_PORT < 8000 || BACKEND_PORT > 9000)) {
    console.warn(`[port-guard] Backend proxy target port ${BACKEND_PORT} outside 8000-9000 range on office server. Defaulting to 8024.`);
    BACKEND_PORT = 8024;
}

const BACKEND_HOST = process.env.BACKEND_HOST || 'localhost';
const HOST = process.env.HOST || '0.0.0.0';
const indexPath = path.join(__dirname, 'index.html');

process.on('uncaughtException', (err) => {
    console.error('[frontend-proxy] Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('[frontend-proxy] Unhandled rejection:', reason);
});

// Function to get current index HTML with optional runtime config injection
function getIndexHtml(req) {
    try {
        let html = fs.readFileSync(indexPath, 'utf8');
        const clientHost = (req && req.headers && req.headers.host) ? req.headers.host.split(':')[0] : 'localhost';
        const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://${clientHost}:${BACKEND_PORT}`;
        const configScript = `
    <script>
        window.__WATCHTOWER_CONFIG__ = {
            backendUrl: ${JSON.stringify(backendUrl)},
            backendPort: ${BACKEND_PORT},
            frontendPort: ${PORT},
            injectedAt: ${Date.now()}
        };
    </script>`;
        if (html.includes('</head>')) {
            html = html.replace('</head>', `${configScript}\n</head>`);
        }
        return Buffer.from(html);
    } catch (e) {
        console.error('[frontend-proxy] Could not read index.html:', e.message);
        return Buffer.from('<h1>Error loading index.html</h1>');
    }
}

const server = http.createServer((req, res) => {
    req.on('error', (err) => {
        console.warn('[frontend-proxy] Incoming request error:', err.message);
    });

    res.on('error', (err) => {
        console.warn('[frontend-proxy] Outgoing response error:', err.message);
    });

    // Transparently proxy all API, MCP, and Health routes to the backend
    if (req.url.startsWith('/api/') || req.url.startsWith('/mcp') || req.url.startsWith('/mock-app/') || req.url === '/health' || req.url === '/api/health') {
        const proxyReq = http.request({
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
            path: req.url,
            method: req.method,
            headers: {
                ...req.headers,
                host: `${BACKEND_HOST}:${BACKEND_PORT}`
            }
        }, (proxyRes) => {
            if (!res.headersSent) {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
            }
            proxyRes.pipe(res);
            proxyRes.on('error', (err) => {
                console.warn('[frontend-proxy] proxyRes error:', err.message);
                if (!res.destroyed) res.destroy();
            });
        });

        proxyReq.on('error', (err) => {
            console.error('[frontend-proxy] proxyReq error:', err.message);
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: { message: `Backend unavailable at ${BACKEND_HOST}:${BACKEND_PORT}: ${err.message}` }
                }));
            } else if (!res.destroyed) {
                res.destroy();
            }
        });

        req.pipe(proxyReq);
        return;
    }

    // Serve static files if they exist in frontend directory
    const cleanUrl = req.url.split('?')[0].replace(/^\/+/, '');
    const staticFilePath = path.join(__dirname, cleanUrl);
    if (cleanUrl && fs.existsSync(staticFilePath) && fs.statSync(staticFilePath).isFile()) {
        const ext = path.extname(staticFilePath).toLowerCase();
        const mimeTypes = {
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.html': 'text/html; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml'
        };
        const cType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': cType });
        fs.createReadStream(staticFilePath).pipe(res);
        return;
    }

    // Serve fresh index.html for all other requests
    if (!res.headersSent) {
        const html = getIndexHtml(req);
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': html.length,
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
        });
        res.end(html);
    }
});

server.on('error', (err) => {
    console.error('[frontend-proxy] Server error:', err.message);
});

server.listen(PORT, HOST, () => {
    console.log(`Frontend proxy server running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} (proxying /api to http://${BACKEND_HOST}:${BACKEND_PORT})`);
});
