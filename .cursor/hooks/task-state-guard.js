#!/usr/bin/env node
// task-state-guard.js — Cursor preToolUse hook
// Validates YAML frontmatter status transitions in .planning/work/**/*.md
// On ALLOW path: returns { permission: "allow" }.
// On DENY path: returns { permission: "deny", agent_message, user_message }.
//
// Cursor preToolUse input (stdin JSON):
//   { tool_name, tool_input: { path|file_path, contents|content, old_string, new_string }, ... }
// Filtering is path-based (not tool-name-based) so the guard fires regardless of
// whether the editing tool is named Write, StrReplace, Edit, or MultiEdit.

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

// Investigation cards (RESEARCH.md, repo: inv) use a lean lifecycle: a single
// card per epic with NO CodeReview/QA/TeamLeadCheck stages. The
// research-investigator self-approves and writes done directly — the analog of
// the normal pipeline's TeamLead Check → done step — so inProgress may go
// straight to done (forTeamLeadCheck is accepted as an optional intermediate).
// team-lead:test never applies to these cards.
const RESEARCH_TRANSITIONS = {
  readyForDevelop:  ['inProgress', 'stopped'],
  inProgress:       ['forTeamLeadCheck', 'done', 'readyForDevelop', 'stopped'],
  forTeamLeadCheck: ['done', 'inProgress', 'stopped'],
  done:             [],
  stopped:          [],
};

let input = '';
const stdinTimeout = setTimeout(() => allow(), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const toolInput = data.tool_input || {};

    // 1. Path filter: only guard task files in .planning/work/
    const filePath = toolInput.path || toolInput.file_path || '';
    if (!filePath.includes('.planning/work/') || !filePath.endsWith('.md')) return allow();

    // Investigation card: RESEARCH.md uses RESEARCH_TRANSITIONS and skips the
    // TASK-pipeline gates (sequential ordering, CodeReview/QA/TLC annotations).
    const isResearch = path.basename(filePath) === 'RESEARCH.md';

    // 1.5. Restore bypass: a `.restore` sentinel in the epic directory disables
    // all validation — used to recreate accidentally deleted task files verbatim.
    if (fs.existsSync(path.join(path.dirname(filePath), '.restore'))) return allow();

    // 2. Extract newStatus from the tool call. Full-content writes carry
    // contents/content; in-place edits carry new_string.
    const fullContent = toolInput.contents != null ? toolInput.contents
                      : toolInput.content  != null ? toolInput.content
                      : null;
    let newStatus;
    if (fullContent != null) {
      newStatus = extractFrontmatterField(fullContent, 'status');
    } else {
      const ns = toolInput.new_string || '';
      newStatus = ns.match(/^status:\s*(\S+)/m)?.[1] || extractFrontmatterField(ns, 'status');
    }

    // No status field being set — allow.
    if (!newStatus) return allow();

    const fileExists = fs.existsSync(filePath);
    let diskContent = null;
    let currentStatus = null;

    // 3. New file creation
    if (!fileExists) {
      if (newStatus !== 'readyForDevelop') {
        return deny(`New task files must have status: readyForDevelop. Got: ${newStatus}`);
      }
    } else {
      // 4. Existing file — validate transition
      diskContent = fs.readFileSync(filePath, 'utf8');
      currentStatus = extractFrontmatterField(diskContent, 'status');
      const allowed = (isResearch ? RESEARCH_TRANSITIONS : VALID_TRANSITIONS)[currentStatus] || [];
      if (!allowed.includes(newStatus)) {
        return deny(`Invalid status transition: ${currentStatus} -> ${newStatus}. Allowed from ${currentStatus}: [${allowed.join(', ') || 'none'}]`);
      }

      // Sequential ordering (E-01)
      if (!isResearch && currentStatus === 'readyForDevelop' && newStatus === 'inProgress') {
        const blocker = previousTaskBlocking(filePath);
        if (blocker) {
          return deny(`Cannot start ${path.basename(filePath)} — previous task ${blocker.id} is ${blocker.status} (must be done). Complete it first.`);
        }
      }

      // Annotation-gated reverse transitions (D-06)
      if (!isResearch && currentStatus === 'inReview' && newStatus === 'inProgress') {
        if (!diskContent.includes('CHANGES_REQUESTED')) {
          return deny('Status regression inReview → inProgress requires a code review block with CHANGES_REQUESTED');
        }
      }
      if (!isResearch && currentStatus === 'inTesting' && newStatus === 'inProgress') {
        if (!diskContent.match(/## QA Results\b[^#]*Status: FAIL/)) {
          return deny('Status regression inTesting → inProgress requires ## QA Results block with Status: FAIL');
        }
      }
      if (!isResearch && currentStatus === 'forTeamLeadCheck' && newStatus === 'inProgress') {
        if (!diskContent.match(/## TeamLead Check\b[^#]*Status: REJECTED/)) {
          return deny('Status regression forTeamLeadCheck → inProgress requires ## TeamLead Check block with Status: REJECTED');
        }
      }
    }

    // 5. Repo check — enforced on the reconstructed final content
    let finalContent;
    if (fullContent != null) {
      finalContent = fullContent;
    } else {
      finalContent = (diskContent || '').replace(toolInput.old_string || '', toolInput.new_string || '');
    }
    const repoValue = finalContent.match(/^repo:\s*(\S+)/m)?.[1];
    if (repoValue === 'both') {
      return deny('repo: both is not allowed. Split into separate be and fe tasks.');
    }

    // 6. ALLOW path — validation only. Lifecycle timestamps are injected by the
    // afterFileEdit hook (task-timestamps.js) after the edit lands.
    return allow();
  } catch (e) {
    // Silent fail-open — never block tool execution on hook error.
    return allow();
  }
});

function allow() {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    permission: 'deny',
    agent_message: reason,
    user_message: reason,
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

function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const searchIn = fmMatch ? fmMatch[1] : content;
  const m = searchIn.match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'));
  return m ? m[1] : undefined;
}
