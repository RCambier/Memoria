import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { STATUSES, type Status, type Task } from "@todos/sheet-core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useIsTouch } from "../lib/useIsTouch.js";
import { Column } from "./Column.js";

const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  done: "Done",
};

/** The panel shown by default on mobile load — the column most people care about day to day. */
const DEFAULT_MOBILE_STATUS: Status = "in_progress";

interface BoardProps {
  tasks: Task[];
  readOnly: boolean;
  onAdd: (status: Status, title: string) => void;
  onMove: (id: string, status: Status, dropIndex: number) => void;
  onDelete: (id: string) => void;
}

export function Board({ tasks, readOnly, onAdd, onMove, onDelete }: BoardProps) {
  const isTouch = useIsTouch();
  const [activeMobileStatus, setActiveMobileStatus] = useState<Status>(DEFAULT_MOBILE_STATUS);
  const boardRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<Partial<Record<Status, HTMLDivElement>>>({});

  const byStatus = useMemo(() => {
    const map: Record<Status, Task[]> = { backlog: [], in_progress: [], done: [] };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  // Land on the "In progress" panel by default (no animation — this is the
  // initial position, not a navigation). useLayoutEffect so it happens
  // before paint, with no visible jump from "Backlog" to "In progress".
  useLayoutEffect(() => {
    const board = boardRef.current;
    const panel = panelRefs.current[DEFAULT_MOBILE_STATUS];
    if (board && panel) board.scrollLeft = panel.offsetLeft;
  }, []);

  // Swiping between panels updates which segment reads as active. Panels
  // are equal-width snap points, so the visible one is just whichever
  // multiple of the container's width the scroll position is nearest to —
  // a plain scroll listener computing that is simpler (and avoids
  // IntersectionObserver's threshold tuning) than observing each panel.
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    function onScroll(): void {
      const current = boardRef.current;
      if (!current) return;
      const width = current.clientWidth || 1;
      const index = Math.round(current.scrollLeft / width);
      const clamped = Math.min(STATUSES.length - 1, Math.max(0, index));
      setActiveMobileStatus(STATUSES[clamped] ?? DEFAULT_MOBILE_STATUS);
    }
    board.addEventListener("scroll", onScroll, { passive: true });
    return () => board.removeEventListener("scroll", onScroll);
  }, []);

  function goToPanel(status: Status): void {
    setActiveMobileStatus(status);
    const board = boardRef.current;
    const panel = panelRefs.current[status];
    if (board && panel) board.scrollTo({ left: panel.offsetLeft, behavior: "smooth" });
  }

  function handleDragEnd(result: DropResult): void {
    if (readOnly) return;
    const { draggableId, source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    onMove(draggableId, destination.droppableId as Status, destination.index);
  }

  return (
    <div className="board-scroll">
      <div className="seg-switcher">
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={status === activeMobileStatus ? "active" : ""}
            onClick={() => goToPanel(status)}
          >
            {STATUS_LABEL[status]}
          </button>
        ))}
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="board" ref={boardRef}>
          {STATUSES.map((status) => (
            <Column
              key={status}
              panelRef={(el) => {
                if (el) panelRefs.current[status] = el;
              }}
              status={status}
              tasks={byStatus[status]}
              isTouch={isTouch}
              readOnly={readOnly}
              onAdd={(title) => onAdd(status, title)}
              onMove={(id, s) => onMove(id, s, 0)}
              onDelete={onDelete}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
