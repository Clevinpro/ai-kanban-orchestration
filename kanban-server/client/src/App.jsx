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
  const [autoRun, setAutoRun] = useState(() => localStorage.getItem('kanban-autoRun') === 'true');

  useEffect(() => {
    localStorage.setItem('kanban-autoRun', autoRun);
  }, [autoRun]);
  const esRef = useRef(null);
  const retryRef = useRef(null);
  const prevDoneRef = useRef(new Set());

  // Detect newly-done tasks and trigger next readyForDevelop when autoRun is on.
  // Uses state directly (not a stale ref) so the chain works for every task.
  useEffect(() => {
    const currDoneIds = new Set((state.done || []).map((t) => taskUid(t)));

    if (autoRun) {
      const newlyDone = (state.done || []).filter((t) => !prevDoneRef.current.has(taskUid(t)));
      if (newlyDone.length > 0) {
        const readyTasks = (state.readyForDevelop || [])
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id));
        if (readyTasks.length > 0) {
          const next = readyTasks[0];
          dispatch({ type: 'DRAG_OPTIMISTIC', taskUid: taskUid(next), newStatus: 'inProgress' });
          fetch('/tasks/' + next.epic + '/' + next.id + '/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'inProgress', autoNext: true }),
          }).catch(() => {
            dispatch({ type: 'DRAG_REVERT', taskId: next.id, taskEpic: next.epic, originalStatus: 'readyForDevelop' });
          });
        }
      }
    }

    prevDoneRef.current = currDoneIds;
  }, [state, autoRun]);

  useEffect(() => {
    function connect() {
      const es = new EventSource('/events');
      esRef.current = es;

      es.addEventListener('task-updated', (e) => {
        const task = JSON.parse(e.data);
        dispatch({ type: 'SSE_UPDATE', task });
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

  return <Board tasks={state} dispatch={dispatch} autoRun={autoRun} setAutoRun={setAutoRun} />;
}
