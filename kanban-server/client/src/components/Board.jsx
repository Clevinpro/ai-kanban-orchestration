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

export default function Board({ tasks, dispatch }) {
  function handleDragEnd(result) {
    const { draggableId, source, destination, reason } = result;
    if (!destination || reason === 'CANCEL') return;
    if (destination.droppableId === source.droppableId) return;
    const newStatus = destination.droppableId;
    const originalStatus = source.droppableId;
    dispatch({ type: 'DRAG_OPTIMISTIC', taskId: draggableId, newStatus });
    fetch('/tasks/' + draggableId + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).then(function(res) {
      if (!res.ok) dispatch({ type: 'DRAG_REVERT', taskId: draggableId, originalStatus });
    }).catch(function() {
      dispatch({ type: 'DRAG_REVERT', taskId: draggableId, originalStatus });
    });
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-2 p-3 min-h-screen bg-gray-50">
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
                    <Draggable draggableId={task.id} index={index} key={task.id}>
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
    </DragDropContext>
  );
}
