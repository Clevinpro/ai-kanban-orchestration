import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import TaskCard from './TaskCard';
import { formatDuration, fmtDate } from '../timeUtils';

const COLUMN_ORDER = [
  'readyForDevelop',
  'inProgress',
  'inReview',
  'inTesting',
  'forTeamLeadCheck',
  'done',
];

const COLUMN_LABELS = {
  readyForDevelop: 'Ready',
  inProgress: 'In Progress',
  inReview: 'In Review',
  inTesting: 'Testing',
  forTeamLeadCheck: 'TL Check',
  done: 'Done',
};

function groupByEpic(taskList) {
  const map = {};
  for (const task of taskList) {
    if (!map[task.epic]) map[task.epic] = [];
    map[task.epic].push(task);
  }
  return map;
}

// An epic is fully done when it has tasks and none of them sit outside the done
// column. Active (still-running) epics → yellow header; fully-done → green.
function epicFullyDone(epic, tasks) {
  let hasAny = false;
  let hasOpen = false;
  for (const col of COLUMN_ORDER) {
    for (const t of tasks[col] || []) {
      if (t.epic !== epic) continue;
      hasAny = true;
      if (col !== 'done') hasOpen = true;
    }
  }
  return hasAny && !hasOpen;
}

// Epic-level start/finish across ALL columns: start = earliest started-at,
// ready = latest completed-at (only meaningful when the epic is fully done).
function epicTimes(epic, tasks, fullyDone) {
  let startedAt = null;
  let completedAt = null;
  for (const col of COLUMN_ORDER) {
    for (const t of tasks[col] || []) {
      if (t.epic !== epic) continue;
      const s = t['started-at'];
      const c = t['completed-at'];
      if (s && (!startedAt || new Date(s) < new Date(startedAt))) startedAt = s;
      if (c && (!completedAt || new Date(c) > new Date(completedAt))) completedAt = c;
    }
  }
  return { startedAt, completedAt: fullyDone ? completedAt : null };
}

// One "label: ▶ start → ✓ end (duration)" line for the expanded epic header.
function TimeRow({ label, startedAt, endedAt }) {
  if (!startedAt && !endedAt) return null;
  const duration = formatDuration(startedAt, endedAt);
  return (
    <div className="flex items-center gap-1 normal-case font-normal">
      <span className="opacity-60 w-7 flex-shrink-0">{label}</span>
      {startedAt && <span>▶ {fmtDate(startedAt)}</span>}
      {startedAt && endedAt && <span className="opacity-50">→</span>}
      {endedAt && <span>✓ {fmtDate(endedAt)}</span>}
      {duration && <span className="opacity-75 font-medium">({duration})</span>}
    </div>
  );
}

// Verdict badge for the epic header: spinner while the gate runs, ✓ / ✗ after.
function TestVerdictBadge({ verdict }) {
  if (verdict === 'IN-PROGRESS') {
    return (
      <svg className="w-3 h-3 flex-shrink-0 animate-spin opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" d="M21 12a9 9 0 11-6.2-8.56" />
      </svg>
    );
  }
  if (verdict === 'PASS') return <span className="flex-shrink-0 opacity-80" title="Epic test: PASS">✓</span>;
  if (verdict === 'FAIL') return <span className="flex-shrink-0 opacity-80" title="Epic test: FAIL">✗</span>;
  return null;
}

export default function Board({ tasks, dispatch, autoRun, setAutoRun, epicTests = {} }) {
  const [openEpics, setOpenEpics] = useState({});

  function toggleEpic(epic) {
    setOpenEpics((prev) => ({ ...prev, [epic]: !prev[epic] }));
  }

  function runEpicTest(epic) {
    // Server guards duplicates: 409 while TEST-REPORT.md reads IN-PROGRESS.
    // Button state updates via the epic-test SSE event, no optimistic write needed.
    fetch('/epics/' + epic + '/test', { method: 'POST' }).catch(() => {});
  }

  function handleDragEnd(result) {
    const { draggableId, source, destination, reason } = result;
    if (!destination || reason === 'CANCEL') return;
    if (destination.droppableId === source.droppableId) return;
    const newStatus = destination.droppableId;
    const originalStatus = source.droppableId;
    // draggableId format: "epic/TASK-NNN"
    const slashIdx = draggableId.indexOf('/');
    const taskEpic = draggableId.slice(0, slashIdx);
    const taskId = draggableId.slice(slashIdx + 1);
    dispatch({ type: 'DRAG_OPTIMISTIC', taskUid: draggableId, newStatus });
    fetch('/tasks/' + taskEpic + '/' + taskId + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).then(function(res) {
      if (!res.ok) dispatch({ type: 'DRAG_REVERT', taskId, taskEpic, originalStatus });
    }).catch(function() {
      dispatch({ type: 'DRAG_REVERT', taskId, taskEpic, originalStatus });
    });
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="flex gap-2 p-3 flex-1">
        {COLUMN_ORDER.map((status) => (
          <Droppable droppableId={status} key={status}>
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex-1 min-w-0 flex flex-col bg-gray-100 rounded-lg p-2"
              >
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 px-1 flex items-center gap-1">
                  {COLUMN_LABELS[status]}
                  <span className="text-gray-400 font-normal">
                    {tasks[status]?.length ?? 0}
                  </span>
                </h2>
                <div className="flex-1">
                  {status === 'done' ? (() => {
                    const byEpic = groupByEpic(tasks.done || []);
                    let globalIndex = 0;
                    return Object.entries(byEpic).map(([epic, epicTasks]) => {
                      const isOpen = !!openEpics[epic];
                      const fullyDone = epicFullyDone(epic, tasks);
                      const epicStart = globalIndex;
                      globalIndex += epicTasks.length;
                      const test = epicTests[epic];
                      const verdict = test?.verdict;
                      // IN-PROGRESS: gate running. PASS: verified — re-run only after
                      // deleting TEST-REPORT.md. FAIL stays active (re-run after fixes).
                      const testBlocked = verdict === 'IN-PROGRESS' || verdict === 'PASS';
                      const testTitle = verdict === 'IN-PROGRESS'
                        ? 'Epic test already running'
                        : verdict === 'PASS'
                          ? 'Epic test passed — delete TEST-REPORT.md to re-run'
                          : verdict === 'FAIL'
                            ? 'Re-run /team-lead:test (failed ACs only)'
                            : 'Run /team-lead:test ' + epic;
                      const times = isOpen ? epicTimes(epic, tasks, fullyDone) : null;
                      return (
                        <div
                          key={epic}
                          className={`mb-1.5 rounded transition-shadow duration-300 ${
                            isOpen
                              ? fullyDone
                                ? 'shadow-xl shadow-green-600/40'
                                : 'shadow-xl shadow-yellow-500/40'
                              : 'shadow-none'
                          }`}
                        >
                          <div
                            className={`w-full px-1.5 py-1 ${isOpen ? 'rounded-t' : 'rounded'} text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                              fullyDone
                                ? 'bg-green-500 hover:bg-green-600 text-white'
                                : 'bg-yellow-400 hover:bg-yellow-500 text-yellow-900'
                            }`}
                          >
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => toggleEpic(epic)}
                              className="flex items-center gap-1.5 flex-1 min-w-0 uppercase"
                            >
                              <svg
                                className={`w-3 h-3 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="truncate">{epic}</span>
                            </button>
                            <TestVerdictBadge verdict={verdict} />
                            <span className="font-normal opacity-70">{epicTasks.length}</span>
                            <button
                              onClick={() => runEpicTest(epic)}
                              disabled={testBlocked}
                              title={testTitle}
                              className={`flex-shrink-0 rounded p-0.5 transition-opacity ${
                                testBlocked ? 'opacity-40 cursor-not-allowed' : 'opacity-80 hover:opacity-100'
                              }`}
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </button>
                          </div>
                          {isOpen && (times?.startedAt || test?.startedAt || test?.endedAt) && (
                            <div className="mt-1 pt-1 border-t border-current/20 text-[10px] flex flex-col gap-0.5">
                              <TimeRow label="Epic" startedAt={times?.startedAt} endedAt={times?.completedAt} />
                              <TimeRow label="Test" startedAt={test?.startedAt} endedAt={test?.endedAt} />
                            </div>
                          )}
                          </div>
                          {/* grid-rows 0fr→1fr: smooth expand/collapse without JS height math */}
                          <div
                            className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                              isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                            }`}
                          >
                            <div
                              className={`overflow-hidden min-h-0 rounded-b ${
                                isOpen
                                  ? `p-1 pt-0 bg-white border border-t-0 ${fullyDone ? 'border-green-500' : 'border-yellow-400'}`
                                  : ''
                              }`}
                            >
                              {epicTasks.map((task, i) => (
                                <Draggable draggableId={task.epic + '/' + task.id} index={epicStart + i} key={task.epic + '/' + task.id}>
                                  {(provided) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className="cursor-grab mt-1 [&>*]:mb-0"
                                    >
                                      <TaskCard task={task} isDone />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })() : (tasks[status] || []).map((task, index) => (
                    <Draggable draggableId={task.epic + '/' + task.id} index={index} key={task.epic + '/' + task.id}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="cursor-grab"
                        >
                          <TaskCard task={task} isDone={false} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                </div>
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        ))}
      </div>
      </div>
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-3">
        <button
          onClick={() => setAutoRun((v) => !v)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoRun ? 'bg-green-500' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoRun ? 'translate-x-4' : 'translate-x-1'}`} />
        </button>
        <span className="text-xs text-gray-600">
          Auto-run next task when previous is done
          {autoRun && (tasks.readyForDevelop?.length ?? 0) > 0 && (
            <span className="ml-2 text-green-600 font-medium">
              · next: {[...tasks.readyForDevelop].sort((a, b) => a.id.localeCompare(b.id))[0]?.id}
            </span>
          )}
        </span>
      </div>
    </DragDropContext>
  );
}
