// Static file server for local development. Node's standard library only, so the
// project needs exactly one runtime — the same one the tests and the audit use.
//
// The app loads js/app.js as a native ES module, which the browser will not do over
// file://, so it has to be served over HTTP. That is the entire reason this exists.
//
//   node tools/serve.js            serve on 8000
//   node tools/serve.js 3000       serve on 3000
//   node tools/serve.js --no-open  do not launch a browser

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv':  'text/csv; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff2': 'font/woff2',
};

const args = process.argv.slice(2);
const port = Number(args.find(a => /^\d+$/.test(a)) ?? 8000);
const shouldOpen = !args.includes('--no-open');

// Resolve a request path to a file inside ROOT, or null. Everything is rejected
// that escapes ROOT once normalised, which is what stops ../ traversal.
function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = normalize(decoded).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const full = join(ROOT, rel || 'index.html');
  return full.startsWith(ROOT) ? full : null;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  let path = resolvePath(req.url);
  if (!path) { res.writeHead(403).end('Forbidden'); return; }

  try {
    let info = await stat(path);
    if (info.isDirectory()) {
      path = join(path, 'index.html');
      info = await stat(path);
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
      'content-length': info.size,
      // No caching in development, or an edited module keeps serving the old copy.
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(path).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
       .end(`Not found: ${req.url}`);
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try: node tools/serve.js ${port + 1}`);
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`Whetstone is running on ${url} — ctrl-c to stop`);

  if (!shouldOpen) return;
  // Best effort. A failure here is not worth reporting: the URL is above.
  const cmd = process.platform === 'darwin' ? 'open'
            : process.platform === 'win32'  ? 'explorer'
            : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch { /* no browser available */ }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
