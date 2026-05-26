import React from 'react';

function repoBadge(repo) {
  if (repo === 'be') return 'bg-blue-100 text-blue-700';
  if (repo === 'fe') return 'bg-purple-100 text-purple-700';
  return 'bg-gray-100 text-gray-700';
}

const TaskCard = React.forwardRef(({ task }, ref) => (
  <div
    ref={ref}
    className="bg-white rounded-md shadow-sm p-2 mb-1.5 text-xs"
  >
    <div className="font-medium text-gray-800 leading-snug mb-1 truncate">
      {task.title}
    </div>
    <div className="flex items-center gap-1 flex-wrap">
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${repoBadge(task.repo)}`}>
        {task.repo.toUpperCase()}
      </span>
      <span className="text-gray-500 truncate flex-1">{task.epic}</span>
      <span className="ml-auto text-gray-400 font-mono">{task.complexity}</span>
    </div>
  </div>
));

TaskCard.displayName = 'TaskCard';

export default TaskCard;
