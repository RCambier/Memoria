import { Draggable } from "@hello-pangea/dnd";
import type { Status, Task } from "@todos/sheet-core";
import { tagColorClass } from "../lib/tagColor.js";

const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  done: "Done",
};

const ALL_STATUSES: Status[] = ["backlog", "in_progress", "done"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Formats a `YYYY-MM-DD` due date as e.g. "Jul 21" (local, no timezone drift). */
function formatDueDate(dueDate: string): string {
  const d = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dueDate;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A due date is overdue once the local calendar day has passed — unless the task is done. */
function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === "done") return false;
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return task.dueDate < localToday;
}

interface CardProps {
  task: Task;
  /** Position within the destination column's rendered list — the draggable index. */
  index: number;
  isTouch: boolean;
  readOnly: boolean;
  onMove: (status: Status) => void;
  onDelete: () => void;
}

export function Card({ task, index, isTouch, readOnly, onMove, onDelete }: CardProps) {
  // Touch devices use tap-to-move instead: dragging a card and swiping the
  // mobile pager both start from a touchstart on the card, and letting the
  // DnD library claim that gesture would fight the horizontal swipe.
  const dragDisabled = isTouch || readOnly;
  const otherStatuses = ALL_STATUSES.filter((s) => s !== task.status);

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={dragDisabled}>
      {(provided, snapshot) => {
        // The library owns `style.transform` for positioning/drop animation;
        // merge our lift-and-tilt on top rather than overriding it via CSS
        // (an inline style always wins over a stylesheet rule).
        const style = {
          ...provided.draggableProps.style,
          transform: snapshot.isDragging
            ? `${provided.draggableProps.style?.transform ?? ""} rotate(1.2deg)`.trim()
            : provided.draggableProps.style?.transform,
        };

        return (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            style={style}
            {...provided.dragHandleProps}
            className={`card${task.status === "done" ? " done" : ""}${snapshot.isDragging ? " dragging" : ""}`}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <p className="title" style={{ flex: 1 }}>
                {task.title}
              </p>
              {!readOnly && (
                <button className="card-delete" aria-label={`Delete "${task.title}"`} onClick={onDelete}>
                  ×
                </button>
              )}
            </div>
            {task.notes && <p className="notes">{task.notes}</p>}
            {task.tags.length > 0 && (
              <div className="card-tags">
                {task.tags.map((t) => (
                  <span key={t} className={`tag ${tagColorClass(t)}`}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="meta">
              {task.source === "agent" && <span className="chip">✳ agent</span>}
              {task.dueDate && (
                <span className={`due${isOverdue(task) ? " overdue" : ""}`} title={`Due ${task.dueDate}`}>
                  ⚑ {formatDueDate(task.dueDate)}
                </span>
              )}
              <span>{formatDate(task.createdAt)}</span>
            </div>
            {isTouch && !readOnly && (
              <div className="move-actions">
                {otherStatuses.map((s) => (
                  <button key={s} type="button" onClick={() => onMove(s)}>
                    → {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      }}
    </Draggable>
  );
}
