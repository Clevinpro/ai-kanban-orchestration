import { useReducer, useEffect, useRef, useState } from 'react';
import Board from './components/Board';

const COLUMN_ORDER = [
  'readyForDevelop',
  'inProgress',
  'inReview',
  'inTesting',
  'forTeamLeadCheck',
  'done',
];

const initialState = Object.fromEntries(COLUMN_ORDER.map((col) => [col, []]));

function taskUid(t) { return t.epic + '/' + t.id; }

function boardReducer(state, action) {
  switch (action.type) {
    case 'SSE_UPDATE': {
      const { task } = action;
      const uid = taskUid(task);
      if (task.deleted) {
        const next = { ...state };
        for (const col of COLUMN_ORDER) {
          next[col] = next[col].filter((t) => taskUid(t) !== uid);
        }
        return next;
      }
      const next = { ...state };
      for (const col of COLUMN_ORDER) {
        next[col] = next[col].filter((t) => taskUid(t) !== uid);
      }
      if (COLUMN_ORDER.includes(task.status)) {
        next[task.status] = [...(next[task.status] || []), task];
      }
      return next;
    }
    case 'DRAG_OPTIMISTIC': {
      const { taskUid: uid, newStatus } = action;
      const next = { ...state };
      let movedTask = null;
      for (const col of COLUMN_ORDER) {
        const found = next[col].find((t) => taskUid(t) === uid);
        if (found) movedTask = found;
        next[col] = next[col].filter((t) => taskUid(t) !== uid);
      }
      if (movedTask) {
        next[newStatus] = [...(next[newStatus] || []), { ...movedTask, status: newStatus }];
      }
      return next;
    }
    case 'DRAG_REVERT': {
      return boardReducer(state, {
        type: 'SSE_UPDATE',
        task: { id: action.taskId, epic: action.taskEpic, status: action.originalStatus },
      });
    }
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(boardReducer, initialState);
  // Per-epic auto-run: epic -> bool. When on, completing a task in that epic
  // auto-launches the epic's next readyForDevelop task (and, once the whole epic
  // is done, the /team-lead:test gate). Each epic is independent.
  const [autoRunEpics, setAutoRunEpics] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('kanban-autoRunEpics') || '{}');
    } catch {
      return {};
    }
  });
  const toggleEpicAutoRun = (epic) =>
    setAutoRunEpics((prev) => ({ ...prev, [epic]: !prev[epic] }));
  // Footer-level chain: when an epic fully completes, auto-start the next epic
  // (enable its per-epic auto-run + launch its first task). Persisted separately.
  const [autoRunNextEpic, setAutoRunNextEpic] = useState(
    () => localStorage.getItem('kanban-autoRunNextEpic') === 'true',
  );
  // Per-epic agent: epic -> 'claude' | 'cursor'. Chooses which CLI the server
  // spawns for that epic's task launches and acceptance gate. Missing → 'claude'.
  const [epicAgents, setEpicAgents] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('kanban-epicAgents') || '{}');
    } catch {
      return {};
    }
  });
  const setEpicAgent = (epic, agent) =>
    setEpicAgents((prev) => ({ ...prev, [epic]: agent }));
  const agentFor = (epic) => epicAgents[epic] || 'claude';
  // epic -> { verdict: 'IN-PROGRESS' | 'PASS' | 'FAIL', startedAt, endedAt }.
  // Fed by epic-test SSE events (initial snapshot on connect + live
  // TEST-REPORT.md changes).
  const [epicTests, setEpicTests] = useState({});

  useEffect(() => {
    localStorage.setItem('kanban-autoRunEpics', JSON.stringify(autoRunEpics));
  }, [autoRunEpics]);
  useEffect(() => {
    localStorage.setItem('kanban-autoRunNextEpic', autoRunNextEpic);
  }, [autoRunNextEpic]);
  useEffect(() => {
    localStorage.setItem('kanban-epicAgents', JSON.stringify(epicAgents));
  }, [epicAgents]);
  const esRef = useRef(null);
  const retryRef = useRef(null);
  // Tracks the last-seen status of every task (uid -> status). Used to detect a
  // genuine transition INTO done. Tasks first seen already in done (the initial
  // snapshot delivered on connect / page reload) have no prior status and are NOT
  // treated as newly-done, so a reload never re-triggers autoRun.
  const prevStatusRef = useRef(new Map());
  // Epics for which the /team-lead:test gate was already launched this session —
  // prevents duplicate test terminals. Cleared when an epic re-opens (a task
  // leaves done), so a later re-completion can fire the gate again.
  const testedEpicsRef = useRef(new Set());

  // Detect tasks that just transitioned into done and trigger the next
  // readyForDevelop when autoRun is on. Uses state directly (not a stale ref).
  useEffect(() => {
    const newlyDone = (state.done || []).filter((t) => {
      const prev = prevStatusRef.current.get(taskUid(t));
      return prev !== undefined && prev !== 'done';
    });
    if (newlyDone.length > 0) {
      const epicsJustDone = new Set(newlyDone.map((t) => t.epic));

      // Per-epic auto-run: for each epic that just had a done-transition AND has
      // its toggle on, launch that epic's own next readyForDevelop task. Epics
      // without the toggle (or other epics) are never touched.
      for (const epic of epicsJustDone) {
        if (!autoRunEpics[epic]) continue;
        const next = (state.readyForDevelop || [])
          .filter((t) => t.epic === epic)
          .sort((a, b) => a.id.localeCompare(b.id))[0];
        if (!next) continue;
        dispatch({ type: 'DRAG_OPTIMISTIC', taskUid: taskUid(next), newStatus: 'inProgress' });
        fetch('/tasks/' + next.epic + '/' + next.id + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'inProgress', agent: agentFor(epic) }),
        }).catch(() => {
          dispatch({ type: 'DRAG_REVERT', taskId: next.id, taskEpic: next.epic, originalStatus: 'readyForDevelop' });
        });
      }

      // Per-epic completion: when every task of a just-touched epic (toggle on)
      // is now in done, launch the /team-lead:test gate once.
      const epicTotals = new Map(); // epic -> { total, done }
      for (const col of COLUMN_ORDER) {
        for (const t of state[col] || []) {
          const e = epicTotals.get(t.epic) || { total: 0, done: 0 };
          e.total += 1;
          if (col === 'done') e.done += 1;
          epicTotals.set(t.epic, e);
        }
      }
      for (const epic of epicsJustDone) {
        if (!autoRunEpics[epic]) continue;
        const e = epicTotals.get(epic);
        // Skip when a gate is already running (IN-PROGRESS) or the epic already
        // passed (PASS) — the server's 409 guards cover both; this avoids the noise.
        const v = epicTests[epic]?.verdict;
        if (v === 'IN-PROGRESS' || v === 'PASS') continue;
        if (e && e.total > 0 && e.done === e.total && !testedEpicsRef.current.has(epic)) {
          testedEpicsRef.current.add(epic);
          fetch('/epics/' + epic + '/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent: agentFor(epic) }),
          }).catch(() => {
            testedEpicsRef.current.delete(epic); // allow retry on failure
          });
        }
      }

      // Footer chain: when a just-completed epic is now fully done, auto-start the
      // next epic (alphabetical) that still has ready tasks — enable its per-epic
      // auto-run and launch its first task so the next epic runs through.
      if (autoRunNextEpic) {
        const fullyDoneNow = [...epicsJustDone].some((epic) => {
          const e = epicTotals.get(epic);
          return e && e.total > 0 && e.done === e.total;
        });
        if (fullyDoneNow) {
          // Next epic = first unstarted epic (no task outside Ready), so we never
          // re-pick the epic that just finished or one already in flight.
          const startedEpics = new Set();
          for (const col of COLUMN_ORDER) {
            if (col === 'readyForDevelop') continue;
            for (const t of state[col] || []) startedEpics.add(t.epic);
          }
          const nextEpic = [...new Set((state.readyForDevelop || []).map((t) => t.epic))]
            .filter((e) => !startedEpics.has(e))
            .sort()[0];
          if (nextEpic) {
            setAutoRunEpics((prev) => (prev[nextEpic] ? prev : { ...prev, [nextEpic]: true }));
            const next = (state.readyForDevelop || [])
              .filter((t) => t.epic === nextEpic)
              .sort((a, b) => a.id.localeCompare(b.id))[0];
            if (next) {
              dispatch({ type: 'DRAG_OPTIMISTIC', taskUid: taskUid(next), newStatus: 'inProgress' });
              fetch('/tasks/' + next.epic + '/' + next.id + '/status', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'inProgress', agent: agentFor(nextEpic) }),
              }).catch(() => {
                dispatch({ type: 'DRAG_REVERT', taskId: next.id, taskEpic: next.epic, originalStatus: 'readyForDevelop' });
              });
            }
          }
        }
      }
    }

    // Record the current status of every task on the board for the next diff,
    // and release the test guard for any epic that is no longer fully done.
    const nextStatus = new Map();
    const epicHasOpen = new Set();
    for (const col of COLUMN_ORDER) {
      for (const t of state[col] || []) {
        nextStatus.set(taskUid(t), col);
        if (col !== 'done') epicHasOpen.add(t.epic);
      }
    }
    for (const epic of epicHasOpen) testedEpicsRef.current.delete(epic);
    prevStatusRef.current = nextStatus;
  }, [state, autoRunEpics, autoRunNextEpic, epicTests]);

  useEffect(() => {
    function connect() {
      const es = new EventSource('/events');
      esRef.current = es;

      es.addEventListener('task-updated', (e) => {
        const task = JSON.parse(e.data);
        dispatch({ type: 'SSE_UPDATE', task });
      });

      es.addEventListener('epic-test', (e) => {
        const { epic, verdict, startedAt, endedAt } = JSON.parse(e.data);
        setEpicTests((prev) => {
          if (verdict === null) {
            // TEST-REPORT.md deleted — clear the badge / unblock the button.
            const next = { ...prev };
            delete next[epic];
            return next;
          }
          return { ...prev, [epic]: { verdict, startedAt, endedAt } };
        });
      });

      es.onerror = () => {
        es.close();
        retryRef.current = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      clearTimeout(retryRef.current);
    };
  }, [dispatch]);

  return (
    <Board
      tasks={state}
      dispatch={dispatch}
      autoRunEpics={autoRunEpics}
      toggleEpicAutoRun={toggleEpicAutoRun}
      autoRunNextEpic={autoRunNextEpic}
      setAutoRunNextEpic={setAutoRunNextEpic}
      epicTests={epicTests}
      epicAgents={epicAgents}
      setEpicAgent={setEpicAgent}
    />
  );
}
