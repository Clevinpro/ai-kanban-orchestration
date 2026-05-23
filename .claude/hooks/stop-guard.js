#!/usr/bin/env node
// stop-guard.js — Stop hook. Prevents infinite loop: exits 0 immediately if stop_hook_active is true.
// Registered in .claude/settings.json hooks.Stop array.

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    // CRITICAL: if already in forced-continuation state, let Claude stop. This breaks the infinite loop.
    if (data.stop_hook_active === true) {
      process.exit(0);
    }
    // Allow stopping normally.
    process.exit(0);
  } catch (e) {
    // Silent fail — never block the session on a parse error.
    process.exit(0);
  }
});
