#!/usr/bin/env node
// Claude Code hook. Reads the hook event on stdin and records session id, folder name, status and a
// short tool summary in ~/.duck-cubicle/claude-code.json. Never touches the network, never blocks.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = path.join(os.homedir(), '.duck-cubicle');
const FILE = path.join(DIR, 'claude-code.json');
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

function summary(tool, input) {
  input = input || {};
  const base = (p) => (p ? path.basename(String(p)) : '');
  switch (tool) {
    case 'Bash': return 'Bash: ' + clip(input.command, 40);
    case 'Edit': case 'Write': case 'MultiEdit': case 'Read': case 'NotebookEdit': return tool + ': ' + base(input.file_path || input.notebook_path);
    case 'Grep': case 'Glob': return tool + ': ' + clip(input.pattern, 30);
    case 'Task': case 'Agent': return 'Agent: ' + clip(input.description, 30);
    case 'WebFetch': case 'WebSearch': return tool + ': ' + clip(input.url || input.query, 30);
    default: return clip(tool, 40);
  }
}

function main(raw) {
  let ev;
  try { ev = JSON.parse(raw); } catch (_) { return; }
  const sid = ev.session_id;
  if (!sid) return;
  const key = ev.agent_id ? `${sid}:${ev.agent_id}` : sid;     // subagents get their own desk
  let st = { sessions: {} };
  try { st = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (!st.sessions) st.sessions = {}; } catch (_) {}
  const now = Date.now();
  const name = clip(path.basename(ev.cwd || '') || 'claude', 24);
  const cur = st.sessions[key] || { name, status: 'idle', task: '' };
  cur.name = ev.agent_id ? clip(ev.agent_type || 'subagent', 24) : name;
  cur.sub = !!ev.agent_id;
  cur.updated = now;

  switch (ev.hook_event_name) {
    case 'SessionStart': cur.status = 'idle'; cur.task = ''; cur.error = ''; break;
    case 'UserPromptSubmit': cur.status = 'running'; cur.task = clip(ev.prompt, 40); cur.error = ''; break;
    case 'PreToolUse': cur.status = 'running'; cur.task = summary(ev.tool_name, ev.tool_input); cur.error = ''; break;
    case 'PostToolUse': cur.status = 'running'; cur.error = ''; break;
    case 'PostToolUseFailure': cur.status = 'error'; cur.error = clip(ev.error || 'tool failed', 60); break;
    case 'PermissionRequest': case 'Notification': cur.status = 'waiting'; cur.task = clip(ev.message || 'needs approval', 40); break;
    case 'Stop': case 'SubagentStop': cur.status = 'idle'; cur.task = ''; break;
    case 'SessionEnd': delete st.sessions[key]; break;
    default: return;
  }
  if (ev.hook_event_name !== 'SessionEnd') st.sessions[key] = cur;
  // forget sessions nobody has touched for a day
  for (const [k, s] of Object.entries(st.sessions)) if (now - s.updated > 24 * 3600 * 1000) delete st.sessions[k];
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(st));
  fs.renameSync(tmp, FILE);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => { try { main(raw); } catch (_) {} process.exit(0); });
setTimeout(() => process.exit(0), 3000).unref();
