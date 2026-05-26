import { useReducer, useEffect, useRef } from 'react';
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

function boardReducer(state, action) {
  switch (action.type) {
    case 'SSE_UPDATE': {
      const { task } = action;
      if (task.deleted) {
        const next = { ...state };
        for (const col of COLUMN_ORDER) {
          next[col] = next[col].filter((t) => t.id !== task.id);
        }
        return next;
      }
      const next = { ...state };
      for (const col of COLUMN_ORDER) {
        next[col] = next[col].filter((t) => t.id !== task.id);
      }
      if (COLUMN_ORDER.includes(task.status)) {
        next[task.status] = [...(next[task.status] || []), task];
      }
      return next;
    }
    case 'DRAG_OPTIMISTIC': {
      const { taskId, newStatus } = action;
      const next = { ...state };
      let movedTask = null;
      for (const col of COLUMN_ORDER) {
        const found = next[col].find((t) => t.id === taskId);
        if (found) movedTask = found;
        next[col] = next[col].filter((t) => t.id !== taskId);
      }
      if (movedTask) {
        next[newStatus] = [...(next[newStatus] || []), { ...movedTask, status: newStatus }];
      }
      return next;
    }
    case 'DRAG_REVERT': {
      return boardReducer(state, {
        type: 'SSE_UPDATE',
        task: { id: action.taskId, status: action.originalStatus },
      });
    }
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(boardReducer, initialState);
  const esRef = useRef(null);
  const retryRef = useRef(null);

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

  return <Board tasks={state} dispatch={dispatch} />;
}
