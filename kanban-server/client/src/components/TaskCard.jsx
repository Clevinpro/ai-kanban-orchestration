import React from 'react';

function repoBadge(repo) {
  if (repo === 'be') return 'bg-blue-100 text-blue-700';
  if (repo === 'fe') return 'bg-purple-100 text-purple-700';
  return 'bg-gray-100 text-gray-700';
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt) - new Date(startedAt);
  if (isNaN(ms) || ms < 0) return null;
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${totalMin < 1 ? '< 1' : mins}m`;
}

const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleString([], { timeZone: USER_TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TaskCard = React.forwardRef(({ task, isDone }, ref) => {
  const startedAt = task['started-at'];
  const completedAt = task['completed-at'];
  const duration = isDone ? formatDuration(startedAt, completedAt) : null;
  return (
    <div
      ref={ref}
      className={`bg-white rounded-md shadow-sm p-2 mb-1.5 text-xs flex flex-col${isDone ? ' min-h-[180px]' : ''}`}
    >
      <div className="font-medium text-gray-800 leading-snug text-sm mb-[5px]">
        {task.title}
      </div>
      <div className="flex items-center gap-1 flex-wrap mt-auto">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${repoBadge(task.repo)}`}>
          {(task.repo ?? '').toUpperCase()}
        </span>
        <span className="text-gray-500 truncate flex-1">
          {task.epic}
          <span className="text-gray-400 ml-1">#{parseInt((task.id || '').replace(/\D/g, ''), 10) || ''}</span>
        </span>
        <span className="ml-auto flex items-center gap-0.5 text-teal-500 font-mono">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {task.complexity}
        </span>
      </div>
      {isDone && (startedAt || completedAt) && (
        <div className="mt-2 text-[10px] text-gray-400 flex items-center gap-1.5 flex-wrap">
          {startedAt && <span>▶ {fmtDate(startedAt)}</span>}
          {startedAt && completedAt && <span className="text-gray-300">→</span>}
          {completedAt && (
            <span>
              ✓ {fmtDate(completedAt)}
              {duration && <span className="text-emerald-600 font-medium ml-1">({duration})</span>}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

TaskCard.displayName = 'TaskCard';

export default TaskCard;
