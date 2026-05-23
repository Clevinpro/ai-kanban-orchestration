#!/usr/bin/env node
// stop-guard.js — Stop hook. Phase 2: circuit-breaker guard only — always allows stop.
// Registered in .claude/settings.json hooks.Stop array.

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  // Phase 2: circuit-breaker guard only — always allow stop.
  process.exit(0);
});
