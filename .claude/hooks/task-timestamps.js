#!/usr/bin/env node
// task-timestamps.js — PostToolUse hook (matcher: Write|Edit)
// Injects lifecycle timestamps into .planning/work/**/*.md task files AFTER the
// edit has landed. Running post-edit (rather than in PreToolUse) means the harness
// read-cache is already in sync with disk when we write, so the out-of-band write
// does not trigger "File content has changed since it was last read" on the agent's
// NEXT edit (which is preceded by a Read in the pipeline, or is the final edit).
//
// Writes are minimal and idempotent:
//   - started-at   : set once, when status first becomes inProgress and the field
//                    is still null/empty.
//   - completed-at : set once, when status becomes done and the field is still
//                    null/empty (this is the last edit of a task → zero stale-read risk).
// updated-at is refreshed only when one of the above actually writes the file.

const fs = require('fs');

// Local ISO 8601 with timezone offset (e.g. 2026-06-04T18:23:35+03:00),
// matching the format historically written by the workflow.
function localISOString() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) +
    ':' + pad(d.getMinutes()) +
    ':' + pad(d.getSeconds()) +
    sign + pad(off / 60) + ':' + pad(off % 60)
  );
}

// Returns true when the field is absent, empty, or literally `null`.
function fieldNeedsValue(content, field) {
  const m = content.match(new RegExp('^' + field + ':\\s*(.*)$', 'm'));
  if (!m) return true;
  const v = (m[1] || '').trim();
  return v === '' || v === 'null';
}

// Set (or insert after the status line) a frontmatter field.
function setField(content, field, value) {
  if (content.match(new RegExp('^' + field + ':', 'm'))) {
    return content.replace(new RegExp('^(' + field + ':\\s*).*$', 'm'), `$1${value}`);
  }
  return content.replace(/(status:\s*\S+)/, `$1\n${field}: ${value}`);
}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const { tool_name, tool_input } = data;
    if (tool_name !== 'Write' && tool_name !== 'Edit') process.exit(0);

    const filePath = tool_input?.file_path || tool_input?.path || '';
    if (!filePath.includes('.planning/work/') || !filePath.endsWith('.md')) process.exit(0);
    if (!fs.existsSync(filePath)) process.exit(0);

    let content = fs.readFileSync(filePath, 'utf8');
    const status = content.match(/^status:\s*(\S+)/m)?.[1];
    if (!status) process.exit(0);

    const now = localISOString();
    let changed = false;

    if (status === 'inProgress' && fieldNeedsValue(content, 'started-at')) {
      content = setField(content, 'started-at', now);
      changed = true;
    }
    if (status === 'done' && fieldNeedsValue(content, 'completed-at')) {
      content = setField(content, 'completed-at', now);
      changed = true;
    }

    if (changed) {
      content = setField(content, 'updated-at', now);
      fs.writeFileSync(filePath, content, 'utf8');
    }

    process.exit(0);
  } catch {
    // Silent fail — never disrupt the pipeline.
    process.exit(0);
  }
});
