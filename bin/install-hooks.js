'use strict';
// Adds (or removes) the Duck Cubicle hook in ~/.claude/settings.json. Backs the file up first and
// never touches hooks that are not ours.
const fs = require('fs');
const os = require('os');
const path = require('path');

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK = path.join(__dirname, 'duck-cubicle-hook.js');
const MARK = 'duck-cubicle-hook';
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop', 'SubagentStop', 'SessionEnd'];
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest']);

module.exports = function (install) {
  let cfg = {};
  if (fs.existsSync(SETTINGS)) {
    try { cfg = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (e) { console.error('Cannot parse ' + SETTINGS + ': ' + e.message); process.exit(1); }
    const backup = SETTINGS + '.duck-backup-' + Date.now();
    fs.copyFileSync(SETTINGS, backup);
    console.log('Backup: ' + backup);
  } else fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });

  cfg.hooks = cfg.hooks || {};
  const ours = (g) => (g.hooks || []).some((h) => String(h.command || '').includes(MARK));
  for (const ev of EVENTS) {
    const groups = (cfg.hooks[ev] || []).filter((g) => !ours(g));
    if (install) {
      const group = { hooks: [{ type: 'command', command: `node "${HOOK}"` }] };
      if (TOOL_EVENTS.has(ev)) group.matcher = '*';
      groups.push(group);
    }
    if (groups.length) cfg.hooks[ev] = groups; else delete cfg.hooks[ev];
  }
  if (!Object.keys(cfg.hooks).length) delete cfg.hooks;
  fs.writeFileSync(SETTINGS, JSON.stringify(cfg, null, 2) + '\n');
  console.log(install ? 'Hooks installed. Restart Claude Code sessions, then run: duck-cubicle' : 'Hooks removed.');
};
