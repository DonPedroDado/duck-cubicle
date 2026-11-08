#!/usr/bin/env node
// Starts the server and the fake Claude Code sessions together, in a throwaway HOME so your real
// ~/.duck-cubicle and ~/.claude are never touched. Extra arguments go to the server (e.g. --port 4000).
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-cubicle-demo-'));
const env = { ...process.env, HOME: home, USERPROFILE: home };
const root = path.join(__dirname, '..');
const kids = [
  spawn('node', [path.join(root, 'bin', 'duck-cubicle.js'), ...process.argv.slice(2)], { env, stdio: 'inherit' }),
  spawn('node', [path.join(__dirname, 'fake-hooks.js')], { env, stdio: 'inherit' }),
];
const stop = () => { kids.forEach((k) => k.kill()); fs.rmSync(home, { recursive: true, force: true }); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
kids[0].on('exit', stop);
