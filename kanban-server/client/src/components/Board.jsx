import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
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

export default function Board({ tasks, dispatch, autoRun, setAutoRun }) {
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
      body: JSON.stringify({ status: newStatus, autoNext: newStatus === 'inProgress' && autoRun }),
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
                  {(tasks[status] || []).map((task, index) => (
                    <Draggable draggableId={task.epic + '/' + task.id} index={index} key={task.epic + '/' + task.id}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="cursor-grab"
                        >
                          <TaskCard task={task} />
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
