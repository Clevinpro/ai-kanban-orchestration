import TaskCard from './TaskCard';

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

export default function Board({ tasks, dispatch }) {
  return (
    <div className="flex gap-2 p-3 min-h-screen bg-gray-50">
      {COLUMN_ORDER.map((status) => (
        <div
          key={status}
          className="flex-1 min-w-0 flex flex-col bg-gray-100 rounded-lg p-2"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 px-1 flex items-center gap-1">
            {COLUMN_LABELS[status]}
            <span className="text-gray-400 font-normal">
              {tasks[status]?.length ?? 0}
            </span>
          </h2>
          <div className="flex-1">
            {(tasks[status] || []).map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
