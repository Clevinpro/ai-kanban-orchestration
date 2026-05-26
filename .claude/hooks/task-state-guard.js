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

    // 5. If file does NOT exist (new file creation)
    if (!fileExists) {
      if (newStatus !== 'readyForDevelop') {
        deny(`New task files must have status: readyForDevelop. Got: ${newStatus}`);
      }
      // Valid new file — proceed to repo check
    } else {
      // 6. File DOES exist — validate transition
      diskContent = fs.readFileSync(filePath, 'utf8');
      const currentStatus = extractFrontmatterField(diskContent, 'status');
      const allowed = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(newStatus)) {
        deny(`Invalid status transition: ${currentStatus} -> ${newStatus}. Allowed from ${currentStatus}: [${allowed.join(', ') || 'none'}]`);
      }

      // Annotation-gated reverse transitions (D-06) — rejection-only gating
      if (currentStatus === 'inReview' && newStatus === 'inProgress') {
        // Only allow if QA Results block has Status: FAIL
        // [^#]* stops at the next ## heading so text in subsequent sections cannot satisfy this gate
        if (!diskContent.match(/## QA Results\b[^#]*Status: FAIL/)) {
          deny('Status regression inReview → inProgress requires ## QA Results block with Status: FAIL');
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

    // 8. ALLOW path — inject updated-at, keyed by tool_name
    const now = new Date().toISOString();
    let modifiedInput;
    if (tool_name === 'Write') {
      // Write tool: modifiedInput.content is the complete file content to write
      const updatedContent = (tool_input.content || '').replace(/(updated-at:\s*)([^\n]+)/, `$1${now}`);
      modifiedInput = { content: updatedContent };
    } else {
      // Edit tool: modifiedInput.new_string is the replacement snippet (not full file).
      // The timestamp injection below is a no-op for the normal pipeline case where only
      // the status: line is being replaced — updated-at is not in new_string and the
      // regex simply does not match. updated-at is only updated here when the Edit call
      // explicitly includes the updated-at field inside new_string.
      const updatedNewString = (tool_input.new_string || '').replace(/(updated-at:\s*)([^\n]+)/, `$1${now}`);
      modifiedInput = { new_string: updatedNewString };
    }

    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
      modifiedInput,
    };

    process.stdout.write(JSON.stringify(output));
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

function extractFrontmatterField(content, field) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const searchIn = fmMatch ? fmMatch[1] : content;
  const m = searchIn.match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'));
  return m ? m[1] : undefined;
}
