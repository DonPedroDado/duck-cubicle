#!/usr/bin/env node
// Pretends to be a handful of Claude Code sessions by feeding fake hook events to the real hook script.
// Usage: HOME=/some/throwaway/dir node scripts/fake-hooks.js     (run the server with the same HOME)
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const HOOK = path.join(__dirname, '..', 'bin', 'duck-cubicle-hook.js');
const FOLDERS = ['api', 'web', 'docs', 'infra', 'mobile', 'billing'];
const TOOLS = [
  ['Bash', { command: 'npm test' }], ['Bash', { command: 'git push --force' }], ['Edit', { file_path: '/w/src/App.tsx' }],
  ['Read', { file_path: '/w/server.js' }], ['Grep', { pattern: 'TODO' }], ['Write', { file_path: '/w/report.md' }], ['Task', { description: 'refactor auth' }],
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const send = (ev) => spawnSync('node', [HOOK], { input: JSON.stringify(ev), env: process.env });

const sessions = FOLDERS.map((f, i) => ({ id: 'fake-' + i, cwd: '/work/' + f, state: 'new', next: Date.now() + i * 2500 }));
console.log('Faking ' + sessions.length + ' Claude Code sessions. Ctrl+C to stop.');

setInterval(() => {
  const now = Date.now();
  for (const s of sessions) {
    if (now < s.next) continue;
    const base = { session_id: s.id, cwd: s.cwd };
    const r = Math.random();
    if (s.state === 'new') { send({ ...base, hook_event_name: 'SessionStart' }); s.state = 'idle'; s.next = now + 1500; }
    else if (s.state === 'idle') { send({ ...base, hook_event_name: 'UserPromptSubmit', prompt: pick(['fix the login bug', 'add dark mode', 'write the tests', 'why is CI red']) }); s.state = 'busy'; s.next = now + 1500; }
    else if (r < 0.14) { send({ ...base, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: pick(['Exit code 1', 'tests failed', 'merge conflict', 'ENOENT']) }); s.next = now + 5000 + Math.random() * 3000; }
    else if (r < 0.22) { send({ ...base, hook_event_name: 'Notification', message: 'needs approval' }); s.state = 'waiting'; s.next = now + 15000 + Math.random() * 20000; }
    else if (r < 0.34 || s.state === 'waiting') { send({ ...base, hook_event_name: 'Stop' }); s.state = 'idle'; s.next = now + 10000 + Math.random() * 20000; }
    else { const [tool_name, tool_input] = pick(TOOLS); send({ ...base, hook_event_name: 'PreToolUse', tool_name, tool_input }); s.next = now + 2500 + Math.random() * 5000; }
  }
}, 500);
