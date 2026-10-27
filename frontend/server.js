/**
 * Agent Watchtower — Frontend Reverse-Proxy Server
 * Serves index.html and transparently proxies /api/* requests to backend (port 3000).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_PORT = parseInt(process.env.BACKEND_PORT, 10) || 3000;
const BACKEND_HOST = process.env.BACKEND_HOST || 'localhost';
const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const indexPath = path.join(__dirname, 'index.html');

process.on('uncaughtException', (err) => {
    console.error('[frontend-proxy] Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('[frontend-proxy] Unhandled rejection:', reason);
});

// Function to get current index HTML
function getIndexHtml() {
    try {
        return fs.readFileSync(indexPath);
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

    // Transparently proxy all API routes to the backend
    if (req.url.startsWith('/api/')) {
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
        const html = getIndexHtml();
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
