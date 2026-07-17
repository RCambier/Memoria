import { useEffect, useRef, useState } from "react";
import { tagColorClass } from "../lib/tagColor.js";

export interface NewTaskInput {
  title: string;
  notes?: string;
  dueDate?: string;
  tags?: string[];
}

interface ComposerProps {
  onSubmit: (input: NewTaskInput) => void;
  onCancel: () => void;
}

/**
 * Inline top-of-column task composer covering the full task model: title,
 * description, due date, and tags. Enter on the title adds immediately (the
 * fast path is still one keystroke); Escape cancels from anywhere.
 */
export function Composer({ onSubmit, onCancel }: ComposerProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function commitTagDraft(): string[] {
    const t = tagDraft.trim().replace(/,/g, "");
    setTagDraft("");
    if (t === "" || tags.includes(t)) return tags;
    const next = [...tags, t];
    setTags(next);
    return next;
  }

  function submit(): void {
    const trimmed = title.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    const allTags = commitTagDraft();
    onSubmit({
      title: trimmed,
      notes: notes.trim() || undefined,
      dueDate: dueDate || undefined,
      tags: allTags.length > 0 ? allTags : undefined,
    });
  }

  return (
    <div
      className="composer"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
      }}
    >
      <input
        ref={titleRef}
        type="text"
        className="composer-title"
        placeholder="Task title…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <textarea
        className="composer-notes"
        placeholder="Description…"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="composer-tags">
        {tags.map((t) => (
          <span key={t} className={`tag ${tagColorClass(t)}`}>
            {t}
            <button
              type="button"
              className="tag-remove"
              aria-label={`Remove tag ${t}`}
              onClick={() => setTags(tags.filter((x) => x !== t))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="tag-input"
          placeholder={tags.length === 0 ? "Add tag…" : ""}
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitTagDraft();
            }
            if (e.key === "Backspace" && tagDraft === "" && tags.length > 0) {
              setTags(tags.slice(0, -1));
            }
          }}
          onBlur={() => commitTagDraft()}
        />
      </div>

      <div className="composer-actions">
        <input
          type="date"
          className="composer-date"
          aria-label="Due date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <div className="composer-spacer" />
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={!title.trim()}>
          Add task
        </button>
      </div>
    </div>
  );
}
