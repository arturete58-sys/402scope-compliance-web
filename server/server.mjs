// Self-hosted server for compliance.402scope.org (no dependencies, Node 18+).
// Serves the built site in dist/ and the website scanner at POST /api/scan.
// Listens on 127.0.0.1 only; a reverse proxy (Caddy or nginx) adds HTTPS in front.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestPost } from '../functions/api/scan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT || 8402);
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Scanner: 1-hour result cache and 10 scans per minute per IP.
const cache = new Map();
const hits = new Map();
const CACHE_MS = 3600_000;
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 10;
}
const clientIp = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  const direct = req.socket.remoteAddress || '';
  return fwd && /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(direct) ? String(fwd).split(',')[0].trim() : direct;
};

async function scan(req, res) {
  if (limited(clientIp(req))) return send(res, 429, JSON.stringify({ error: 'Too many scans. Try again in a minute.' }), 'application/json');
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 4096) return send(res, 413, '{"error":"Request too large."}', 'application/json'); }
  let key = '';
  try { key = String(JSON.parse(body).url || '').trim().toLowerCase(); } catch { /* handled by the scanner */ }
  const hit = key && cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return send(res, 200, hit.body, 'application/json; charset=utf-8', { 'x-scan-cache': 'hit' });
  const r = await onRequestPost({
    request: new Request('http://localhost/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    env: {},
  });
  const text = await r.text();
  if (r.status === 200 && key) { cache.set(key, { t: Date.now(), body: text }); if (cache.size > 500) cache.delete(cache.keys().next().value); }
  send(res, r.status, text, 'application/json; charset=utf-8', { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
}

function send(res, status, body, type, extra = {}) {
  res.writeHead(status, { 'content-type': type, ...SECURITY, ...extra });
  res.end(body);
}

function serveFile(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'Bad request', 'text/plain'); }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.join(ROOT, path.normalize(urlPath));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return send(res, 403, 'Forbidden', 'text/plain');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // Allow extensionless URLs (/privacy -> /privacy.html).
      if (!path.extname(file) && fs.existsSync(file + '.html')) { req.url = urlPath + '.html'; return serveFile(req, res); }
      return fs.readFile(path.join(ROOT, '404.html'), (e, d) => send(res, 404, e ? 'Not found' : d, 'text/html; charset=utf-8'));
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'content-type': TYPES[ext] || 'application/octet-stream', 'content-length': st.size, ...SECURITY };
    if (urlPath.startsWith('/fonts/')) headers['cache-control'] = 'public, max-age=31536000, immutable';
    else if (['.mp4', '.webm', '.webp', '.png', '.pdf'].includes(ext)) headers['cache-control'] = 'public, max-age=604800';
    else headers['cache-control'] = 'public, max-age=300';
    if (urlPath === '/_headers') return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/scan')) {
    if (req.method !== 'POST') return send(res, 405, '{"error":"Use POST."}', 'application/json', { allow: 'POST' });
    return scan(req, res).catch(() => send(res, 500, '{"error":"The scan did not finish. Try again in a minute."}', 'application/json'));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  serveFile(req, res);
}).listen(PORT, HOST, () => console.log(`402Scope Compliance on http://${HOST}:${PORT}`));
