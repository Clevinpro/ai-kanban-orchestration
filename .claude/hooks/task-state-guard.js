#!/usr/bin/env node
// task-state-guard.js — PreToolUse hook
// Validates YAML frontmatter status transitions in .planning/work/**/*.md
// On ALLOW path: injects current ISO timestamp into updated-at field via modifiedInput
// On DENY path: returns permissionDecision:deny with reason

const fs = require('fs');
const path = require('path');

const VALID_TRANSITIONS = {
  readyForDevelop:  ['inProgress'],
  inProgress:       ['inReview', 'readyForDevelop', 'stopped'],
  inReview:         ['inTesting', 'inProgress', 'stopped'],
  inTesting:        ['forTeamLeadCheck', 'inProgress', 'stopped'],
  forTeamLeadCheck: ['done', 'inProgress', 'stopped'],
  done:             [],
  stopped:          [],
};

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const { tool_name, tool_input } = data;

    // 1. Guard: only handle Write and Edit tool calls
    if (tool_name !== 'Write' && tool_name !== 'Edit') process.exit(0);

    // 2. Path filter: only guard task files in .planning/work/
    const filePath = tool_input?.file_path || tool_input?.path || '';
    if (!filePath.includes('.planning/work/') || !filePath.endsWith('.md')) process.exit(0);

    // 2.5. Restore bypass: a `.restore` sentinel in the epic directory disables
    // all validation — used to recreate accidentally deleted task files verbatim
    // (status: done, no transition history). Flow: touch .restore → write files
    // → rm .restore. Never leave the sentinel behind.
    if (fs.existsSync(path.join(path.dirname(filePath), '.restore'))) process.exit(0);

    // 3. Extract newStatus from tool call
    let newStatus;
    if (tool_name === 'Write') {
      newStatus = extractFrontmatterField(tool_input.content || '', 'status');
    } else {
      // Edit: extract from new_string
      const ns = tool_input.new_string || '';
      newStatus = ns.match(/^status:\s*(\S+)/m)?.[1] || extractFrontmatterField(ns, 'status');
    }

    // If no status field being set — allow without modification
    if (!newStatus) process.exit(0);

    // 4. Check file existence
    const fileExists = fs.existsSync(filePath);

    // Variables to hold disk content (reused in repo check and allow path)
    let diskContent = null;
    let currentStatus = null;

    // 5. If file does NOT exist (new file creation)
    if (!fileExists) {
      if (newStatus !== 'readyForDevelop') {
        deny(`New task files must have status: readyForDevelop. Got: ${newStatus}`);
      }
      // Valid new file — proceed to repo check
    } else {
      // 6. File DOES exist — validate transition
      diskContent = fs.readFileSync(filePath, 'utf8');
      currentStatus = extractFrontmatterField(diskContent, 'status');
      const allowed = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(newStatus)) {
        deny(`Invalid status transition: ${currentStatus} -> ${newStatus}. Allowed from ${currentStatus}: [${allowed.join(', ') || 'none'}]`);
      }

      // Sequential ordering (E-01) — a task may only start once the previous task in the epic is done
      if (currentStatus === 'readyForDevelop' && newStatus === 'inProgress') {
        const blocker = previousTaskBlocking(filePath);
        if (blocker) {
          deny(`Cannot start ${path.basename(filePath)} — previous task ${blocker.id} is ${blocker.status} (must be done). Complete it first.`);
        }
      }

      // Annotation-gated reverse transitions (D-06) — rejection-only gating
      if (currentStatus === 'inReview' && newStatus === 'inProgress') {
        // inReview = CodeReview running; regression means CHANGES_REQUESTED from code-reviewer
        if (!diskContent.includes('CHANGES_REQUESTED')) {
          deny('Status regression inReview → inProgress requires a code review block with CHANGES_REQUESTED');
        }
      }
      if (currentStatus === 'inTesting' && newStatus === 'inProgress') {
        // inTesting = QA running; regression means QA FAIL
        // [^#]* stops at the next ## heading so text in subsequent sections cannot satisfy this gate
        if (!diskContent.match(/## QA Results\b[^#]*Status: FAIL/)) {
          deny('Status regression inTesting → inProgress requires ## QA Results block with Status: FAIL');
        }
      }
      if (currentStatus === 'forTeamLeadCheck' && newStatus === 'inProgress') {
        // Only allow if TeamLead Check block has Status: REJECTED
        // [^#]* stops at the next ## heading so text in subsequent sections cannot satisfy this gate
        if (!diskContent.match(/## TeamLead Check\b[^#]*Status: REJECTED/)) {
          deny('Status regression forTeamLeadCheck → inProgress requires ## TeamLead Check block with Status: REJECTED');
        }
      }
    }

    // 7. Repo check — enforced on the reconstructed final content
    let finalContent;
    if (tool_name === 'Write') {
      finalContent = tool_input.content || '';
    } else {
      // Edit: reconstruct the final file content by applying the edit to diskContent
      finalContent = (diskContent || '').replace(tool_input.old_string || '', tool_input.new_string || '');
    }

    const repoValue = finalContent.match(/^repo:\s*(\S+)/m)?.[1];
    if (repoValue === 'both') {
      deny('repo: both is not allowed. Split into separate be and fe tasks.');
    }

    // 8. ALLOW path — validation only. Lifecycle timestamps (started-at /
    // completed-at / updated-at) are injected by the PostToolUse hook
    // (task-timestamps.js) AFTER the edit lands, so the hook never writes the
    // file out-of-band before the tool runs — which would desync the harness
    // read-cache and trigger "File content has changed since it was last read".
    process.exit(0);
  } catch (e) {
    // Silent fail — never block tool execution
    process.exit(0);
  }
});

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function previousTaskBlocking(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const curMatch = base.match(/TASK-(\d+)\.md$/);
  if (!curMatch) return null;
  const curId = parseInt(curMatch[1], 10);
  let files;
  try { files = fs.readdirSync(dir); } catch (e) { return null; }
  let prevId = -1;
  let prevFile = null;
  for (const f of files) {
    const m = f.match(/^TASK-(\d+)\.md$/);
    if (!m) continue;
    const id = parseInt(m[1], 10);
    if (id < curId && id > prevId) { prevId = id; prevFile = f; }
  }
  if (!prevFile) return null; // no previous task (e.g. TASK-001)
  const prevStatus = extractFrontmatterField(fs.readFileSync(path.join(dir, prevFile), 'utf8'), 'status');
  if (prevStatus === 'done') return null;
  return { id: `TASK-${String(prevId).padStart(3, '0')}`, status: prevStatus || 'unknown' };
}

function localISOString() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad2 = n => String(Math.abs(n)).padStart(2, '0');
  return d.getFullYear() + '-' +
    pad2(d.getMonth() + 1) + '-' +
    pad2(d.getDate()) + 'T' +
    pad2(d.getHours()) + ':' +
    pad2(d.getMinutes()) + ':' +
    pad2(d.getSeconds()) +
    sign + pad2(Math.floor(off / 60)) + ':' + pad2(off % 60);
}

function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const searchIn = fmMatch ? fmMatch[1] : content;
  const m = searchIn.match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'));
  return m ? m[1] : undefined;
}
