import React from 'react';

function repoBadge(repo) {
  if (repo === 'be') return 'bg-blue-100 text-blue-700';
  if (repo === 'fe') return 'bg-purple-100 text-purple-700';
  return 'bg-gray-100 text-gray-700';
}

function formatDuration(createdAt, updatedAt) {
  if (!createdAt || !updatedAt) return null;
  const ms = new Date(updatedAt) - new Date(createdAt);
  if (isNaN(ms) || ms < 0) return null;
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const TaskCard = React.forwardRef(({ task, isDone }, ref) => {
  const duration = isDone ? formatDuration(task['created-at'], task['_completedAt'] || task['updated-at']) : null;
  return (
    <div
      ref={ref}
      className={`bg-white rounded-md shadow-sm p-2 mb-1.5 text-xs flex flex-col${isDone ? ' min-h-[180px]' : ''}`}
    >
      <div className="font-medium text-gray-800 leading-snug mb-1 text-sm">
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
        <span className="ml-auto text-gray-400 font-mono">{task.complexity}</span>
      </div>
      {isDone && duration && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
          </svg>
          {duration}
        </div>
      )}
    </div>
  );
});

TaskCard.displayName = 'TaskCard';

export default TaskCard;
