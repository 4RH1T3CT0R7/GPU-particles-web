// serve.mjs — dev server with Cross-Origin isolation headers
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';

const PORT = 8080;
const ROOT = process.cwd();

const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.wasm': 'application/wasm',
    '.ts': 'text/plain',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

createServer((req, res) => {
    // Required for SharedArrayBuffer (WASM threads)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = join(ROOT, urlPath);

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        res.writeHead(404);
        res.end('Not Found');
        return;
    }

    const ext = extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(readFileSync(filePath));
}).listen(PORT, () => {
    console.log(`Dev server: http://localhost:${PORT}`);
    console.log('COOP/COEP headers enabled for SharedArrayBuffer support');
});
