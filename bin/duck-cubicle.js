#!/usr/bin/env node
// Duck Cubicle server: zero dependencies. Serves public/, turns agent status into /api/feed,
// and keeps local appearance settings. Read-only except PUT /api/appearance (local browsers only).
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = path.join(os.homedir(), '.duck-cubicle');
const PUBLIC = path.join(__dirname, '..', 'public');
const argv = process.argv.slice(2);

if (argv[0] === 'install-hooks' || argv[0] === 'uninstall-hooks') {
  require('./install-hooks.js')(argv[0] === 'install-hooks');
  return;
}

const opt = (name, env, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : process.env[env] || dflt;
};
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`duck-cubicle [--port 3300] [--host 127.0.0.1] [--source claude-code|none|FILE.json|URL]
duck-cubicle install-hooks     add the Claude Code hooks (backs up ~/.claude/settings.json)
duck-cubicle uninstall-hooks   remove them again
Open http://127.0.0.1:3300/?demo to see the office without any agents.`);
  return;
}
const PORT = Number(opt('port', 'DUCK_PORT', 3300));
const HOST = opt('host', 'DUCK_HOST', '127.0.0.1');
const SOURCE = opt('source', 'DUCK_SOURCE', 'claude-code');
const CLAUDE_STATE = path.join(HOME, 'claude-code.json');
const APPEARANCE = path.join(HOME, 'appearance.json');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

// Claude Code sessions written by bin/duck-cubicle-hook.js -> feed agents.
function claudeFeed() {
  const st = readJson(CLAUDE_STATE, { sessions: {} });
  const now = Date.now();
  const rows = Object.entries(st.sessions || {}).filter(([, s]) => now - s.updated < 30 * 60 * 1000);
  const count = {};
  for (const [, s] of rows) count[s.name] = (count[s.name] || 0) + 1;
  const seen = {};
  const agents = rows.map(([id, s]) => {
    seen[s.name] = (seen[s.name] || 0) + 1;
    // Two sessions in the same folder: tell them apart.
    const name = count[s.name] > 1 ? `${s.name} #${seen[s.name]}` : s.name;
    let status = s.status;
    if (status === 'running' && now - s.updated > 180 * 1000) status = 'idle';   // hook never saw the Stop
    return { id, name, role: s.role || (s.sub ? 'Subagent' : 'Claude Code'), status, task: s.task || '', error: s.error || '' };
  });
  return { company: path.basename(process.cwd()) || 'Duck Cubicle', agents };
}

async function feed() {
  if (SOURCE === 'none') return { company: 'Duck Cubicle', agents: [] };
  if (SOURCE === 'claude-code') return claudeFeed();
  if (/^https?:\/\//.test(SOURCE)) {
    const r = await fetch(SOURCE, { signal: AbortSignal.timeout(4000) });
    return r.json();
  }
  return readJson(SOURCE, { company: 'Duck Cubicle', agents: [] });
}

// Only a browser on this machine may change the saved appearance (blocks DNS rebinding and other sites).
function localRequest(req) {
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return false;
  const origin = req.headers.origin;
  if (origin) { try { if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) return false; } catch (_) { return false; } }
  return req.headers['x-duck'] === '1';
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/feed' && req.method === 'GET') return send(res, 200, await feed());
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, source: SOURCE });
    if (url.pathname === '/api/appearance') {
      if (req.method === 'GET') return send(res, 200, readJson(APPEARANCE, { agents: {}, names: {} }));
      if (req.method === 'PUT') {
        if (!localRequest(req)) return send(res, 403, { error: 'local browsers only' });
        let size = 0; const chunks = [];
        for await (const c of req) { size += c.length; if (size > 6e6) return send(res, 413, { error: 'too big' }); chunks.push(c); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        fs.mkdirSync(HOME, { recursive: true });
        fs.writeFileSync(APPEARANCE + '.tmp', JSON.stringify(data));
        fs.renameSync(APPEARANCE + '.tmp', APPEARANCE);
        return send(res, 200, { ok: true });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Duck Cubicle is open for business: http://${HOST}:${PORT}  (source: ${SOURCE})`);
  if (SOURCE === 'claude-code' && !fs.existsSync(CLAUDE_STATE)) console.log('No Claude Code activity seen yet. Run "duck-cubicle install-hooks", or try http://' + HOST + ':' + PORT + '/?demo');
});
