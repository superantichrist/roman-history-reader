// Local-only production preview. --faults simulates one failed book request,
// one failed search request and a slow response for navigation race checks.
// ?qaClipboard=blocked also exercises the manual-copy fallback.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
const prefix = '/roman-history-reader';
const failures = new Set(process.argv.includes('--faults') ? [
  '/data/books/livy/02.json', '/data/search/polybius.json',
] : []);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const requested = decodeURIComponent(url.pathname).replace(new RegExp(`^${prefix}(?=/|$)`), '') || '/';
    if (failures.delete(requested)) {
      response.writeHead(503, { 'Cache-Control': 'no-store' }).end('Temporary test failure');
      return;
    }
    if (process.argv.includes('--faults') && requested === '/data/books/polybius/02.json') {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    const filename = path.resolve(root, `.${requested === '/' ? '/index.html' : requested}`);
    if (!filename.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    const headers = { 'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (url.searchParams.get('qaClipboard') === 'blocked') headers['Permissions-Policy'] = 'clipboard-write=()';
    response.writeHead(200, headers).end(await fs.readFile(filename));
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end();
  }
});
server.listen(0, '127.0.0.1', () => {
  console.log(`Preview: http://127.0.0.1:${server.address().port}${prefix}/`);
});
